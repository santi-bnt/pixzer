# Private game storage and upload contract

**Status:** Phase 1 design. No R2 bucket, credentials, upload endpoint, or object access is configured yet.

## Goals and invariants

- Keep ROMs, saves, and any user-supplied files in a private Cloudflare R2 Standard bucket. Never enable public bucket access for user content.
- Keep R2 credentials in server-only environment variables. The browser receives only short-lived URLs for a single object and a single operation.
- Resolve the authenticated user on the server for every initiation, completion, download, and delete request. Ignore or reject a client-supplied owner ID.
- Store an opaque, server-generated object key in PostgreSQL. Do not use a user filename as a key or permit a client to choose a bucket/key.
- Treat a signed URL as a bearer capability. Do not log it, put it in analytics, persist it in the database, or expose it to another account.
- Track object lifecycle and quota in metadata; reconcile metadata against R2 periodically because the database and object store do not share a transaction.

## Quota and operating budget

The initial product limit is **900 MB per user**, with roughly ten invited users. Ten full quotas use 9,000 MB, leaving about 1,000 MB against a 10 GB-month Standard storage allowance for shared operational headroom. This is a planning ceiling, not a guarantee: define MB/GB consistently in code (recommend decimal bytes), account for pending uploads and retained saves, and enforce both per-user and global limits. Do not issue upload capabilities if projected committed plus reserved bytes exceed the global budget. A full allowance from every user is possible and would exhaust most of the free storage tier.

As checked 2026-11-22, Cloudflare lists R2 Standard's free tier as 10 GB-month storage, 1 million Class A requests, 10 million Class B requests, and free internet egress. Standard storage above the included allowance is listed at $0.015 per GB-month; usage is rounded up by billing unit. Infrequent Access has retrieval charges and is not covered by the free tier. Recheck the [official R2 pricing page](https://developers.cloudflare.com/r2/pricing/) before launch and monitor usage; free service tiers and account settings can change.

## Object naming and metadata

Use a private bucket and opaque keys such as `users/{authenticated-user-uuid}/games/{game-uuid}/rom/{object-version}`. The backend creates every UUID and version. Database rows should record owner, game ID, object key, declared and verified size, detected console/extension, checksum algorithm/value, MIME type (treated as advisory), status (`pending`, `ready`, `failed`, `deleting`), timestamps, and upload idempotency key. Do not store client paths.

R2 object metadata is not the authorization source. PostgreSQL ownership plus server-side policy is. Keys may include the user UUID for isolation and operational inspection, but object-key secrecy is not access control.

## Upload contract (planned for Phase 3)

1. **Initiate:** authenticated browser sends filename, byte length, console/file type claim, checksum if available, and an idempotency token. Server validates the extension allowlist (`.gb`, `.gbc`, `.gba`, `.nds`, `.n64`, `.z64`, `.v64`), rejects zero/oversized files, normalizes only the display filename, rate-limits, and reserves the declared bytes atomically against the user's quota and global reserve. Never rely on extension or `Content-Type` alone to establish file validity.
2. **Reserve and key:** in a database transaction, create a `pending` object record with server-derived owner and random object key. A unique idempotency key prevents retry from allocating another reservation. The browser cannot supply owner, bucket, or final object key.
3. **Sign:** server generates a time-limited `PUT` presigned URL for exactly that key, with content type and any supported checksum headers included in the signature. Use a short lifetime (for example 5–10 minutes), set the browser CORS allowlist to the production app origins and only required methods/headers, and return the exact headers the client must send. A signed URL can be reused until expiry; therefore it is not one-time-use. Scope it to a pending, reserved object and overwrite-safe unique key, and do not issue another after completion.
4. **Transfer:** browser uploads directly to R2 over HTTPS and reports the result. Client progress and completion are untrusted hints; they do not mark the record ready.
5. **Finalize:** server authenticates again, confirms the pending row belongs to the user, inspects R2 metadata (size, key, and checksum where supported), checks quota and checksum, and transitions to `ready` idempotently. If finalization fails, keep the reservation until retry or cleanup; do not make an unverified object playable.
6. **Recovery:** expire stale pending reservations, delete abandoned objects, and reconcile object listing/metadata against database records. Incomplete multipart uploads should be aborted by lifecycle policy; Cloudflare documents a seven-day default for incomplete multipart uploads. Alert on orphaned objects and quota drift.

