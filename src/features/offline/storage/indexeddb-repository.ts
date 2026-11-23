import type {
  OfflineAccountScope,
  OfflineGameRecord,
  OfflineRepository,
  SaveHead,
  SaveOperationPatch,
  SaveSyncOperation,
  SaveVersionRecord,
} from "@/features/offline/contracts";
import { verifyBlobSha256 } from "../checksum.ts";

export const OFFLINE_DATABASE_NAME = "pixzer-offline";
export const OFFLINE_DATABASE_VERSION = 1;

const STORE = {
  games: "games",
  saveVersions: "saveVersions",
  saveHeads: "saveHeads",
  saveOutbox: "saveOutbox",
} as const;

const SHA256_PATTERN = /^[a-f\d]{64}$/i;

export type OfflineStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "upgrade"
  | "quota"
  | "aborted"
  | "conflict"
  | "not-found"
  | "invalid-record"
  | "database";

export class OfflineStorageError extends Error {
  readonly code: OfflineStorageErrorCode;

  constructor(
    code: OfflineStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OfflineStorageError";
    this.code = code;
  }
}

export type IndexedDbOfflineRepositoryOptions = {
  /** Injection point for tests; the browser global is read lazily otherwise. */
  factory?: IDBFactory;
  databaseName?: string;
  databaseVersion?: number;
};

type TransactionContext<T> = {
  succeed(value: T): void;
  fail(error: unknown): void;
};

type TransactionFailureContext = {
  fail(error: unknown): void;
};

function errorName(error: unknown): string | undefined {
  if (error && typeof error === "object" && "name" in error) {
    const name = error.name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

function storageError(error: unknown, context: string): OfflineStorageError {
  if (error instanceof OfflineStorageError) return error;

  const name = errorName(error);
  const code: OfflineStorageErrorCode =
    name === "QuotaExceededError"
      ? "quota"
      : name === "BlockedError"
        ? "blocked"
        : name === "VersionError"
          ? "upgrade"
          : name === "AbortError"
            ? "aborted"
            : name === "ConstraintError"
              ? "conflict"
              : name === "SecurityError" || name === "NotSupportedError"
                ? "unavailable"
                : "database";

  const message =
    code === "quota"
      ? "Browser storage is full. Remove offline copies or free device storage, then try again."
      : code === "blocked"
        ? "Offline storage is open in another tab. Close other pixzer tabs and retry."
        : code === "upgrade"
          ? "Offline storage could not be upgraded. Close other pixzer tabs and reload."
          : code === "aborted"
            ? "The local storage transaction did not finish. The previous saved data was kept."
            : code === "conflict"
              ? "This local version already exists. No stored version was overwritten."
              : code === "unavailable"
                ? "IndexedDB is unavailable in this browser context. Local offline storage cannot be used here."
                : `${context} failed. The previous local data was kept.`;

  return new OfflineStorageError(code, message, { cause: error });
}

function invalidRecord(message: string): OfflineStorageError {
  return new OfflineStorageError("invalid-record", message);
}

async function verifyBytes(
  blob: Blob,
  checksum: string,
  label: string,
): Promise<void> {
  try {
    if (await verifyBlobSha256(blob, checksum)) return;
  } catch (error) {
    throw new OfflineStorageError(
      "database",
      `Could not verify ${label} bytes before saving them locally.`,
      { cause: error },
    );
  }
  throw invalidRecord(
    `${label} bytes do not match the supplied SHA-256 checksum.`,
  );
}

function validateScope(scope: OfflineAccountScope): string {
  const userId = scope?.userId;
  if (typeof userId !== "string" || userId.trim() === "") {
    throw invalidRecord("A non-empty account scope is required.");
  }
  return userId;
}

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidRecord(`${label} is required.`);
  }
}

function requireChecksum(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw invalidRecord(`${label} must be a 64-character SHA-256 hex digest.`);
  }
}

function requireTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidRecord(`${label} must be a positive timestamp.`);
  }
}

