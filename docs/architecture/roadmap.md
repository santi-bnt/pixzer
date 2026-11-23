# Development roadmap and acceptance gates

The phases are ordered by dependency. Do not start a phase's dependent implementation until its prerequisites and previous acceptance checks pass. A merged screen or successful build does not count as a service, emulator, or device compatibility result.

## Phase 1 — Architecture and foundation (complete)

- Next.js App Router, strict TypeScript, reusable UI foundation, honest unavailable states, `.env.example`, lockfile, CI, and root contributor instructions exist.
- Typed PC/iPhone player and input contracts exist; mode suggestion uses device capability signals and manual selection overrides it.
- Database, private R2, emulator, save, security, and free-tier proposals are documented. No external service is configured and no gameplay is claimed.
- Acceptance: clean local commit; `npm ci`, lint, typecheck, format check, and production build pass.

## Phase 2 — Accounts, PostgreSQL, and RLS

- Configure Supabase Auth with invite-only access for the initial small cohort, verified sessions, route protection, and account recovery flow.
- Review and apply the schema; library rows, `is_favorite`, and game metadata are owner-scoped and available to the same account on all devices.
- Acceptance: automated two-user tests prove one user cannot read or mutate another user's profile, game, favorite, upload session, or save metadata. No service-role credential reaches client bundles.

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

## Phase 6 — Saves and shared account state

- Implement IndexedDB local persistence, private cloud save objects, versioned metadata, outbox/retry, import/export, conflict resolution, and cross-device fetch for the same authenticated account.
- Keep shared favorites/game metadata account-owned. Keep input/touch geometry device-local by default, with optional export/import.
- Gate restore by user, game checksum, console, artifact kind, save schema, and core/build compatibility. Battery saves are not assumed portable; save states require exact tested compatibility.
- Acceptance: tests prove PC-originated compatible battery saves can be retrieved and restored in a second client, conflicts retain both versions, and incompatible states cannot be silently restored. Record compatible console/core pairs.

## Phase 7 — iPhone Safari and installed-PWA mode

- Add virtual D-pad, A/B/Start/Select/L/R, N64 analog/C controls, multi-touch pointer tracking, adjustable size/position/opacity, responsive portrait/landscape layouts, DS lower-screen touch, safe-area support, and explicit PC/iPhone manual mode switch.
- Recommend the touch-first layout using capabilities (touch points, coarse/fine pointer, connected gamepad, fullscreen/PWA availability); never depend solely on user-agent strings. Feature-detect Bluetooth controller exposure, interactive fullscreen, orientation behavior, audio, and storage.
- Apply scroll/selection/context-menu suppression only within active game controls. Use PWA standalone/fullscreen manifest behavior as an optional installation path; provide fallbacks for Safari tab restrictions.
- Acceptance: test current physical iPhone Safari and Home Screen-installed PWA separately, portrait and landscape, for each claimed console. Record gameplay, touch latency/multi-touch, safe-area/home-indicator occlusion, audio, controller availability, IndexedDB persistence after relaunch, cloud save restore, frame pacing, and memory.
- Full iPhone compatibility remains blocked until real gameplay, input, audio, persistence, and performance all pass on recorded devices. A responsive screenshot is insufficient.

## Phase 8 — Security, operations, and authorized deployment

- Complete security review, dependency/license inventory, account deletion, storage reconciliation alerts, backup/recovery procedure, rate limits, monitoring, and CI expansion.
- Acceptance: end-to-end browser → authenticated API → RLS/R2 → response flows pass; deployment checklist and provider costs are reviewed; Vercel deployment occurs only after authorization.
