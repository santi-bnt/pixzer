import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  createIndexedDbOfflineRepository,
  OfflineStorageError,
} from "../../../src/features/offline/storage/indexeddb-repository.ts";
import {
  inspectOfflineStorage,
  requestOfflineStoragePersistence,
} from "../../../src/features/offline/storage/storage-capabilities.ts";

function clone(value) {
  return structuredClone(value);
}

function keyString(key) {
  return JSON.stringify(key);
}

function readPath(value, path) {
  return Array.isArray(path) ? path.map((part) => value[part]) : value[path];
}

function nameList(values) {
  return {
    contains: (value) => values.has(value),
  };
}

class Request {
  result = undefined;
  error = null;
  onsuccess = null;
  onerror = null;
  onupgradeneeded = null;
  onblocked = null;
}

class FakeIndex {
  constructor(store, definition) {
    this.store = store;
    this.definition = definition;
  }

  getAll(query) {
    return this.store.transaction.schedule(() =>
      [...this.store.data.values()]
        .filter(
          (value) =>
            query === undefined ||
            keyString(readPath(value, this.definition.keyPath)) ===
              keyString(query),
        )
        .map(clone),
    );
  }
}

class FakeStore {
  constructor(transaction, definition, data) {
    this.transaction = transaction;
    this.definition = definition;
    this.data = data;
    this.indexNames = nameList(new Set(definition.indexes.keys()));
  }

  createIndex(name, keyPath) {
    if (!this.transaction.upgrade)
      throw new Error("Index creation requires upgrade mode");
    this.definition.indexes.set(name, { name, keyPath });
    this.indexNames = nameList(new Set(this.definition.indexes.keys()));
    return new FakeIndex(this, this.definition.indexes.get(name));
  }

  index(name) {
    const definition = this.definition.indexes.get(name);
    if (!definition) throw new Error(`Missing fake index: ${name}`);
    return new FakeIndex(this, definition);
  }

  get(key) {
    return this.transaction.schedule(() =>
      clone(this.data.get(keyString(key))),
    );
  }

  getAll(query) {
    return this.transaction.schedule(() =>
      [...this.data.entries()]
        .filter(([key]) => query === undefined || key === keyString(query))
        .map(([, value]) => clone(value)),
    );
  }

  put(value) {
    return this.transaction.schedule(() => {
      this.data.set(
        keyString(readPath(value, this.definition.keyPath)),
        clone(value),
      );
      return undefined;
    });
  }

  add(value) {
    return this.transaction.schedule(() => {
      const key = keyString(readPath(value, this.definition.keyPath));
      if (this.data.has(key)) {
        throw new DOMException("Duplicate key", "ConstraintError");
      }
      this.data.set(key, clone(value));
      return undefined;
    });
  }

  delete(key) {
    return this.transaction.schedule(() => this.data.delete(keyString(key)));
  }
}

class FakeTransaction {
  pending = 0;
  completeQueued = false;
  aborted = false;
  error = null;
  oncomplete = null;
  onerror = null;
  onabort = null;

  constructor(database, names, mode, upgrade = false) {
    this.database = database;
    this.names = Array.isArray(names) ? names : [names];
    this.mode = mode;
    this.upgrade = upgrade;
    this.working = new Map();
    for (const name of this.names) {
      const data = database.state.records.get(name);
      this.working.set(
        name,
        mode === "readonly"
          ? data
          : new Map(
              [...data.entries()].map(([key, value]) => [key, clone(value)]),
            ),
      );
    }
  }

  objectStore(name) {
    const definition = this.database.state.definitions.get(name);
    const data =
      this.working.get(name) ?? this.database.state.records.get(name);
    if (!definition || !data)
      throw new Error(`Missing fake object store: ${name}`);
    return new FakeStore(this, definition, data);
  }

  schedule(action) {
    const request = new Request();
    this.pending += 1;
    queueMicrotask(() => {
      if (this.aborted) {
        this.pending -= 1;
        this.queueCompletion();
        return;
      }
      try {
        if (this.database.factory.failNextRequest) {
          const error = this.database.factory.failNextRequest;
          this.database.factory.failNextRequest = null;
          throw error;
        }
        request.result = action();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        this.error = error;
        request.onerror?.({ target: request });
        this.onerror?.({ target: this });
        this.abort(error);
      }
      this.pending -= 1;
      this.queueCompletion();
    });
    return request;
  }

