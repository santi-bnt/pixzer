export const MAX_GAME_SIZE_BYTES: number;
export const USER_QUOTA_BYTES: number;
export const GLOBAL_QUOTA_BYTES: number;

export type UploadValidationResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      fileName: string;
      title: string;
      console: "gb" | "gbc" | "gba" | "nds" | "n64";
      sizeBytes: number;
      idempotencyKey: string;
    };

export function validateUploadRequest(input: unknown): UploadValidationResult;
export function isOwnedGameObjectKey(objectKey: unknown, userId: string): boolean;
export function isValidUploadId(value: unknown): value is string;
export function getBoundedUploadUrlTtl(
  expiresAt: unknown,
  maxSeconds?: number,
  nowMilliseconds?: number,
): number;
