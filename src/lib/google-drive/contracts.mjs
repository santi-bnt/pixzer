export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_USER_QUOTA_BYTES = 900_000_000;
export const DRIVE_MAX_GAME_BYTES = 900_000_000;
// Keep proxied chunks below Vercel Functions' 4.5 MB request-body ceiling.
export const DRIVE_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

const extensionConsole = new Map([
  [".gb", "gb"], [".gbc", "gbc"], [".gba", "gba"],
  [".nds", "nds"], [".n64", "n64"], [".z64", "n64"], [".v64", "n64"],
]);

export function validateDriveGameUpload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fileName = typeof input.fileName === "string" ? input.fileName.normalize("NFC").trim() : "";
  const title = typeof input.title === "string" ? input.title.normalize("NFC").trim() : "";
  if (!fileName || fileName.length > 255 || /[\\/\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(fileName)) return null;
  if (!title || title.length > 160 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(title)) return null;
  const sizeBytes = input.sizeBytes;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DRIVE_MAX_GAME_BYTES) return null;
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const console = extensionConsole.get(extension);
  if (!console || (input.console !== undefined && input.console !== console)) return null;
  return { fileName, title, sizeBytes, console };
}

export function nextDriveChunkRange(offset, totalBytes, chunkBytes = DRIVE_UPLOAD_CHUNK_BYTES) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(totalBytes) ||
      !Number.isInteger(chunkBytes) || chunkBytes < 256 * 1024 ||
      chunkBytes % (256 * 1024) !== 0 || offset < 0 || totalBytes < 1 || offset >= totalBytes) {
    return null;
  }
  const end = Math.min(totalBytes - 1, offset + chunkBytes - 1);
  return { start: offset, end, length: end - offset + 1, contentRange: `bytes ${offset}-${end}/${totalBytes}` };
}

export function parseDriveUploadChunkRange(value, expectedSizeBytes, maxChunkBytes = DRIVE_UPLOAD_CHUNK_BYTES) {
  if (typeof value !== "string" || !Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 1 ||
      !Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 256 * 1024 || maxChunkBytes % (256 * 1024) !== 0) return null;
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const totalBytes = Number(match[3]);
  const length = end - start + 1;
  if (![start, end, totalBytes, length].every(Number.isSafeInteger) || start < 0 || end < start ||
      totalBytes !== expectedSizeBytes || end >= totalBytes || length > maxChunkBytes ||
      (end < totalBytes - 1 && length % (256 * 1024) !== 0)) return null;
  return { start, end, totalBytes, length };
}

export function parseDriveUploadOffset(rangeHeader, totalBytes) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1) return null;
  if (rangeHeader === null) return 0;
  const match = /^bytes=0-(\d+)$/.exec(rangeHeader);
  if (!match) return null;
  const lastByte = Number(match[1]);
  if (!Number.isSafeInteger(lastByte) || lastByte < 0 || lastByte >= totalBytes) return null;
  return lastByte + 1;
}

export function selectPersistedDriveUploadCapability(claimed, winner, now = Date.now()) {
  const row = claimed ?? winner;
  if (!row || typeof row !== "object") return null;
  if (!claimed && row.status !== "uploading") return null;
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now ||
      typeof row.resumable_uri_ciphertext !== "string" || !row.resumable_uri_ciphertext ||
      typeof row.resumable_uri_nonce !== "string" || !row.resumable_uri_nonce ||
      typeof row.resumable_uri_tag !== "string" || !row.resumable_uri_tag) return null;
  return {
    ciphertext: row.resumable_uri_ciphertext,
    nonce: row.resumable_uri_nonce,
    tag: row.resumable_uri_tag,
  };
}

export function isDriveFileMetadata(value, expectedSize) {
  return Boolean(
    value && typeof value === "object" &&
    typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256 &&
    typeof value.name === "string" &&
    typeof value.size === "string" && Number(value.size) === expectedSize &&
    value.trashed !== true,
  );
}

export function isDriveOwnedUploadMetadata(value, expected) {
  if (!expected || typeof expected !== "object" || !isDriveFileMetadata(value, expected.sizeBytes)) return false;
  if (value.name !== expected.fileName) return false;
  const properties = value.appProperties;
  const owners = value.owners;
  const capabilities = value.capabilities;
  return Boolean(properties && typeof properties === "object" && properties.pixzerGameId === expected.gameId &&
    Array.isArray(owners) && owners.some((owner) => owner && typeof owner === "object" && owner.permissionId === expected.permissionId) &&
    (expected.fileId === undefined || value.id === expected.fileId) &&
    (expected.requireCanDownload !== true || (capabilities && typeof capabilities === "object" && capabilities.canDownload === true)) &&
    typeof value.md5Checksum === "string" && /^[a-f0-9]{32}$/i.test(value.md5Checksum));
}

export function parseSafeDriveMediaRedirect(location, baseUrl) {
  if (typeof location !== "string" || typeof baseUrl !== "string") return null;
  try {
    const destination = new URL(location, baseUrl);
    const allowedHost = destination.hostname === "www.googleapis.com" ||
      destination.hostname === "drive.google.com" ||
      destination.hostname === "drive.usercontent.google.com" ||
      destination.hostname.endsWith(".googleusercontent.com");
    if (destination.protocol !== "https:" || !allowedHost || destination.username || destination.password || destination.port) return null;
    return destination;
  } catch {
    return null;
  }
}

export function isOwnedDriveGameMetadata(value, expected) {
  if (!expected || typeof expected !== "object" || !isDriveOwnedUploadMetadata(value, expected)) return false;
  return !expected.providerChecksum || value.md5Checksum.toLowerCase() === expected.providerChecksum.toLowerCase();
}
