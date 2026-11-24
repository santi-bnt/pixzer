# Private game storage and upload contract

**Status:** The local upload, completion, download, quota reservation, and library code is implemented behind `PIXZER_R2_UPLOADS_ENABLED=false`. `0003_private_game_uploads.sql` is proposal-only and has not been applied. No R2 bucket or real credentials are configured, so live object transfers remain unverified.

## Security and data boundaries

- ROMs and saves belong in a private Cloudflare R2 Standard bucket. Never enable public access for user content.
- R2 credentials and the Supabase secret key are server-only. The browser receives a short-lived capability for one object and one operation; signed URLs are bearer tokens and must never be logged, analyzed, or persisted.
- Every operation starts from a fresh invited Supabase session. The server derives `user_id`; callers cannot choose an owner, bucket, key, quota, or database state.
- PostgreSQL stores metadata only. Object access is authorized by an owner-scoped database lookup before the server signs a download.
- ROM bytes stay out of PostgreSQL, Vercel request bodies, Cache Storage, and the Git repository.

## Implemented local flow

1. The upload page accepts `.gb`, `.gbc`, `.gba`, `.nds`, `.n64`, `.z64`, and `.v64`, checks the file name and size, and reports progress from XHR.
2. An invitation-authorized same-origin POST validates the request and calls the service-role-only `reserve_game_upload` RPC. The proposed RPC serializes quota reservations with an advisory transaction lock, enforces 900,000,000 bytes per user and 9,000,000,000 bytes shared, allows at most two active reservations per account, and creates an opaque owner-prefixed object key.
3. The server issues a 15-minute presigned PUT for the exact key, exact Content-Length, binary content type, and `If-None-Match: *`. R2 evaluates the conditional write atomically, so a replay cannot replace an existing object at that key. The browser transfers directly to R2.
4. The completion endpoint authenticates again, checks the reservation owner and expiry, confirms R2's object size, streams the object through the Node.js function to calculate SHA-256, and calls `complete_game_upload`. A `games` row appears only after R2 and PostgreSQL both confirm the object.
5. Library records are read using the normal cookie-bound Supabase client and RLS. Download URLs are issued only after a user-scoped row lookup and last 120 seconds. Stored games are clearly marked as not playable until an emulator is integrated.

R2's current S3 compatibility documentation lists `Content-MD5` for `PutObject`, but not the `x-amz-checksum-sha256` header. The current server therefore streams the object to compute its trusted SHA-256. No live large-file transfer has been run, so Vercel function duration and cost for a 900 MB verification still need measurement. Single PUT uploads are not resumable; multipart/resume support is future work.

## Proposed database migration

`supabase/migrations/0003_private_game_uploads.sql` adds idempotency/game identifiers to `upload_sessions` and three security-definer RPCs with an empty `search_path`. Execute permission is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`. It does not alter RLS or client grants. Its pgTAP suite is `supabase/tests/0004_private_game_uploads.test.sql` and runs inside a transaction with rollback.

This migration has **not** been applied. Before enabling uploads, review and authorize applying it to the dedicated development project, then run all four suites (48 + 10 + 22 = 80 assertions) there. Do not apply it to production as part of this task.

## Required setup

Create a private R2 bucket with public access disabled. Create an R2 API token scoped to object read/write for that bucket, then configure these server environment variables without committing their values:

- `R2_ACCOUNT_ID`: Cloudflare account ID (32 hexadecimal characters).
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: bucket-scoped R2 S3 credentials.
- `R2_BUCKET_NAME`: the private bucket name.
- `R2_ENDPOINT`: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `SUPABASE_SECRET_KEY`: secret key for the matching Supabase project; server runtime only.
- `PIXZER_R2_UPLOADS_ENABLED`: leave `false` until the migration, bucket, credentials, and CORS policy have been verified; then set `true` only in that environment.

Set R2 CORS to allow only `https://pixzer.vercel.app` (and `http://localhost:3000` only for local testing), method `PUT`, headers `Content-Type` and `If-None-Match`, and expose no object listing or public-read access. Keep separate development and production buckets/tokens. Vercel must receive the matching project's public Supabase URL/key and site URL along with the server-only values. Do not copy development secrets into production.

## Acceptance and remaining work

- Apply and test the proposal migration in development; verify RPC ownership, `SECURITY DEFINER`, empty `search_path`, execute ACLs, original RLS, and all 80 pgTAP assertions.
- Perform real object uploads/downloads in a dedicated bucket, including over-quota, concurrent reservations, abandoned/expired upload, exact-size mismatch, retry, and two-user isolation cases.
- Add deletion, scheduled reservation/orphan reconciliation, rate limiting, and alerting before broader use. The active-reservation cap is not a general API rate limiter.
- Test an actual iPhone Safari transfer and a large-file Vercel completion. No emulator/player is implemented, so uploaded files cannot yet be played.

## References

- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2 upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