  abort(error = new DOMException("Transaction aborted", "AbortError")) {
    if (this.aborted) return;
    this.aborted = true;
    this.error = error;
    queueMicrotask(() => this.onabort?.({ target: this }));
  }

  queueCompletion() {
    if (this.completeQueued || this.pending !== 0 || this.aborted) return;
    this.completeQueued = true;
    setTimeout(() => {
      this.completeQueued = false;
      if (this.pending !== 0 || this.aborted) return;
      if (this.mode === "readwrite" && !this.upgrade) {
        for (const [name, data] of this.working) {
          this.database.state.records.set(name, data);
        }
      }
      this.oncomplete?.({ target: this });
    }, 0);
  }
}

class FakeDatabase {
  constructor(state, factory) {
    this.state = state;
    this.factory = factory;
    this.objectStoreNames = nameList(new Set(state.definitions.keys()));
    this.onversionchange = null;
    this.closed = false;
  }

  createObjectStore(name, options) {
    this.state.definitions.set(name, {
      name,
      keyPath: options.keyPath,
      indexes: new Map(),
    });
    this.state.records.set(name, new Map());
    this.objectStoreNames = nameList(new Set(this.state.definitions.keys()));
    return new FakeStore(
      new FakeTransaction(this, [name], "versionchange", true),
      this.state.definitions.get(name),
      this.state.records.get(name),
    );
  }

  transaction(names, mode) {
    if (this.closed)
      throw new DOMException("Database is closed", "InvalidStateError");
    return new FakeTransaction(this, names, mode);
  }

  close() {
    this.closed = true;
  }
}

class FakeIndexedDbFactory {
  databases = new Map();
  blockNextOpen = false;
  failNextRequest = null;

  open(name, version) {
    const request = new Request();
    queueMicrotask(() => {
      if (this.blockNextOpen) {
        this.blockNextOpen = false;
        request.onblocked?.({ target: request });
        return;
      }
      try {
        let state = this.databases.get(name);
        if (!state) {
          state = { version: 0, definitions: new Map(), records: new Map() };
          this.databases.set(name, state);
        }
        const requestedVersion = version ?? Math.max(state.version, 1);
        if (requestedVersion < state.version) {
          throw new DOMException("Version is old", "VersionError");
        }
        const database = new FakeDatabase(state, this);
        request.result = database;
        if (requestedVersion > state.version) {
          request.transaction = new FakeTransaction(
            database,
            [],
            "versionchange",
            true,
          );
          request.onupgradeneeded?.({ target: request });
          state.version = requestedVersion;
        }
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      }
    });
    return request;
  }
}

const checksum = (value) => createHash("sha256").update(value).digest("hex");
const romBytes = "rom-bytes";
const romChecksum = checksum(romBytes);
const scope = (userId) => ({ userId });

function game(userId, gameId = "game-1") {
  const rom = new Blob([romBytes]);
  return {
    userId,
    gameId,
    title: "Homebrew test",
    fileName: "test.gb",
    consoleId: "gb",
    romSha256: romChecksum,
    sizeBytes: rom.size,
    rom,
    cachedAt: 100,
    verifiedAt: 101,
  };
}

function save(userId, versionId, revision = 1, status = "pending") {
  const payloadBytes = `save-${versionId}`;
  const payload = new Blob([payloadBytes]);
  return {
    userId,
    gameId: "game-1",
    romSha256: romChecksum,
    versionId,
    parentRevision: revision === 1 ? null : "cloud-revision-0",
    cloudRevision: null,
    kind: "battery",
    slotId: "slot-1",
    payload,
    payloadSha256: checksum(payloadBytes),
    sizeBytes: payload.size,
    emulator: {
      emulatorId: "test-emulator",
      emulatorVersion: "1.0.0",
      coreId: "test-core",
      coreVersion: "1.0.0",
      configurationSha256: checksum("emulator-config"),
    },
    deviceId: "device-test",
    localRevision: revision,
    status,
    createdAt: 200 + revision,
  };
}

function operation(userId, version, operationId = `op-${version.versionId}`) {
  return {
    userId,
    operationId,
    idempotencyKey: `idem-${operationId}`,
    versionId: version.versionId,
    gameId: version.gameId,
    expectedParentRevision: version.parentRevision,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastErrorCode: null,
    createdAt: 300,
  };
}

