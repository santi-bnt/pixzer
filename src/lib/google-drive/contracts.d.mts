export const GOOGLE_DRIVE_FILE_SCOPE: string;
export const DRIVE_USER_QUOTA_BYTES: number;
export const DRIVE_MAX_GAME_BYTES: number;
export const DRIVE_UPLOAD_CHUNK_BYTES: number;
export type DriveUploadInput = { fileName: string; title: string; sizeBytes: number; console?: string };
export type DriveUploadValidation = { fileName: string; title: string; sizeBytes: number; console: string };
export function validateDriveGameUpload(input: unknown): DriveUploadValidation | null;
export function nextDriveChunkRange(offset: number, totalBytes: number, chunkBytes?: number): {start:number;end:number;length:number;contentRange:string}|null;
export function parseDriveUploadChunkRange(value: unknown, expectedSizeBytes: number, maxChunkBytes?: number): {start:number;end:number;totalBytes:number;length:number}|null;
export function parseDriveUploadOffset(rangeHeader: string|null, totalBytes: number): number|null;
export function selectPersistedDriveUploadCapability(claimed: unknown, winner: unknown, now?: number): {
  ciphertext: string;
  nonce: string;
  tag: string;
} | null;
export function isDriveFileMetadata(value: unknown, expectedSize: number): boolean;
export function isDriveOwnedUploadMetadata(value: unknown, expected: {
  sizeBytes: number;
  fileName: string;
  gameId: string;
  permissionId: string;
  fileId?: string;
}): boolean;
export function parseSafeDriveMediaRedirect(location: string | null, baseUrl: string): URL | null;
export function isOwnedDriveGameMetadata(value: unknown, expected: {
  sizeBytes: number;
  fileName: string;
  gameId: string;
  permissionId: string;
  fileId: string;
  providerChecksum?: string | null;
  requireCanDownload?: boolean;
}): boolean;
