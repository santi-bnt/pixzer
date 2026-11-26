import { isDriveOwnedUploadMetadata } from "./contracts.mjs";

export function classifyDriveReconciliationProbe(status, attemptCount) {
  if (status === 308) return attemptCount >= 3 ? "manual_review" : "retry";
  if (status === 404 || status === 410) return "inspect_files";
  if (status === 200 || status === 201) return "verify_completed_file";
  if (status === 429 || (Number.isInteger(status) && status >= 500)) {
    return attemptCount >= 3 ? "manual_review" : "retry";
  }
  return "manual_review";
}

export function classifyDriveReconciliationFiles(files, expected, uploadReportedComplete = false) {
  if (!Array.isArray(files)) return "manual_review";
  if (files.length === 0) return uploadReportedComplete ? "manual_review" : "confirmed_absent";
  if (files.length !== 1) return "manual_review";

  const [file] = files;
  if (isDriveOwnedUploadMetadata(file, expected)) return "verified_complete";
  if (!file || typeof file !== "object" || Array.isArray(file)) return "manual_review";

  const record = file;
  const owners = record.owners;
  const properties = record.appProperties;
  if (record.trashed === true && typeof record.id === "string" && record.id.length > 0 &&
      record.id.length <= 256 && record.name === expected.fileName &&
      properties && typeof properties === "object" && !Array.isArray(properties) &&
      properties.pixzerGameId === expected.gameId && Array.isArray(owners) &&
      owners.some((owner) => owner && typeof owner === "object" && owner.permissionId === expected.permissionId)) {
    return "confirmed_trashed";
  }
  return "manual_review";
}
