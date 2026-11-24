# Database and authentication proposal

Status: Phase 2 migrations `0001` and `0002` are applied to development project `pxxtzjpjtigikolauxwc`. The four application tables, six unchanged RLS policies, profile-provisioning function and triggers, and all 58 pgTAP assertions have been verified there. Real Auth provider flows remain unverified.

## Responsibilities

- Supabase Auth is the source of authenticated user IDs. Application tables reference `auth.users(id)` and authorize every row with `auth.uid()`.
- PostgreSQL stores user-owned metadata, never ROM bytes. Game objects and save objects live in a private R2 bucket; object keys are opaque, server-generated values.
- Browser clients must not choose or override `user_id`, object keys, quota values, upload state, or checksums. Server routes derive the owner from a validated session and use narrowly scoped service access only for operations requiring it.
- RLS protects browser-facing reads and writes. Server-side R2 actions must separately verify session ownership because RLS does not protect the bucket.

## Initial entities

`profiles` holds optional display name and lifecycle metadata. `games` is the owner-scoped library record, including console, verified object size/hash, title/display metadata, and `is_favorite`. This makes favorites and game metadata available from the same account on PC and iPhone. `saves` describes versioned save artifacts associated with a game. `upload_sessions` is an upload intent/state machine used to reconcile a short-lived R2 upload with a game record. None of these tables contain ROM or save contents.

Per-console keyboard/gamepad mappings and iPhone touch-layout calibration are device preferences in the first design, because key codes, controller hardware, safe areas, and touch geometry differ by device. Export/import can be added; an account-level synchronized preset is optional and must not replace the local override.

Favorites are the sole direct client mutation in this schema. The `games` owner update policy scopes rows to `auth.uid()`, and a column-level SQL grant permits changing only `is_favorite`. All other game metadata changes remain server-mediated. Profile owners can similarly update only `display_name`.

The `games.size_bytes` ceiling is only a per-object sanity bound; a SQL `CHECK` cannot enforce the 900 MB aggregate account quota. The local upload implementation depends on proposed `0003_private_game_uploads.sql` to reserve aggregate bytes transactionally, including pending uploads, and enforce the shared storage ceiling. That migration is not applied and uploads remain disabled until it is reviewed, authorized, and tested in development.

The schema deliberately leaves email delivery, account deletion orchestration, save-state core compatibility, and storage accounting reconciliation to later phases. The reviewed profile-provisioning migration `0002_invited_profile_provisioning.sql` is applied in development: its security-definer trigger checks only Supabase-maintained `auth.users.invited_at`, and its backfill creates rows only for already invited users. It does not grant client INSERT access or change RLS. `upload_sessions` is not itself authorization to write an arbitrary object: the backend must bind its opaque key to the authenticated owner and validate completion against R2.

## Future offline save-sync migration (not applied)

The current `saves` proposal is not sufficient for concurrent offline branches: it has a revision number and object checksum but no slot head, parent revision, device identity, or idempotent upload operation. Preserve the Phase 2 migration unchanged. After it is validated in development and private R2 save operations exist, add a reviewed migration that:

- treats each save object row as an immutable version and records `slot_id`, `parent_revision`, `device_id`, `emulator_id`, `emulator_version`, and a canonical emulator/configuration fingerprint;
- identifies a version by `(game_id, save_kind, slot_id, revision)` and preserves multiple children of the same parent;
- adds a `save_heads` relation keyed by `(user_id, game_id, save_kind, slot_id)` pointing to the currently selected version;
- adds a `save_upload_operations` relation with a unique `(user_id, idempotency_key)`, expected parent, checksum, verified size, status and retry/reconciliation metadata;
- advances a head only with a server-side compare-and-swap against the expected parent after the R2 object has been verified. A stale parent returns both branch metadata and never deletes or replaces either object.

These records remain owner-scoped under RLS; browser clients receive no INSERT/UPDATE/DELETE privileges for save objects or heads. Device IDs are metadata, not authorization. The server derives `user_id` from a fresh invited Supabase session and generates opaque R2 keys. A future migration must include two-user RLS tests, branch/conflict tests, idempotent replay, failed-object cleanup and rollback checks before it is applied anywhere. No schema changes are being applied in this task.

## Ownership and policies

RLS is enabled on all four application tables. Owners can select their own profile, games, upload sessions, and saves; profile and game update policies additionally scope mutation to the owner. SQL privileges are separately revoked from `PUBLIC`, `anon`, and `authenticated`, then narrowly granted: authenticated SELECT on all four tables, UPDATE on `profiles.display_name`, and UPDATE on `games.is_favorite`. PostgreSQL checks grants before policies, so the column grants close updates to other fields; there are no client INSERT/DELETE grants or policies. The applied invited-user provisioning migration adds a trusted-invite profile trigger without changing RLS or client grants.

Privileged service-role code bypasses RLS, so every server handler still needs authentication, owner-scoped queries, schema validation, and explicit object-key checks. Never expose the service role or R2 credentials to the browser.

## Operational rules

- The local upload flow reserves quota before signing, enforcing the 900 MB per-user cap and 9 GB shared ceiling through proposed RPCs. Because the migration is unapplied, this flow remains disabled. A periodic reconciliation should compare database records to R2 inventory.
- Compute and verify SHA-256 server-side or through a trusted completion workflow; a client-reported hash is only a hint.
- Deletion should mark an operation pending, remove the R2 object, then finalize metadata; retries must be idempotent and orphan cleanup must be possible.
- Signed URLs are short-lived bearer capabilities. Keep expiry minimal and never persist them in database rows or logs.
- Saves need a monotonically increasing revision and content hash. Conflict policy should preserve both versions or require an explicit user choice; last-write-wins risks data loss.

## Migration notes

`supabase/migrations/0001_initial_schema.sql` and `0002_invited_profile_provisioning.sql` have been applied to the dedicated development project `pxxtzjpjtigikolauxwc`; four application tables, six original RLS policies, and 58 pgTAP assertions were verified there. `0003_private_game_uploads.sql` is a separate, local proposal that adds server-side quota reservation/completion RPCs without changing RLS. It has not been applied; review and explicit authorization are required before database changes.
