# Private game storage and upload contract

**Status (2026-11-26):** Migrations 0003 and 0004 are applied to Supabase project `pxxtzjpjtigikolauxwc` as versions `20261126081749` and `20261126081801`. Both R2 and Drive uploads remain disabled. No real Drive transfer has been verified. Drive downloads use an authenticated server stream with the user's encrypted Drive grant; the route validates ownership metadata and checks byte count and provider MD5 while streaming.

## Security and data boundaries

- ROMs and saves must remain private in the storage provider chosen for the account. Google Drive is the intended active provider; Cloudflare R2 is retained only as a disabled alternative. Never enable public access for user content.
- Provider credentials, OAuth tokens, and the Supabase secret key are server-only. Temporary resumable upload URLs are bearer capabilities and must never be logged, analyzed, or persisted.
- Every operation starts from a fresh invited Supabase session. The server derives `user_id`; callers cannot choose an owner, bucket, key, quota, or database state.
- PostgreSQL stores metadata only. Object access is authorized by an owner-scoped database lookup before the server signs a download.
- ROM bytes stay out of PostgreSQL, Vercel request bodies, Cache Storage, and the Git repository.

## Disabled R2 alternative

1. The upload page accepts `.gb`, `.gbc`, `.gba`, `.nds`, `.n64`, `.z64`, and `.v64`, checks the file name and size, and reports progress.
2. An invitation-authorized same-origin POST validates the request and calls the service-role-only `reserve_game_upload` RPC. The RPC serializes quota reservations with an advisory transaction lock, enforces 900,000,000 bytes per user and 9,000,000,000 bytes shared, allows at most two active reservations per provider, and creates an opaque owner-prefixed object key.
3. The server issues a 15-minute presigned PUT for the exact key, exact Content-Length, binary content type, and `If-None-Match: *`. R2 evaluates the conditional write atomically, so a replay cannot replace an existing object at that key. The browser transfers directly to R2.
4. The completion endpoint authenticates again, checks the reservation owner and expiry, confirms R2's object size, streams the object through the Node.js function to calculate SHA-256, and calls `complete_game_upload`. A `games` row appears only after R2 and PostgreSQL both confirm the object.
5. Library records are read using the normal cookie-bound Supabase client and RLS. Download URLs are issued only after a user-scoped row lookup and last 120 seconds. Stored games are clearly marked as not playable until an emulator is integrated.

R2's current S3 compatibility documentation lists `Content-MD5` for `PutObject`, but not the `x-amz-checksum-sha256` header. The current server therefore streams the object to compute its trusted SHA-256. No live large-file transfer has been run, so Vercel function duration and cost for a 900 MB verification still need measurement. Single PUT uploads are not resumable; multipart/resume support is future work.

## Applied database migrations

`supabase/migrations/0003_private_game_uploads.sql` adds idempotency/game identifiers and a retry-safe expired-object cleanup marker to `upload_sessions`, plus a centralized quota checker and upload RPCs with an empty `search_path`. Completion retries return the same game only when its owner, ID, object key, verified size and SHA-256 still match; a missing game row or changed metadata raises an explicit error. The checker dynamically detects the Drive reservation table so 0003 remains valid before 0004. It totals committed games plus uncleared R2 and Drive reservations, under one transaction advisory lock. Expiry alone never releases quota: provider absence or cleanup must be confirmed. Execute permission is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`. It does not alter RLS or client grants. Its pgTAP suite is `supabase/tests/0004_private_game_uploads.test.sql` and runs inside a transaction with rollback.

This migration has already been applied to the authorized project. Do not apply it again. The four pgTAP suites passed earlier in isolated CI (166 assertions); no remote migration or pgTAP test was run during this code task.

## Google Drive per-user provider (implemented, uploads disabled)

Google Drive is now represented as a separate provider behind `PIXZER_GAME_STORAGE_PROVIDER=google_drive` and `PIXZER_GOOGLE_DRIVE_ENABLED=false`. Each invited pixzer account authorizes its own Google account through a separate OAuth authorization-code + PKCE flow. The only requested scope is `https://www.googleapis.com/auth/drive.file`; OAuth state and verifier are HttpOnly, short-lived cookies. Supabase Auth identity remains separate and unchanged.

