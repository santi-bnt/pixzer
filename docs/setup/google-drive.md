# Google Drive setup for pixzer

## Current status

Google Drive uses a separate OAuth client from Supabase Google login. Supabase project `pxxtzjpjtigikolauxwc` has storage migrations `20261126081749` and `20261126081801` applied. The production database had no Drive connections, upload sessions, or stored games during the last read-only check; RLS is enabled on Drive tables and browser roles cannot read or write token/session rows. Production upload flags remain off and R2 remains off. Local development has completed real Google Drive upload/download checks with synthetic files; production and Vercel Preview have not.

Each invited pixzer user connects their own Google account using only `https://www.googleapis.com/auth/drive.file`. The server encrypts refresh tokens and resumable session URIs with AES-256-GCM and stores only ciphertext and its nonce/tag. OAuth secrets and encryption keys are server-only. Upload chunks pass through authenticated, owner-scoped pixzer routes and stream to Drive without buffering a complete ROM in server memory or writing it to disk. Download uses the owner's encrypted Drive grant and streams Drive bytes through pixzer, so the browser's currently selected Google account does not affect authorization.

## Separate Google Cloud environments

Use independent Google Cloud projects and OAuth Web clients for development and production. This prevents localhost credentials and redirect URIs from entering the production OAuth configuration. The projects `pixzer-drive-dev` and `pixzer-drive-prod` have been created and Google Drive API is enabled in each. Neither has a billing account. Google's Standard Tier is the default no-cost tier; do not attach billing or request Scaled Tier quotas.

- Development project: `pixzer-drive-dev`. Once its consent screen is configured, create the Web OAuth client with JavaScript origin `http://localhost:3000` and callback `http://localhost:3000/api/drive/callback`; use audience **External / Testing** and add each real developer account as a test user.
- Production project: `pixzer-drive-prod`. Once legal pages and domain verification are complete, create its independent Web OAuth client with JavaScript origin `https://pixzer.vercel.app` and callback `https://pixzer.vercel.app/api/drive/callback` (or the eventual verified custom domain and callback).
- The existing `pixzer-drive` client belongs to the older `pixzer` Cloud project alongside `pixzer-login`; OAuth clients cannot be moved between projects. It is not reused, so Drive production credentials remain isolated from Supabase Login. No OAuth Web client has yet been created in either new project because Google requires the consent/branding screen to be configured first.
- In each project, enable only Google Drive API; request only `https://www.googleapis.com/auth/drive.file`.

The current implementation asks for the non-sensitive `drive.file` scope. Google still requires basic OAuth app verification/brand checks for a public External production app, including accurate branding and owned, verified domains. Publish status and verification must remain unchanged until those checks pass. OAuth Testing is for named testers and imposes Google limits; it is not the finished public configuration.

## Branding and domain readiness

Routes `/privacy` and `/terms` have been drafted locally to describe the implemented data flow, but both visibly remain drafts and are not yet deployed publicly. They cannot be submitted to Google as final policies until the operator supplies the legal identity, privacy contact, retention period, account deletion process, governing law, and dispute process. Do not invent these details.

Google requires a public homepage that explains pixzer, links to the matching privacy policy (and terms), and is hosted on a verified domain owned by the app operator. Google's documentation says Search Console URL-prefix properties can be verified with supported site methods, but also recommends using a domain the app operator owns rather than a shared hosting domain. Whether the `pixzer.vercel.app` subdomain will satisfy OAuth authorized-domain review has not been confirmed. A custom domain controlled by the operator is the reliable fallback; no domain has been purchased or changed, and cost depends on the chosen name/TLD and registrar.

The Google Cloud consent/branding setup is blocked on real operator-provided information: the public support email and developer contact, legal operator identity, retention and account-deletion practices, and governing law/dispute terms. Do not publish OAuth or submit verification while these values or the public legal pages are incomplete. The production callback and origin also need to use the final verified domain if a custom domain is selected.

## Vercel variables

In the Vercel project linked to `pixzer.vercel.app`, open **Settings → Environment Variables**. Use the **Production** environment only when deliberately preparing a production test. Never put secret values in `NEXT_PUBLIC_*` variables.

Public values:

On the read-only Production environment view checked November 26, 2026, only the following three site/Supabase public variable names were visible. None of the server-only Drive variables, server Supabase key, or storage feature flags was configured there. No values are recorded in this document.

