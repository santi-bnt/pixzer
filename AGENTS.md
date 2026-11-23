# pixzer contributor instructions

## Objective

Build pixzer, a private, account-based library for users to play games they are legally allowed to use. Phase 1 established the foundation. Phase 2 adds local Supabase Auth/session and RLS integration; external Supabase setup and applying migrations remain environment-specific until verified. The preferred deployment domain is `pixzer.vercel.app`, subject to availability and project configuration.

## Architecture principles

- Use Next.js App Router, React, strict TypeScript, Tailwind CSS, and server components by default.
- Supabase Auth and PostgreSQL own identity and metadata; RLS is required for browser-accessible rows.
- Cloudflare R2 game and save objects stay private. All access is authorized server-side and granted with short-lived, scoped signed URLs.
- Never bundle ROMs, BIOS, firmware, user saves, or credentials.
- Client code must never receive service-role keys or R2 secrets. Server operations derive ownership from a verified session.
- Emulator integration must use pinned, reviewed assets and a per-console/browser compatibility matrix. Do not claim support until a redistributable test ROM has been run.
- The player targets two modes: PC (keyboard, configurable mappings, Gamepad API, fullscreen where supported) and iPhone touch-first (multi-touch overlay, safe-area-aware portrait/landscape layouts, installed PWA where available). Mode suggestions use capabilities, never user-agent sniffing, and users can switch manually.
- Both modes use the same authenticated account and private library. Favorites and game metadata are account-scoped; cross-device save restore is allowed only after game identity and save/core compatibility checks. Device-specific control mappings and touch geometry are local by default.
- Input is normalized into console-independent actions and analog axes. Keyboard, gamepad, touch controls, and emulator core bindings are separate adapters. Store profiles by console; keep device-specific layouts local unless the user explicitly syncs them.
- iPhone browser limits are part of the contract: feature-detect fullscreen and Gamepad APIs, request audio from a user gesture, and do not promise true fullscreen or Bluetooth controller availability across iOS/browser versions.
- Support Light, Dark, and System appearance across the whole application using shared semantic design tokens. Light and Dark use the red palettes and mappings in `docs/architecture/design-system.md`; do not add a purple theme or duplicate route trees. Persist the preference locally before sign-in and synchronize it to authenticated Supabase Auth user metadata when configured; this user-editable value is presentation-only.
- Authentication supports email/password and Google OAuth through Supabase Auth with PKCE cookie sessions. Google sign-in is not an invitation: protected server routes and RLS require Supabase's trusted `auth.users.invited_at` marker, never `user_metadata`, an email match, or a client-supplied user ID.
- Preserve Supabase's verified identity linking. Do not write custom email-based account merges. Same verified provider email may link to an existing invited Auth user while retaining its user ID; mismatched or unverified emails must never be merged by application code.
- Resolve System from `prefers-color-scheme` and apply the saved/effective theme before first paint. Theme changes are immediate and do not reload the page; transitions respect `prefers-reduced-motion`. The player canvas and input overlays must remain independently styled so theme changes cannot alter game rendering, input focus, keyboard/gamepad handling, or touch hit areas.
- A cross-device save is usable only when the game identity and save format/core compatibility checks pass. Battery saves and core-specific states remain distinct.
- Offline ROMs and saves belong in account-partitioned IndexedDB, never shared Cache Storage. That partition is not encryption or OS-level isolation; clear the active offline account selector on logout and switch partitions only after verified online account changes.
- Service Workers may cache only public static assets and a generic offline fallback. Never cache authenticated pages, API responses, Supabase data, R2 signed URLs, ROMs, or saves. A cached/expired identity cannot authorize remote operations; retry sync only after fresh server verification.
- Save locally before attempting cloud sync. Persist immutable save versions and a retry operation atomically; preserve both branches on conflicts and never silently merge binary saves.
- Treat the 900 MB per-user quota and shared reserve as enforced limits, not UI hints. Recheck current provider pricing before launch.

## Coding conventions