The server encrypts Drive refresh tokens and resumable-session URLs with AES-256-GCM using `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`; only ciphertext, nonce, tag, and key version are stored in the private `drive_connections` table. The encryption key, Google OAuth client secret, and Supabase secret key are server-only. The browser receives a resumable upload URL, which is a temporary bearer capability for one upload; it is kept in component memory and not logged or persisted. A small session identifier is retained in sessionStorage to resume after a page reload, and the server returns the capability only after checking the invited session and row ownership.

ROM bytes upload directly from the browser to Drive in 8 MiB resumable chunks, avoiding Vercel request-body limits and ROM transit through Vercel on upload. The server verifies Drive's stored file ID, owner permission ID, app marker, name, size and provider-computed MD5 checksum before creating the library row. `games.sha256` stays null for Drive rows; the provider checksum is stored separately. It deliberately does not accept a client-computed SHA-256 as proof of uploaded content. Downloads use only the authenticated server stream and the encrypted Drive refresh token, so they work independently of the browser's current Google account and never expose OAuth credentials. Redirects are followed manually to allowlisted HTTPS Google hosts; the bearer token is sent only on the initial Drive API request and never on a redirect. The stream checks byte count and provider MD5 without buffering the complete ROM. An integrity failure is detected at end-of-stream, after some bytes may already have reached the browser; the response errors rather than being treated as a verified complete download. Streaming still consumes Vercel function duration and network transfer. The route has a 300-second maximum; plan limits and reliability for 900 MB downloads require a real deployment test. Google CORS and resumable cross-origin behavior also require a real browser upload test.

`0004_google_drive_storage.sql` depends on `0003_private_game_uploads.sql`; both are already applied to the project above. `0005_google_drive_storage.test.sql` has 71 pgTAP assertions; both storage suites insert invited/uninvited fixture users and fake encrypted-token values inside transactions and roll them back. All 166 assertions passed previously in isolated CI; an actual simultaneous two-connection quota race remains a separate pre-launch integration check.

The quota is 900,000,000 bytes per pixzer user and 9,000,000,000 bytes shared across committed games and uncleared reservations from both providers. One service-role-only PostgreSQL checker serializes reservations with a shared advisory transaction lock. Expired reservations continue consuming quota until provider cleanup or absence is confirmed. For Drive, `claim_expired_drive_upload_cleanup` leases expired rows with `SKIP LOCKED`; the protected `POST /api/internal/drive/reconcile` worker refreshes only that owner's encrypted Drive credential, checks the connected permission ID, probes any resumable session, and searches for the server-created `pixzerGameId` marker. A fully verified object is completed idempotently; a confirmed absent object releases the hold; active uploads are retried; revoked access or ambiguous files are parked for manual review and keep their quota. No object is deleted automatically. After restoring the owner's Drive authorization and reviewing/removing an invalid object in Drive, an operator may requeue a manual-review row and rerun reconciliation. The endpoint requires the server-only `PIXZER_DRIVE_RECONCILIATION_SECRET`; do not schedule or invoke it until the development worker has been verified. R2 remains disabled for this rollout. Google Drive's reported storage usage is displayed separately because the personal Drive allowance is shared with Gmail and Photos and is controlled by Google, not pixzer. Downloads revalidate pixzer ownership, Drive account, exact metadata/checksum and `capabilities.canDownload` before streaming.

### Google Cloud and local/Vercel configuration

No Google Cloud project/API, billing account, OAuth client, Vercel variable, or remote migration was changed. Development can be prepared without production OAuth verification. For manual testing, enable Google Drive API in a Cloud project without linking a billing account; if the console requires billing to proceed, stop there. Configure the OAuth consent screen as External / Testing, add each tester under Test users, and create a Web application client with authorized JavaScript origin `https://pixzer.vercel.app` and redirect URI `https://pixzer.vercel.app/api/drive/callback` (for local work only, add `http://localhost:3000` and `http://localhost:3000/api/drive/callback` to a separate local OAuth client). Testing refresh tokens expire after seven days. The requested `drive.file` scope is non-sensitive and per-file; it does not grant access to the user's whole Drive.

