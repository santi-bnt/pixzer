# Database and authentication proposal

Status: design proposal for Phase 1. This migration has not been applied to a Supabase project and authentication is not integrated yet.

## Responsibilities

- Supabase Auth is the source of authenticated user IDs. Application tables reference `auth.users(id)` and authorize every row with `auth.uid()`.
- PostgreSQL stores user-owned metadata, never ROM bytes. Game objects and save objects live in a private R2 bucket; object keys are opaque, server-generated values.
- Browser clients must not choose or override `user_id`, object keys, quota values, upload state, or checksums. Server routes derive the owner from a validated session and use narrowly scoped service access only for operations requiring it.
- RLS protects browser-facing reads and writes. Server-side R2 actions must separately verify session ownership because RLS does not protect the bucket.

## Initial entities

`profiles` holds optional display name and lifecycle metadata. `games` is the owner-scoped library record, including console, verified object size/hash, title/display metadata, and `is_favorite`. This makes favorites and game metadata available from the same account on PC and iPhone. `saves` describes versioned save artifacts associated with a game. `upload_sessions` is an upload intent/state machine used to reconcile a short-lived R2 upload with a game record. None of these tables contain ROM or save contents.

Per-console keyboard/gamepad mappings and iPhone touch-layout calibration are device preferences in the first design, because key codes, controller hardware, safe areas, and touch geometry differ by device. Export/import can be added; an account-level synchronized preset is optional and must not replace the local override.

Favorite changes remain server-mediated in the initial policy set: the authenticated route scopes the game row to the current user, then updates `is_favorite`. This keeps the selected policy model consistent until a reviewed, column-restricted RLS mutation policy is added.

The `games.size_bytes` ceiling is only a per-object sanity bound; a SQL `CHECK` cannot enforce the 900 MB aggregate account quota. Phase 3 must reserve aggregate bytes transactionally (including pending uploads and retained data) and enforce the global storage ceiling in trusted server code or a narrowly scoped database function. RLS alone does not make quota accounting race-safe.

The schema deliberately leaves invite policy, email verification, account deletion orchestration, save-state core compatibility, and storage accounting reconciliation to later phases. `upload_sessions` is not itself authorization to write an arbitrary object: the backend must bind its opaque key to the authenticated owner and validate completion against R2.

## Ownership and policies

RLS is enabled on all user-facing tables. Policies use `auth.uid() = user_id`; profile rows use the auth user ID as their primary key. Clients cannot transfer records between users. The SQL does not grant broad table permissions; Supabase project grants and client/server roles must be reviewed alongside deployment configuration.

Privileged service-role code bypasses RLS, so every server handler still needs authentication, owner-scoped queries, schema validation, and explicit object-key checks. Never expose the service role or R2 credentials to the browser.

## Operational rules

- Upload flow should reserve quota transactionally before signing an upload, enforce the 900 MB per-user cap on the server, and release the reservation on failure or expiry. A periodic reconciliation should compare database records to R2 inventory.
- Compute and verify SHA-256 server-side or through a trusted completion workflow; a client-reported hash is only a hint.
- Deletion should mark an operation pending, remove the R2 object, then finalize metadata; retries must be idempotent and orphan cleanup must be possible.
- Signed URLs are short-lived bearer capabilities. Keep expiry minimal and never persist them in database rows or logs.
- Saves need a monotonically increasing revision and content hash. Conflict policy should preserve both versions or require an explicit user choice; last-write-wins risks data loss.

## Migration notes

`supabase/migrations/0001_initial_schema.sql` is a starting proposal. Apply only after checking the target project's existing schema and Supabase version. It creates application tables and RLS policies but intentionally does not modify `auth.users`, configure Storage, create credentials, or provision R2. A later migration should add transactional quota reservations and server RPCs only after the upload protocol is agreed.
