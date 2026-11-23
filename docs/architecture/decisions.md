# Architecture decisions

## ADR-001: Phase the system around trust boundaries

**Status:** Accepted for Phase 1.

Build UI and typed boundaries before service credentials exist. Auth must precede ownership-sensitive storage routes; storage completion must precede emulator launch; persistence metadata must precede cloud save sync. Screens are allowed to describe planned capabilities but cannot simulate success.

## ADR-002: Private object storage with signed capabilities

**Status:** Proposed.

Store game and save bytes in a private R2 bucket. The server verifies the session and quota before issuing a short-lived signed operation for one opaque object key. The client never chooses object paths or receives R2 credentials. Revisit URL expiry, multipart strategy, abuse limits, and allowed file signatures during Phase 3 implementation.

## ADR-003: Compatibility is an evidence-based product state

**Status:** Accepted.

EmulatorJS core availability is feasibility evidence only. Each target console needs a redistributable homebrew test, browser/device criteria, input validation, save/load review, and documented result before it is marked working.

## ADR-004: Save artifacts carry portability metadata

**Status:** Proposed.

Store battery saves separately from emulator save states. A state artifact records emulator product, core, core version, format version, and game checksum. Conflicts are resolved by preserving versions and requiring an explicit choice; never silently overwrite a newer remote artifact.

## ADR-005: Initial quota is a ceiling with a reserve

**Status:** Planning assumption.

The target 900 MB per invited account leaves about 1 GB of a nominal 10 GB-month pool when ten accounts fill quota. This reserve can be exhausted by temporary copies, retained saves, and growth. Enforce per-user and global committed plus reserved bytes and recheck provider pricing and included usage before launch.