function requireBlob(value: Blob, expectedSize: number, label: string): void {
  if (
    !value ||
    typeof value.size !== "number" ||
    typeof value.slice !== "function" ||
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    value.size !== expectedSize
  ) {
    throw invalidRecord(
      `${label} must be a non-empty Blob with matching size.`,
    );
  }
}

function validateGame(scope: OfflineAccountScope, game: OfflineGameRecord) {
  const userId = validateScope(scope);
  if (game?.userId !== userId) {
    throw invalidRecord(
      "The game does not belong to the active local account scope.",
    );
  }
  requireNonEmpty(game.gameId, "Game ID");
  requireNonEmpty(game.title, "Game title");
  requireNonEmpty(game.fileName, "Game filename");
  requireChecksum(game.romSha256, "ROM checksum");
  requireBlob(game.rom, game.sizeBytes, "ROM data");
  requireTimestamp(game.cachedAt, "Cached timestamp");
  requireTimestamp(game.verifiedAt, "Verified timestamp");
  if (game.verifiedAt < game.cachedAt) {
    throw invalidRecord(
      "ROM verification cannot predate the completed local cache record.",
    );
  }
}

function validateVersion(
  scope: OfflineAccountScope,
  version: SaveVersionRecord,
) {
  const userId = validateScope(scope);
  if (version?.userId !== userId) {
    throw invalidRecord(
      "The save does not belong to the active local account scope.",
    );
  }
  requireNonEmpty(version.gameId, "Game ID");
  requireNonEmpty(version.versionId, "Save version ID");
  requireNonEmpty(version.slotId, "Save slot");
  requireNonEmpty(version.deviceId, "Device ID");
  requireChecksum(version.romSha256, "ROM checksum");
  requireChecksum(version.payloadSha256, "Save checksum");
  requireChecksum(
    version.emulator.configurationSha256,
    "Emulator configuration checksum",
  );
  requireBlob(version.payload, version.sizeBytes, "Save data");
  requireTimestamp(version.createdAt, "Save timestamp");
  requireNonEmpty(version.emulator.emulatorId, "Emulator ID");
  requireNonEmpty(version.emulator.emulatorVersion, "Emulator version");
  requireNonEmpty(version.emulator.coreId, "Core ID");
  requireNonEmpty(version.emulator.coreVersion, "Core version");
  if (
    !Number.isSafeInteger(version.localRevision) ||
    version.localRevision < 1
  ) {
    throw invalidRecord("Local save revision must be a positive integer.");
  }
}

function validateOperation(
  scope: OfflineAccountScope,
  version: SaveVersionRecord,
  operation: SaveSyncOperation,
) {
  const userId = validateScope(scope);
  if (
    operation?.userId !== userId ||
    operation.versionId !== version.versionId ||
    operation.gameId !== version.gameId ||
    operation.expectedParentRevision !== version.parentRevision
  ) {
    throw invalidRecord(
      "The outbox operation does not match the local save version.",
    );
  }
  requireNonEmpty(operation.operationId, "Sync operation ID");
  requireNonEmpty(operation.idempotencyKey, "Sync idempotency key");
  requireTimestamp(operation.createdAt, "Sync operation timestamp");
  if (!Number.isSafeInteger(operation.attempts) || operation.attempts < 0) {
    throw invalidRecord("Sync attempt count must be a non-negative integer.");
  }
  if (
    !Number.isFinite(operation.nextAttemptAt) ||
    operation.nextAttemptAt < 0
  ) {
    throw invalidRecord("Next sync attempt must be a non-negative timestamp.");
  }
  if (version.status !== "pending" || operation.status !== "pending") {
    throw invalidRecord("A new local save must begin in pending sync state.");
  }
}

