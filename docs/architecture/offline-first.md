# Offline-first architecture

## Status and scope

Offline gameplay, ROM download controls, emulator execution, and cloud save sync are **not functional yet**. The codebase has invitation-gated Supabase Auth and a planned private R2 boundary, but no configured R2 bucket, ROM download API, emulator runtime, or save adapter. This phase adds a browser IndexedDB repository, checksum utility, bounded sync coordinator over an unimplemented transport, and public-only Service Worker shell. Those foundations are not connected to the library, auth account selection, an emulator, or a real cloud service. Do not expose offline-ready or synced UI states until those flows are integrated and verified.

This foundation is independent of Phase 2 acceptance. It must not weaken invite authorization, change RLS, or treat a cached identity as an authenticated server session.

## Runtime responsibilities

- **IndexedDB** owns account-partitioned game blobs, immutable local save versions, local save heads, and durable pending-sync operations. ROMs and saves must not be stored in a shared Cache Storage cache.
- **Cache Storage / Service Worker** may hold only the public offline fallback, versioned same-origin application assets, and reviewed public emulator assets. Never cache authenticated HTML, Supabase responses, R2 signed URLs, ROM bytes, save bytes, or user-specific metadata in this shared origin cache.
- **Supabase Auth/PostgreSQL** remains the account and metadata authority. Every remote operation requires a fresh server-side verified user and invitation marker. A cached/expired token or local account hint cannot authorize remote reads, writes, or signed URLs.
- **Private R2** is the future source/target for ROM and save bytes. The application server issues narrowly scoped, short-lived capabilities and derives owner/game identity from the verified session.
- **The emulator adapter** writes to the local repository first. Cloud transport is an independent later step; no emulator implementation currently exists.

## IndexedDB model

Database name: `pixzer-offline`; migrations use an explicit schema version. All primary and secondary keys include the Supabase user UUID (`userId`) so each library query is scoped. This partitioning prevents accidental cross-account display by application code; it is **not encryption, a secure vault, or operating-system-level isolation**. Anyone with access to the same browser profile or developer tools can inspect browser-managed data.

Required logical stores:

| Store          | Key                              | Contents                                                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `games`        | `[userId, gameId]`               | ROM `Blob`, immutable ROM SHA-256, console, file metadata, verified size, cache timestamps                                      |
| `saveVersions` | `[userId, versionId]`            | Immutable binary save, game/ROM identity, checksum, parent/cloud revision, device, core/version/configuration and artifact kind |
| `saveHeads`    | `[userId, gameId, kind, slotId]` | Current local version reference; never a binary overwrite                                                                       |
| `saveOutbox`   | `[userId, operationId]`          | Idempotency key, version reference, expected parent, status, bounded retry count and next-attempt time                          |

Writing a save version, updating its local head, and enqueueing its sync operation must be one IndexedDB transaction. A failed transaction leaves the preceding valid head intact. Conflicting remote versions are retained as separate immutable records. A ROM is published as offline-ready only after its complete byte length and SHA-256 match authoritative metadata; interrupted downloads must not replace a previously verified copy. Any chunked download implementation must record per-download progress durably and finalize only after verification.

Use `navigator.storage.estimate()` to report approximate origin usage/quota and `navigator.storage.persist()` as a best-effort request. Handle `QuotaExceededError`, private browsing, denied persistence, browser eviction, and IndexedDB being unavailable. Never promise that browser storage will be retained. Explicit downloads only; never mirror an entire cloud library. Remove-offline-copy deletes only that account's ROM record, not local/cloud saves.

## Local-first save lifecycle

1. The emulator adapter exports a complete save artifact with game checksum, kind (`battery` or `state`), slot, emulator/core identity and configuration.
2. The client validates size/format and computes the artifact checksum. It creates a new immutable version and a durable outbox operation.
3. One IndexedDB transaction writes the version, advances the local head, and enqueues the operation. The UI may report **Saved locally** only after this transaction commits.
4. Cloud sync is attempted later. Failure leaves the local version and operation available for retry/export; it never rolls back the local head.
5. The local binary copy is retained after upload confirmation. “Synced” means the server verified the stored object and committed its metadata/revision, not merely that an HTTP upload returned 200.

Save states remain core/build/configuration-specific unless an explicit compatibility test says otherwise. Battery RAM is not automatically portable merely because two games use the same console. Never merge binary artifacts automatically.

## Cloud protocol and idempotency

`SaveSyncTransport` accepts a game/version, expected parent revision, and idempotency key, but no owner ID. The server derives the owner from a verified invited Supabase session, verifies game ownership and save limits, and performs a conditional revision check. The intended server flow is:

