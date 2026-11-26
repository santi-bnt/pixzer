export type DriveReconciliationExpectedFile = {
  sizeBytes: number;
  fileName: string;
  gameId: string;
  permissionId: string;
};

export type DriveReconciliationDecision =
  | "retry"
  | "manual_review"
  | "inspect_files"
  | "verify_completed_file";

export type DriveReconciliationFileDecision =
  | "confirmed_absent"
  | "confirmed_trashed"
  | "verified_complete"
  | "manual_review";

export function classifyDriveReconciliationProbe(
  status: number,
  attemptCount: number,
): DriveReconciliationDecision;

export function classifyDriveReconciliationFiles(
  files: unknown,
  expected: DriveReconciliationExpectedFile,
  uploadReportedComplete?: boolean,
): DriveReconciliationFileDecision;