For the initial 900 MB/user maximum, a single presigned `PUT` may be enough. If resumable multipart upload is later added, its create/part/complete/abort operations need an authenticated server-controlled session, per-part limits, expiry, and cleanup. Cloudflare documents a minimum 5 MiB part size (except last), maximum 5 GiB per part, and 10,000 parts. Do not accept arbitrary client-provided multipart IDs.

## Download, launch, and deletion (planned)

- **Launch/download:** authenticate and look up the game by ID scoped to the current user; require `ready`; then sign a short-lived `GET` for that one private object. Return no raw object key lookup endpoint and never accept a URL or key chosen by the client. EmulatorJS fetches the game bytes from this authorized URL; browser CORS must allow only the app origin and required headers. Signed URLs remain usable until expiry and cannot be revoked individually, so use a very short TTL and avoid caching private content in shared caches.
- **Delete:** authenticate, scope the game/object row to the current user, mark it `deleting`, delete using server credentials, then remove metadata/release quota only when deletion is confirmed. Make retries idempotent. If R2 deletion succeeds but DB update fails, reconciliation completes the cleanup; if it fails, retain the reservation and surface a retryable error.
- **Duplicate handling:** initially allow a duplicate per owner or detect duplicates by a verified content hash within that owner. Never deduplicate across users: it complicates independent deletion, accounting, and authorization and can reveal that another user has a particular game.

## Integrity and validation

- Validate size before signing and verify actual stored size after transfer. The declared `Content-Length` is a client claim.
- Prefer SHA-256 for application integrity checks. If signed checksum headers are supported by the selected AWS SDK/R2 path, bind them into the signature and verify after upload; otherwise stream/read the object server-side for hashing only when the cost is acceptable. Do not equate an S3 ETag with a SHA-256 hash; multipart ETags are not whole-file hashes.
- Check file signatures/format structure and console-specific constraints in a sandboxed or resource-bounded worker before marking a ROM ready. Initial extension detection is only routing metadata. Do not execute user files on the server.
- Reject archive formats unless archive extraction is deliberately designed with strict path, expansion-size, and file-count limits.
- Apply per-account request throttles, bounded concurrent reservations, CSRF/origin protections for cookie-authenticated endpoints, and audit events without signed URLs or secrets.

## Phase 1 server interface proposal

Implement later behind server-only modules, not in client components:

```ts
type GameConsole = "gb" | "gbc" | "gba" | "nds" | "n64";

interface UploadIntent {
  filename: string;
  sizeBytes: number;
  console: GameConsole;
  checksum?: { algorithm: "sha256"; value: string };
  idempotencyKey: string;
}

interface UploadCapability {
  uploadId: string;
  url: string; // bearer token; short lived; never persist or log
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
}

interface PrivateGameStorage {
  createUploadIntent(input: UploadIntent): Promise<UploadCapability>;
  finalizeUpload(
    uploadId: string,
  ): Promise<{ gameId: string; verifiedSizeBytes: number }>;
  createDownloadCapability(
    gameId: string,
  ): Promise<{ url: string; expiresAt: string }>;
  deleteGame(gameId: string): Promise<void>;
}
```

Each method must derive identity from a verified server session, not accept `userId`. These are design contracts only; there is no implementation in Phase 1.

## Cloudflare references

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/) — current rates, free tier, rounding, and GB-month definition.
- [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — supported methods, expiry range, signed content type/CORS guidance, bearer-token warning, and S3 endpoint restriction.
- [Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) — direct presigned upload, multipart limits, and incomplete-upload lifecycle.
- [R2 error codes](https://developers.cloudflare.com/r2/api/error-codes/) — checksum mismatch and multipart failure modes.

## Acceptance before enabling uploads

- Private bucket and least-privilege R2 API token configured outside Git; credentials are available only to server runtime.
- Authenticated initiation/finalization/download/delete routes enforce owner scope and quota with adversarial cross-user tests.
- CORS allowlist, signed URL TTL, content size cap, rate limits, and cleanup lifecycle are configured and exercised.
- Successful and interrupted uploads, repeated initiation/finalization, checksum mismatch, expiry, over-quota, deletion retry, and reconciliation have integration coverage.
- Billing alerts/usage review are configured and actual usage is checked against the 10 GB-month target.
