# Supabase Auth setup (Phase 2)

## Current state

Invite-only Auth UI, cookie-backed SSR clients, a protected account shell, callback handling, local Supabase CLI configuration, and SQL/RLS tests are present in this checkout. Migrations `0001` and `0002` have been applied to the dedicated development project `pxxtzjpjtigikolauxwc`; the four tables, six policies, profile-provisioning triggers, and all 58 pgTAP assertions were verified there. Live browser Auth flows remain unverified. This checkout has no `.env.local` or Supabase application variables. Hosted Auth provider and email-template settings were not inspected or changed during this validation.

## Create local configuration

1. For an isolated local stack, install/start a Docker-compatible container runtime, then run `npx supabase start`; `supabase/config.toml` disables public signup and seed loading and allows local app callback URLs. Local confirmation and recovery emails are captured by the Supabase local email testing server.
2. Alternatively, create or select a dedicated non-production Supabase project. Never link a production project for this validation task.
3. Copy `.env.example` to `.env.local`. For the Supabase CLI stack use the API URL and publishable/anon key printed by `npx supabase status` (normally `http://127.0.0.1:54321`); set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. For hosted development use `NEXT_PUBLIC_SUPABASE_URL=https://pxxtzjpjtigikolauxwc.supabase.co`, copy the publishable key from that project's API settings, and keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Do not copy database URLs, service-role keys, or provider secrets into this file. Local HTTP URLs on loopback are allowed; hosted URLs must use HTTPS.
4. Restart the Next.js dev server after changing environment values.
5. Do not put a Supabase secret/service-role key in the app environment for Phase 2. The public publishable key is safe to distribute only because database grants and RLS constrain all exposed data.

For a future Vercel deployment, use the production Supabase project's HTTPS API URL and publishable key, and set `NEXT_PUBLIC_SITE_URL` to the exact approved app origin (for example `https://pixzer.vercel.app` only if that project/domain is selected). Add the matching `/auth/confirm` URL to Supabase's redirect allow-list. Do not reuse a development Google OAuth client or credentials in production; deployment and production project changes remain unauthorized.

## Configure invite-only access

1. In the development project's Authentication settings, disable public sign-ups and anonymous sign-ins; keep email/password enabled for existing invited users, require email confirmation, and set minimum password length to 12. Confirm that only the administrator can send invites. The local CLI config uses the same signup, confirmation, and password-length requirements.
2. Set the project Site URL to `http://localhost:3000` during local app testing. Add both `http://localhost:3000/auth/confirm` and `http://localhost:3000/auth/confirm?next=%2Freset-password` to the allowed redirect list; the latter is the exact `redirectTo` used by password recovery. Add production origins only after production is authorized.
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

For hosted development invitations and recovery to reach external test inboxes, configure a custom SMTP provider under **Authentication > Emails > SMTP Settings** with its verified sender. Supabase's built-in sender is restricted to organization team addresses and currently has a low project-wide rate limit; it is unsuitable for general external inbox testing. Keep SMTP credentials only in the Dashboard and never in `.env.local` or Git.

The callback accepts the configured PKCE code and token-hash email flows, validates them with Supabase, and permits only same-origin relative continuation paths. Invitation/password setup and recovery links are short-lived; send a fresh invite if one expires.

## Configure Google OAuth

