import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function decodeKey(value) {
  if (typeof value !== "string") throw new Error("drive-token-key-invalid");
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) throw new Error("drive-token-key-invalid");
  return key;
}

export function encryptDriveSecret(plaintext, keyBase64) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("drive-token-invalid");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv(algorithm, decodeKey(keyBase64), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptDriveSecret(payload, keyBase64) {
  if (
    !payload || payload.version !== 1 ||
    typeof payload.nonce !== "string" ||
    typeof payload.ciphertext !== "string" ||
    typeof payload.tag !== "string"
  ) throw new Error("drive-token-ciphertext-invalid");

  const decipher = createDecipheriv(
    algorithm,
    decodeKey(keyBase64),
    Buffer.from(payload.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptDriveSecretWithKeyring(payload, primaryKeyBase64, previousKeyBase64 = null) {
  const keys = [primaryKeyBase64, previousKeyBase64].filter(
    (key, index, all) => typeof key === "string" && key.length > 0 && all.indexOf(key) === index,
  );
  if (keys.length === 0) throw new Error("drive-token-key-invalid");

  for (const key of keys) {
    try {
      return { plaintext: decryptDriveSecret(payload, key), usedPreviousKey: key !== primaryKeyBase64 };
    } catch {
      // Try the explicitly configured previous key; never log ciphertext or key material.
    }
  }
  throw new Error("drive-token-decryption-failed");
}