function repository(factory = new FakeIndexedDbFactory()) {
  return createIndexedDbOfflineRepository({
    factory,
    databaseName: `test-${Math.random()}`,
  });
}

test("two account partitions cannot list each other's games", async () => {
  const repo = repository();
  await repo.putVerifiedGame(scope("user-a"), game("user-a"));
  await repo.putVerifiedGame(scope("user-b"), game("user-b"));

  assert.deepEqual(
    (await repo.listGames(scope("user-a"))).map((item) => item.userId),
    ["user-a"],
  );
  assert.equal(
    (await repo.getGame(scope("user-a"), "game-1"))?.userId,
    "user-a",
  );
  assert.deepEqual(
    (await repo.listGames(scope("user-b"))).map((item) => item.userId),
    ["user-b"],
  );
  assert.equal(await repo.getGame(scope("user-b"), "missing"), null);
});

test("verified ROM records require matching owner, checksum shape, and byte length", async () => {
  const repo = repository();
  await assert.rejects(
    repo.putVerifiedGame(scope("user-a"), game("user-b")),
    (error) =>
      error instanceof OfflineStorageError && error.code === "invalid-record",
  );
  const badChecksum = { ...game("user-a"), romSha256: "not-a-sha256" };
  await assert.rejects(
    repo.putVerifiedGame(scope("user-a"), badChecksum),
    (error) =>
      error instanceof OfflineStorageError && error.code === "invalid-record",
  );
  const badSize = { ...game("user-a"), sizeBytes: 999 };
  await assert.rejects(
    repo.putVerifiedGame(scope("user-a"), badSize),
    (error) =>
      error instanceof OfflineStorageError && error.code === "invalid-record",
  );
});

test("ROM bytes are checksum-verified before entering IndexedDB", async () => {
  const repo = repository();
  const corrupted = { ...game("user-a"), romSha256: checksum("different ROM") };

  await assert.rejects(
    repo.putVerifiedGame(scope("user-a"), corrupted),
    (error) =>
      error instanceof OfflineStorageError && error.code === "invalid-record",
  );
  assert.deepEqual(await repo.listGames(scope("user-a")), []);

  await repo.putVerifiedGame(scope("user-a"), game("user-a"));
  assert.equal((await repo.listGames(scope("user-a"))).length, 1);
});

test("local save version, head, and outbox are written together", async () => {
  const repo = repository();
  const first = save("user-a", "version-1");
  await repo.writeLocalSave(scope("user-a"), first, operation("user-a", first));

  assert.equal(
    (await repo.getSaveHead(scope("user-a"), "game-1", "battery", "slot-1"))
      ?.versionId,
    "version-1",
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "version-1"))?.payload.size,
    first.sizeBytes,
  );
  assert.deepEqual(
    (await repo.listSyncOperations(scope("user-a", 1))).map(
      (item) => item.operationId,
    ),
    ["op-version-1"],
  );
});

test("save bytes are checksum-verified before version, head, or outbox writes", async () => {
  const repo = repository();
  const corrupted = save("user-a", "version-corrupt");
  corrupted.payloadSha256 = checksum("different save bytes");

  await assert.rejects(
    repo.writeLocalSave(
      scope("user-a"),
      corrupted,
      operation("user-a", corrupted),
    ),
    (error) =>
      error instanceof OfflineStorageError && error.code === "invalid-record",
  );
  assert.equal(
    await repo.getSaveVersion(scope("user-a"), "version-corrupt"),
    null,
  );
  assert.equal(
    await repo.getSaveHead(scope("user-a"), "game-1", "battery", "slot-1"),
    null,
  );
  assert.deepEqual(await repo.listSyncOperations(scope("user-a")), []);

  const valid = save("user-a", "version-valid");
  await repo.writeLocalSave(scope("user-a"), valid, operation("user-a", valid));
  assert.ok(await repo.getSaveVersion(scope("user-a"), "version-valid"));
});

test("a failed outbox insert aborts the new save and keeps the prior head", async () => {
  const repo = repository();
  const first = save("user-a", "version-1");
  await repo.writeLocalSave(scope("user-a"), first, operation("user-a", first));

  const second = save("user-a", "version-2", 2);
  await assert.rejects(
    repo.writeLocalSave(
      scope("user-a"),
      second,
      operation("user-a", second, "op-version-1"),
    ),
    (error) =>
      error instanceof OfflineStorageError && error.code === "conflict",
  );
  assert.equal(
    (await repo.getSaveHead(scope("user-a"), "game-1", "battery", "slot-1"))
      ?.versionId,
    "version-1",
  );
  assert.equal(await repo.getSaveVersion(scope("user-a"), "version-2"), null);
  assert.equal((await repo.listSyncOperations(scope("user-a", 1))).length, 1);
});

