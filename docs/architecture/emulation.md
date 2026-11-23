# Emulator architecture (Phase 1 proposal)

## Status

EmulatorJS is a plausible candidate, not an integrated feature. PocketArcade does not yet load the library, run a ROM, or provide BIOS files. No console is accepted as compatible until a redistributable homebrew ROM is executed through the complete production-like flow on supported browsers and results are recorded.

## Current feasibility findings

The official EmulatorJS system pages list these cores:

| Target                    | EmulatorJS system/core                                       | Notes                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game Boy / Game Boy Color | `gb` defaults to Gambatte; mGBA also listed                  | Docs list optional GB/GBC BIOS. Verify both `.gb` and `.gbc` homebrew independently.                                                                                                 |
| Game Boy Advance          | `gba` defaults to mGBA                                       | Docs list optional GBA BIOS. Test `.gba` with a redistributable homebrew ROM.                                                                                                        |
| Nintendo DS               | `nds` defaults to melonDS; DeSmuME and DeSmuME 2015 listed   | The melonDS docs list required ARM7/ARM9 BIOS and firmware. Do not bundle proprietary firmware; Phase 2+ must decide whether user-supplied firmware is supported and safely handled. |
| Nintendo 64               | `n64` defaults to Mupen64Plus Next; Parallel-N64 also listed | EmulatorJS documents Parallel-N64 fallback on iOS. WebGL/GPU and core variance require a separate compatibility matrix.                                                              |

These are core availability statements from EmulatorJS documentation, not PocketArcade compatibility results. The project describes itself as WebAssembly-based and says modern browsers are supported, but our product should use a tested support matrix rather than adopting that broad claim. Core and browser performance varies by device.

## License and distribution review

The EmulatorJS repository currently carries GPL-3.0. EmulatorJS is an integration candidate only after a license review covering the exact pinned release, included core binaries, core source and licenses, and our method of distribution. A separate iframe does not automatically settle whether the combined delivered product has obligations. Preserve notices and source/license access as required if adopted; get legal review before shipping. Do not treat ROMs or console BIOS/firmware as included or licensed by EmulatorJS.

Pin an exact release and self-host reviewed assets. Do not load an unpinned `latest` CDN build in production. Keep emulator distribution, notices, and source offer aligned with the release. Generate an SBOM/license inventory during integration.

## Adapter boundary

Future implementation should isolate EmulatorJS behind `src/features/emulator`:

- `ConsoleId`: `gb | gbc | gba | nds | n64`.
- `EmulatorLaunchRequest`: library game ID, short-lived private ROM URL or a scoped in-memory `File`, console ID, and user-selected options. Never put credentials or permanent object URLs in the request.
- `EmulatorAdapter`: `mount(container, request)`, `pause()`, `resume()`, `exportSave()`, `importSave(data)`, `dispose()`. Optional capabilities must be explicit; a core that cannot implement a method returns an unsupported result.
- `EmulatorStatus`: `idle | loading | ready | paused | error | disposing` with user-safe error codes; do not leak signed URLs in telemetry.
- `SaveEnvelope`: game checksum, console, core ID/version, save kind (`battery | state`), schema version, bytes, created time. State files are core/build-specific unless verified otherwise.

Avoid letting emulator globals or DOM mutation enter React's application shell. The official Embed guide warns React/SPA users that embedding directly on the app page can break the SPA and recommends an iframe. Use a dedicated same-origin player document/route in a sandboxed iframe, with a narrowly scoped `postMessage` protocol. Validate `event.origin`, `event.source`, message schema, request IDs, and allowed message types on both sides. Do not enable top navigation, popups, or same-origin privileges without a demonstrated requirement; review sandbox flags before use. Pass a one-game capability with short expiry, not an account token.

## Lifecycle

1. Server authenticates the session, checks ownership of the selected game and storage status, then issues a short-lived, read-only ROM capability.
2. Client creates the player frame only after the user presses Play. The player loads pinned, self-hosted EmulatorJS assets and the required core.
3. Display loading/progress and a recoverable error if resource loading fails. Only transition to `ready` on an actual emulator-ready signal.
4. Keyboard controls are scoped to the player while focused. Use the browser Gamepad API where exposed, and show a clear remapping/status surface. Test hotplug and disconnect behavior.
5. Nintendo DS needs a responsive layout for two screens (stacked and side-by-side) plus touch input mapped to the lower display. Test rotation, scaling, touch hit regions, and games that rely on both displays.
6. Nintendo 64 needs an explicit mapping for the analog stick, C buttons, Z, triggers and Start. Handle sticks/axes and dead zones; test both gamepad and keyboard fallback. Do not assume a generic pad mapping is correct.
7. On stop, request supported battery-save export and wait for completion before disposal. Keep state save separate from SRAM/battery saves. On unload/crash, best-effort flushing is not a durability guarantee.
8. Tear down frame, listeners, object URLs, WebAssembly memory, and temporary capabilities. Pause on hidden tab and resume only on explicit user action if required.

## Acceptance before a console is marked supported

- Test one legally redistributable homebrew image per console and record its license/source/checksum, but do not commit binaries unless the license permits it.
- Test current Chromium, Firefox, and Safari desktop versions selected by the project support policy, with at least one low-spec device; note required WebAssembly/WebGL capabilities.
- Verify cold load, reload, pause/resume, controller mapping, battery save export/import, deletion, and player teardown.
- For NDS specifically test both-screen layout/touch; for N64 test analog/controller mapping and WebGL fallback behavior.
- Capture tested browser, OS, device, core version, emulator asset hash, ROM test ID, result, and known issues in a versioned compatibility report.

## Primary references

- [EmulatorJS getting started](https://emulatorjs.org/docs/getting-started/)
- [EmulatorJS embedding guide](https://emulatorjs.org/docs/embed/)
- [EmulatorJS core list](https://emulatorjs.org/docs4devs/cores/)
- [Game Boy and Game Boy Color system page](https://emulatorjs.org/docs/systems/nintendo-game-boy/)
- [Game Boy Advance system page](https://emulatorjs.org/docs/systems/nintendo-game-boy-advance/)
- [Nintendo DS system page](https://emulatorjs.org/docs/systems/nintendo-ds/)
- [Nintendo 64 system page](https://emulatorjs.org/docs/systems/nintendo-64/)
- [EmulatorJS GPL-3.0 license](https://github.com/EmulatorJS/EmulatorJS/blob/main/LICENSE)
- [EmulatorJS releases](https://github.com/EmulatorJS/EmulatorJS/releases)
