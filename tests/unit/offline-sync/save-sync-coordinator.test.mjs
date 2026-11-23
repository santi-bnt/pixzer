import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  SaveSyncCoordinator,
  SaveSyncFailure,
} from "../../../src/features/offline/sync/save-sync-coordinator.ts";

const scope = { userId: "invited-user-1" };

function makeVersion(overrides = {}) {
  const payload = new Blob(["local save payload"]);
  return {
    userId: scope.userId,
    gameId: "game-1",
    romSha256: "a".repeat(64),
    versionId: "local-v1",
    parentRevision: null,
    cloudRevision: null,
    kind: "battery",
    slotId: "slot-1",
    payload,
    payloadSha256: "b".repeat(64),
    sizeBytes: payload.size,
    emulator: {
      emulatorId: "emulator-js",
      emulatorVersion: "1.0.0",
      coreId: "gb",
      coreVersion: "2.0.0",
      configurationSha256: "c".repeat(64),
    },
    deviceId: "device-install-1",
    localRevision: 1,
    status: "pending",
    createdAt: 10,
    ...overrides,
  };
}

function makeOperation(version, overrides = {}) {
  return {
    userId: scope.userId,
    operationId: "operation-1",
    idempotencyKey: "stable-idempotency-key",
    versionId: version.versionId,
    gameId: version.gameId,
    expectedParentRevision: version.parentRevision,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 10,
    lastErrorCode: null,
    createdAt: 10,
    ...overrides,
  };
}

class MemoryRepository {
  games = [];
  versions = new Map();
  operations = new Map();
  heads = new Map();

  async listGames(userScope) {
    return this.games.filter((game) => game.userId === userScope.userId);
  }

  async getGame(userScope, gameId) {
    return (
      this.games.find(
        (game) => game.userId === userScope.userId && game.gameId === gameId,
      ) ?? null
    );
  }

  async putVerifiedGame(userScope, game) {
    if (game.userId !== userScope.userId) throw new Error("scope mismatch");
    this.games.push(game);
  }

  async deleteGame(userScope, gameId) {
    const index = this.games.findIndex(
      (game) => game.userId === userScope.userId && game.gameId === gameId,
    );
    if (index >= 0) this.games.splice(index, 1);
  }

  async getSaveHead(userScope, gameId, kind, slotId) {
    return (
      this.heads.get(`${userScope.userId}:${gameId}:${kind}:${slotId}`) ?? null
    );
  }

  async getSaveVersion(userScope, versionId) {
    return this.versions.get(`${userScope.userId}:${versionId}`) ?? null;
  }

  async writeLocalSave(userScope, version, operation) {
    if (
      version.userId !== userScope.userId ||
      operation.userId !== userScope.userId
    ) {
      throw new Error("scope mismatch");
    }
    this.versions.set(`${userScope.userId}:${version.versionId}`, version);
    this.operations.set(
      `${userScope.userId}:${operation.operationId}`,
      operation,
    );
    this.heads.set(
      `${userScope.userId}:${version.gameId}:${version.kind}:${version.slotId}`,
      {
        userId: userScope.userId,
        gameId: version.gameId,
        kind: version.kind,
        slotId: version.slotId,
        versionId: version.versionId,
      },
    );
  }

  async listSyncOperations(userScope, dueAt) {
    return [...this.operations.values()].filter(
      (operation) =>
        operation.userId === userScope.userId &&
        (dueAt === undefined || operation.nextAttemptAt <= dueAt),
    );
  }

  async updateOperationAndVersion(userScope, operationId, patch) {
    const opKey = `${userScope.userId}:${operationId}`;
    const operation = this.operations.get(opKey);
    if (!operation) throw new Error("operation missing");
    const updatedOperation = { ...operation, ...patch };
    this.operations.set(opKey, updatedOperation);
    const versionKey = `${userScope.userId}:${operation.versionId}`;
    const version = this.versions.get(versionKey);
    if (version && patch.status) {
      this.versions.set(versionKey, { ...version, status: patch.status });
    }
  }

  async completeSyncOperation(userScope, operationId, cloudRevision) {
    const opKey = `${userScope.userId}:${operationId}`;
    const operation = this.operations.get(opKey);
    if (!operation) throw new Error("operation missing");
    const versionKey = `${userScope.userId}:${operation.versionId}`;
    const version = this.versions.get(versionKey);
    if (!version) throw new Error("version missing");
    this.versions.set(versionKey, {
      ...version,
      status: "synced",
      cloudRevision,
    });
    this.operations.set(opKey, {
      ...operation,
      status: "synced",
      nextAttemptAt: Date.now(),
      lastErrorCode: null,
    });
  }