test("sync completion and retry updates persist version/outbox state atomically", async () => {
  const repo = repository();
  const pending = save("user-a", "version-1");
  const pendingOperation = operation("user-a", pending);
  await repo.writeLocalSave(scope("user-a"), pending, pendingOperation);

  await repo.updateOperationAndVersion(
    scope("user-a"),
    pendingOperation.operationId,
    {
      status: "syncing",
      attempts: 1,
    },
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "version-1"))?.status,
    "syncing",
  );
  assert.equal(
    (await repo.listSyncOperations(scope("user-a", 1)))[0]?.attempts,
    1,
  );

  await repo.completeSyncOperation(
    scope("user-a"),
    pendingOperation.operationId,
    "revision-1",
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "version-1"))?.cloudRevision,
    "revision-1",
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "version-1"))?.status,
    "synced",
  );
  assert.deepEqual(await repo.listSyncOperations(scope("user-a", 1000)), []);
  await repo.completeSyncOperation(
    scope("user-a"),
    pendingOperation.operationId,
    "revision-1",
  );
});

test("conflicts preserve both immutable versions without moving the local head", async () => {
  const repo = repository();
  const local = save("user-a", "local-version");
  const localOperation = operation("user-a", local);
  await repo.writeLocalSave(scope("user-a"), local, localOperation);
  const remote = {
    ...save("user-a", "remote-version", 1, "synced"),
    cloudRevision: "remote-revision",
  };

  await repo.preserveConflict(
    scope("user-a"),
    localOperation.operationId,
    remote,
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "local-version"))?.status,
    "conflict",
  );
  assert.equal(
    (await repo.getSaveVersion(scope("user-a"), "remote-version"))?.status,
    "conflict",
  );
  assert.equal(
    (await repo.getSaveHead(scope("user-a"), "game-1", "battery", "slot-1"))
      ?.versionId,
    "local-version",
  );
  assert.equal(
    (await repo.listSyncOperations(scope("user-a", 1000))).length,
    0,
  );
});

test("the repository fails with a typed error when IndexedDB is unavailable", async () => {
  const repo = createIndexedDbOfflineRepository({
    databaseName: "no-indexeddb",
  });
  await assert.rejects(
    repo.listGames(scope("user-a")),
    (error) =>
      error instanceof OfflineStorageError && error.code === "unavailable",
  );
});

test("a blocked database upgrade is reported as recoverable", async () => {
  const factory = new FakeIndexedDbFactory();
  factory.blockNextOpen = true;
  const repo = repository(factory);
  await assert.rejects(
    repo.listGames(scope("user-a")),
    (error) => error instanceof OfflineStorageError && error.code === "blocked",
  );
});

test("storage quota errors are typed and do not publish the failed ROM record", async () => {
  const factory = new FakeIndexedDbFactory();
  const repo = repository(factory);
  factory.failNextRequest = new DOMException(
    "Quota exceeded",
    "QuotaExceededError",
  );
  await assert.rejects(
    repo.putVerifiedGame(scope("user-a"), game("user-a")),
    (error) => error instanceof OfflineStorageError && error.code === "quota",
  );
  assert.deepEqual(await repo.listGames(scope("user-a")), []);
});

test("storage estimate reports approximate remaining quota and persistence status", async () => {
  const assessment = await inspectOfflineStorage({
    estimate: async () => ({ usage: 80, quota: 300 }),
    persisted: async () => false,
  });
  assert.deepEqual(assessment, {
    api: "available",
    usageBytes: 80,
    quotaBytes: 300,
    remainingBytes: 220,
    persistent: false,
    persistenceRequest: "unsupported",
  });
});

test("storage persistence is requested only through the explicit helper", async () => {
  assert.equal(
    await requestOfflineStoragePersistence({
      estimate: async () => ({}),
      persist: async () => true,
    }),
    "granted",
  );
  assert.equal(
    await requestOfflineStoragePersistence({
      estimate: async () => ({}),
      persist: async () => false,
    }),
    "denied",
  );
  assert.equal(
    await requestOfflineStoragePersistence(undefined),
    "unsupported",
  );
});
