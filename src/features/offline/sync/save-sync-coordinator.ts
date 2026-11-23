import type {
  OfflineAccountScope,
  OfflineRepository,
  RemoteSaveVersionMetadata,
  SaveSyncOperation,
  SaveSyncTransport,
  SaveUploadVersion,
  SaveVersionRecord,
} from "@/features/offline/contracts";
import { sha256Blob } from "../checksum.ts";

export type FreshSyncAuthorization = {
  userId: string;
  verifiedAt: number;
};

/**
 * The provider must perform a fresh online server/Auth verification for every
 * invocation and require the trusted pixzer invitation marker. A cached
 * session or navigator.onLine check is insufficient.
 */
export type FreshSyncAuthorizationProvider = (
  scope: OfflineAccountScope,
) => Promise<FreshSyncAuthorization>;

export type SaveSyncPolicy = {
  maxAttempts: number;
  maxOperationsPerRun: number;
  maxConflictPayloadBytes: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  maxAuthorizationAgeMs: number;
  syncingLeaseMs: number;
};

const defaultPolicy: SaveSyncPolicy = {
  maxAttempts: 6,
  maxOperationsPerRun: 10,
  // Keep remote conflict materialization bounded. Align this with the server
  // save upload/download limit when that transport is implemented.
  maxConflictPayloadBytes: 64 * 1024 * 1024,
  baseDelayMs: 1_000,
  maxDelayMs: 60 * 60 * 1_000,
  jitterRatio: 0.2,
  maxAuthorizationAgeMs: 30_000,
  syncingLeaseMs: 60_000,
};

export class SaveSyncFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, message: string) {
    super(message);
    this.name = "SaveSyncFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

export type SaveSyncResult =
  | { status: "synced"; operationId: string; cloudRevision: string }
  | { status: "conflict"; operationId: string; remoteVersionId: string }
  | {
      status: "retry_scheduled";
      operationId: string;
      nextAttemptAt: number;
      errorCode: string;
    }
  | { status: "failed"; operationId: string; errorCode: string }
  | { status: "authorization_required"; operationId: string }
  | { status: "not_due"; operationId: string; nextAttemptAt: number }
  | { status: "not_found"; operationId: string }
  | { status: "in_progress"; operationId: string };

export type SaveSyncRun = {
  results: SaveSyncResult[];
  skippedDueToLimit: number;
};

type SaveSyncCoordinatorOptions = {
  repository: OfflineRepository;
  transport: SaveSyncTransport;
  authorize: FreshSyncAuthorizationProvider;
  policy?: Partial<SaveSyncPolicy>;
  now?: () => number;
  random?: () => number;
};

/**
 * Single-pass sync coordinator. A caller can invoke it after app resume, an
 * online event, or a manual action. It never runs a background retry loop and
 * never treats browser connectivity hints as proof of server reachability.
 */
export class SaveSyncCoordinator {
  private readonly repository: OfflineRepository;
  private readonly transport: SaveSyncTransport;
  private readonly authorize: FreshSyncAuthorizationProvider;
  private readonly policy: SaveSyncPolicy;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly activeOperations = new Set<string>();

  constructor(options: SaveSyncCoordinatorOptions) {
    this.repository = options.repository;
    this.transport = options.transport;
    this.authorize = options.authorize;
    this.policy = { ...defaultPolicy, ...options.policy };
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.validatePolicy();
  }

  /** Process one bounded snapshot of currently due operations. */
  async syncPending(scope: OfflineAccountScope): Promise<SaveSyncRun> {
    this.validateScope(scope);
    const currentTime = this.readClock();
    const operations = await this.repository.listSyncOperations(
      scope,
      currentTime,
    );
    const due = operations
      .filter((operation) => this.isDueOperation(operation, scope, currentTime))
      .sort((left, right) => left.createdAt - right.createdAt);
    const selected = due.slice(0, this.policy.maxOperationsPerRun);
    const results: SaveSyncResult[] = [];

    for (const operation of selected) {
      results.push(await this.syncOperation(scope, operation.operationId));
    }

    return {
      results,
      skippedDueToLimit: Math.max(0, due.length - selected.length),
    };
  }

