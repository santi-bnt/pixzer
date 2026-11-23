export type StorageApiState = "available" | "unsupported" | "failed";
export type PersistenceRequestState =
  "granted" | "denied" | "unsupported" | "failed";

export type OfflineStorageAssessment = {
  api: StorageApiState;
  usageBytes: number | null;
  quotaBytes: number | null;
  remainingBytes: number | null;
  persistent: boolean | null;
  persistenceRequest: PersistenceRequestState;
};

type StorageManagerLike = Pick<StorageManager, "estimate"> &
  Partial<Pick<StorageManager, "persist" | "persisted">>;

function currentStorageManager(): StorageManagerLike | undefined {
  if (typeof navigator === "undefined" || !navigator.storage) return undefined;
  return navigator.storage;
}

/**
 * Read current origin storage usage without prompting for persistence.
 * Estimates are advisory and can change as the browser evicts or reserves data.
 */
export async function inspectOfflineStorage(
  storage: StorageManagerLike | undefined = currentStorageManager(),
): Promise<OfflineStorageAssessment> {
  if (!storage || typeof storage.estimate !== "function") {
    return {
      api: "unsupported",
      usageBytes: null,
      quotaBytes: null,
      remainingBytes: null,
      persistent: null,
      persistenceRequest: "unsupported",
    };
  }

  try {
    const estimate = await storage.estimate();
    const usageBytes = finiteOrNull(estimate.usage);
    const quotaBytes = finiteOrNull(estimate.quota);
    let persistent: boolean | null = null;
    try {
      if (typeof storage.persisted === "function") {
        persistent = await storage.persisted();
      }
    } catch {
      persistent = null;
    }

    return {
      api: "available",
      usageBytes,
      quotaBytes,
      remainingBytes:
        usageBytes === null || quotaBytes === null
          ? null
          : Math.max(0, quotaBytes - usageBytes),
      persistent,
      persistenceRequest: "unsupported",
    };
  } catch {
    return {
      api: "failed",
      usageBytes: null,
      quotaBytes: null,
      remainingBytes: null,
      persistent: null,
      persistenceRequest: "failed",
    };
  }
}

/** Ask for persistent origin storage only in response to an explicit user action. */
export async function requestOfflineStoragePersistence(
  storage: StorageManagerLike | undefined = currentStorageManager(),
): Promise<PersistenceRequestState> {
  if (!storage || typeof storage.persist !== "function") return "unsupported";
  try {
    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "failed";
  }
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
