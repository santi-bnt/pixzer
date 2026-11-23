# Phase 1 Task Board

## Shared architecture and contracts

- Next.js App Router with strict TypeScript; server components by default.
- Supabase owns identity, PostgreSQL metadata, and row-level authorization.
- Private Cloudflare R2 objects are accessed only through server-issued short-lived capabilities.
- Browser emulation is an isolated client-side subsystem; games and firmware are user-provided.
- Save data is versioned separately from metadata and must not assume save-state portability.
- No route may claim authentication, uploads, gameplay, or sync works until the corresponding service is integrated and tested.

## Ownership and dependencies

| Workstream               | Owner           | Files                                                                          | Depends on                  | Acceptance                                                                                |
| ------------------------ | --------------- | ------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------- |
| Architecture integration | Orchestrator    | `AGENTS.md`, `README.md`, app configuration, shared contracts                  | None                        | App has coherent setup, routes, documentation, strict types                               |
| UI foundation            | Orchestrator    | `src/app/**`, `src/components/**`, `src/features/**`, styles                   | Shared architecture         | Responsive routes use reusable accessible components and honest unavailable states        |
| Auth/database proposal   | Backend Agent   | `docs/architecture/database.md`, `supabase/migrations/0001_initial_schema.sql` | Shared architecture         | User-scoped schema and RLS proposal; no credentials or implicit trust in client ownership |
| Storage architecture     | Storage Agent   | `docs/architecture/storage.md`                                                 | Shared architecture         | Private R2 flow and server contract with quota/validation/recovery considerations         |
| Emulator feasibility     | Emulation Agent | `docs/architecture/emulation.md`                                               | Shared architecture         | Current official docs/licensing/browser/core findings with clear unverified compatibility |
| Save architecture        | Save Agent      | `docs/architecture/saves.md`                                                   | Emulator findings/contracts | IndexedDB/local/cloud model, versions, conflicts, and portability limits                  |
| QA/CI                    | QA Agent        | `.github/workflows/ci.yml`, `docs/architecture/quality.md`                     | App skeleton                | CI checks install, lint, types, and production build without secrets                      |

## Integration rules

- The orchestrator owns cross-cutting interfaces in `src/lib/**`; agents do not edit those files.
- Each agent owns only its listed files. Coordinate before expanding scope.
- Do not claim compatibility, security guarantees, or service functionality without evidence.
- Do not publish, deploy, or add secrets. No ROMs, BIOS, saves, or local env files belong in Git.
- Review every contribution and run requested local quality checks before calling Phase 1 done.