- TypeScript strict mode; avoid `any`, unsafe casts, and unvalidated request data.
- Prefer small, typed feature modules and shared UI primitives over duplicated screens.
- Keep browser-only APIs and emulator code behind client component boundaries.
- Use accessible labels, semantic elements, keyboard navigation, visible focus, and reduced-motion support.
- Use semantic CSS variables for foregrounds, surfaces, borders, focus, and accent colors. Check text and control contrast in both themes; never rely on color alone for state.
- Use `@/*` imports for `src/*`.
- Do not add a dependency for a small utility without a clear need.

## Testing expectations

- Before a change is complete, run `npm run lint`, `npm run typecheck`, and `npm run build` when dependencies are available.
- Add focused unit/integration/E2E coverage alongside implemented service functionality. Run tests relevant to changed behavior.
- Emulator support requires test-ROM execution on each claimed system and recorded target browser/device results.
- PC input requires keyboard remap tests, supported controller hot-plug tests, analog dead-zone tests for N64, and fullscreen feature-detection tests.
- iPhone mode requires actual iPhone Safari and installed-PWA testing in portrait/landscape, safe-area and home-indicator checks, simultaneous multi-touch, scroll/selection suppression limited to the controls, controller capability checks, audio, IndexedDB persistence, and performance.
- Offline acceptance requires disconnected reload/launch/save/reopen, quota and eviction behavior, durable retry and conflict tests, account switching/logout isolation, and separate physical iPhone Safari/PWA runs. Do not promise iOS Background Sync.
- Theme QA covers all routes and shared UI states in Light, Dark, and System; local preference persistence before authentication; live system appearance changes; no incorrect-theme flash on reload; contrast, focus, and reduced-motion behavior; and no gameplay/input impact on desktop or iPhone layouts.
- Never claim full iPhone compatibility until real gameplay, input, audio, persistence, and performance pass on recorded device/browser versions.
- Database migrations must be reviewed for ownership, constraints, and RLS. Never treat a proposal as applied.

## Security requirements

- Never trust client-supplied user IDs, object keys, checksums, quota, console, or authorization decisions.
- Validate upload size, extension, signature where applicable, ownership, idempotency, and quota on the server. Signed URLs are bearer capabilities and must not be logged or persisted.
- Use private buckets and opaque server-generated keys.
- No secrets in Git, browser bundles, logs, docs, issues, or screenshots. Keep `.env` ignored; update `.env.example` with names only.
- Avoid HTML injection, unsafe redirects, open proxies, and unbounded upload/download operations.
- OAuth callbacks must exchange PKCE codes using the request-bound cookie client, validate a same-origin continuation path, handle provider errors generically, and reject/sign out Auth users without trusted invite authorization before exposing app routes.
- Google OAuth client secrets belong only in Supabase Auth provider configuration or local Supabase CLI secrets; never in `.env.example`, client bundles, or Git.

## Ownership boundaries

- `src/app/**`: routes and route-level composition.
- `src/components/**`: shared presentation components.
- `src/features/**`: feature-specific UI and client behavior.
- `src/lib/supabase/**`, `src/lib/r2/**`, `src/lib/security/**`, `src/lib/db/**`: service boundaries and server integrations.
- `supabase/migrations/**`: reviewed SQL migrations. Mark proposals until applied intentionally.
- `docs/architecture/**`: architecture decisions and operating constraints.
- `.github/workflows/**`: CI only unless deployment is explicitly authorized.

## Collaboration and Git

- Read the task board and relevant architecture docs before taking work.
- Claim narrow, non-overlapping file ownership. Coordinate shared interface changes before editing them.
- Review delegated changes for code, tests, and integration before accepting them.
- Use focused commits with clear messages; never commit ROMs, firmware, saves, local env files, secrets, or generated build artifacts.
- Do not create/publish a repository, push, merge, or deploy without explicit authorization.

## Documentation

- Document setup, environment variable purpose, security boundaries, limitations, and external configuration.
- Distinguish implemented behavior from proposals and planned work. Cite primary service documentation for time-sensitive decisions.
- Update the roadmap and compatibility status when capabilities change.

## Definition of done

- Requested behavior is implemented without fake success states.
- Typecheck, lint, build, and relevant tests pass, or blockers are reported precisely.
- Security/authorization boundaries are reviewed; docs and `.env.example` match the code.
- The working tree contains only intentional changes and no secrets or prohibited game assets.
