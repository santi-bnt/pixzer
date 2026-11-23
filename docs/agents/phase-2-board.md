# Phase 2 Task Board — Auth, Sessions, and RLS

## Shared architecture and contracts

- Use Supabase Auth with `@supabase/ssr` cookie-backed PKCE sessions for Next.js App Router; use Next.js 16 `src/proxy.ts` only for refresh/claim propagation. Every protected server route/page verifies claims itself.
- Public client configuration uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not introduce or expose a service-role/secret key in this phase.
- Initial access is invite-only: disable public signup in Supabase and invite users from the Dashboard. `/register` is an invite acceptance/password-setup surface, not an open signup form. No admin invite endpoint is added.
- Auth callback accepts the configured Supabase PKCE code and token-hash invite/recovery flows. It rejects unauthorized sessions without trusted Supabase `invited_at`. Redirect destinations must be same-origin relative paths; reject protocol-relative or external redirects.
- RLS and SQL grants are both part of authorization. Revoke table access from `anon` and `authenticated` by default, then grant only intended operations. Keep game/upload/save mutation paths closed except the owner-scoped favorite update.
- `getSession()` is not an authorization check. Use verified claims (`getClaims()`) or an Auth-verified `getUser()` call. Treat Proxy as refresh plumbing, not the only authorization boundary.
- Phase 2 completes Auth/RLS integration; Phase 3 owns R2 and aggregate storage quota. Phase 4/5/6/7 preserve PC/iPhone player mode and shared account data requirements.

## Ownership and dependencies

| Workstream                    | Owner                    | Files                                                                                                  | Depends on                                 | Acceptance                                                                                                                   |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Auth server integration       | Agent B — Backend & Auth | `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/confirm/route.ts`, `src/components/app-shell.tsx` | Supabase package and client contract below | Cookie SSR clients, session refresh, verified server user, invite callback, protected shell; no admin secret                 |
| Auth UI                       | Agent A — Frontend & UX  | `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/features/auth/**`                          | Auth server contract below                 | Working password sign-in, invite-only password setup, error/pending states, sign-out control; no open signup                 |
| Schema and policies           | Agent B — Backend & Auth | `supabase/migrations/0001_initial_schema.sql`, `docs/architecture/database.md`                         | Shared architecture                        | Owner-scoped RLS plus explicit grants/revokes; favorite-only mutation; all other writes denied to public roles               |
| RLS tests and threat review   | Agent F — QA/Security    | `supabase/tests/**`, `docs/architecture/auth-security.md`                                              | Final schema/policy names                  | pgTAP allow/deny coverage for anon, two users, and intended owner mutations; documents local test command and external setup |
| Integration and configuration | Orchestrator             | `package.json`, `package-lock.json`, `.env.example`, `README.md`, task board                           | All agent contracts                        | Stable packages locked; correct public env names; setup and known external blockers documented                               |

## Shared code contract

- Browser utility: `createClient()` at `@/lib/supabase/client`, returning the standard `SupabaseClient`.
- Server utility: async `createClient()` at `@/lib/supabase/server`, returning the request-cookie-bound standard client.
- Authorized identity: `getAuthorizedUser()` at `@/lib/supabase/user`, returning `{ id, email } | null` after a server-verified Supabase user lookup and trusted invite-marker check.
- The auth UI may call `supabase.auth.signInWithPassword`, `supabase.auth.updateUser({ password })`, and `supabase.auth.signOut()`. It must not call `signUp()` in the invite-only flow.
- The callback route handles PKCE `code` and invite/recovery token hashes; success is allowed only for invited users and invite acceptance lands on `/register` for password setup. Errors land on a non-sensitive auth error state.
- `AppShell` invokes `getAuthorizedUser()` and redirects unauthorized visitors to login. After sign-in, validate `next` again before redirecting.
- The `games` row can be selected only by its owner; authenticated users may update only `is_favorite` on their own rows. Game creation, object-key, size/hash, upload-session, and save mutations remain unavailable to user roles.

## Integration rules

- No agent edits another owner's files. Coordinate contract changes before expanding scope.
- Do not run migrations against any hosted project in this phase; no project credentials are configured. Keep changes as reviewed local SQL migrations.
- Do not claim live Auth or live cross-user RLS acceptance without a configured Supabase project or local Supabase stack.
- Keep Supabase Dashboard steps (signup disabled, invite email template, Site URL/Redirect URL, email confirmation) in setup docs.
- Review every contribution and test both signed-out and signed-in routing before integration is complete.
