# Development roadmap and acceptance gates

The phases are ordered by dependency. Do not start a phase's dependent implementation until its prerequisites and previous acceptance checks pass. A merged screen or successful build does not count as a service, emulator, or device compatibility result.

## Phase 1 — Architecture and foundation (complete)

- Next.js App Router, strict TypeScript, reusable UI foundation, honest unavailable states, `.env.example`, lockfile, CI, and root contributor instructions exist.
- Typed PC/iPhone player and input contracts exist; mode suggestion uses device capability signals and manual selection overrides it.
- Database, private R2, emulator, save, security, and free-tier proposals are documented. No external service is configured and no gameplay is claimed.
- Acceptance: clean local commit; `npm ci`, lint, typecheck, format check, and production build pass.

## Phase 2 — Accounts, PostgreSQL, and RLS

- Local implementation: email/password and Google OAuth PKCE flows, invitation password setup, recovery, cookie-backed sessions, verified invitation authorization, protected account shell, invitation-gated RLS migration, and 48 pgTAP assertions are present. Google provider credentials and a development Supabase project are not configured; the migration remains unapplied and live auth/RLS checks are pending.
- Configure Supabase Auth for the invited cohort, verify redirect/email templates, then apply the reviewed schema to an explicitly selected development project. Library rows and favorites are account-scoped and therefore shared across devices using the same account.
- Acceptance: run the 48 pgTAP assertions and pass two-user isolation tests against a configured development project; verify invite, email login, Google sign-in/linking, logout, recovery, and protected-route callbacks in desktop and iPhone Safari; confirm no service-role or Google client secret reaches client bundles. Live acceptance remains pending until those external checks have evidence.

## Phase 3 — Private R2 library

- Implement server-authorized upload intent/completion, private R2 objects, short-lived signed URLs, checksums, deletion, retry/reconciliation, and quota reservation.
- Enforce 900 MB aggregate per-user quota and a separate global committed-plus-reserved budget with shared reserve; individual file limits alone do not satisfy quota acceptance.
- Acceptance: integration tests cover wrong-user access, expired/replayed/wrong-object URLs, quota race/overrun, interrupted upload, checksum mismatch, duplicate, deletion retry, and orphan reconciliation. Only verified ready objects can launch.

## Phase 4 — GB/GBC/GBA PC emulation and desktop input

- Integrate a pinned, license-reviewed emulator/core build. Add keyboard input/remapping, Gamepad API detection and hot-plug, Xbox/PlayStation/compatible USB or Bluetooth controller profiles, fullscreen with capability fallback, and per-console mappings.
- Acceptance: each of GB, GBC, and GBA independently runs a redistributable homebrew test image in supported desktop Chromium, Firefox, and Safari versions. Record controller, remapping, audio, save, lifecycle, and low-spec performance results per core/browser/device.

## Phase 5 — Nintendo DS and Nintendo 64 PC emulation

- Add DS dual-screen responsive layouts and lower-screen pointer input. Add N64 analog stick axes/dead zones, C buttons, Z, triggers, Start, keyboard fallback, and physical controller mappings.
- Decide and document BIOS/firmware behavior without bundling proprietary files.
- Acceptance: separate licensed homebrew test evidence for DS and N64, browser/device matrix, DS two-screen/touch result, N64 analog calibration result, audio/performance results, and teardown/save checks. EmulatorJS's listed cores alone do not pass acceptance.

## Phase 6 — Offline local foundation

- **Foundation implemented in this update:** account-partitioned IndexedDB records for ROM blobs and immutable save versions/heads/outbox; atomic save/head/outbox commits; byte-level streaming SHA-256 checks; storage estimate/persistence helpers; quota/blocked/abort error handling; bounded sync coordinator over an injected transport; versioned public-only Service Worker shell and offline fallback.
- **Still required:** integrate identity-derived offline account selection, explicit resumable R2 downloads with progress/cancel/recovery, native-browser persistence tests, emulator save adapters, real cloud transport, and offline-ready/sync UI. The current repository does not expose a working ROM download or game session.
- This foundation can be developed in parallel with Phase 2 review. Actual game downloads require Phase 3's private R2 download API; playable offline sessions require a compatible emulator from Phases 4 or 5. No offline-ready UI is allowed before those operations work end to end.
- Acceptance: account partitions never expose another user’s records; checksum mismatch/interruption does not replace a verified ROM; local saves survive reload and do not wait on network; worker tests prove that authenticated HTML, API responses, signed URLs, ROMs, and saves never enter Cache Storage; quota and transaction-abort paths are covered.

## Phase 7 — Private cloud save synchronization and conflicts

- Implement only after Phase 2 authorization/RLS is validated, Phase 3 provides private R2 operations, and the relevant emulator exposes a verified save adapter.
- Upload immutable save versions with server-derived ownership, per-operation idempotency, expected-parent revision checks, server-verified checksum/size, bounded exponential retry, and no reliance on `navigator.onLine` as reachability proof.
- Preserve both local and remote versions on conflict; provide explicit choose/export actions. Never merge binary files or silently overwrite a head. Keep local copies after sync.
- Acceptance: verified account can upload and retrieve a compatible save on another device; retries are idempotent and bounded; expired auth is rejected for remote work; simulated upload failure leaves recoverable local data; two independent clients preserve both conflicting versions.

## Phase 8 — iPhone Safari and installed-PWA mode, including offline validation

- Add virtual D-pad, A/B/Start/Select/L/R, N64 analog/C controls, multi-touch pointer tracking, adjustable size/position/opacity, responsive portrait/landscape layouts, DS lower-screen touch, safe-area support, and explicit PC/iPhone manual mode switch.
- Recommend the touch-first layout using capabilities (touch points, coarse/fine pointer, connected gamepad, fullscreen/PWA availability); never depend solely on user-agent strings. Feature-detect Bluetooth controller exposure, interactive fullscreen, orientation behavior, audio, and storage.
- Apply scroll/selection/context-menu suppression only within active game controls. Do not rely on Background Sync in iOS; resume sync only when the app is opened or becomes active and a real server request succeeds.
- Acceptance: test current physical iPhone Safari and Home Screen-installed PWA separately in portrait/landscape, including offline reload, cached game launch, local save/restore, app suspension/reopen, explicit account/logout behavior, sync retry, safe areas, touch latency, audio, controllers, frame pacing, and memory. Record a separate result for every claimed console.
- Full iPhone offline compatibility remains unclaimed until real gameplay and persistence pass on recorded physical devices. DS/N64 performance must be validated independently.

## Phase 9 — Security, operations, and authorized deployment

- Complete security review, dependency/license inventory, account deletion, storage reconciliation alerts, backup/recovery procedure, rate limits, monitoring, and CI expansion.
- Acceptance: end-to-end browser → authenticated API → RLS/R2 → response flows pass; deployment checklist and provider costs are reviewed; Vercel deployment occurs only after authorization.
