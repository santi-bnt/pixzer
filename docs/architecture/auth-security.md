# Authentication and authorization model

## Status

Phase 2 uses Supabase Auth for identity and PostgreSQL Row Level Security (RLS) for browser-visible metadata. Migrations `0001` and `0002`, four tables, six policies, and 58 pgTAP assertions have been verified on the dedicated development project `pxxtzjpjtigikolauxwc`; real browser Auth flows and hosted provider settings remain unverified. Authentication and authorization are separate checks: Next.js server code verifies the user's claims, and PostgreSQL independently filters rows and enforces grants.

## Trust boundaries

- The browser receives only the Supabase project URL and publishable key. It never receives a service-role key, R2 credentials, object keys for another user, or a decision based on a client-supplied user ID.
- Server routes use the cookie-bound Supabase client and verify identity with an Auth-verified claims/user call. A refreshed cookie or a call to `getSession()` alone is not authorization.
- A valid Supabase identity is not sufficient for pixzer access. `getAuthorizedUser()` verifies the user through Auth and requires Supabase's trusted `invited_at` marker. The OAuth/email callback also checks this marker after exchanging a code or invite/recovery token and signs out sessions without it. Do not substitute editable `user_metadata`, Google email text, or client-supplied IDs.
- `auth.uid()` is the source of the database identity. RLS policies compare it to the row owner. Table grants and RLS are both required; neither replaces the other.
- RLS additionally calls `public.is_invited_pixzer_user()`, a narrow `SECURITY DEFINER` predicate with an empty `search_path`, to check the server-maintained `auth.users.invited_at` marker. It grants no row access to an authenticated but uninvited identity.
- Profile provisioning is applied in the development project as a separate migration. Its trigger uses `auth.users.invited_at`, not `raw_user_meta_data`, inserts only the matching Auth UUID, and runs as a revoked security-definer function. It adds no browser INSERT privilege and does not change the existing RLS policies.
- Game bytes and save bytes remain in private R2 storage. Future server operations must derive ownership from the verified session, check the corresponding metadata row, and issue narrowly scoped short-lived signed URLs. Signed URLs are bearer capabilities and must not be logged or stored as durable authorization.
- Public registration is disabled for the initial invite-only cohort. Invites are issued through the Supabase Dashboard; no service-role invite endpoint is part of Phase 2. Google OAuth does not grant access by itself; Supabase `enable_signup=false` is defense in depth, while the app callback, protected server shell, and RLS independently require invitation authorization.
- Google and email/password identities remain owned by the same Supabase user ID when Supabase performs its verified same-email automatic identity link. pixzer does not merge accounts itself; Supabase rejects linking to unverified email identities to prevent account takeover.
- Auth callback destinations must be validated as same-origin relative paths. Reject absolute and protocol-relative destinations.

## Database access contract

| Relation          | `anon`    | Invited authenticated owner                      | Other or uninvited authenticated user        |
| ----------------- | --------- | ------------------------------------------------ | -------------------------------------------- |
| `profiles`        | No access | Read own row; update only allowed profile fields | Cannot read or update the other profile      |
| `games`           | No access | Read own rows; update only `is_favorite`         | Cannot read or update another user's game    |
| `upload_sessions` | No access | Read own rows; no browser mutations              | Cannot read or mutate another user's session |
| `saves`           | No access | Read own rows; no browser mutations              | Cannot read or mutate another user's save    |

Game creation/deletion and changes to title, console, filename, object key, size, checksum, and timestamps stay server-mediated so storage and quota operations can be coordinated. Upload-session transitions and save metadata writes also stay server-mediated. Database constraints tie a save to a game belonging to the same user. The local upload implementation relies on a proposed service-role-only migration to reserve pending plus committed bytes transactionally; it is not enabled until that migration is explicitly applied and tested in development.

RLS `USING` filters often make a cross-owner `UPDATE` return zero rows rather than raising an error. Tests therefore assert empty `RETURNING` results for those paths, while tests for operations denied by SQL grants assert PostgreSQL's insufficient-privilege error. Positive mutation tests assert returned values, so a no-op cannot pass as success.

## pgTAP coverage

`supabase/tests/0002_auth_rls.test.sql` seeds two invited synthetic users plus one authenticated but uninvited user and their rows, then runs as `anon` and each authenticated identity. It currently declares 48 assertions. It checks:

- anonymous reads and mutations are denied;
- each authenticated user sees only their own profile, games, upload sessions, and saves;
- the authenticated but uninvited identity cannot read even rows owned by its own UUID;
- a user can update their own profile display name and their own game's favorite flag;
- another user's profile/game updates return no rows;
- protected game metadata and upload-session/save mutations are denied to browser roles;
- a save cannot be associated with a game from another owner (where the schema constraints are exercised).

The test uses a transaction and rolls back its fixtures. It must be reviewed against the final local migration before acceptance. Tests have not been run unless the executing report explicitly says a local Supabase stack was available and gives the result.

## Local test setup

The repository includes `supabase/config.toml` and the Supabase CLI dependency. From the repository root, start Docker Desktop and run:

```powershell
supabase start
supabase test db
```

`supabase test db` applies local migrations and executes SQL tests under `supabase/tests`. It does not use or modify the hosted project. Stop the local services when done with `supabase stop`. Do not add hosted credentials to this workflow. A Docker-free remote route using native Windows `psql` and explicit TAP-output validation is documented in `docs/setup/supabase-auth.md`; it still requires a dedicated development database and explicit authorization. Official references: [Supabase database testing](https://supabase.com/docs/guides/database/testing), [testing RLS policies with pgTAP](https://supabase.com/docs/guides/database/postgres/testing-row-level-security), and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Dashboard configuration and release checks

For the invited-user deployment, configure Supabase Auth's Site URL and exact Redirect URLs, disable public signups, configure Google as an external provider, confirm the invite/recovery email templates supply the callback data expected by the app, and verify email confirmation settings. Configure Google Cloud's authorized redirect URI to the Supabase Auth callback URL shown by the project; allow only the exact app callback in Supabase's Redirect URLs. Set `NEXT_PUBLIC_SITE_URL` to the deployment origin so the server action rejects untrusted request origins. Keep Google client secrets in Supabase provider configuration, never in app variables. Use separate development and production projects. Apply migrations intentionally after review; do not treat a proposal or local test as a hosted migration.

Before enabling browser access, review explicit grants together with every policy. Add regression coverage whenever a table, policy, grant, or storage operation changes. Local R2 upload/download routes and quota RPC proposal exist but are disabled/unapplied; live transfers, cloud saves, emulator execution, and device compatibility are not verified. PC and iPhone modes share the same verified account and library in the later player phases; device-specific input layouts are not authorization data, and cross-device save use is allowed only after game identity and save-format/core compatibility checks pass.
