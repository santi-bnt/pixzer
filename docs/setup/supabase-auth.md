# Supabase Auth setup (Phase 2)

## Current state

Invite-only Auth UI, cookie-backed SSR clients, a protected account shell, callback handling, local Supabase CLI configuration, and SQL/RLS tests are present in this checkout. The CLI is installed as a development dependency, but this machine has no Docker-compatible container runtime and there is no `.env.local` or linked Supabase project. Auth and database behavior have therefore not been exercised. The migration is not applied; review its target schema, grants, RLS tests, and project settings before applying it anywhere hosted.

## Create local configuration

1. For an isolated local stack, install/start a Docker-compatible container runtime, then run `npx supabase start`; `supabase/config.toml` disables public signup and seed loading and allows local app callback URLs. Local confirmation and recovery emails are captured by the Supabase local email testing server.
2. Alternatively, create or select a dedicated non-production Supabase project. Never link a production project for this validation task.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the selected development project's API settings. Local HTTP API URLs on `localhost`, `127.0.0.1`, or `[::1]` are permitted; deployed projects must use HTTPS.
4. Restart the Next.js dev server after changing environment values.
5. Do not put a Supabase secret/service-role key in the app environment for Phase 2. The public publishable key is safe to distribute only because database grants and RLS constrain all exposed data.

## Configure invite-only access

1. In Supabase Authentication settings, disable public sign-ups and enable email/password for existing invited users. Require email confirmation.
2. Set the project Site URL to the local app origin during development, and add the local callback URL (for example `http://localhost:3000/auth/confirm`) plus the production callback URL to the allowed redirect list when production is authorized.
3. In **Authentication → Email Templates → Invite user**, configure the confirmation link to target the application callback with the token hash and invite type, then continue to the invite-only password setup page. Example for an HTML template:

   ```html
   <a
     href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite&amp;next=%2Fregister"
     >Accept your pixzer invitation</a
   >
   ```

4. Configure the password recovery email to use the same callback with `type=recovery` and `next=%2Freset-password`. For an HTML template, use a server-verifiable token hash:

   ```html
   <a
     href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Freset-password"
     >Reset your pixzer password</a
   >
   ```

5. Add initial users through **Authentication → Users → Add user → Send invitation**. pixzer intentionally has no public sign-up or admin-invite endpoint.

The callback accepts the configured PKCE code and token-hash email flows, validates them with Supabase, and permits only same-origin relative continuation paths. Invitation/password setup and recovery links are short-lived; send a fresh invite if one expires.

## Configure Google OAuth

