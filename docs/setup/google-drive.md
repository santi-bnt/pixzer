# Google Drive setup for pixzer

## Current status

Google Drive uses a separate OAuth client from Supabase Google login. Supabase project `pxxtzjpjtigikolauxwc` has storage migrations `20261126081749` and `20261126081801` applied. The database currently has no Drive connections, upload sessions, or stored games. RLS is enabled on the Drive tables; browser roles do not have policies to read or write token/session rows. Upload flags remain off, and R2 remains off. No real Drive upload or download has been performed.

Each invited pixzer user connects their own Google account using only `https://www.googleapis.com/auth/drive.file`. The server encrypts refresh tokens with AES-256-GCM and stores only ciphertext and its nonce/tag. OAuth secrets and the encryption key are server-only. The uploaded bytes go directly from the browser to Drive in resumable chunks. Download uses the owner's encrypted Drive grant and streams Drive bytes through the pixzer server, so the current Google account in the browser does not affect authorization.

## Google Cloud manual configuration

In the Google Cloud project that owns OAuth client `pixzer-drive`:

1. Open **APIs & Services → Library → Google Drive API** and enable the API. Do not link a billing account or enable a paid service. Stop if the console requires billing before enabling it.
2. Open **Google Auth Platform → Audience**. For development, use **External / Testing** and add each real test account under **Test users**.
3. Under **Clients**, edit the Web application client `pixzer-drive` (not `pixzer-login`):
   - Authorized JavaScript origin: `https://pixzer.vercel.app`
   - Authorized redirect URI: `https://pixzer.vercel.app/api/drive/callback`
4. Keep Supabase's `pixzer-login` client in Supabase Auth provider configuration. Do not substitute its client credentials in the Drive environment variables.
5. Keep the only requested Drive scope at `https://www.googleapis.com/auth/drive.file`. Do not add a broad Drive scope.

Testing-mode OAuth is appropriate only for the accounts explicitly added as test users. Before general production use, Google may require app branding, domain verification, a public privacy policy and terms, and OAuth verification for the requested scopes. Do not change the app to production publishing until that review is complete.

## Vercel variables

In the Vercel project linked to `pixzer.vercel.app`, open **Settings → Environment Variables**. Use the **Production** environment only when deliberately preparing a production test. Never put secret values in `NEXT_PUBLIC_*` variables.

Public values:

- `NEXT_PUBLIC_SITE_URL=https://pixzer.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL`: project API URL for `pxxtzjpjtigikolauxwc`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key for the same Supabase project.

Server-only secrets (do not print, commit, or expose to client code):

- `SUPABASE_SECRET_KEY`: server key for the same Supabase project, used only for narrow privileged database operations.
- `GOOGLE_DRIVE_CLIENT_ID`: OAuth client ID for `pixzer-drive`.
- `GOOGLE_DRIVE_CLIENT_SECRET`: OAuth client secret for `pixzer-drive`.
- `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes. Store a secure backup; losing this key makes stored refresh tokens unreadable.
- `PIXZER_DRIVE_RECONCILIATION_SECRET`: long random bearer secret for the maintenance endpoint. Do not configure a scheduler until reconciliation has passed an end-to-end development test.

Keep the feature flags in Vercel set as follows until the first real browser upload, server-side download, isolation checks, and recovery tests pass:

- `PIXZER_GAME_STORAGE_PROVIDER=google_drive`
- `PIXZER_GOOGLE_DRIVE_ENABLED=false`
- `PIXZER_GOOGLE_DRIVE_UPLOADS_ENABLED=false`
- `PIXZER_R2_UPLOADS_ENABLED=false`

After changing environment variables, redeploy only through the normal approved release process. This task does not enable flags or deploy.

## Verification and limits

The application currently uploads directly from the browser to Google's resumable upload endpoint in 8 MiB chunks. Browser CORS behavior has not yet been verified with a real authenticated upload. A synthetic request without a valid resumable session cannot prove CORS support.

Downloads stream through a Node.js Vercel function. This avoids buffering a full ROM in server memory, but the transfer still consumes function duration and network egress. The route sets a 300-second maximum and omits `Content-Length` on the downstream response so a later byte-count or MD5 failure interrupts the stream instead of presenting a complete length-delimited body. The active Vercel plan and function configuration are not accessible from this environment. Therefore a 900 MB download is not yet guaranteed to finish within the deployed function limit. A dedicated streaming origin/CDN or a secure browser-to-Drive download capability should be evaluated if real large-file tests exceed Vercel limits; neither has been configured. The default download never uses `webContentLink` and does not depend on the browser's Google session.

The protected reconciliation endpoint is conservative: it only releases quota after Drive confirms absence or trash; it completes a session only when owner, game marker, name, size and checksum all match. Revoked access and ambiguous states remain reserved for manual review. No scheduler is configured, so abandoned reservations will continue to count against quota until an operator runs the reviewed reconciliation process.

Do not upload commercial ROMs to test. Use only a lawful homebrew/test file or another file you are authorized to store.
