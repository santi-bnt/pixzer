export type EncryptedDriveSecret = {
  version: 1;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export function encryptDriveSecret(plaintext: string, keyBase64: string): EncryptedDriveSecret;
export function decryptDriveSecret(payload: EncryptedDriveSecret, keyBase64: string): string;
