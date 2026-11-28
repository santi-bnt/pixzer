export type EncryptedDriveSecret = {
  version: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export function encryptDriveSecret(plaintext: string, keyBase64: string): EncryptedDriveSecret;
export function decryptDriveSecret(payload: EncryptedDriveSecret, keyBase64: string): string;
export function decryptDriveSecretWithKeyring(
  payload: EncryptedDriveSecret,
  primaryKeyBase64: string,
  previousKeyBase64?: string | null,
): { plaintext: string; usedPreviousKey: boolean };
