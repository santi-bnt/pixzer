# Save persistence and synchronization (Phase 1 proposal)

## Status and guarantees

No save system is implemented in Phase 1. The proposal separates in-game battery saves (portable in some cases) from emulator save states (usually tied to the exact core and build). A save must never be reported as synced until the durable cloud write is confirmed.

## Data layers

1. **Emulator memory:** the current core's in-memory state; lost on crash or tab termination.
2. **Local browser persistence:** IndexedDB stores per-game save records and optional import/export artifacts. Browser storage can be evicted, cleared, or unavailable; it is a recovery cache, not the only durable copy. Ask for persistent storage where supported, but do not promise it.
3. **Cloud save objects (later phase):** private R2 binary objects with PostgreSQL metadata and ownership policy. Sync is a Phase 6 capability after Auth, RLS, object signing, and upload flows exist. PC and iPhone use the same account and save heads; a save only appears as resumable on the other device after the compatibility gate passes.

Use IndexedDB over localStorage because saves are binary and can exceed small synchronous key/value limits. Suggested stores:

- `saveBlobs`: key `[userId, gameId, kind, slotId]`; bytes as `Blob`/`ArrayBuffer`.
- `saveHeads`: key `[userId, gameId, kind, slotId]`; schema version, monotonic local revision, checksum, core identity for states, updated timestamp, sync state (`local | pending | synced | conflict | error`).
- `saveOutbox`: retryable operations with idempotency ID, expected cloud revision, payload checksum, attempt count, and last error code.

Use a transaction for blob+metadata changes. Never trust a user ID embedded in IndexedDB; on account change, partition local records and avoid exposing another account's cached saves on shared devices. Provide a deliberate sign-out cleanup option and clear in-memory keys/data at sign-out.

## Save envelope and naming

Each item should include `gameId`, immutable uploaded ROM checksum, `consoleId`, `kind`, `slotId`, `schemaVersion`, `payloadChecksum`, `payloadBytes`, `createdAt`, `updatedAt`, and—for state saves—exact emulator/core version and relevant core settings. Storage object keys must be generated server-side and opaque, not derived from an untrusted path or filename.

Never overwrite a different ROM's save because display titles match. Same-game identity starts with the content checksum; if the user replaces the ROM, it is a new identity unless they explicitly migrate/import a save.

## Local behavior and recovery

- Debounce/checkpoint routine battery save changes when the emulator reports them, and flush before normal Stop/Exit.
- Use IndexedDB transactions and surface quota/permission failures clearly. Maintain a dirty indicator until a local transaction commits.
- Offer explicit export/import of raw battery-save files and, separately, core-specific state files. Include a JSON sidecar/filename metadata or a documented container so users can identify console/game/kind/core.
- Validate size, expected format, game checksum match where available, and schema before import. Never auto-import a mismatched or untrusted state into the running core.
- Browser tab close, device shutdown, private mode, storage eviction, and browser quota exhaustion can still lose unsynced data; explain pending state to users.

## Cloud sync and conflict rules (Phase 6)

Treat saves as immutable versions. Metadata records a current head revision plus parent revision and checksum. Server authorization derives the owner from the verified session; clients never choose owner IDs. For uploads, require an expected parent revision and idempotency key. The server commits metadata only after object upload verification, and garbage-collects abandoned objects after a grace period.

For cross-device continuation, require the same authenticated account, immutable game checksum, console ID, save kind, and a recognized artifact format. Battery saves may transfer when both tested emulator integrations use compatible save formats; verify per console/core before advertising continuation. Save states default to exact emulator/core build and configuration compatibility and must not be offered on another device/core without a recorded compatibility result. If the target cannot consume the artifact, preserve it in cloud storage and offer download/export; never silently import it or relabel it as compatible.

On download, compare local and cloud checksums/revisions. If local head equals the server's parent, upload as a new revision. If remote advanced independently, preserve both as conflict copies and ask the user to choose or export; do not silently last-write-wins a save. A later product decision may allow deterministic merge only for save kinds/cores proven mergeable. Keep conflicts until a user explicitly resolves them.

Retry network failures from an outbox with bounded exponential backoff and idempotency. A partial object upload remains an orphan/pending operation, never a visible save head. Reconciliation can compare metadata and object inventory and remove orphaned objects only after a conservative retention period.

## Portability limits

Battery RAM saves are often more portable than save states, but game versions and emulator-specific formats still matter. Save states encode core internals and should be treated as compatible only with the same core build/configuration unless testing proves otherwise. EmulatorJS documents downloadable/loadable save states, but this alone is not a cloud sync protocol or cross-core compatibility guarantee. Do not automatically transfer a state file from Gambatte to mGBA, melonDS to DeSmuME, or between Mupen/Parallel cores.

## Primary references

- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [MDN Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [EmulatorJS documented features](https://emulatorjs.org/docs/features/)
- [EmulatorJS cores](https://emulatorjs.org/docs4devs/cores/)
- [EmulatorJS releases](https://github.com/EmulatorJS/EmulatorJS/releases)