  /** Retry one operation after a caller has requested a manual retry. */
  async retryFailedOperation(
    scope: OfflineAccountScope,
    operationId: string,
  ): Promise<SaveSyncResult> {
    this.validateScope(scope);
    const operation = await this.findOperation(scope, operationId);
    if (!operation) return { status: "not_found", operationId };
    if (operation.status !== "failed") {
      return operation.status === "syncing"
        ? { status: "in_progress", operationId }
        : operation.status === "synced"
          ? {
              status: "synced",
              operationId,
              cloudRevision:
                (
                  await this.repository.getSaveVersion(
                    scope,
                    operation.versionId,
                  )
                )?.cloudRevision ?? "",
            }
          : operation.status === "conflict"
            ? {
                status: "conflict",
                operationId,
                remoteVersionId: operation.versionId,
              }
            : {
                status: "not_due",
                operationId,
                nextAttemptAt: operation.nextAttemptAt,
              };
    }

    await this.repository.updateOperationAndVersion(scope, operationId, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: this.readClock(),
      lastErrorCode: null,
    });
    return this.syncOperation(scope, operationId);
  }

  async syncOperation(
    scope: OfflineAccountScope,
    operationId: string,
  ): Promise<SaveSyncResult> {
    this.validateScope(scope);
    const lockKey = `${scope.userId}:${operationId}`;
    if (this.activeOperations.has(lockKey)) {
      return { status: "in_progress", operationId };
    }
    this.activeOperations.add(lockKey);

    try {
      return await this.syncOperationUnlocked(scope, operationId);
    } finally {
      this.activeOperations.delete(lockKey);
    }
  }

  private async syncOperationUnlocked(
    scope: OfflineAccountScope,
    operationId: string,
  ): Promise<SaveSyncResult> {
    const currentTime = this.readClock();
    const operation = await this.findOperation(scope, operationId);
    if (!operation || operation.userId !== scope.userId) {
      return { status: "not_found", operationId };
    }
    if (operation.status === "synced") {
      const savedVersion = await this.repository.getSaveVersion(
        scope,
        operation.versionId,
      );
      return {
        status: "synced",
        operationId,
        cloudRevision: savedVersion?.cloudRevision ?? "",
      };
    }
    if (operation.status === "conflict") {
      return {
        status: "conflict",
        operationId,
        remoteVersionId: operation.versionId,
      };
    }
    if (!this.isDueOperation(operation, scope, currentTime)) {
      return {
        status: "not_due",
        operationId,
        nextAttemptAt: operation.nextAttemptAt,
      };
    }
    if (operation.attempts >= this.policy.maxAttempts) {
      await this.repository.updateOperationAndVersion(scope, operationId, {
        status: "failed",
        lastErrorCode: "retry_limit_exceeded",
      });
      return {
        status: "failed",
        operationId,
        errorCode: "retry_limit_exceeded",
      };
    }

    const version = await this.repository.getSaveVersion(
      scope,
      operation.versionId,
    );
    if (!version || !this.isOwnedVersion(version, operation, scope)) {
      await this.repository.updateOperationAndVersion(scope, operationId, {
        status: "failed",
        lastErrorCode: "local_version_missing_or_mismatched",
      });
      return {
        status: "failed",
        operationId,
        errorCode: "local_version_missing_or_mismatched",
      };
    }

    if (version.status === "synced" && version.cloudRevision) {
      await this.repository.completeSyncOperation(
        scope,
        operationId,
        version.cloudRevision,
      );
      return {
        status: "synced",
        operationId,
        cloudRevision: version.cloudRevision,
      };
    }

    const authorization = await this.getFreshAuthorization(scope);
    if (!authorization) {
      return { status: "authorization_required", operationId };
    }

    const attemptNumber = operation.attempts + 1;
    const leaseExpiry = currentTime + this.policy.syncingLeaseMs;
    await this.repository.updateOperationAndVersion(scope, operationId, {
      status: "syncing",
      attempts: attemptNumber,
      nextAttemptAt: leaseExpiry,
      lastErrorCode: null,
    });

    try {
      const response = await this.transport.uploadVersion({
        gameId: version.gameId,
        kind: version.kind,
        slotId: version.slotId,
        version: this.toUploadVersion(version),
        expectedParentRevision: operation.expectedParentRevision,
        idempotencyKey: operation.idempotencyKey,
      });

      if (response.kind === "accepted") {
        if (!response.cloudRevision.trim()) {
          throw new SaveSyncFailure(
            "invalid_server_response",
            false,
            "Server accepted a save without returning a revision.",
          );
        }
        await this.repository.completeSyncOperation(
          scope,
          operationId,
          response.cloudRevision,
        );
        return {
          status: "synced",
          operationId,
          cloudRevision: response.cloudRevision,
        };
      }

      if (!this.isCompatibleRemoteVersion(response.current, version)) {
        throw new SaveSyncFailure(
          "invalid_conflict_response",
          false,
          "Remote conflict did not match the local game and save slot.",
        );
      }

      if (response.current.sizeBytes > this.policy.maxConflictPayloadBytes) {
        throw new SaveSyncFailure(
          "conflict_payload_too_large",
          false,
          "Remote conflict save exceeds the configured download limit.",
        );
      }

      if (!(await this.getFreshAuthorization(scope))) {
        await this.repository.updateOperationAndVersion(scope, operationId, {
          status: "pending",
          attempts: operation.attempts,
          nextAttemptAt: this.readClock(),
          lastErrorCode: "authorization_required",
        });
        return { status: "authorization_required", operationId };
      }

      const remotePayload = await this.transport.downloadVersionPayload({
        gameId: response.current.gameId,
        versionId: response.current.versionId,
        payloadSha256: response.current.payloadSha256,
      });
      if (remotePayload.size !== response.current.sizeBytes) {
        throw new SaveSyncFailure(
          "remote_payload_size_mismatch",
          false,
          "Downloaded remote save size did not match verified metadata.",
        );
      }
      if (
        (await sha256Blob(remotePayload)) !==
        response.current.payloadSha256.toLowerCase()
      ) {
        throw new SaveSyncFailure(
          "remote_payload_checksum_mismatch",
          false,
          "Downloaded remote save checksum did not match verified metadata.",
        );
      }

      const remoteVersion: SaveVersionRecord = {
        ...response.current,
        userId: scope.userId,
        payload: remotePayload,
      };
      await this.repository.preserveConflict(scope, operationId, remoteVersion);
      return {
        status: "conflict",
        operationId,
        remoteVersionId: remoteVersion.versionId,
      };
    } catch (error) {
      return this.handleFailure(scope, operation, attemptNumber, error);
    }
  }