Configure these names only in local `.env.local` and the matching Vercel project/environment, never commit values:

- `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000` locally; `https://pixzer.vercel.app` for production.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the intended Supabase project.
- `SUPABASE_SECRET_KEY`: same project's server-only secret key; required for the narrow server RPC/table operations.
- `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`: Web OAuth client values, server-side only.
- `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`: base64 encoding of 32 random bytes, server-side only. Generate/store using a secret manager; do not paste it into chat or commit it. Back it up securely because losing it makes stored refresh tokens unrecoverable.
- `PIXZER_DRIVE_RECONCILIATION_SECRET`: random server-only bearer secret used only by the protected expired-upload maintenance endpoint; do not expose it to the browser.
- `PIXZER_GAME_STORAGE_PROVIDER=google_drive` and `PIXZER_GOOGLE_DRIVE_ENABLED=false` until both migrations are reviewed/applied and all external setup is verified; only then enable in development.
- Keep `PIXZER_R2_UPLOADS_ENABLED=false` as the alternative provider remains disabled.

For production OAuth publication, complete Google's app branding, homepage/privacy policy/terms, domain ownership, production verification requirements, and the applicable OAuth consent-screen review before changing Publishing status to In production. This is not needed to develop with named test users. Google currently states standard Drive API use is available at no extra cost, while exceeding quota request limits is planned to become billable later in 2026; do not configure billing or request paid quota increases. Each user's own Drive storage allowance remains subject to their Google account plan.

Primary references: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive API usage limits and pricing](https://developers.google.com/workspace/drive/api/guides/limits), [OAuth Testing-mode refresh token lifetime](https://developers.google.com/identity/protocols/oauth2), and [Vercel Function limits](https://vercel.com/docs/functions/limitations).

## Disabled R2 alternative setup

Create a private R2 bucket with public access disabled. Create an R2 API token scoped to object read/write for that bucket, then configure these server environment variables without committing their values:

- `R2_ACCOUNT_ID`: Cloudflare account ID (32 hexadecimal characters).
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: bucket-scoped R2 S3 credentials.
- `R2_BUCKET_NAME`: the private bucket name.
- `R2_ENDPOINT`: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `SUPABASE_SECRET_KEY`: secret key for the matching Supabase project; server runtime only.
- `PIXZER_R2_UPLOADS_ENABLED`: leave `false` until the migration, bucket, credentials, and CORS policy have been verified; then set `true` only in that environment.

Set R2 CORS to allow only `https://pixzer.vercel.app` (and `http://localhost:3000` only for local testing), method `PUT`, headers `Content-Type` and `If-None-Match`, and expose no object listing or public-read access. Keep separate development and production buckets/tokens. Vercel must receive the matching project's public Supabase URL/key and site URL along with the server-only values. Do not copy development secrets into production.

## Acceptance and remaining work

- The migrations are already applied. Do not reapply them. Their security properties and migration history have been confirmed read-only; 166 pgTAP assertions passed earlier in isolated CI. A separate live concurrent-session test remains required before enabling either provider.
- Perform real Drive upload/download tests using an authorized test file, including over-quota, concurrent reservations, abandoned/expired upload, exact-size mismatch, retry, and two-user isolation cases.
- The Drive reconciliation endpoint processes at most three expired sessions per request, uses a 15-minute claim lease, retries transient provider states, and parks revoked/ambiguous states for manual review without releasing quota. Configure a trusted scheduler only after the development flow is validated. R2 orphan reconciliation, rate limiting, alerting, and a genuine two-connection quota race test remain required before broader use. The active-reservation cap is not a general API rate limiter.
- Test an actual iPhone Safari transfer and a large-file Vercel completion. No emulator/player is implemented, so uploaded files cannot yet be played.

## References

- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2 upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
