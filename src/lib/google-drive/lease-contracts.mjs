export const DRIVE_UPLOAD_LEASE_SECONDS = 360;
export const DRIVE_UPLOAD_FUNCTION_MAX_SECONDS = 300;
export const DRIVE_UPLOAD_OPERATION_TIMEOUT_MS = 240_000;

/** Parse the narrow result returned by acquire_drive_upload_chunk_lease. */
export function parseDriveUploadLeaseResult(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.acquired !== "boolean") {
    return { kind: "invalid" };
  }
  if (!row.acquired) return row.lease_expires_at == null ? { kind: "busy" } : { kind: "invalid" };
  if (typeof row.lease_expires_at !== "string" || !Number.isFinite(Date.parse(row.lease_expires_at))) {
    return { kind: "invalid" };
  }
  return { kind: "acquired", expiresAt: row.lease_expires_at };
}

export function isDriveUploadLeaseBusy(status, error) {
  return status === 409 && error === "drive-upload-busy";
}

export function driveUploadLeaseRetryDelayMs(retryAfter, attempt) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(3_000, seconds * 1_000)
    : Math.min(3_000, 250 * (2 ** Math.max(0, attempt)));
}