1. In a dedicated Supabase development project, open **Authentication → Sign In / Providers → Google** and enable Google. Use the provider callback URL displayed by Supabase Auth as the authorized redirect URI in Google Cloud; keep Google client ID/secret in the provider configuration, not in app browser variables.
2. In Supabase URL Configuration, add the exact app callback URL for each approved origin, such as `http://localhost:3000/auth/confirm` for local development and `https://<approved-app-domain>/auth/confirm` for an authorized deployment. Do not use broad production wildcards.
3. Set `NEXT_PUBLIC_SITE_URL` to the same app origin. Local OAuth starts only from loopback HTTP; deployed actions require the request origin to match this setting or Vercel's deployment URL.
4. Keep public sign-ups disabled. A Google identity is not an invitation: the callback and protected server routes require Supabase's trusted `invited_at` marker, and RLS checks the same authorization state. When a Google identity uses the same verified email as an existing invited Auth user, rely on Supabase Auth's automatic identity linking to retain that Auth user ID. Do not implement app-side account merging or trust editable metadata.
5. Test with an already invited email account and a separate uninvited Google identity. Confirm that the invited user retains the same Auth user ID/library after verified linking, while the uninvited identity is rejected and sees no private rows. Supabase documents automatic linking for matching verified emails and warns against linking to unverified identities: [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Google client credentials and a verified provider configuration are external setup requirements. They are intentionally absent from `.env.example`; the Google provider remains disabled in local Supabase config until credentials are supplied through Supabase's supported secret configuration.

## Apply and verify the schema

1. Review `supabase/migrations/0001_initial_schema.sql` and the RLS tests under `supabase/tests/`.
2. Preferred local route: start Docker Desktop, run `npx supabase start`, then `npx supabase test db`. This validates the migration and pgTAP suite on the local stack without touching a hosted database.
3. Docker-free hosted route: use only a dedicated, explicitly authorized development project. Install PostgreSQL command-line tools so `psql` is on PATH, set `PIXZER_DEV_PROJECT_REF` and `PIXZER_DEV_DATABASE_URL` in the current PowerShell session, and run `./scripts/test-pgtap-remote.ps1`. The script accepts only a direct Supabase database URL or session-pooler URL whose project ref matches, asks you to type the ref again, executes the existing test SQL, and verifies the TAP plan plus every declared assertion (currently 48). It never applies the migration. `psql`'s process environment receives the password; the script does not print or save the connection string. Do not run this against production: pgTAP extension creation and the test transaction are database operations.
4. Before applying the migration to the dev project, inspect its project ref and current schema/migration history. Apply only after explicit authorization; the migration uses `DROP POLICY IF EXISTS` and must not be run against an unknown target.
5. Verify signed-out access is denied and two distinct users cannot read or mutate each other's rows. Test the intended owner-only favorite update and ensure uploads/saves remain non-writable in this phase.

### Windows 11 prerequisites for hosted pgTAP

1. Install PostgreSQL command-line tools from the official PostgreSQL Windows installer and select the command-line tools (`psql`). A local PostgreSQL server is not required for the remote runner.
2. In PowerShell, store the project ref and connection URI only in the session. Do not paste either value into chat or commit them:

   ```powershell
   $env:PIXZER_DEV_PROJECT_REF = 'your-20-character-dev-project-ref'
   $secureUri = Read-Host 'Paste the development database URI' -AsSecureString
   $env:PIXZER_DEV_DATABASE_URL = [System.Net.NetworkCredential]::new('', $secureUri).Password
   Remove-Variable secureUri
   .\scripts\test-pgtap-remote.ps1
   Remove-Item Env:PIXZER_DEV_DATABASE_URL
   Remove-Item Env:PIXZER_DEV_PROJECT_REF
   ```

   The URI can be copied from the dedicated development project's Connect panel. Prefer the direct connection when the network supports IPv6; otherwise choose the Supavisor session pooler. The script checks the ref embedded in the direct hostname or pooler username before opening the connection.

### Real Auth flow validation

Use only two controlled test inboxes and a dedicated development project. In the project's Auth settings, turn off public sign-ups, enable email/password for invited users, require confirmation, and configure the local/development callback URLs and invite/recovery templates from this document. Apply the reviewed migration only after confirming the target and receiving explicit authorization. Then send invitations to both test users; accept each invite, set a password, sign in, open protected routes, sign out, and confirm those routes redirect to login. Request recovery for one user, use its link to set a new password, and verify the new password works while the old one fails. Finally, verify account A cannot see or mutate account B's rows, and repeat in reverse. Capture test results without saving invitation or recovery tokens. Delete only synthetic test users/rows in the disposable development project after review; never use `db reset` or broad cleanup against a hosted project.

## Session security notes

- Browser and server clients use cookie-backed SSR sessions. Next.js 16 Proxy refreshes tokens; protected pages and handlers still verify claims themselves.
- Use `getClaims()` or Auth-verified `getUser()` for identity checks. `getSession()` alone does not validate cookie claims.
- Sign-out clears the Supabase session cookie for that browser. PC and iPhone authenticate to the same account independently; their sessions are not shared between devices.
- Auth callback redirects use `private, no-store` and `no-referrer`; review cache headers for any other response that refreshes auth cookies. Do not statically cache private account pages or responses.

## References

- [Supabase SSR clients for Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase server-side authentication methods](https://supabase.com/docs/guides/auth/server-side)
- [Supabase invitation flow](https://supabase.com/docs/guides/auth/users)
- [Supabase RLS, grants, and policy tests](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js 16 Proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
