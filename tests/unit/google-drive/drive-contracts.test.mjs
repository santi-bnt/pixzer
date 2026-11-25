import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRIVE_UPLOAD_CHUNK_BYTES,
  DRIVE_USER_QUOTA_BYTES,
  isDriveOwnedUploadMetadata,
  isOwnedDriveGameMetadata,
  nextDriveChunkRange,
  parseDriveUploadOffset,
  parseSafeDriveMediaRedirect,
  selectPersistedDriveUploadCapability,
  validateDriveGameUpload,
} from "../../../src/lib/google-drive/contracts.mjs";
import { decryptDriveSecret, encryptDriveSecret } from "../../../src/lib/google-drive/crypto.mjs";
import {
  buildDriveAuthorizationUrl,
  createDriveOAuthParameters,
  equalOAuthState,
} from "../../../src/lib/google-drive/oauth-flow.mjs";
import { buildSupabaseGoogleOAuthOptions, mapOAuthProviderError } from "../../../src/features/auth/oauth-error-flow.mjs";

test("Drive accepts only supported ROM extensions and bounded metadata", () => {
  for (const [fileName, console] of [["a.gb", "gb"], ["b.gbc", "gbc"], ["c.gba", "gba"], ["d.nds", "nds"], ["e.v64", "n64"]]) {
    assert.equal(validateDriveGameUpload({ fileName, title: "Game", sizeBytes: 10 }).console, console);
  }
  for (const fileName of ["a.zip", "../a.gb", "bad\n.gb", "a.gb.exe"]) {
    assert.equal(validateDriveGameUpload({ fileName, title: "Game", sizeBytes: 10 }), null);
  }
  assert.equal(validateDriveGameUpload({ fileName: "a.gb", title: "Game", sizeBytes: DRIVE_USER_QUOTA_BYTES + 1 }), null);
});

test("resumable chunk ranges stay aligned and offsets are bounded", () => {
  assert.equal(DRIVE_UPLOAD_CHUNK_BYTES % (256 * 1024), 0);
  assert.deepEqual(nextDriveChunkRange(0, 10), { start: 0, end: 9, length: 10, contentRange: "bytes 0-9/10" });
  assert.equal(nextDriveChunkRange(1, 10), null);
  assert.equal(parseDriveUploadOffset("bytes=0-8388607", 10_000_000), 8_388_608);
  assert.equal(parseDriveUploadOffset("bytes=0-100", 100), null);
  assert.equal(parseDriveUploadOffset("bytes=1-3", 100), null);
});

test("concurrent Drive upload intents return only the encrypted capability persisted by the reservation winner", () => {
  const expiresAt = new Date(10_000).toISOString();
  const winner = {
    status: "uploading", expires_at: expiresAt,
    resumable_uri_ciphertext: "cipher", resumable_uri_nonce: "nonce", resumable_uri_tag: "tag",
  };
  assert.deepEqual(selectPersistedDriveUploadCapability(winner, null, 1_000), {
    ciphertext: "cipher", nonce: "nonce", tag: "tag",
  });
  assert.deepEqual(selectPersistedDriveUploadCapability(null, winner, 1_000), {
    ciphertext: "cipher", nonce: "nonce", tag: "tag",
  });
  assert.equal(selectPersistedDriveUploadCapability(null, { ...winner, status: "pending" }, 1_000), null);
  assert.equal(selectPersistedDriveUploadCapability(null, { ...winner, expires_at: new Date(1_000).toISOString() }, 1_000), null);
  assert.equal(selectPersistedDriveUploadCapability(null, { ...winner, resumable_uri_ciphertext: null }, 1_000), null);
});

test("OAuth requests only drive.file with state and PKCE", () => {
  const params = createDriveOAuthParameters();
  assert.ok(equalOAuthState(params.state, params.state));
  assert.equal(equalOAuthState(params.state, `${params.state}x`), false);
  const url = new URL(buildDriveAuthorizationUrl({ clientId: "client", redirectUri: "https://pixzer.vercel.app/api/drive/callback", ...params }));
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  const consentRetry = new URL(buildDriveAuthorizationUrl({
    clientId: "client", redirectUri: "https://pixzer.vercel.app/api/drive/callback", ...params, forceConsent: true,
  }));
  assert.equal(consentRetry.searchParams.get("prompt"), "select_account consent");
});

