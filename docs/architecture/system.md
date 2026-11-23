# System architecture

## Status

Phase 1 establishes the UI and typed service boundaries. Phase 2 adds Supabase Auth and RLS code, but no development Supabase project is configured. This offline foundation adds IndexedDB persistence and a public-only Service Worker, but they are not integrated with authenticated library selection, R2, emulator execution, or cloud saves. Offline gameplay is not claimed.

## Runtime shape

```text
PC browser / iPhone Safari or installed web app (planned)
  ├─ Next.js App Router UI (Vercel)
  ├─ Supabase Auth session (planned)
  ├─ PostgreSQL metadata + RLS (planned)
  ├─ Short-lived signed object requests (planned)
  │    └─ Private Cloudflare R2 bucket
  ├─ Responsive shared player (planned)
  │    ├─ PC keyboard + Gamepad API input adapters
  │    └─ iPhone virtual multi-touch controls (later phase)
  └─ EmulatorJS WebAssembly runtime in browser (candidate; unvalidated)
       └─ IndexedDB local saves + compatible private cloud saves (planned)
```

## Offline boundary

The implemented Service Worker caches a generic offline fallback and allowlisted public static files only. It never caches authenticated page responses, API data, Supabase data, short-lived R2 URLs, ROMs, or saves. The IndexedDB repository supports explicitly cached ROM records and immutable local saves under user-partitioned keys. That partition prevents application-level account mix-ups but is not encryption or OS-level isolation. Account selection and logout integration are not implemented; when added, a local cached user identity may select only local records, while each remote operation still requires a fresh server-verified invited Supabase session. See [offline-first architecture](offline-first.md) and the [offline execution board](../agents/offline-first-board.md).

The Next.js server is the policy enforcement point for session-bound upload intents, quota reservations, upload completion, signed downloads, and object deletion. The browser must never receive privileged database or R2 credentials. Postgres and R2 do not share transactions, so upload state is explicit and reconciliation is required.

PC and iPhone use the same authenticated account and server-owned game records, including shared favorites and metadata. The player chooses PC or iPhone layout from capability signals, with a manual override; it never relies solely on user-agent strings. Keyboard/gamepad/touch adapters emit a shared input contract. Device-specific mappings and touch geometry remain local by default. Cloud saves are shared only when the ROM identity and save artifact/core compatibility checks permit restore.

## Module map

- `src/app`: public, account, library, upload, player, and settings route composition.
- `src/components`: shared responsive shell and design primitives.
- `src/features/offline/`: typed local game/save contracts, account-partitioned IndexedDB repository, streaming checksums, storage capability helpers, a bounded sync coordinator without a cloud transport, and production-only PWA registration.
- `src/features`: feature-specific behavior.
- `src/lib/supabase`: cookie-bound browser/server clients, Auth actions, callback verification, and invitation-gated session checks. `src/lib/r2`: typed contracts only; cloud storage operations are not implemented.
- `supabase/migrations`: initial schema applied to the dedicated development project; real Auth flow validation remains pending.
- `docs/architecture`: service flows, trust boundaries, decisions, and known limitations.

## Key decisions

| Decision                                    | Reason                                              | Consequence                                                       |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Account-owned library records               | Cross-device library requires identity              | Auth and RLS precede cloud storage                                |
| Private R2, signed per-operation URLs       | ROMs and saves are private user data                | Signed URLs are short-lived bearer capabilities                   |
| Opaque server-generated object keys         | Avoid path ownership and filename injection         | Metadata is authoritative for lookup                              |
| Explicit upload state machine               | DB/R2 writes cannot be atomic                       | Recovery jobs reconcile incomplete uploads                        |
| Browser-based emulator isolated from server | WASM runs client-side and needs file bytes          | Validate origin, CSP, resource loading, memory and device limits  |
| Battery saves separated from save states    | Portability varies by core/build                    | Cloud sync records artifact kind, core and version                |
| Compatibility per console and browser       | A listed core does not prove reliable game support  | Never market untested console support                             |
| Canonical input with device adapters        | PC keys/pads and phone touch differ in hardware     | Core receives normalized actions; profiles are keyed by console   |
| iOS is capability-gated                     | Safari and installed web apps expose different APIs | Fullscreen/controller/audio/storage have tested fallbacks         |
| Offline game bytes live in IndexedDB        | Cache Storage is shared by the origin               | Account keys prevent app mix-ups, not local inspection/encryption |
| Service Worker caches public assets only    | Authenticated HTML and signed URLs are private      | Never cache ROM/save/API data in a shared origin cache            |
| Local save is independent of cloud sync     | Network/R2 may be unavailable during play           | Commit local version and outbox atomically before showing saved   |

## Deployment and operations

Vercel is the planned Next.js host. Supabase and Cloudflare R2 remain separate providers. Use separate development and production projects/buckets, least-privilege keys, database migrations, encrypted provider secrets, rate limits, and usage alerts. Do not configure deployment until the user authorizes it and the service projects exist. Provider free tiers are variable and do not imply a zero-cost guarantee.

See [roadmap and acceptance gates](roadmap.md), [database](database.md), [storage](storage.md), [emulation and PC/iPhone modes](emulation.md), [saves](saves.md), [free-tier limits](free-tiers.md), and [quality](quality.md) for detailed designs.