- `NEXT_PUBLIC_SITE_URL=https://pixzer.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL`: project API URL for `pxxtzjpjtigikolauxwc`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key for the same Supabase project.

Server-only secrets (do not print, commit, or expose to client code):

- `SUPABASE_SECRET_KEY`: server key for the same Supabase project, used only for narrow privileged database operations.
- `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`: use `pixzer-drive-dev` only in local development and `pixzer-drive-prod` only in Vercel Production. These are server-side values; never expose them through `NEXT_PUBLIC_*`.
- `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`: independent base64 encoding of 32 random bytes for each environment. Keep a copy in a password manager or another encrypted secret manager. Losing the only key makes stored refresh tokens and resumable upload capabilities unreadable.
- `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY_PREVIOUS`: optional prior environment key during a key rotation. New values are always encrypted with the primary key; existing ciphertext can be decrypted with the previous key. Keep the previous key until every existing Drive connection has been reconnected and every active resumable session has completed or expired; then remove it. Never use one environment's key in another.
- `PIXZER_DRIVE_RECONCILIATION_SECRET`: long random bearer secret for the maintenance endpoint. Do not configure a scheduler until reconciliation has passed an end-to-end development test.

Keep the feature flags in Vercel set as follows until the first real browser upload, server-side download, isolation checks, and recovery tests pass:

- `PIXZER_GAME_STORAGE_PROVIDER=google_drive`
- `PIXZER_GOOGLE_DRIVE_ENABLED=false`
- `PIXZER_GOOGLE_DRIVE_UPLOADS_ENABLED=false`
- `PIXZER_R2_UPLOADS_ENABLED=false`

After changing environment variables, redeploy only through the normal approved release process. This task does not enable flags or deploy.

## Verification and limits

The browser sends sequential 4 MiB chunks to pixzer; pixzer forwards each request body stream to Google's resumable endpoint. This keeps each request below Vercel's default 4.5 MB function payload cap and avoids browser-to-Drive CORS. The encrypted resumable session URI never leaves the server. Each chunk request rechecks invited authentication, upload ownership, expected size/range, current provider offset, and exact body length. The client resumes only from Drive's server-confirmed offset.

Downloads stream through a Node.js Vercel function. This avoids buffering a full ROM in server memory, but the transfer still consumes function duration and network egress. The route sets a 300-second maximum and omits `Content-Length` on the downstream response so a later byte-count or MD5 failure interrupts the stream instead of presenting a complete length-delimited body. A 900 MB download is not guaranteed to finish within 300 seconds; at least 3 MB/s sustained throughput would be needed before protocol and integrity-check overhead. A dedicated streaming origin/CDN or a secure browser-to-Drive download capability should be evaluated if real large-file tests exceed Vercel limits; neither has been configured. The default download never uses `webContentLink` and does not depend on the browser's Google session.

Vercel documents a default 4.5 MB request/response payload cap, a 2 GB maximum Hobby function memory, and up to 300 seconds with Fluid Compute; streamed response time counts toward that duration. A 20 MiB request-body beta announced November 20, 2026 requires 4 GB function memory, so it is outside Hobby's documented 2 GB maximum. The existing 4 MiB chunks do not depend on that beta. A 900 MB download needs more than 3 MB/s sustained throughput to finish within 300 seconds, before protocol and integrity-check overhead; no 900 MB transfer has been tested.

The Vercel account plan, Fluid Compute setting, current usage, and Production variables could not be queried directly in this work session. The previous environment review recorded Hobby with Fluid Compute enabled and reported no server-only Drive variables or Drive flags in Production; recheck in Vercel before any production activation. Hobby includes 10 GB Fast Origin Transfer and 100 GB Fast Data Transfer. Vercel counts both function request and response bytes toward Fast Origin Transfer. A 900 MB upload followed by a 900 MB download therefore uses about 1.8 GB of Fast Origin Transfer, or roughly five complete upload/download cycles from the 10 GB allowance before other traffic. Hobby overages do not authorize paid service; usage limits can pause the feature until reset. Hobby is intended for personal, non-commercial use, so confirm that pixzer's intended use fits the plan terms before production use.

The protected reconciliation endpoint is conservative: it only releases quota after Drive confirms absence or trash; it completes a session only when owner, game marker, name, size and checksum all match. Revoked access and ambiguous states remain reserved for manual review. No scheduler is configured, so abandoned reservations will continue to count against quota until an operator runs the reviewed reconciliation process.

