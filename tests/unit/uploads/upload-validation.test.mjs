import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_QUOTA_BYTES,
  MAX_GAME_SIZE_BYTES,
  USER_QUOTA_BYTES,
  getBoundedUploadUrlTtl,
  isOwnedGameObjectKey,
  isValidUploadId,
  validateUploadRequest,
} from "../../../src/lib/r2/upload-validation.mjs";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idempotencyKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("accepts the supported extension map and derives the console from the filename", () => {
  const accepted = [
    ["home.gb", "gb"],
    ["color.GBC", "gbc"],
    ["advance.gba", "gba"],
    ["two-screens.nds", "nds"],
    ["sixty-four.n64", "n64"],
    ["sixty-four.z64", "n64"],
    ["sixty-four.v64", "n64"],
  ];

  for (const [fileName, consoleType] of accepted) {
    const result = validateUploadRequest({ fileName, sizeBytes: 1, idempotencyKey });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.console, consoleType);
      assert.equal(result.title, fileName.slice(0, fileName.lastIndexOf(".")));
    }
  }
});

test("rejects paths, unsupported extensions, invalid sizes, and malformed idempotency keys", () => {
  const base = { sizeBytes: 1, idempotencyKey };
  assert.equal(validateUploadRequest({ ...base, fileName: "../game.gb" }).ok, false);
  assert.equal(validateUploadRequest({ ...base, fileName: "game.gb.exe" }).ok, false);
  assert.equal(validateUploadRequest({ ...base, fileName: "game.rom" }).ok, false);
  assert.equal(validateUploadRequest({ ...base, fileName: "game.gb", sizeBytes: 0 }).ok, false);
  assert.equal(validateUploadRequest({ ...base, fileName: "game.gb", sizeBytes: MAX_GAME_SIZE_BYTES + 1 }).ok, false);
  assert.equal(validateUploadRequest({ ...base, fileName: "game.gb", idempotencyKey: "not-a-uuid" }).ok, false);
  assert.equal(validateUploadRequest(null).ok, false);
});

test("uses the fixed decimal user and shared quota limits", () => {
  assert.equal(USER_QUOTA_BYTES, 900_000_000);
  assert.equal(GLOBAL_QUOTA_BYTES, 9_000_000_000);
});

test("only permits an opaque game key under the verified user's prefix", () => {
  assert.equal(
    isOwnedGameObjectKey(
      `users/${userId}/games/cccccccc-cccc-4ccc-8ccc-cccccccccccc/rom/original`,
      userId,
    ),
    true,
  );
  assert.equal(
    isOwnedGameObjectKey(
      "users/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/games/cccccccc-cccc-4ccc-8ccc-cccccccccccc/rom/original",
      userId,
    ),
    false,
  );
  assert.equal(isOwnedGameObjectKey("https://attacker.example/rom", userId), false);
  assert.equal(isValidUploadId("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), true);
  assert.equal(isValidUploadId("not-an-id"), false);
});

test("signed upload lifetime never outlives its reservation", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z");
  assert.equal(getBoundedUploadUrlTtl("2026-11-24T12:30:00.000Z", 900, now), 900);
  assert.equal(getBoundedUploadUrlTtl("2026-11-24T12:01:00.000Z", 900, now), 60);
  assert.equal(getBoundedUploadUrlTtl("2026-11-24T11:59:59.000Z", 900, now), 0);
  assert.equal(getBoundedUploadUrlTtl("invalid", 900, now), 0);
});
