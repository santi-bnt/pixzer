# pixzer

pixzer is a private, account-based library for playing retro games that users are legally allowed to use on PC and iPhone. The product targets keyboard/controller desktop play and a touch-first iPhone Safari/installed-PWA experience for a small invited community. These are planned modes, not current compatibility claims. No games, BIOS files, firmware, or save files are included.

## Current status

Phase 1 provides the Next.js application foundation, responsive interface routes, typed Supabase/R2 and player-input contracts, architecture documentation, and CI. Phase 2 includes invitation-only email/password and Google OAuth PKCE sign-in, password setup/recovery, cookie-backed Supabase SSR sessions, server and RLS invitation authorization, and pgTAP coverage. Google identities use Supabase's verified identity-linking behavior; pixzer does not merge accounts by email. A Supabase development project is not configured here, so hosted authentication, linking, and database policies have not been exercised or applied. Uploads, cloud storage, emulator execution, controller input, iPhone touch controls, and save synchronization remain planned.

The interface supports Light, Dark, and System appearance with white/red and black/red palettes. Choices persist on the device and synchronize through authenticated Supabase user metadata when a configured session is available. Account sync has not yet been verified against a live project. Theme changes are presentation-only and do not alter player input or game state.

Preferred deployment domain: `pixzer.vercel.app` (DNS resolves and HTTPS returned 200 from Vercel during this check; ownership and availability for this project are unverified).

| System                               | Planned extension     | Current status                                    |
| ------------------------------------ | --------------------- | ------------------------------------------------- |
| Game Boy (`.gb`)                     | EmulatorJS `gb` core  | Not integrated or tested                          |
| Game Boy Color (`.gbc`)              | EmulatorJS `gb` core  | Not integrated or tested                          |
| Game Boy Advance (`.gba`)            | EmulatorJS `gba` core | Not integrated or tested                          |
| Nintendo DS (`.nds`)                 | EmulatorJS `nds` core | Not integrated; firmware requirements need review |
| Nintendo 64 (`.n64`, `.z64`, `.v64`) | EmulatorJS `n64` core | Not integrated or tested                          |

EmulatorJS licensing, core licenses, BIOS/firmware requirements, browser performance, and per-console compatibility must be reviewed before release. A documentation-listed core is not a pixzer compatibility claim.

The iPhone mode is planned for Safari and Home Screen-installed web apps, with iOS-specific fallbacks. Interactive fullscreen, Bluetooth controller exposure, audio activation, and storage behavior vary by iOS and browser context; full iPhone support will not be claimed until real gameplay, input, audio, persistence, and performance pass on recorded devices. See the [player design and test gates](docs/architecture/emulation.md).

## Technology

- Next.js App Router, React, TypeScript strict mode, Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security (Phase 2 local integration; hosted project not configured)
- Cloudflare R2 Standard private object storage (planned)
- EmulatorJS/WebAssembly candidate; IndexedDB save cache (planned)
- Vercel deployment target (not configured)

## Local development

Requirements: Node.js 20.9 or newer and npm. The repository pins exact dependency resolutions in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Useful routes: `/`, `/login`, `/register`, `/library`, `/upload`, `/play/demo`, and `/settings`.

Quality checks:

```sh
npm run lint
npm run typecheck
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` only when configuring integrations. Phase 2 requires a configured Supabase project. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are intended for the public client when RLS is enabled. R2 credentials and any future Supabase secret keys are server-only. Phase 2 does not require an admin/service-role key. Never commit `.env.local` or use `NEXT_PUBLIC_` for secrets. See [Supabase Auth setup](docs/setup/supabase-auth.md).

## Architecture and security

Read [system architecture](docs/architecture/system.md), [roadmap and acceptance gates](docs/architecture/roadmap.md), [database proposal](docs/architecture/database.md), [private storage flow](docs/architecture/storage.md), [PC/iPhone player and emulator design](docs/architecture/emulation.md), [save strategy](docs/architecture/saves.md), [free-tier estimates](docs/architecture/free-tiers.md), and [security/quality plan](docs/architecture/quality.md). The initial SQL file is a proposal and has not been applied. Private objects must be accessed through authenticated, short-lived server-issued URLs. The server derives ownership from a validated session, enforces quotas, and reconciles storage metadata. No public bucket is permitted for user content.

The initial planning ceiling is 900 MB per account for roughly ten invited users, reserving capacity against a nominal R2 Standard 10 GB-month free storage allowance. This is a planning target, not a promise of zero cost; request/operation counts, retained copies, other provider usage, and future pricing can affect cost. Confirm current provider terms and configure usage monitoring before launch.

## Roadmap

1. **Phase 1:** architecture, repository, design system, foundation, shared player/input contracts (complete).
2. **Phase 2:** Supabase Auth, PostgreSQL migrations, sessions, and RLS (in progress).
3. **Phase 3:** R2 private uploads, library persistence, quotas, recovery, and deletion.
4. **Phase 4:** GB/GBC/GBA PC emulation, keyboard/gamepad adapters, remapping, fullscreen where supported, and per-console/browser validation.
5. **Phase 5:** Nintendo DS and Nintendo 64 PC integration; per-console input profiles, N64 analog controls, and desktop controller tests.
6. **Phase 6:** IndexedDB and private cloud saves, compatibility-gated PC↔iPhone continuation, conflict resolution, and shared account metadata/favorites.
7. **Phase 7:** iPhone Safari and installed-PWA player mode: virtual multi-touch controls, configurable layout, safe areas, portrait/landscape and DS touch screen.
8. **Phase 8:** security hardening, cross-device/browser/device tests, CI expansion, and authorized Vercel deployment.

## GitHub

The existing GitHub repository remains `https://github.com/santi-bnt/PocketArcade.git`. Phase 1 commits are pushed to `main`; current Phase 2 and rebranding work is local and uncommitted. No repository was created or reinitialized.

## License

See [LICENSE](LICENSE). Third-party emulator and core licenses will be reviewed independently before any assets are distributed.
