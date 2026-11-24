export const MAX_GAME_SIZE_BYTES = 900_000_000;
export const USER_QUOTA_BYTES = 900_000_000;
export const GLOBAL_QUOTA_BYTES = 9_000_000_000;

const extensionConsole = new Map([
  [".gb", "gb"],
  [".gbc", "gbc"],
  [".gba", "gba"],
  [".nds", "nds"],
  [".n64", "n64"],
  [".z64", "n64"],
  [".v64", "n64"],
]);

const unsafeNameCharacters = /[\\/\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maximumLength) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maximumLength || unsafeNameCharacters.test(normalized)) {
    return null;
  }
  return normalized;
}

/** Validate a browser-supplied upload intent without trusting console or owner claims. */
export function validateUploadRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid-request" };
  }

  const fileName = normalizeText(input.fileName, 255);
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  const sizeBytes = input.sizeBytes;
  if (!fileName || fileName === "." || fileName === "..") {
    return { ok: false, reason: "invalid-file-name" };
  }
  if (!uuidPattern.test(idempotencyKey)) {
    return { ok: false, reason: "invalid-idempotency-key" };
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    return { ok: false, reason: "invalid-size" };
  }
  if (sizeBytes > MAX_GAME_SIZE_BYTES) {
    return { ok: false, reason: "file-too-large" };
  }

  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const console = extensionConsole.get(extension);
  if (!console) return { ok: false, reason: "unsupported-file-type" };

  const suppliedTitle = input.title === undefined ? "" : normalizeText(input.title, 160);
  if (input.title !== undefined && suppliedTitle === null) {
    return { ok: false, reason: "invalid-title" };
  }
  const title = suppliedTitle || fileName.slice(0, -extension.length).trim();
  if (!title || title.length > 160) return { ok: false, reason: "invalid-title" };

  return {
    ok: true,
    fileName,
    title,
    console,
    sizeBytes,
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}

/** Only keys minted by the SQL reservation function are accepted for cleanup. */
export function isOwnedGameObjectKey(objectKey, userId) {
  if (typeof objectKey !== "string" || !uuidPattern.test(userId)) return false;
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^users/${escapedUserId}/games/[0-9a-f-]{36}/rom/original$`, "i").test(objectKey);
}

export function isValidUploadId(value) {
  return typeof value === "string" && uuidPattern.test(value);
}

/** Never let a signed upload URL outlive its database quota reservation. */
export function getBoundedUploadUrlTtl(
  expiresAt,
  maxSeconds = 900,
  nowMilliseconds = Date.now(),
) {
  if (
    typeof expiresAt !== "string" ||
    !Number.isInteger(maxSeconds) ||
    maxSeconds < 1 ||
    !Number.isFinite(nowMilliseconds)
  ) {
    return 0;
  }
  const remainingSeconds = Math.floor((Date.parse(expiresAt) - nowMilliseconds) / 1000);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 1) return 0;
  return Math.min(maxSeconds, remainingSeconds);
}