test("Supabase Google sign-in selects an account without account hint or repeated consent", () => {
  assert.deepEqual(buildSupabaseGoogleOAuthOptions("https://pixzer.vercel.app/auth/confirm"), {
    redirectTo: "https://pixzer.vercel.app/auth/confirm",
    queryParams: { prompt: "select_account" },
    skipBrowserRedirect: true,
  });
  assert.equal(mapOAuthProviderError("access_denied", null), "google-access-denied");
  assert.equal(mapOAuthProviderError(null, "redirect_uri_mismatch"), "google-redirect-mismatch");
  assert.equal(mapOAuthProviderError(null, "flow_state_expired"), "oauth-session-failed");
  assert.equal(mapOAuthProviderError("server_error", null), "google-unavailable");
});

test("Drive refresh-token encryption authenticates ciphertext", () => {
  const key = Buffer.alloc(32, 17).toString("base64");
  const encrypted = encryptDriveSecret("refresh-secret-test", key);
  assert.notEqual(encrypted.ciphertext, "refresh-secret-test");
  assert.equal(decryptDriveSecret(encrypted, key), "refresh-secret-test");
  assert.throws(() => decryptDriveSecret({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` }, key));
  assert.throws(() => decryptDriveSecret(encrypted, Buffer.alloc(32, 18).toString("base64")));
});

test("completion requires Google-confirmed size, owner, game marker and checksum", () => {
  const metadata = {
    id: "drive-file-id", name: "game.gb", size: "12", trashed: false,
    appProperties: { pixzerGameId: "game-id" }, owners: [{ permissionId: "owner-id" }],
    capabilities: { canDownload: true },
    md5Checksum: "0123456789abcdef0123456789abcdef",
  };
  const expected = { sizeBytes: 12, fileName: "game.gb", gameId: "game-id", permissionId: "owner-id", fileId: "drive-file-id" };
  assert.equal(isDriveOwnedUploadMetadata(metadata, expected), true);
  assert.equal(isDriveOwnedUploadMetadata(metadata, { ...expected, permissionId: "other" }), false);
  assert.equal(isDriveOwnedUploadMetadata({ ...metadata, appProperties: {} }, expected), false);
  assert.equal(isDriveOwnedUploadMetadata({ ...metadata, size: "11" }, expected), false);
  assert.equal(isDriveOwnedUploadMetadata({ ...metadata, md5Checksum: undefined }, expected), false);
  assert.equal(isOwnedDriveGameMetadata(metadata, { ...expected, providerChecksum: metadata.md5Checksum }), true);
  assert.equal(isOwnedDriveGameMetadata(metadata, { ...expected, providerChecksum: metadata.md5Checksum, requireCanDownload: true }), true);
  assert.equal(isOwnedDriveGameMetadata({ ...metadata, capabilities: { canDownload: false } }, { ...expected, requireCanDownload: true }), false);
  assert.equal(isOwnedDriveGameMetadata(metadata, { ...expected, providerChecksum: "ffffffffffffffffffffffffffffffff" }), false);
});

test("download media redirects stay HTTPS and on Google-controlled hosts", () => {
  assert.equal(parseSafeDriveMediaRedirect("https://content.googleusercontent.com/download", "https://www.googleapis.com/drive/v3/files/x")?.hostname, "content.googleusercontent.com");
  assert.equal(parseSafeDriveMediaRedirect("https://drive.google.com/uc?id=private-file", "https://www.googleapis.com/drive/v3/files/x")?.hostname, "drive.google.com");
  assert.equal(parseSafeDriveMediaRedirect("http://www.googleapis.com/file", "https://www.googleapis.com/"), null);
  assert.equal(parseSafeDriveMediaRedirect("https://www.googleapis.com.attacker.example/file", "https://www.googleapis.com/"), null);
  assert.equal(parseSafeDriveMediaRedirect("https://user:pass@drive.google.com/file", "https://www.googleapis.com/"), null);
});
