import assert from "node:assert/strict";
import { test } from "node:test";

import {
  sha256Blob,
  verifyBlobSha256,
} from "../../src/features/offline/checksum.ts";

test("computes and verifies a known SHA-256 digest", async () => {
  const blob = new Blob(["abc"]);
  const digest =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  assert.equal(await sha256Blob(blob), digest);
  assert.equal(await verifyBlobSha256(blob, digest), true);
  assert.equal(await verifyBlobSha256(blob, "0".repeat(64)), false);
  assert.equal(await verifyBlobSha256(blob, "invalid"), false);
});

test("hashes large blobs incrementally", async () => {
  const blob = new Blob(["abcd".repeat(1_000)]);
  assert.equal(await sha256Blob(blob, 37), await sha256Blob(blob));
});

test("supports Blob implementations without stream()", async () => {
  const bytes = new TextEncoder().encode("abc");
  const blobWithoutStream = {
    size: bytes.byteLength,
    slice(start, end) {
      return new Blob([bytes.slice(start, end)]);
    },
  };

  assert.equal(
    await sha256Blob(blobWithoutStream, 2),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
