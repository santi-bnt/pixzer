# Development roadmap and acceptance gates

The phases are ordered by dependency. Do not start a phase's dependent implementation until its prerequisites and previous acceptance checks pass. A merged screen or successful build does not count as a service, emulator, or device compatibility result.

## Phase 1 — Architecture and foundation (complete)

- Next.js App Router, strict TypeScript, reusable UI foundation, honest unavailable states, `.env.example`, lockfile, CI, and root contributor instructions exist.
- Typed PC/iPhone player and input contracts exist; mode suggestion uses device capability signals and manual selection overrides it.
- Database, private R2, emulator, save, security, and free-tier proposals are documented. No external service is configured and no gameplay is claimed.
- Acceptance: clean local commit; `npm ci`, lint, typecheck, format check, and production build pass.

## Phase 2 — Accounts, PostgreSQL, and RLS

- Local implementation: email/password and Google OAuth PKCE flows, invitation password setup, recovery, cookie-backed sessions, verified invitation authorization, profile provisioning, and the protected account shell are present. Migrations `0001` and `0002`, four tables, six RLS policies, and all 58 pgTAP assertions are verified on development project `pxxtzjpjtigikolauxwc`. Hosted Auth provider settings and real browser flows remain unverified.
- Configure Supabase Auth for the invited cohort and verify the development redirect URLs, Google provider, invite/recovery templates, and email confirmation settings. No production Auth or database configuration is authorized here. Library rows and favorites are account-scoped and therefore shared across devices using the same account.
- Acceptance: database migrations and 58 pgTAP checks pass. Still required: verify invitation, email login, Google sign-in/linking, logout, recovery, session persistence, and protected routes with two independent users in real browser sessions; verify that no service-role or Google client secret reaches client bundles. Do not mark Phase 2 complete until these checks have evidence.

## Phase 3 — Private game storage (provider integration in progress)

- Local code now includes server-authorized upload intent/completion, private R2 signed PUT/GET, streamed SHA-256 verification, a real library query, and transactional quota reservation proposal. The upload migration is not applied; the feature flag is false; no real bucket or credentials are configured.
- The proposal enforces 900 MB per user and a 9 GB committed-plus-reserved shared ceiling under a transaction advisory lock. It also caps active reservations at two per account.
- Remaining acceptance: review and explicitly authorize applying `0003_private_game_uploads.sql` only in development, run its 27 transactional pgTAP checks with the existing suites (85 total), then exercise real R2 uploads, wrong-user access, expiry/replay, quota concurrency, interrupted upload, checksum mismatch, deletion and orphan reconciliation. Only verified stored objects are listed; none are playable until emulator work is completed.
- Google Drive per-user OAuth (`drive.file`), token encryption, direct resumable upload routes, server-streamed downloads, library provider metadata, and a 32-assertion proposal suite are now local and disabled. Migration `0004_google_drive_storage.sql` depends on proposal `0003`; neither is applied. R2 stays disabled. No real Google test-user OAuth or file transfer has been executed. The provider test suite totals 117 assertions with the earlier 48 + 10 + 27 suites; run only in the dedicated development project after explicit migration authorization.

## Phase 4 — GB/GBC/GBA PC emulation and desktop input

- Integrate a pinned, license-reviewed emulator/core build. Add keyboard input/remapping, Gamepad API detection and hot-plug, Xbox/PlayStation/compatible USB or Bluetooth controller profiles, fullscreen with capability fallback, and per-console mappings.
- Acceptance: each of GB, GBC, and GBA independently runs a redistributable homebrew test image in supported desktop Chromium, Firefox, and Safari versions. Record controller, remapping, audio, save, lifecycle, and low-spec performance results per core/browser/device.

## Phase 5 — Nintendo DS and Nintendo 64 PC emulation

- Add DS dual-screen responsive layouts and lower-screen pointer input. Add N64 analog stick axes/dead zones, C buttons, Z, triggers, Start, keyboard fallback, and physical controller mappings.
- Decide and document BIOS/firmware behavior without bundling proprietary files.
- Acceptance: separate licensed homebrew test evidence for DS and N64, browser/device matrix, DS two-screen/touch result, N64 analog calibration result, audio/performance results, and teardown/save checks. EmulatorJS's listed cores alone do not pass acceptance.

## Phase 6 — Offline local foundation

- **Foundation implemented in this update:** account-partitioned IndexedDB records for ROM blobs and immutable save versions/heads/outbox; atomic save/head/outbox commits; byte-level streaming SHA-256 checks; storage estimate/persistence helpers; quota/blocked/abort error handling; bounded sync coordinator over an injected transport; versioned public-only Service Worker shell and offline fallback.
- **Still required:** integrate identity-derived offline account selection, resumable R2 downloads with progress/cancel/recovery, native-browser persistence tests, emulator save adapters, real cloud transport, and offline-ready/sync UI. A server-side signed download endpoint exists locally but is disabled with the rest of R2 until storage setup is complete; no game session is available.
- This foundation can be developed in parallel with Phase 2 review. Offline game downloads require the private R2 download path and device tests; playable offline sessions require a compatible emulator from Phases 4 or 5. No offline-ready UI is allowed before those operations work end to end.
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
