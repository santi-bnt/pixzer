import { sha256 } from "@noble/hashes/sha2.js";

export const DEFAULT_HASH_CHUNK_BYTES = 1024 * 1024;

/** Compute SHA-256 incrementally without materializing the complete Blob. */
export async function sha256Blob(
  blob: Blob,
  chunkSizeBytes = DEFAULT_HASH_CHUNK_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
    throw new RangeError("Hash chunk size must be a positive safe integer.");
  }

  const hash = sha256.create();
  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    for (let offset = 0; offset < blob.size; offset += chunkSizeBytes) {
      const chunk = await blob
        .slice(offset, Math.min(offset + chunkSizeBytes, blob.size))
        .arrayBuffer();
      hash.update(new Uint8Array(chunk));
    }
  }

  return Array.from(hash.digest(), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyBlobSha256(
  blob: Blob,
  expectedSha256: string,
): Promise<boolean> {
  if (!/^[a-f\d]{64}$/i.test(expectedSha256)) return false;
  return (await sha256Blob(blob)) === expectedSha256.toLowerCase();
}