function installSchema(request: IDBOpenDBRequest): void {
  const database = request.result;
  const transaction = request.transaction;
  if (!transaction) {
    throw new OfflineStorageError(
      "upgrade",
      "The offline database upgrade transaction is missing.",
    );
  }

  const ensureStore = (
    name: string,
    keyPath: string | string[],
    indexes: ReadonlyArray<{ name: string; keyPath: string | string[] }>,
  ) => {
    const store = database.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : database.createObjectStore(name, { keyPath });
    for (const index of indexes) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, { unique: false });
      }
    }
  };

  ensureStore(
    STORE.games,
    ["userId", "gameId"],
    [{ name: "byUser", keyPath: "userId" }],
  );
  ensureStore(
    STORE.saveVersions,
    ["userId", "versionId"],
    [{ name: "byUser", keyPath: "userId" }],
  );
  ensureStore(
    STORE.saveHeads,
    ["userId", "gameId", "kind", "slotId"],
    [{ name: "byUser", keyPath: "userId" }],
  );
  ensureStore(
    STORE.saveOutbox,
    ["userId", "operationId"],
    [
      { name: "byUser", keyPath: "userId" },
      { name: "byUserVersion", keyPath: ["userId", "versionId"] },
    ],
  );
}

function runTransaction<T>(
  database: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  queue: (transaction: IDBTransaction, context: TransactionContext<T>) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(stores, mode);
    } catch (error) {
      reject(storageError(error, "Opening offline storage transaction"));
      return;
    }

    let result: T;
    let hasResult = false;
    let failure: OfflineStorageError | null = null;
    const context: TransactionContext<T> = {
      succeed(value) {
        result = value;
        hasResult = true;
      },
      fail(error) {
        if (failure) return;
        failure = storageError(error, "Offline storage transaction");
        try {
          transaction.abort();
        } catch {
          // The transaction may already be aborting or complete.
        }
      },
    };

    transaction.oncomplete = () => {
      if (failure) {
        reject(failure);
      } else if (hasResult) {
        resolve(result);
      } else {
        reject(
          new OfflineStorageError(
            "database",
            "Offline storage transaction completed without a result.",
          ),
        );
      }
    };
    transaction.onerror = () => {
      if (!failure) {
        failure = storageError(
          transaction.error,
          "Offline storage transaction",
        );
      }
    };
    transaction.onabort = () => {
      reject(
        failure ??
          storageError(
            transaction.error ??
              new DOMException("Transaction aborted", "AbortError"),
            "Offline storage transaction",
          ),
      );
    };

    try {
      queue(transaction, context);
    } catch (error) {
      context.fail(error);
    }
  });
}

function attachRequestFailure<T>(
  request: IDBRequest<T>,
  context: TransactionFailureContext,
): void {
  request.onerror = () => context.fail(request.error);
}

function sameHeadKey(
  head: SaveHead,
  scope: OfflineAccountScope,
  version: SaveVersionRecord,
): boolean {
  return (
    head.userId === scope.userId &&
    head.gameId === version.gameId &&
    head.kind === version.kind &&
    head.slotId === version.slotId
  );
}