  async preserveConflict(userScope, operationId, remoteVersion) {
    if (remoteVersion.userId !== userScope.userId) {
      throw new Error("scope mismatch");
    }
    const opKey = `${userScope.userId}:${operationId}`;
    const operation = this.operations.get(opKey);
    if (!operation) throw new Error("operation missing");
    const localKey = `${userScope.userId}:${operation.versionId}`;
    const localVersion = this.versions.get(localKey);
    if (!localVersion) throw new Error("local version missing");
    this.versions.set(localKey, { ...localVersion, status: "conflict" });
    this.versions.set(
      `${userScope.userId}:${remoteVersion.versionId}`,
      remoteVersion,
    );
    this.operations.set(opKey, { ...operation, status: "conflict" });
  }
}

function makeRemoteConflict(
  version,
  remotePayload = new Blob(["remote payload"]),
) {
  const remoteFields = { ...version };
  delete remoteFields.userId;
  delete remoteFields.status;
  delete remoteFields.payload;
  return {
    payload: remotePayload,
    response: {
      kind: "conflict",
      current: {
        ...remoteFields,
        versionId: "remote-v2",
        parentRevision: "cloud-r1",
        cloudRevision: "cloud-r2",
        payloadSha256: createHash("sha256")
          .update(Buffer.from("remote payload"))
          .digest("hex"),
        sizeBytes: remotePayload.size,
        status: "synced",
      },
    },
  };
}

function createCoordinator(repository, upload, options = {}) {
  return new SaveSyncCoordinator({
    repository,
    transport: {
      uploadVersion: upload,
      downloadVersionPayload:
        options.downloadVersionPayload ??
        (async () => new Blob(["remote payload"])),
    },
    authorize:
      options.authorize ??
      (async (requestedScope) => ({
        userId: requestedScope.userId,
        verifiedAt: options.now?.() ?? 100,
      })),
    now: options.now ?? (() => 100),
    random: () => 0.5,
    policy: options.policy,
  });
}

test("accepted upload atomically confirms the revision but keeps its local blob", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  const originalPayload = version.payload;
  let sentVersion;
  let sentIdempotencyKey = "";
  const coordinator = createCoordinator(repository, async (input) => {
    sentVersion = input.version;
    sentIdempotencyKey = input.idempotencyKey;
    return { kind: "accepted", cloudRevision: "cloud-r1" };
  });

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.equal(result.status, "synced");
  assert.equal(sentIdempotencyKey, operation.idempotencyKey);
  assert.equal(Object.hasOwn(sentVersion, "userId"), false);
  assert.equal(Object.hasOwn(sentVersion, "gameId"), false);
  assert.equal(
    (await repository.getSaveVersion(scope, version.versionId))?.payload,
    originalPayload,
  );
  assert.equal(
    (await repository.getSaveVersion(scope, version.versionId))?.cloudRevision,
    "cloud-r1",
  );
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.status,
    "synced",
  );
});

test("stale or mismatched local authorization prevents any upload", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  let uploadCalls = 0;
  const coordinator = createCoordinator(
    repository,
    async () => {
      uploadCalls += 1;
      return { kind: "accepted", cloudRevision: "unexpected" };
    },
    {
      now: () => 100,
      policy: { maxAuthorizationAgeMs: 20 },
      authorize: async () => ({ userId: scope.userId, verifiedAt: 1 }),
    },
  );

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.equal(result.status, "authorization_required");
  assert.equal(uploadCalls, 0);
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.status,
    "pending",
  );
});

test("retry delay is bounded and automatic attempts stop at the configured limit", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  let now = 100;
  let uploads = 0;
  const idempotencyKeys = [];
  const coordinator = createCoordinator(
    repository,
    async (input) => {
      uploads += 1;
      idempotencyKeys.push(input.idempotencyKey);
      throw new SaveSyncFailure("network", true, "temporary network error");
    },
    {
      now: () => now,
      policy: {
        maxAttempts: 2,
        baseDelayMs: 100,
        maxDelayMs: 500,
        jitterRatio: 0,
      },
    },
  );

  const first = await coordinator.syncOperation(scope, operation.operationId);
  assert.equal(first.status, "retry_scheduled");
  assert.equal(first.nextAttemptAt, 200);
  now = 200;
  const second = await coordinator.syncOperation(scope, operation.operationId);
  assert.equal(second.status, "failed");
  assert.equal(uploads, 2);
  assert.deepEqual(idempotencyKeys, [
    operation.idempotencyKey,
    operation.idempotencyKey,
  ]);

  const third = await coordinator.syncOperation(scope, operation.operationId);
  assert.equal(third.status, "not_due");
  assert.equal(uploads, 2);
});