  private async handleFailure(
    scope: OfflineAccountScope,
    operation: SaveSyncOperation,
    attempts: number,
    error: unknown,
  ): Promise<SaveSyncResult> {
    const failure = this.asFailure(error);
    if (!failure.retryable || attempts >= this.policy.maxAttempts) {
      await this.repository.updateOperationAndVersion(
        scope,
        operation.operationId,
        {
          status: "failed",
          attempts,
          nextAttemptAt: this.readClock(),
          lastErrorCode: failure.code,
        },
      );
      return {
        status: "failed",
        operationId: operation.operationId,
        errorCode: failure.code,
      };
    }

    const nextAttemptAt = this.readClock() + this.retryDelayMs(attempts);
    await this.repository.updateOperationAndVersion(
      scope,
      operation.operationId,
      {
        status: "pending",
        attempts,
        nextAttemptAt,
        lastErrorCode: failure.code,
      },
    );
    return {
      status: "retry_scheduled",
      operationId: operation.operationId,
      nextAttemptAt,
      errorCode: failure.code,
    };
  }

  private async getFreshAuthorization(
    scope: OfflineAccountScope,
  ): Promise<FreshSyncAuthorization | null> {
    try {
      const authorization = await this.authorize(scope);
      const currentTime = this.readClock();
      if (
        authorization.userId !== scope.userId ||
        !Number.isFinite(authorization.verifiedAt) ||
        authorization.verifiedAt > currentTime ||
        currentTime - authorization.verifiedAt >
          this.policy.maxAuthorizationAgeMs
      ) {
        return null;
      }
      return authorization;
    } catch {
      return null;
    }
  }

