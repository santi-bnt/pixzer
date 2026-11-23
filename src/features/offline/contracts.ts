import type { ConsoleId } from "@/features/player/contracts";

/**
 * A local partition hint, not a security credential. Callers must derive this
 * from the current Supabase identity when online or its cached user identity
 * for local-only access. It must never authorize a cloud operation.
 */
export type OfflineAccountScope = {
  userId: string;
};

export type OfflineGameRecord = {
  userId: string;
  gameId: string;
  title: string;
  fileName: string;
  consoleId: ConsoleId;
  romSha256: string;
  sizeBytes: number;
  rom: Blob;
  cachedAt: number;
  verifiedAt: number;
};

export type SaveArtifactKind = "battery" | "state";
export type SaveSyncStatus =
  "local" | "pending" | "syncing" | "synced" | "conflict" | "failed";

export type EmulatorSaveIdentity = {
  emulatorId: string;
  emulatorVersion: string;
  coreId: string;
  coreVersion: string;
  configurationSha256: string;
};

/** Immutable binary save version. Cloud revision IDs are opaque server values. */
export type SaveVersionRecord = {
  userId: string;
  gameId: string;
  romSha256: string;
  versionId: string;
  parentRevision: string | null;
  cloudRevision: string | null;
  kind: SaveArtifactKind;
  slotId: string;
  payload: Blob;
  payloadSha256: string;
  sizeBytes: number;
  emulator: EmulatorSaveIdentity;
  deviceId: string;
  localRevision: number;
  status: SaveSyncStatus;
  createdAt: number;
};

/** Durable retry record committed atomically with its immutable local save. */
export type SaveSyncOperation = {
  userId: string;
  operationId: string;
  idempotencyKey: string;
  versionId: string;
  gameId: string;
  expectedParentRevision: string | null;
  status: Exclude<SaveSyncStatus, "local">;
  attempts: number;
  nextAttemptAt: number;
  lastErrorCode: string | null;
  createdAt: number;
};

export type SaveHead = {
  userId: string;
  gameId: string;
  kind: SaveArtifactKind;
  slotId: string;
  versionId: string;
};

export type SaveOperationPatch = Partial<
  Pick<
    SaveSyncOperation,
    "status" | "attempts" | "nextAttemptAt" | "lastErrorCode"
  >
>;

/** Cloud payload omits local ownership, head and status fields by construction. */
export type SaveUploadVersion = Omit<
  SaveVersionRecord,
  "userId" | "gameId" | "parentRevision" | "cloudRevision" | "status"
>;

/** Server response without an owner field; the client supplies local scope. */
export type RemoteSaveVersionMetadata = Omit<
  SaveVersionRecord,
  "userId" | "status" | "payload"
> & { status: "synced" };

/** Browser persistence boundary. Implementations must partition every key by userId. */
export interface OfflineRepository {
  listGames(scope: OfflineAccountScope): Promise<OfflineGameRecord[]>;
  getGame(
    scope: OfflineAccountScope,
    gameId: string,
  ): Promise<OfflineGameRecord | null>;
  putVerifiedGame(
    scope: OfflineAccountScope,
    game: OfflineGameRecord,
  ): Promise<void>;
  deleteGame(scope: OfflineAccountScope, gameId: string): Promise<void>;

  getSaveHead(
    scope: OfflineAccountScope,
    gameId: string,
    kind: SaveArtifactKind,
    slotId: string,
  ): Promise<SaveHead | null>;
  getSaveVersion(
    scope: OfflineAccountScope,
    versionId: string,
  ): Promise<SaveVersionRecord | null>;
  writeLocalSave(
    scope: OfflineAccountScope,
    version: SaveVersionRecord,
    operation: SaveSyncOperation,
  ): Promise<void>;
  listSyncOperations(
    scope: OfflineAccountScope,
    dueAt?: number,
  ): Promise<SaveSyncOperation[]>;
  /** Atomically update operation and version after a bounded retry/error. */
  updateOperationAndVersion(
    scope: OfflineAccountScope,
    operationId: string,
    patch: SaveOperationPatch,
  ): Promise<void>;
  /** Atomically persist cloud confirmation on the version and operation. */
  completeSyncOperation(
    scope: OfflineAccountScope,
    operationId: string,
    cloudRevision: string,
  ): Promise<void>;
  /** Store the remote branch and mark the local version/operation as conflicted. */
  preserveConflict(
    scope: OfflineAccountScope,
    operationId: string,
    remoteVersion: SaveVersionRecord,
  ): Promise<void>;
}

export type SaveSyncResponse =
  | { kind: "accepted"; cloudRevision: string }
  | { kind: "conflict"; current: RemoteSaveVersionMetadata };

/**
 * Future server transport. It deliberately accepts no owner ID: the server
 * must derive ownership from the verified Supabase session on each request.
 */
export interface SaveSyncTransport {
  uploadVersion(input: {
    gameId: string;
    kind: SaveArtifactKind;
    slotId: string;
    version: SaveUploadVersion;
    expectedParentRevision: string | null;
    idempotencyKey: string;
  }): Promise<SaveSyncResponse>;
  /** Fetch conflict bytes through a freshly authorized private server path. */
  downloadVersionPayload(input: {
    gameId: string;
    versionId: string;
    payloadSha256: string;
  }): Promise<Blob>;
}
