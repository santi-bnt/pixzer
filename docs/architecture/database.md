# Database and authentication proposal

Status: Phase 2 schema applied to development project `pxxtzjpjtigikolauxwc`. The four application tables, six RLS policies, and 48 pgTAP assertions have been verified there. Real Auth provider flows remain unverified. No profile-provisioning trigger exists; profile creation is still an explicit lifecycle gap.

## Responsibilities

- Supabase Auth is the source of authenticated user IDs. Application tables reference `auth.users(id)` and authorize every row with `auth.uid()`.
- PostgreSQL stores user-owned metadata, never ROM bytes. Game objects and save objects live in a private R2 bucket; object keys are opaque, server-generated values.
- Browser clients must not choose or override `user_id`, object keys, quota values, upload state, or checksums. Server routes derive the owner from a validated session and use narrowly scoped service access only for operations requiring it.
- RLS protects browser-facing reads and writes. Server-side R2 actions must separately verify session ownership because RLS does not protect the bucket.

## Initial entities

`profiles` holds optional display name and lifecycle metadata. `games` is the owner-scoped library record, including console, verified object size/hash, title/display metadata, and `is_favorite`. This makes favorites and game metadata available from the same account on PC and iPhone. `saves` describes versioned save artifacts associated with a game. `upload_sessions` is an upload intent/state machine used to reconcile a short-lived R2 upload with a game record. None of these tables contain ROM or save contents.

Per-console keyboard/gamepad mappings and iPhone touch-layout calibration are device preferences in the first design, because key codes, controller hardware, safe areas, and touch geometry differ by device. Export/import can be added; an account-level synchronized preset is optional and must not replace the local override.

Favorites are the sole direct client mutation in this schema. The `games` owner update policy scopes rows to `auth.uid()`, and a column-level SQL grant permits changing only `is_favorite`. All other game metadata changes remain server-mediated. Profile owners can similarly update only `display_name`.

The `games.size_bytes` ceiling is only a per-object sanity bound; a SQL `CHECK` cannot enforce the 900 MB aggregate account quota. Phase 3 must reserve aggregate bytes transactionally (including pending uploads and retained data) and enforce the global storage ceiling in trusted server code or a narrowly scoped database function. RLS alone does not make quota accounting race-safe.

The schema deliberately leaves invite policy, email verification, account deletion orchestration, save-state core compatibility, and storage accounting reconciliation to later phases. `upload_sessions` is not itself authorization to write an arbitrary object: the backend must bind its opaque key to the authenticated owner and validate completion against R2.

## Future offline save-sync migration (not applied)

The current `saves` proposal is not sufficient for concurrent offline branches: it has a revision number and object checksum but no slot head, parent revision, device identity, or idempotent upload operation. Preserve the Phase 2 migration unchanged. After it is validated in development and private R2 save operations exist, add a reviewed migration that:

- treats each save object row as an immutable version and records `slot_id`, `parent_revision`, `device_id`, `emulator_id`, `emulator_version`, and a canonical emulator/configuration fingerprint;
- identifies a version by `(game_id, save_kind, slot_id, revision)` and preserves multiple children of the same parent;
- adds a `save_heads` relation keyed by `(user_id, game_id, save_kind, slot_id)` pointing to the currently selected version;
- adds a `save_upload_operations` relation with a unique `(user_id, idempotency_key)`, expected parent, checksum, verified size, status and retry/reconciliation metadata;
- advances a head only with a server-side compare-and-swap against the expected parent after the R2 object has been verified. A stale parent returns both branch metadata and never deletes or replaces either object.

These records remain owner-scoped under RLS; browser clients receive no INSERT/UPDATE/DELETE privileges for save objects or heads. Device IDs are metadata, not authorization. The server derives `user_id` from a fresh invited Supabase session and generates opaque R2 keys. A future migration must include two-user RLS tests, branch/conflict tests, idempotent replay, failed-object cleanup and rollback checks before it is applied anywhere. No schema changes are being applied in this task.

## Ownership and policies

RLS is enabled on all four application tables. Owners can select their own profile, games, upload sessions, and saves; profile and game update policies additionally scope mutation to the owner. SQL privileges are separately revoked from `PUBLIC`, `anon`, and `authenticated`, then narrowly granted: authenticated SELECT on all four tables, UPDATE on `profiles.display_name`, and UPDATE on `games.is_favorite`. PostgreSQL checks grants before policies, so the column grants close updates to other fields; there are no client INSERT/DELETE grants or policies. No profile trigger is installed: profile row provisioning is deferred to a reviewed invite lifecycle step.

Privileged service-role code bypasses RLS, so every server handler still needs authentication, owner-scoped queries, schema validation, and explicit object-key checks. Never expose the service role or R2 credentials to the browser.

## Operational rules

- Upload flow should reserve quota transactionally before signing an upload, enforce the 900 MB per-user cap on the server, and release the reservation on failure or expiry. A periodic reconciliation should compare database records to R2 inventory.
- Compute and verify SHA-256 server-side or through a trusted completion workflow; a client-reported hash is only a hint.
- Deletion should mark an operation pending, remove the R2 object, then finalize metadata; retries must be idempotent and orphan cleanup must be possible.
- Signed URLs are short-lived bearer capabilities. Keep expiry minimal and never persist them in database rows or logs.
- Saves need a monotonically increasing revision and content hash. Conflict policy should preserve both versions or require an explicit user choice; last-write-wins risks data loss.

## Migration notes

`supabase/migrations/0001_initial_schema.sql` is a reviewed local Phase 2 migration. Apply only after checking the target project's existing schema and Supabase version. It creates application tables, RLS policies, and explicit client-role grants but intentionally does not modify `auth.users`, configure Storage, create credentials, or provision R2. No hosted or local Supabase project is configured for this phase, so this migration has not been executed and its policies have not been live-tested. A later migration should add transactional quota reservations and server RPCs only after the upload protocol is agreed.
