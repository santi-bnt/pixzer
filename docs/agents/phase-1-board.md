# Phase 1 Task Board

## Shared architecture and contracts

- Next.js App Router with strict TypeScript; server components by default.
- Supabase owns identity, PostgreSQL metadata, and row-level authorization.
- Private Cloudflare R2 objects are accessed only through server-issued short-lived capabilities.
- Browser emulation is an isolated client-side subsystem; games and firmware are user-provided.
- Player input normalizes keyboard, Gamepad API, and virtual touch controls into shared console-independent actions; input profiles are keyed by console.
- PC is the first target for keyboard/gamepad/fullscreen controls. iPhone is a later touch-first layout with portrait/landscape and installed-PWA behavior constrained by Safari capabilities.
- Recommend PC or iPhone layout from touch/pointer/gamepad/fullscreen/PWA capability signals, not user-agent strings. A manual mode choice always overrides the suggestion.
- Library metadata and favorites belong to the authenticated account; local control layout and device-specific controller calibration may remain device-local.
- Save data is versioned separately from metadata and must not assume save-state portability.
- No route may claim authentication, uploads, gameplay, or sync works until the corresponding service is integrated and tested.

## Ownership and dependencies

| Workstream                  | Owner           | Files                                                                          | Depends on                  | Acceptance                                                                                                           |
| --------------------------- | --------------- | ------------------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Architecture integration    | Orchestrator    | `AGENTS.md`, `README.md`, app configuration, shared contracts                  | None                        | App has coherent setup, routes, documentation, strict types                                                          |
| UI foundation               | Orchestrator    | `src/app/**`, `src/components/**`, `src/features/**`, styles                   | Shared architecture         | Responsive routes use reusable accessible components and honest unavailable states                                   |
| Auth/database proposal      | Backend Agent   | `docs/architecture/database.md`, `supabase/migrations/0001_initial_schema.sql` | Shared architecture         | User-scoped schema and RLS proposal; no credentials or implicit trust in client ownership                            |
| Storage architecture        | Storage Agent   | `docs/architecture/storage.md`                                                 | Shared architecture         | Private R2 flow and server contract with quota/validation/recovery considerations                                    |
| Emulator feasibility        | Emulation Agent | `docs/architecture/emulation.md`                                               | Shared architecture         | Current official docs/licensing/browser/core findings with clear unverified compatibility                            |
| Save architecture           | Save Agent      | `docs/architecture/saves.md`                                                   | Emulator findings/contracts | IndexedDB/local/cloud model, versions, conflicts, and portability limits                                             |
| Input and responsive player | Orchestrator    | `src/features/player/contracts.ts`, `docs/architecture/emulation.md`           | Shared architecture         | Typed PC/iPhone mode, normalized actions, per-console profiles, capability-based suggestion, and explicit iOS limits |
| QA/CI                       | QA Agent        | `.github/workflows/ci.yml`, `docs/architecture/quality.md`                     | App skeleton                | CI checks install, lint, types, and production build without secrets                                                 |

## Later implementation ownership

- **Agent A — Frontend & UX:** owns the responsive player shell, visible PC/iPhone mode switch, input/remapping screens, touch-control layout editor, safe-area/orientation presentation, and accessibility. Coordinate the emitted action contract with Agent D; do not own emulator-core loading or auth/storage policy.
- **Agent B — Backend & Authentication:** owns shared account game metadata and favorites, Auth/RLS, and owner-scoped save metadata. Ensure the same user sees identical library/favorite records on PC and iPhone.
- **Agent C — Cloud Storage:** owns private game/save object lifecycle and signed access. Cross-device reads still require an authenticated owner-scoped authorization check.
- **Agent D — Emulation & Input:** owns keyboard and Gamepad API adapters, automatic connection detection/hot-plug where exposed, per-console mappings, N64 analog normalization, fullscreen feature detection, and core integration. Collaborate with Agent A on UI contracts; provide browser/core input acceptance evidence.
- **Agent E — Save Systems:** owns IndexedDB and cloud save versioning, conflict handling, and cross-device compatibility gates. Keep battery saves separate from core-specific states and never silently restore an incompatible artifact.
- **Agent F — QA, Security & DevOps:** owns desktop browser/controller and physical iPhone test matrices, including Safari tab versus installed PWA, safe areas, orientations, audio, persistence, multi-touch, and performance. Do not mark a console/device mode supported from a build or screenshot alone.
- PC keyboard/controller implementation is developed alongside desktop emulation (Phases 4–5); the iPhone touch overlay/PWA experience has a dedicated later delivery phase (Phase 7). Shared account metadata/favorites and compatible saves must work across both presentations.
- Device detection and mode switching belong to player UI; no workstream may rely solely on user-agent parsing.

## Integration rules

- The orchestrator owns cross-cutting interfaces in `src/lib/**`; agents do not edit those files.
- Each agent owns only its listed files. Coordinate before expanding scope.
- Do not claim compatibility, security guarantees, or service functionality without evidence.
- Do not publish, deploy, or add secrets. No ROMs, BIOS, saves, or local env files belong in Git.
- Review every contribution and run requested local quality checks before calling Phase 1 done.
