# System architecture

## Status

Phase 1 establishes the UI, typed service boundaries, architectural proposals, and local build tooling. No external service is configured. The landing, library, upload, player, and settings screens communicate that integrations are unavailable.

## Runtime shape

```text
Desktop browser
  ├─ Next.js App Router UI (Vercel)
  ├─ Supabase Auth session (planned)
  ├─ PostgreSQL metadata + RLS (planned)
  ├─ Short-lived signed object requests (planned)
  │    └─ Private Cloudflare R2 bucket
  └─ EmulatorJS WebAssembly runtime in browser (candidate; unvalidated)
       └─ IndexedDB for local saves (planned)
```

The Next.js server is the policy enforcement point for session-bound upload intents, quota reservations, upload completion, signed downloads, and object deletion. The browser must never receive privileged database or R2 credentials. Postgres and R2 do not share transactions, so upload state is explicit and reconciliation is required.

## Module map

- `src/app`: public, account, library, upload, player, and settings route composition.
- `src/components`: shared responsive shell and design primitives.
- `src/features`: reserved for feature-specific behavior as phases add it.
- `src/lib/supabase`, `src/lib/r2`: typed boundaries, currently contracts only.
- `supabase/migrations`: initial schema proposal; not applied.
- `docs/architecture`: service flows, trust boundaries, decisions, and known limitations.

## Key decisions

| Decision                                    | Reason                                             | Consequence                                                      |
| ------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Account-owned library records               | Cross-device library requires identity             | Auth and RLS precede cloud storage                               |
| Private R2, signed per-operation URLs       | ROMs and saves are private user data               | Signed URLs are short-lived bearer capabilities                  |
| Opaque server-generated object keys         | Avoid path ownership and filename injection        | Metadata is authoritative for lookup                             |
| Explicit upload state machine               | DB/R2 writes cannot be atomic                      | Recovery jobs reconcile incomplete uploads                       |
| Browser-based emulator isolated from server | WASM runs client-side and needs file bytes         | Validate origin, CSP, resource loading, memory and device limits |
| Battery saves separated from save states    | Portability varies by core/build                   | Cloud sync records artifact kind, core and version               |
| Compatibility per console and browser       | A listed core does not prove reliable game support | Never market untested console support                            |

## Deployment and operations

Vercel is the planned Next.js host. Supabase and Cloudflare R2 remain separate providers. Use separate development and production projects/buckets, least-privilege keys, database migrations, encrypted provider secrets, rate limits, and usage alerts. Do not configure deployment until the user authorizes it and the service projects exist. Provider free tiers are variable and do not imply a zero-cost guarantee.

See [database](database.md), [storage](storage.md), [emulation](emulation.md), [saves](saves.md), [free-tier limits](free-tiers.md), and [quality](quality.md) for detailed designs.
