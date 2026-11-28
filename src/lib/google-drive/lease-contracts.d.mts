export const DRIVE_UPLOAD_LEASE_SECONDS: number;
export const DRIVE_UPLOAD_FUNCTION_MAX_SECONDS: number;
export const DRIVE_UPLOAD_OPERATION_TIMEOUT_MS: number;

export type ParsedDriveUploadLeaseResult =
  | { kind: "acquired"; expiresAt: string }
  | { kind: "busy" }
  | { kind: "invalid" };

export function parseDriveUploadLeaseResult(value: unknown): ParsedDriveUploadLeaseResult;
export function isDriveUploadLeaseBusy(status: number, error: unknown): boolean;
export function driveUploadLeaseRetryDelayMs(retryAfter: string | null, attempt: number): number;