  private async findOperation(
    scope: OfflineAccountScope,
    operationId: string,
  ): Promise<SaveSyncOperation | null> {
    const operations = await this.repository.listSyncOperations(scope);
    return (
      operations.find(
        (operation) =>
          operation.operationId === operationId &&
          operation.userId === scope.userId,
      ) ?? null
    );
  }

  private isDueOperation(
    operation: SaveSyncOperation,
    scope: OfflineAccountScope,
    currentTime: number,
  ): boolean {
    return (
      operation.userId === scope.userId &&
      operation.status !== "conflict" &&
      operation.status !== "synced" &&
      operation.status !== "failed" &&
      operation.nextAttemptAt <= currentTime
    );
  }

  private isOwnedVersion(
    version: SaveVersionRecord,
    operation: SaveSyncOperation,
    scope: OfflineAccountScope,
  ): boolean {
    return (
      version.userId === scope.userId &&
      version.gameId === operation.gameId &&
      version.versionId === operation.versionId &&
      version.parentRevision === operation.expectedParentRevision
    );
  }

  private isCompatibleRemoteVersion(
    remote: RemoteSaveVersionMetadata,
    local: SaveVersionRecord,
  ): boolean {
    return (
      remote.gameId === local.gameId &&
      remote.romSha256 === local.romSha256 &&
      remote.kind === local.kind &&
      remote.slotId === local.slotId &&
      remote.versionId !== local.versionId &&
      remote.status === "synced" &&
      Boolean(remote.cloudRevision) &&
      Number.isSafeInteger(remote.sizeBytes) &&
      remote.sizeBytes >= 0 &&
      /^[a-f\d]{64}$/i.test(remote.payloadSha256)
    );
  }

  private toUploadVersion(version: SaveVersionRecord): SaveUploadVersion {
    return {
      versionId: version.versionId,
      kind: version.kind,
      slotId: version.slotId,
      romSha256: version.romSha256,
      payload: version.payload,
      payloadSha256: version.payloadSha256,
      sizeBytes: version.sizeBytes,
      emulator: version.emulator,
      deviceId: version.deviceId,
      localRevision: version.localRevision,
      createdAt: version.createdAt,
    };
  }

  private retryDelayMs(attempts: number): number {
    const exponent = Math.max(0, Math.min(attempts - 1, 30));
    const base = Math.min(
      this.policy.baseDelayMs * 2 ** exponent,
      this.policy.maxDelayMs,
    );
    const randomValue = Math.min(1, Math.max(0, this.random()));
    const jitter =
      1 - this.policy.jitterRatio + 2 * this.policy.jitterRatio * randomValue;
    return Math.min(
      this.policy.maxDelayMs,
      Math.max(0, Math.round(base * jitter)),
    );
  }

  private asFailure(error: unknown): SaveSyncFailure {
    if (error instanceof SaveSyncFailure) return error;
    return new SaveSyncFailure(
      "unexpected_transport_error",
      true,
      error instanceof Error ? error.message : "Unknown save sync error.",
    );
  }

  private validateScope(scope: OfflineAccountScope): void {
    if (scope.userId.trim().length === 0) {
      throw new TypeError(
        "An account scope is required for local sync records.",
      );
    }
  }

  private readClock(): number {
    const currentTime = this.now();
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      throw new RangeError("The sync clock returned an invalid timestamp.");
    }
    return currentTime;
  }

  private validatePolicy(): void {
    if (
      !Number.isInteger(this.policy.maxAttempts) ||
      this.policy.maxAttempts < 1 ||
      !Number.isInteger(this.policy.maxOperationsPerRun) ||
      this.policy.maxOperationsPerRun < 1 ||
      !Number.isSafeInteger(this.policy.maxConflictPayloadBytes) ||
      this.policy.maxConflictPayloadBytes < 0 ||
      this.policy.baseDelayMs < 0 ||
      this.policy.maxDelayMs < this.policy.baseDelayMs ||
      this.policy.jitterRatio < 0 ||
      this.policy.jitterRatio > 0.5 ||
      this.policy.maxAuthorizationAgeMs < 0 ||
      this.policy.syncingLeaseMs < 1
    ) {
      throw new RangeError("Invalid save sync coordinator policy.");
    }
  }
}