1. Create or return the same idempotent upload intent for the operation.
2. Issue a short-lived private R2 capability for that one object.
3. Upload bytes and verify the complete object checksum and size server-side.
4. Compare `expectedParentRevision` with the current head and atomically commit new metadata only if unchanged.
5. Return an accepted revision or a conflict with the current remote version metadata. Keep abandoned objects invisible and clean them up only after a retention window.
6. Mark the local operation synced only after the server's accepted response is verified. Keep the local copy.

Retry network/server failures with exponential backoff plus jitter, a hard attempt limit, and manual retry. `navigator.onLine` and an `online` event are only scheduling hints; each request must establish actual server reachability and current authorization. Retry operations use the same idempotency key. Do not retry authorization, validation, checksum, or compatibility failures forever.

## Conflict policy

A client may upload only against the exact parent revision it previously observed. If another device has advanced the head, the server preserves both versions and returns a conflict. The local client stores the remote version alongside its own, surfaces both timestamps/device/core/checksum details, and lets the user continue from or export either copy. Choosing a version creates a new child revision against the current server head; it does not erase either conflicting version. No last-write-wins and no automatic binary merge.

## Offline access policy

- Offline play is limited to a game whose verified bytes were explicitly cached for that same Supabase user ID after a prior authorized online session.
- The cached account ID is a **local partition selector only**. It may select the local user's records while offline even if a session token is stale, but it cannot authorize any network request.
- On every online operation, verify the current Supabase user with the server and require the trusted invitation marker. `getSession()` or an expired token is never sufficient for cloud access.
- A verified online account switch changes the active partition immediately. On sign-out, clear the active offline account hint and in-memory game/save data; retain the old partition on disk but do not display it. It becomes selectable again only after that same account signs in successfully online.
- There is no offline account chooser that can select another user's ID. This is defense against application-level account mix-ups, not protection from another person who can use the same OS/browser profile or developer tools. Provide a clear shared-device sign-out warning; do not claim local encryption or OS isolation.
- If the cached active identity is missing or inconsistent, fail closed for offline library access and ask the user to sign in online. Do not guess based on email or game title.

## Service Worker and PWA

Cache versioned static shell assets and a generic offline fallback only. Use network-first for navigations and fall back to a static page that contains no account/library data. Cache-first is allowed only for immutable same-origin `/_next/static/` assets and an explicit allowlist of public logos/icons/emulator assets. Ignore API requests and all non-GET requests. Do not cache `/auth`, `/login` HTML, `/library` HTML, Supabase endpoints, signed URLs, ROMs, or save payloads. Delete only old caches with pixzer's own prefix during activation; never call `caches.keys().delete()` indiscriminately and never clear IndexedDB during a worker update.

Do not rely on Background Sync. Desktop may retry when connectivity returns or a tab becomes visible; iPhone Safari/PWA retries only when the app is opened or becomes active and a real request succeeds. No synchronization is promised while iOS Safari/PWA is fully closed. Updates must not discard local records or silently reload a running game.

## Device and browser constraints

PC Chrome, Edge, Firefox, and Safari still require separate validation for IndexedDB, worker lifecycle, storage quotas, gamepad behavior, audio, WASM performance, offline reload, and eviction recovery. iPhone Safari and installed PWA are separate targets: iOS may evict storage, deny persistent-storage requests, suspend the app, delay event delivery, require user gesture for audio, and limit memory. Do not claim DS/N64 iPhone performance without physical-device runs. Offline launch itself must use local ROM bytes and cached emulator assets; it must not contact Supabase, R2, or Vercel to start the game.

## Required validation gates

Automated tests should cover account partitions, transaction abort/recovery, checksum mismatch, quota errors, interrupted downloads, worker cache allowlist, retry bounds, idempotent replay, expired auth rejection for remote sync, and conflict preservation. Browser tests must reload with network disconnected, reopen the browser, save/restore locally, reconnect, retry a deliberately failed upload, and switch/logout accounts. Test each claimed desktop browser independently. Physical iPhone Safari and installed-PWA scenarios are mandatory before making iPhone offline claims. No ROMs or saves may be placed in Git; test files must be redistributable homebrew fixtures or generated synthetic bytes.

## Platform references

- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) and [Using service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) and [`StorageManager.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) (limited availability; never a required iPhone path)
- [MDN PWA caching guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [Apple Safari client-side storage guide](https://developer.apple.com/library/archive/documentation/iPhone/Conceptual/SafariJSDatabaseGuide/)
