# Offline-first execution board

## Shared architecture and integration contract

Offline delivery is not a single storage feature. The integration graph is:

```text
verified Supabase account -> account-scoped IndexedDB -> verified local ROM -> emulator adapter -> local immutable save + outbox
                                                                                              -> authorized R2 save API (later)
public Service Worker shell/assets only ------------------------------------------------------^ (never ROM/save/API data)
```

The orchestrator owns `src/features/offline/contracts.ts`, `docs/architecture/offline-first.md`, the roadmap, and integration review. The shared contract requires account-scoped game records, immutable save versions, local heads, an atomic local save/outbox write, bounded retry metadata, and a future transport that accepts no client-supplied owner ID. Changes to the contract must be coordinated before implementation.

R2 uploads/downloads and EmulatorJS are not implemented or configured. Agents must build boundaries and isolated foundations only; they must not invent a successful cloud upload, game download, save, or launch. The existing Supabase invitation/RLS implementation is untouched.

## Task cards

### Agent A — Offline storage

- **Objective:** Implement the browser-only IndexedDB repository matching the shared contracts. Scope must be partitioned by Supabase user ID; local saves, their head and outbox operation must commit atomically. Translate quota/blocked/upgrade errors into typed actionable failures. Do not implement a ROM fetcher until Phase 3 exists.
- **Owned files:** `src/features/offline/storage/**`, `tests/unit/offline-storage/**` only.
- **Shared interface:** Import `src/features/offline/contracts.ts`; do not edit it. Repository methods must compare supplied account scope against every record and never list another scope.
- **Dependencies:** Contracts and architecture document are established; no R2 credentials, emulator or Supabase project is required.
- **Tests required:** Database open/upgrade; two account partitions; verified ROM record CRUD; transaction abort keeps old save head and creates no half outbox entry; atomic version/head/outbox write; missing/unknown user returns no records; quota and blocked database errors.
- **Definition of done:** Browser APIs are isolated from server imports; database versioning and close handling are explicit; IDB transactions are correctly awaited; all required tests pass; no claim of encryption or OS isolation.

### Agent B — PWA and Service Worker

- **Objective:** Add a versioned public offline fallback and static-asset worker lifecycle. Worker must never cache personalized/private data, even when offline.
- **Owned files:** `public/sw.js`, `public/offline.html`, `src/features/offline/pwa-registration.tsx`, and the single integration point in `src/app/layout.tsx`; tests only under `tests/unit/offline-pwa/**`.
- **Shared interface:** Follow the cache allowlist and update policy in `docs/architecture/offline-first.md`. Cache only the generic fallback, immutable `/_next/static/` files and explicitly enumerated public brand/icon assets. Do not register Background Sync.
- **Dependencies:** Existing PWA manifest and static branding are present. No emulator assets exist, so do not invent/cache them.
- **Tests required:** Install/activate version behavior; old pixzer-owned cache cleanup only; navigation fallback on network failure; private/API/auth/signed URL/ROM/save requests are not cached; non-GET requests pass through.
- **Definition of done:** Registration is capability-gated and error-tolerant; update does not reload a running game or clear IndexedDB; offline fallback has no account/library information; automated checks pass.

### Agent C — Save synchronization core

- **Objective:** Implement a pure, testable local-first sync coordinator/state machine over `OfflineRepository` and the future `SaveSyncTransport`. It must leave local saves intact, require a verified-online transport supplied by the caller, bound exponential retries, reuse idempotency keys, and preserve both versions on conflict.
- **Owned files:** `src/features/offline/sync/**`, `tests/unit/offline-sync/**` only.
- **Shared interface:** Import `src/features/offline/contracts.ts`; no owner ID may be passed to the cloud transport. Do not implement an HTTP/R2 adapter or use `navigator.onLine` as proof of connectivity.
- **Dependencies:** Storage interface only; the coordinator can be tested with a fake repository/transport. R2, DB migration and emulator integration are later prerequisites.
- **Tests required:** Local record remains after failed transport; retries stop at configured maximum; delay is bounded/exponential; idempotency stays unchanged; accepted response marks synced only after persistence; conflict stores both versions and never advances by overwrite; expired/unauthorized transport errors do not retry forever.
- **Definition of done:** No background loop; caller can trigger on app resume/online/manual request; typed results distinguish pending, synced, failed and conflict; tests pass.

### Agent D — Player/save adapter (deferred)

- **Status:** Blocked by missing emulator integration. Later work owns translating real core save events into `SaveVersionRecord` and loading only compatible local artifacts. No fake gameplay/save adapter is allowed in this task.

### Agent E — Frontend/UX (deferred)

- **Status:** Do not add download/sync indicators yet. There is no real download or sync state to display. UI starts only after storage/download and sync services can provide persisted truth.

### Agent F — QA/security (after integration)

- **Objective:** Review the integrated modules, run unit/format/lint/typecheck/build, inspect account isolation and SW cache policy, and produce a precise list of browser/device tests still outstanding.
- **Owned files:** Read-only review by default. Report findings to orchestrator; do not edit the storage, sync, worker, or shared contracts.
- **Dependencies:** Agents A–C implementation reviewed and integrated.
- **Tests required:** Run available automated tests and verify no new secret/private assets were added.
- **Definition of done:** No unsupported offline claims; residual limitations and physical-iPhone/browser blockers are explicit.

## Current acceptance status

| Area                                       | Status                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Shared contracts and architecture          | Prepared locally; reviewed by orchestrator and QA                       |
| IndexedDB repository                       | Implemented; simulated-IDB tests pass, native browser DB not tested     |
| ROM download/checksum/progress             | Blocked on Phase 3 private R2 API                                       |
| Emulator and save adapter                  | Blocked on Phases 4/5; no ROM execution                                 |
| Public offline shell                       | Implemented; unit-tested, not exercised in a real browser               |
| Save sync coordinator                      | Implemented and unit-tested over injected interfaces                    |
| Cloud transport/conflict UI                | Not implemented; blocked on Phase 2 validation, R2 and save adapter     |
| QA/security review                         | Read-only review complete; no high-severity issues in scoped foundation |
| Desktop/iPhone disconnected gameplay tests | Not run; no real game player/device harness                             |
