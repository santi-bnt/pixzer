import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  classifyDriveReconciliationFiles,
  classifyDriveReconciliationProbe,
} from "../../../src/lib/google-drive/reconciliation-contracts.mjs";
import {
  buildDriveAuthorizationUrl,
  createDriveOAuthParameters,
  equalOAuthState,
} from "../../../src/lib/google-drive/oauth-flow.mjs";
import { buildSupabaseGoogleOAuthOptions, mapOAuthProviderError } from "../../../src/features/auth/oauth-error-flow.mjs";
import { createIntegrityCheckedDriveStream, fetchDriveMedia } from "../../../src/lib/google-drive/download.mjs";

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

test("Drive cleanup probe keeps active uploads charged and routes unavailable states safely", () => {
  assert.equal(classifyDriveReconciliationProbe(308, 1), "retry");
  assert.equal(classifyDriveReconciliationProbe(308, 3), "manual_review");
  assert.equal(classifyDriveReconciliationProbe(404, 1), "inspect_files");
  assert.equal(classifyDriveReconciliationProbe(410, 1), "inspect_files");
  assert.equal(classifyDriveReconciliationProbe(201, 1), "verify_completed_file");
  assert.equal(classifyDriveReconciliationProbe(403, 1), "manual_review");
  assert.equal(classifyDriveReconciliationProbe(503, 1), "retry");
  assert.equal(classifyDriveReconciliationProbe(503, 3), "manual_review");
});

test("Drive cleanup releases only confirmed absence/trash or completes exact owner metadata", () => {
  const expected = { sizeBytes: 128, fileName: "game.gb", gameId: "game-id", permissionId: "owner-id" };
  const validFile = {
    id: "drive-id",
    name: "game.gb",
    size: "128",
    md5Checksum: "0123456789abcdef0123456789abcdef",
    appProperties: { pixzerGameId: "game-id" },
    trashed: false,
    owners: [{ permissionId: "owner-id" }],
  };
  assert.equal(classifyDriveReconciliationFiles([], expected), "confirmed_absent");
  assert.equal(classifyDriveReconciliationFiles([], expected, true), "manual_review");
  assert.equal(classifyDriveReconciliationFiles([validFile], expected), "verified_complete");
  assert.equal(classifyDriveReconciliationFiles([{ ...validFile, size: "127" }], expected), "manual_review");
  assert.equal(classifyDriveReconciliationFiles([{ ...validFile, owners: [{ permissionId: "other" }] }], expected), "manual_review");
  assert.equal(classifyDriveReconciliationFiles([{ ...validFile, trashed: true }], expected), "confirmed_trashed");
  assert.equal(classifyDriveReconciliationFiles([validFile, validFile], expected), "manual_review");
});

test("download media redirects stay HTTPS and on Google-controlled hosts", () => {
  assert.equal(parseSafeDriveMediaRedirect("https://content.googleusercontent.com/download", "https://www.googleapis.com/drive/v3/files/x")?.hostname, "content.googleusercontent.com");
  assert.equal(parseSafeDriveMediaRedirect("https://drive.usercontent.google.com/download", "https://www.googleapis.com/drive/v3/files/x")?.hostname, "drive.usercontent.google.com");
  assert.equal(parseSafeDriveMediaRedirect("https://drive.google.com/uc?id=private-file", "https://www.googleapis.com/drive/v3/files/x")?.hostname, "drive.google.com");
  assert.equal(parseSafeDriveMediaRedirect("http://www.googleapis.com/file", "https://www.googleapis.com/"), null);
  assert.equal(parseSafeDriveMediaRedirect("https://www.googleapis.com.attacker.example/file", "https://www.googleapis.com/"), null);
  assert.equal(parseSafeDriveMediaRedirect("https://user:pass@drive.google.com/file", "https://www.googleapis.com/"), null);
  assert.equal(parseSafeDriveMediaRedirect("https://drive.google.com:8443/file", "https://www.googleapis.com/"), null);
});

test("Drive media redirect handling bounds redirects and never forwards bearer off the API origin", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: "https://drive.usercontent.google.com/download?id=opaque" } });
    return new Response("rom", { status: 200 });
  };
  const response = await fetchDriveMedia(fetcher, "secret-access-token", "valid_file-id");
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-access-token");
  assert.equal(calls[1].init.headers.Authorization, undefined);

  const sameOriginRedirects = [];
  await fetchDriveMedia(async (url, init) => {
    sameOriginRedirects.push({ url: new URL(url), init });
    return sameOriginRedirects.length === 1
      ? new Response(null, { status: 302, headers: { Location: "https://www.googleapis.com/drive/v3/files/other" } })
      : new Response("rom", { status: 200 });
  }, "secret-access-token", "valid_file-id");
  assert.equal(sameOriginRedirects[1].init.headers.Authorization, undefined);

  await assert.rejects(
    fetchDriveMedia(async () => new Response(null, { status: 302, headers: { Location: "https://attacker.example/file" } }), "secret", "id"),
    /drive-download-redirect-invalid/,
  );
});

test("Drive downloads stream bytes and verify expected length and provider MD5", async () => {
  const content = Buffer.from("authorized test payload");
  const checksum = createHash("md5").update(content).digest("hex");
  const source = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(content.subarray(0, 7));
      controller.enqueue(content.subarray(7));
      controller.close();
    },
  }), { headers: { "Content-Length": String(content.length) } });
  const stream = createIntegrityCheckedDriveStream(source, content.length, checksum);
  assert.deepEqual(Buffer.from(await new Response(stream).arrayBuffer()), content);

  const badLength = new Response("wrong", { headers: { "Content-Length": "5" } });
  assert.throws(() => createIntegrityCheckedDriveStream(badLength, content.length, checksum), /size-mismatch/);

  const badHashSource = new Response(content);
  const badHash = createIntegrityCheckedDriveStream(badHashSource, content.length, "00000000000000000000000000000000");
  await assert.rejects(new Response(badHash).arrayBuffer(), /integrity-failed/);

  const badSizeSource = new Response(content.subarray(0, -1));
  const badSize = createIntegrityCheckedDriveStream(badSizeSource, content.length, checksum);
  await assert.rejects(new Response(badSize).arrayBuffer(), /integrity-failed/);
});