export class IndexedDbOfflineRepository implements OfflineRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly factory?: IDBFactory;
  private readonly databaseName: string;
  private readonly databaseVersion: number;
  private connection: IDBDatabase | null = null;

  constructor(options: IndexedDbOfflineRepositoryOptions = {}) {
    this.factory = options.factory;
    this.databaseName = options.databaseName ?? OFFLINE_DATABASE_NAME;
    this.databaseVersion = options.databaseVersion ?? OFFLINE_DATABASE_VERSION;
  }

  close(): void {
    this.databasePromise = null;
    this.connection?.close();
    this.connection = null;
  }

  async listGames(scope: OfflineAccountScope): Promise<OfflineGameRecord[]> {
    const userId = validateScope(scope);
    const database = await this.database();
    return runTransaction(
      database,
      STORE.games,
      "readonly",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.games)
          .index("byUser")
          .getAll(userId) as IDBRequest<OfflineGameRecord[]>;
        request.onsuccess = () => context.succeed(request.result);
        attachRequestFailure(request, context);
      },
    );
  }

  async getGame(
    scope: OfflineAccountScope,
    gameId: string,
  ): Promise<OfflineGameRecord | null> {
    const userId = validateScope(scope);
    requireNonEmpty(gameId, "Game ID");
    const database = await this.database();
    return runTransaction(
      database,
      STORE.games,
      "readonly",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.games)
          .get([userId, gameId]) as IDBRequest<OfflineGameRecord | undefined>;
        request.onsuccess = () => context.succeed(request.result ?? null);
        attachRequestFailure(request, context);
      },
    );
  }

  async putVerifiedGame(
    scope: OfflineAccountScope,
    game: OfflineGameRecord,
  ): Promise<void> {
    validateGame(scope, game);
    await verifyBytes(game.rom, game.romSha256, "ROM");
    const database = await this.database();
    return runTransaction(
      database,
      STORE.games,
      "readwrite",
      (transaction, context) => {
        const request = transaction.objectStore(STORE.games).put(game);
        request.onsuccess = () => context.succeed(undefined);
        attachRequestFailure(request, context);
      },
    );
  }

  async deleteGame(scope: OfflineAccountScope, gameId: string): Promise<void> {
    const userId = validateScope(scope);
    requireNonEmpty(gameId, "Game ID");
    const database = await this.database();
    return runTransaction(
      database,
      STORE.games,
      "readwrite",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.games)
          .delete([userId, gameId]);
        request.onsuccess = () => context.succeed(undefined);
        attachRequestFailure(request, context);
      },
    );
  }

  async getSaveHead(
    scope: OfflineAccountScope,
    gameId: string,
    kind: SaveHead["kind"],
    slotId: string,
  ): Promise<SaveHead | null> {
    const userId = validateScope(scope);
    requireNonEmpty(gameId, "Game ID");
    requireNonEmpty(slotId, "Save slot");
    const database = await this.database();
    return runTransaction(
      database,
      STORE.saveHeads,
      "readonly",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.saveHeads)
          .get([userId, gameId, kind, slotId]) as IDBRequest<
          SaveHead | undefined
        >;
        request.onsuccess = () => context.succeed(request.result ?? null);
        attachRequestFailure(request, context);
      },
    );
  }

  async getSaveVersion(
    scope: OfflineAccountScope,
    versionId: string,
  ): Promise<SaveVersionRecord | null> {
    const userId = validateScope(scope);
    requireNonEmpty(versionId, "Save version ID");
    const database = await this.database();
    return runTransaction(
      database,
      STORE.saveVersions,
      "readonly",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.saveVersions)
          .get([userId, versionId]) as IDBRequest<
          SaveVersionRecord | undefined
        >;
        request.onsuccess = () => context.succeed(request.result ?? null);
        attachRequestFailure(request, context as TransactionContext<unknown>);
      },
    );
  }

  async writeLocalSave(
    scope: OfflineAccountScope,
    version: SaveVersionRecord,
    operation: SaveSyncOperation,
  ): Promise<void> {
    validateVersion(scope, version);
    validateOperation(scope, version, operation);
    await verifyBytes(version.payload, version.payloadSha256, "Save");
    const userId = scope.userId;
    const database = await this.database();
    return runTransaction(
      database,
      [STORE.saveVersions, STORE.saveHeads, STORE.saveOutbox],
      "readwrite",
      (transaction, context) => {
        const heads = transaction.objectStore(STORE.saveHeads);
        const versions = transaction.objectStore(STORE.saveVersions);
        const outbox = transaction.objectStore(STORE.saveOutbox);
        const headKey = [userId, version.gameId, version.kind, version.slotId];
        const headRequest = heads.get(headKey) as IDBRequest<
          SaveHead | undefined
        >;
        attachRequestFailure(headRequest, context);
        headRequest.onsuccess = () => {
          const currentHead = headRequest.result;
          const enqueueNewVersion = () => {
            try {
              versions.add(version);
              heads.put({
                userId,
                gameId: version.gameId,
                kind: version.kind,
                slotId: version.slotId,
                versionId: version.versionId,
              } satisfies SaveHead);
              outbox.add(operation);
              context.succeed(undefined);
            } catch (error) {
              context.fail(error);
            }
          };

          if (!currentHead) {
            if (
              version.localRevision !== 1 ||
              version.parentRevision !== null
            ) {
              context.fail(
                invalidRecord(
                  "The first local save revision must start at 1 with no parent.",
                ),
              );
              return;
            }
            enqueueNewVersion();
            return;
          }

          if (!sameHeadKey(currentHead, scope, version)) {
            context.fail(
              invalidRecord(
                "The current save head does not match the new version.",
              ),
            );
            return;
          }
          const previousRequest = versions.get([
            userId,
            currentHead.versionId,
          ]) as IDBRequest<SaveVersionRecord | undefined>;
          attachRequestFailure(previousRequest, context);
          previousRequest.onsuccess = () => {
            const previous = previousRequest.result;
            if (!previous) {
              context.fail(
                new OfflineStorageError(
                  "database",
                  "The current local save head points to a missing version.",
                ),
              );
              return;
            }
            if (
              previous.userId !== userId ||
              previous.gameId !== version.gameId ||
              previous.kind !== version.kind ||
              previous.slotId !== version.slotId ||
              version.localRevision !== previous.localRevision + 1
            ) {
              context.fail(
                new OfflineStorageError(
                  "conflict",
                  "A newer local save already exists. The existing version was kept.",
                ),
              );
              return;
            }
            enqueueNewVersion();
          };
        };
      },
    );
  }

  async listSyncOperations(
    scope: OfflineAccountScope,
    dueAt = Date.now(),
  ): Promise<SaveSyncOperation[]> {
    const userId = validateScope(scope);
    if (!Number.isFinite(dueAt) || dueAt < 0) {
      throw invalidRecord("Sync due time must be a non-negative timestamp.");
    }
    const database = await this.database();
    return runTransaction(
      database,
      STORE.saveOutbox,
      "readonly",
      (transaction, context) => {
        const request = transaction
          .objectStore(STORE.saveOutbox)
          .index("byUser")
          .getAll(userId) as IDBRequest<SaveSyncOperation[]>;
        request.onsuccess = () => {
          const due = request.result
            .filter(
              (operation) =>
                operation.userId === userId &&
                operation.status !== "synced" &&
                operation.status !== "conflict" &&
                operation.nextAttemptAt <= dueAt,
            )
            .sort(
              (left, right) =>
                left.nextAttemptAt - right.nextAttemptAt ||
                left.createdAt - right.createdAt,
            );
          context.succeed(due);
        };
        attachRequestFailure(request, context);
      },
    );
  }

  async updateOperationAndVersion(
    scope: OfflineAccountScope,
    operationId: string,
    patch: SaveOperationPatch,
  ): Promise<void> {
    const userId = validateScope(scope);
    requireNonEmpty(operationId, "Sync operation ID");
    if (patch.status === "synced" || patch.status === "conflict") {
      throw invalidRecord(
        "Use completion or conflict handling to finalize a sync operation.",
      );
    }
    if (
      patch.attempts !== undefined &&
      (!Number.isSafeInteger(patch.attempts) || patch.attempts < 0)
    ) {
      throw invalidRecord("Sync attempt count must be a non-negative integer.");
    }
    if (
      patch.nextAttemptAt !== undefined &&
      (!Number.isFinite(patch.nextAttemptAt) || patch.nextAttemptAt < 0)
    ) {
      throw invalidRecord(
        "Next sync attempt must be a non-negative timestamp.",
      );
    }

    const database = await this.database();
    return runTransaction(
      database,
      [STORE.saveOutbox, STORE.saveVersions],
      "readwrite",
      (transaction, context) => {
        const outbox = transaction.objectStore(STORE.saveOutbox);
        const versions = transaction.objectStore(STORE.saveVersions);
        const operationRequest = outbox.get([
          userId,
          operationId,
        ]) as IDBRequest<SaveSyncOperation | undefined>;
        attachRequestFailure(operationRequest, context);
        operationRequest.onsuccess = () => {
          const operation = operationRequest.result;
          if (!operation || operation.userId !== userId) {
            context.fail(
              new OfflineStorageError(
                "not-found",
                "The local sync operation was not found.",
              ),
            );
            return;
          }
          if (
            operation.status === "conflict" ||
            operation.status === "synced"
          ) {
            context.fail(
              new OfflineStorageError(
                operation.status === "conflict" ? "conflict" : "not-found",
                "A completed or conflicted sync operation cannot be retried.",
              ),
            );
            return;
          }
          const versionRequest = versions.get([
            userId,
            operation.versionId,
          ]) as IDBRequest<SaveVersionRecord | undefined>;
          attachRequestFailure(versionRequest, context);
          versionRequest.onsuccess = () => {
            const version = versionRequest.result;
            if (
              !version ||
              version.userId !== userId ||
              version.gameId !== operation.gameId
            ) {
              context.fail(
                new OfflineStorageError(
                  "not-found",
                  "The local save version was not found.",
                ),
              );
              return;
            }
            const operationUpdate = outbox.put({ ...operation, ...patch });
            operationUpdate.onerror = () => context.fail(operationUpdate.error);
            const versionUpdate = versions.put({
              ...version,
              status: patch.status ?? version.status,
            } satisfies SaveVersionRecord);
            versionUpdate.onerror = () => context.fail(versionUpdate.error);
            context.succeed(undefined);
          };
        };
      },
    );
  }
  async completeSyncOperation(
    scope: OfflineAccountScope,
    operationId: string,
    cloudRevision: string,
  ): Promise<void> {
    const userId = validateScope(scope);
    requireNonEmpty(operationId, "Sync operation ID");
    requireNonEmpty(cloudRevision, "Cloud revision");
    const database = await this.database();
    return runTransaction(
      database,
      [STORE.saveVersions, STORE.saveOutbox],
      "readwrite",
      (transaction, context) => {
        const versions = transaction.objectStore(STORE.saveVersions);
        const outbox = transaction.objectStore(STORE.saveOutbox);
        const operationRequest = outbox.get([
          userId,
          operationId,
        ]) as IDBRequest<SaveSyncOperation | undefined>;
        attachRequestFailure(operationRequest, context);
        operationRequest.onsuccess = () => {
          const operation = operationRequest.result;
          if (!operation || operation.userId !== userId) {
            context.fail(
              new OfflineStorageError(
                "not-found",
                "The local sync operation was not found.",
              ),
            );
            return;
          }
          const versionRequest = versions.get([
            userId,
            operation.versionId,
          ]) as IDBRequest<SaveVersionRecord | undefined>;
          attachRequestFailure(versionRequest, context);
          versionRequest.onsuccess = () => {
            const version = versionRequest.result;
            if (
              !version ||
              version.userId !== userId ||
              version.gameId !== operation.gameId
            ) {
              context.fail(
                new OfflineStorageError(
                  "not-found",
                  "The local save version was not found.",
                ),
              );
              return;
            }
            if (
              operation.status === "conflict" ||
              version.status === "conflict"
            ) {
              context.fail(
                new OfflineStorageError(
                  "conflict",
                  "A conflicted save cannot be marked synced.",
                ),
              );
              return;
            }
            if (operation.status === "synced" || version.status === "synced") {
              if (
                operation.status === "synced" &&
                version.status === "synced" &&
                version.cloudRevision === cloudRevision
              ) {
                context.succeed(undefined);
                return;
              }
              context.fail(
                new OfflineStorageError(
                  "conflict",
                  "The save was already committed at another cloud revision.",
                ),
              );
              return;
            }
            const versionUpdate = versions.put({
              ...version,
              cloudRevision,
              status: "synced",
            } satisfies SaveVersionRecord);
            versionUpdate.onerror = () => context.fail(versionUpdate.error);
            const operationUpdate = outbox.put({
              ...operation,
              status: "synced",
              lastErrorCode: null,
            } satisfies SaveSyncOperation);
            operationUpdate.onerror = () => context.fail(operationUpdate.error);
            context.succeed(undefined);
          };
        };
      },
    );
  }
  async preserveConflict(
    scope: OfflineAccountScope,
    operationId: string,
    remoteVersion: SaveVersionRecord,
  ): Promise<void> {
    const userId = validateScope(scope);
    requireNonEmpty(operationId, "Sync operation ID");
    validateVersion(scope, remoteVersion);
    if (remoteVersion.cloudRevision === null) {
      throw invalidRecord(
        "A conflicting remote version must include its cloud revision.",
      );
    }
    const database = await this.database();
    return runTransaction(
      database,
      [STORE.saveVersions, STORE.saveOutbox],
      "readwrite",
      (transaction, context) => {
        const versions = transaction.objectStore(STORE.saveVersions);
        const outbox = transaction.objectStore(STORE.saveOutbox);
        const operationRequest = outbox.get([
          userId,
          operationId,
        ]) as IDBRequest<SaveSyncOperation | undefined>;
        attachRequestFailure(operationRequest, context);
        operationRequest.onsuccess = () => {
          const operation = operationRequest.result;
          if (!operation || operation.userId !== userId) {
            context.fail(
              new OfflineStorageError(
                "not-found",
                "The local sync operation was not found.",
              ),
            );
            return;
          }
          const localRequest = versions.get([
            userId,
            operation.versionId,
          ]) as IDBRequest<SaveVersionRecord | undefined>;
          attachRequestFailure(localRequest, context);
          localRequest.onsuccess = () => {
            const localVersion = localRequest.result;
            if (!localVersion || localVersion.userId !== userId) {
              context.fail(
                new OfflineStorageError(
                  "not-found",
                  "The local save version was not found.",
                ),
              );
              return;
            }
            if (
              remoteVersion.versionId === localVersion.versionId ||
              remoteVersion.gameId !== localVersion.gameId ||
              remoteVersion.romSha256 !== localVersion.romSha256 ||
              remoteVersion.kind !== localVersion.kind ||
              remoteVersion.slotId !== localVersion.slotId
            ) {
              context.fail(
                invalidRecord(
                  "The remote save does not match the local game and save slot.",
                ),
              );
              return;
            }
            try {
              versions.add({ ...remoteVersion, status: "conflict" });
              versions.put({ ...localVersion, status: "conflict" });
              outbox.put({
                ...operation,
                status: "conflict",
                lastErrorCode: "revision_conflict",
              });
              context.succeed(undefined);
            } catch (error) {
              context.fail(error);
            }
          };
        };
      },
    );
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) {
      return Promise.reject(
        new OfflineStorageError(
          "unavailable",
          "IndexedDB is unavailable in this browser context. Local offline storage cannot be used here.",
        ),
      );
    }

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(this.databaseName, this.databaseVersion);
      } catch (error) {
        reject(storageError(error, "Opening offline database"));
        return;
      }

      let settled = false;
      let blockedReported = false;
      const finishError = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(storageError(error, "Opening offline database"));
      };

      request.onupgradeneeded = () => {
        try {
          installSchema(request);
        } catch (error) {
          finishError(error);
          try {
            request.transaction?.abort();
          } catch {
            // The browser will still report the upgrade failure through onerror.
          }
        }
      };
      request.onblocked = () => {
        blockedReported = true;
        finishError(
          new OfflineStorageError(
            "blocked",
            "Offline storage is open in another tab. Close other pixzer tabs and retry.",
          ),
        );
      };
      request.onerror = () => finishError(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        if (blockedReported) {
          database.close();
          finishError(
            new OfflineStorageError(
              "blocked",
              "Offline database opening was blocked.",
            ),
          );
          return;
        }
        settled = true;
        database.onversionchange = () => {
          if (this.connection === database) this.close();
          else database.close();
        };
        this.connection = database;
        resolve(database);
      };
    });

    const databasePromise = opening.catch((error: unknown) => {
      if (this.databasePromise === databasePromise) this.databasePromise = null;
      throw error;
    });
    this.databasePromise = databasePromise;
    return databasePromise;
  }
}

export function createIndexedDbOfflineRepository(
  options: IndexedDbOfflineRepositoryOptions = {},
): IndexedDbOfflineRepository {
  return new IndexedDbOfflineRepository(options);
}
