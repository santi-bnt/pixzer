# PocketArcade contributor instructions

## Objective

Build a private, account-based library for users to play games they are legally allowed to use. Phase 1 is a documented foundation; it does not provide authentication, file uploads, cloud storage, saves, or emulation.

## Architecture principles

- Use Next.js App Router, React, strict TypeScript, Tailwind CSS, and server components by default.
- Supabase Auth and PostgreSQL own identity and metadata; RLS is required for browser-accessible rows.
- Cloudflare R2 game and save objects stay private. All access is authorized server-side and granted with short-lived, scoped signed URLs.
- Never bundle ROMs, BIOS, firmware, user saves, or credentials.
- Client code must never receive service-role keys or R2 secrets. Server operations derive ownership from a verified session.
- Emulator integration must use pinned, reviewed assets and a per-console/browser compatibility matrix. Do not claim support until a redistributable test ROM has been run.
- Treat the 900 MB per-user quota and shared reserve as enforced limits, not UI hints. Recheck current provider pricing before launch.

## Coding conventions

- TypeScript strict mode; avoid `any`, unsafe casts, and unvalidated request data.
- Prefer small, typed feature modules and shared UI primitives over duplicated screens.
- Keep browser-only APIs and emulator code behind client component boundaries.
- Use accessible labels, semantic elements, keyboard navigation, visible focus, and reduced-motion support.
- Use `@/*` imports for `src/*`.
- Do not add a dependency for a small utility without a clear need.

## Testing expectations

- Before a change is complete, run `npm run lint`, `npm run typecheck`, and `npm run build` when dependencies are available.
- Add focused unit/integration/E2E coverage alongside implemented service functionality. Run tests relevant to changed behavior.
- Emulator support requires test-ROM execution on each claimed system and recorded target browser/device results.
- Database migrations must be reviewed for ownership, constraints, and RLS. Never treat a proposal as applied.

## Security requirements

- Never trust client-supplied user IDs, object keys, checksums, quota, console, or authorization decisions.
- Validate upload size, extension, signature where applicable, ownership, idempotency, and quota on the server. Signed URLs are bearer capabilities and must not be logged or persisted.
- Use private buckets and opaque server-generated keys.
- No secrets in Git, browser bundles, logs, docs, issues, or screenshots. Keep `.env` ignored; update `.env.example` with names only.
- Avoid HTML injection, unsafe redirects, open proxies, and unbounded upload/download operations.

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