test("manual retry resets the attempt counter without changing idempotency", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version, {
    status: "failed",
    attempts: 2,
    nextAttemptAt: 10,
    lastErrorCode: "network",
  });
  await repository.writeLocalSave(scope, version, operation);
  let receivedKey = "";
  const coordinator = createCoordinator(repository, async (input) => {
    receivedKey = input.idempotencyKey;
    return { kind: "accepted", cloudRevision: "cloud-r3" };
  });

  const result = await coordinator.retryFailedOperation(
    scope,
    operation.operationId,
  );

  assert.equal(result.status, "synced");
  assert.equal(receivedKey, operation.idempotencyKey);
});

test("revision conflict preserves both immutable branches and marks local operation conflicted", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion({ parentRevision: "cloud-r1" });
  const operation = makeOperation(version, {
    expectedParentRevision: "cloud-r1",
  });
  await repository.writeLocalSave(scope, version, operation);
  const conflict = makeRemoteConflict(version);
  const coordinator = createCoordinator(
    repository,
    async () => conflict.response,
    { downloadVersionPayload: async () => conflict.payload },
  );

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.deepEqual(result, {
    status: "conflict",
    operationId: operation.operationId,
    remoteVersionId: "remote-v2",
  });
  assert.equal(
    (await repository.getSaveVersion(scope, "local-v1"))?.status,
    "conflict",
  );
  const preservedRemote = await repository.getSaveVersion(scope, "remote-v2");
  assert.equal(preservedRemote?.userId, scope.userId);
  assert.equal(preservedRemote?.cloudRevision, "cloud-r2");
  assert.equal(preservedRemote?.payload.size, conflict.payload.size);
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.status,
    "conflict",
  );
});

test("malformed or cross-game conflict response is not persisted", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  const remote = makeRemoteConflict(version);
  const coordinator = createCoordinator(
    repository,
    async () => ({
      kind: "conflict",
      current: { ...remote.response.current, gameId: "another-game" },
    }),
    { downloadVersionPayload: async () => remote.payload },
  );

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.equal(result.status, "failed");
  assert.equal(await repository.getSaveVersion(scope, "remote-v2"), null);
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.lastErrorCode,
    "invalid_conflict_response",
  );
});

test("oversized remote conflict metadata is rejected before downloading bytes", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  const conflict = makeRemoteConflict(version);
  let downloadRequested = false;
  const coordinator = createCoordinator(
    repository,
    async () => ({
      ...conflict.response,
      current: { ...conflict.response.current, sizeBytes: 11 },
    }),
    {
      policy: { maxConflictPayloadBytes: 10 },
      downloadVersionPayload: async () => {
        downloadRequested = true;
        return conflict.payload;
      },
    },
  );

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.equal(result.status, "failed");
  assert.equal(downloadRequested, false);
  assert.equal(await repository.getSaveVersion(scope, "remote-v2"), null);
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.lastErrorCode,
    "conflict_payload_too_large",
  );
});

test("remote conflict payload is rejected when its streamed checksum mismatches metadata", async () => {
  const repository = new MemoryRepository();
  const version = makeVersion();
  const operation = makeOperation(version);
  await repository.writeLocalSave(scope, version, operation);
  const conflict = makeRemoteConflict(version);
  const coordinator = createCoordinator(
    repository,
    async () => ({
      ...conflict.response,
      current: {
        ...conflict.response.current,
        payloadSha256: "0".repeat(64),
      },
    }),
    { downloadVersionPayload: async () => conflict.payload },
  );

  const result = await coordinator.syncOperation(scope, operation.operationId);

  assert.equal(result.status, "failed");
  assert.equal(await repository.getSaveVersion(scope, "remote-v2"), null);
  assert.equal(
    (await repository.listSyncOperations(scope))[0]?.lastErrorCode,
    "remote_payload_checksum_mismatch",
  );
});

test("sync run processes one bounded snapshot and never loops until retries finish", async () => {
  const repository = new MemoryRepository();
  for (let index = 0; index < 3; index += 1) {
    const version = makeVersion({
      versionId: `local-v${index}`,
      createdAt: index,
    });
    const operation = makeOperation(version, {
      operationId: `operation-${index}`,
      versionId: version.versionId,
      createdAt: index,
    });
    await repository.writeLocalSave(scope, version, operation);
  }
  let uploads = 0;
  const coordinator = createCoordinator(
    repository,
    async () => {
      uploads += 1;
      return { kind: "accepted", cloudRevision: `cloud-r${uploads}` };
    },
    { policy: { maxOperationsPerRun: 2 } },
  );

  const run = await coordinator.syncPending(scope);

  assert.equal(run.results.length, 2);
  assert.equal(run.skippedDueToLimit, 1);
  assert.equal(uploads, 2);
});