1. In Google Cloud Console, configure the OAuth consent screen for the web app. While the app is in Testing, add only the controlled Google test accounts as test users. Create an OAuth client of type **Web application**. Add `http://localhost:3000` as an Authorized JavaScript origin for local development. For the hosted development project, add the callback shown on its Supabase Google provider page; it is expected to be `https://pxxtzjpjtigikolauxwc.supabase.co/auth/v1/callback`. Copy the displayed value exactly. If testing against `supabase start` instead, use `http://127.0.0.1:54321/auth/v1/callback` for the local Auth service.
2. In the development project's **Authentication → Sign In / Providers → Google**, enable Google and enter that OAuth client's ID and secret. Keep the secret in Supabase provider configuration, never in app environment variables or browser code.
3. In Supabase URL Configuration, set the development Site URL to `http://localhost:3000` and add the exact app callback `http://localhost:3000/auth/confirm` to the Redirect URLs list. The Google-to-Supabase callback above and the Supabase-to-app callback here are different redirects. Do not add production origins until a production deployment is explicitly authorized; avoid broad wildcards.
4. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in the local app environment. Set `NEXT_PUBLIC_SUPABASE_URL=https://pxxtzjpjtigikolauxwc.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the development project's API settings. These are the only Supabase values the app needs; do not add a service-role key or Google client secret.
5. Keep `auth.enable_signup=false`, anonymous sign-ins disabled, and manual identity linking disabled. Google sign-in is not an invitation: the callback and protected server routes require the trusted `invited_at` marker, and RLS checks the same authorization state. When Google presents the same verified email as an existing invited Auth user, rely on Supabase Auth's automatic identity linking to retain that Auth user ID. Do not implement app-side account merging or trust editable metadata.
6. Test an invited email identity and a separate uninvited Google identity. Confirm the invited user's Auth user ID remains unchanged after verified linking, while the uninvited account is rejected and cannot access private rows. Supabase documents automatic linking for matching emails and the risk of linking unverified emails: [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Google client credentials and a verified provider configuration are external setup requirements. For hosted Supabase, save the OAuth client ID and secret only in **Authentication → Sign In / Providers → Google**. For a local CLI stack, `supabase/config.toml` reads `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`; set them only in the local CLI process environment or supported Supabase secrets, set `[auth.external.google].enabled=true` for that local stack, and never add them to `.env.local`, `.env.example`, or Git. The local provider remains disabled by default.

## Schema and profile provisioning

1. The reviewed `supabase/migrations/0001_initial_schema.sql` and `0002_invited_profile_provisioning.sql` are applied to the dedicated development project. The second migration provisions profiles only from trusted `auth.users.invited_at`, backfills existing invited users, and leaves existing RLS policies unchanged.
2. Preferred local route: start Docker Desktop, run `npx supabase start`, then `npx supabase test db`. This validates the migration and pgTAP suite on the local stack without touching a hosted database.
3. Docker-free hosted route: use only a dedicated, explicitly authorized development project. Install PostgreSQL command-line tools so `psql` is on PATH, set `PIXZER_DEV_PROJECT_REF` and `PIXZER_DEV_DATABASE_URL` in the current PowerShell session, and run `./scripts/test-pgtap-remote.ps1`. The script accepts only the reviewed project ref and a matching direct Supabase or session-pooler URL, asks you to type the ref again, runs both pgTAP files, and validates the 48- and 10-assertion plans (58 total). It never applies migrations. Apply the profile-provisioning migration only after separate explicit authorization. `psql`'s process environment receives the password; the script does not print or save the connection string. Do not run this against production: pgTAP extension creation and test transactions are database operations.
4. Do not reapply either migration to the existing development project.
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

Use only two controlled test inboxes and a dedicated development project. In the project's Auth settings, turn off public sign-ups, enable email/password for invited users, require confirmation, and configure the local/development callback URLs and invite/recovery templates from this document. Apply the separate profile-provisioning migration only after reviewing it and receiving explicit authorization. Then send invitations to both test users; accept each invite, set a password, sign in, open protected routes, sign out, and confirm those routes redirect to login. Request recovery for one user, use its link to set a new password, and verify the new password works while the old one fails. Verify the same invited user ID is retained after signing in with Google using its verified email. Finally, verify account A cannot see or mutate account B's rows, and repeat in reverse. Capture test results without saving invitation or recovery tokens. Delete only synthetic test users/rows in the disposable development project after review; never use `db reset` or broad cleanup against a hosted project.

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