The local encryption key exists only in ignored .env.local; it decodes to 32 bytes and the operator has confirmed it is backed up securely. Development and production must use distinct keys. The code supports a temporary GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY_PREVIOUS during key rotation; keep the previous key until every stored connection has been reconnected and all resumable upload sessions have completed or expired. The key is never copied to Git or printed by setup commands.

Do not upload commercial ROMs to test. Use only a lawful homebrew/test file or another file you are authorized to store.

### Local transfer results (November 27, 2026)

Authenticated browser transfers to the connected local Google Drive account used deterministic binary fixtures generated locally and stored outside the repository (not ROMs). An 8 MiB + 73 byte file completed in 3 chunks in 5.755 seconds; a 32 MiB file completed in 8 chunks in 7.559 seconds after reload and resumed from Drive's confirmed 4 MiB offset. Both downloaded with the original size and matching SHA-256. A third 8 MiB + 73 byte transfer was interrupted after the browser had sent about 1 MiB of its first chunk; Drive reported offset 0, and the app resumed that file from offset 0 and completed in 4.730 seconds with matching bytes and SHA-256. The three test games were deleted through pixzer and local Drive storage returned to its pre-test baseline. These are local real-provider results, not Vercel Preview or Production results.

The local Supabase instance has two invited test users. The new per-upload PostgreSQL lease was exercised against the real local Google Drive integration: concurrent same-session chunk requests produced one successful provider write and one controlled `409` busy response; competing ranges were serialized; an interrupted request retained its lease; after lease expiry the server queried Drive's confirmed offset and resumed without corrupting bytes. A server restart was also exercised before recovery. Downloaded bytes matched the browser-generated synthetic source by SHA-256, and each new test game was deleted through pixzer. These tests used the already connected owner's Drive; they did not revoke the owner's grant or attempt destructive operations on the other user's Drive.

Every chunk, status probe, and completion attempt first acquires the same atomic database lease for its upload session. The lease is fenced by a random per-request owner ID and expires after six minutes. Google network operations have a 240-second abort timeout and the route's hard runtime limit is 300 seconds, so a live handler cannot intentionally outlast the lease. PostgreSQL transactions end before any Google network call. An ambiguous timeout or disconnect retains the lease until expiry; a later request then probes Google's resumable session and resumes only at the confirmed offset. A busy request receives a retryable `409` with `Retry-After`. Expired-reservation reconciliation ignores sessions with a live chunk lease, and uncertain or unqueryable provider state keeps quota reserved for retry/manual review. No scheduler is configured.

The old `concurrent-probe.gb` synthetic reservation from the earlier race investigation remains held: Google's provider state could not be confirmed, so it was deliberately not deleted or released. Another earlier provider session was still active. The library contains no games from these probes, but their reservations continue to count against local quota. The isolated local pgTAP lease suite passed 29/29 assertions, and an independent-connection PostgreSQL race test had exactly one winner for a shared session while both separate sessions acquired successfully. The full local `0005_google_drive_storage` suite could not pass against this reused local database because the two pre-existing held reservations caused its clean-database global-quota boundary fixture to exceed the configured limit; that suite must be confirmed in the fresh disposable CI database. No files or ROMs were committed.

These results are local development evidence only. Google grant revocation, two-Google-account storage isolation, and Vercel Preview/Production behavior remain unverified. No test files or ROMs were committed.

## Per-user API budgets (local proposal)

The incremental `0006_drive_user_rate_limits.sql` migration stores one fixed-window counter per invited user and Drive action in PostgreSQL. Atomic upserts serialize concurrent requests across serverless instances; browser roles cannot read or modify counters, and the service-role RPC checks the trusted `auth.users.invited_at` marker. The server fails closed with `503` if the database limiter is unavailable and returns `429` with `Retry-After` after the allowance is used. Hourly ceilings are: upload intents 12, 4 MiB chunks 240, status probes 180, resumes 60, completions 20, Drive status 60, Drive downloads 30, deletes 20, disconnects 6, and OAuth starts/callbacks 12. The 240 chunk allowance admits one 900 MB upload (215 chunks) with 25 retries. These values count retries as requests. This migration and its 23-assertion suite have been applied and tested only on the isolated local Supabase stack; they have not been applied to a hosted project.
