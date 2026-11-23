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

## PC and iPhone player modes

These are product targets, not implemented capabilities. The shared player shell has a responsive viewport, a console-independent input coordinator, emulator-core adapters, and save bridge. It receives normalized actions from independent keyboard, Gamepad API, and virtual-touch adapters; it must not let a core bind directly to React UI events.

`src/features/player/contracts.ts` defines the initial contract: `DigitalAction`, normalized `InputFrame`, `ConsoleInputProfile`, `PlayerDeviceCapabilities`, `PlayerModePreference`, and capability-based mode resolution. Input profiles are keyed by console. The physical keyboard/gamepad mapping and device-specific calibration are local to a device by default; account metadata and game/library favorites are shared. A manual PC/iPhone mode choice overrides the automatic suggestion.

### PC mode (implement alongside desktop emulation)

- Keyboard adapter maps configurable `KeyboardEvent.code` values into canonical actions. Scope gameplay keys to the focused player, ignore key repeats where appropriate, release held actions on blur/visibility changes, and preserve browser shortcuts outside gameplay.
- Gamepad adapter checks `navigator.getGamepads`, listens for `gamepadconnected`/`gamepaddisconnected` when available, and refreshes on focus/user interaction to handle late connection. Feature-detect the API; do not assume the controller's reported name, standard mapping, or vendor is reliable. Show connected state and offer manual bindings for controllers with missing/non-standard mappings.
- Provide per-console keyboard and controller profiles, remapping/reset controls, and Xbox, PlayStation, and compatible USB/Bluetooth controller test devices. Standard-mapped controllers can use defaults; unsupported or browser-filtered mappings remain manually configurable.
- Use Gamepad button values for digital actions and normalized axes for analog input. N64 profiles map the stick, C buttons, Z, L/R, and Start; apply configurable dead zone, axis inversion, and calibration before emitting the shared input frame.
- Request player-element fullscreen only from a user gesture when `document.fullscreenEnabled` and `requestFullscreen` are available. Handle rejection, Escape/exit, orientation/resize, and browsers without fullscreen. Fullscreen is an enhancement, not a prerequisite for play.

### iPhone mode (dedicated later implementation phase)

- Use a touch-first overlay with a virtual D-pad, A/B, Start, Select, L/R; for N64 include an analog stick and C buttons. For DS, keep both screens visible and route pointer/touch coordinates only to the lower screen.
- Track every active pointer ID per control so multi-touch can hold directions and face buttons simultaneously. Capture pointers and release on `pointerup`, `pointercancel`, player exit, tab hiding, and lost capture; never leave a virtual button stuck.
- Offer per-device adjustment for control size, normalized position, and opacity. Store the layout on the device initially; it must not overwrite an account's shared game metadata or another device's layout.
- Reflow controls and console displays for portrait and landscape using viewport dimensions and orientation media queries/events, not user-agent parsing. Let users rotate manually; orientation locking is optional and feature-detected.
- Set `viewport-fit=cover`, respect `env(safe-area-inset-*)` around notches and the home indicator, and keep controls within the safe viewport in both orientations. Installed web apps can use a standalone/fullscreen manifest display mode after the user adds the site to the Home Screen. Do not promise Safari tab fullscreen: detect the actual Fullscreen API capability and provide an in-page/installed-app layout fallback.
- Apply `touch-action: none`, `overscroll-behavior: contain`, and `user-select: none` only to the active game surface/control hit regions. Prevent context menus or gestures only when they originate within controls; leave browser navigation and ordinary page scrolling elsewhere usable. Support visible focus and accessible labels for switch-control/assistive use.
- Start/resume emulation audio from an explicit user gesture and surface muted/autoplay-blocked states. Treat Web Audio, IndexedDB, Gamepad API, vibration, and screen-orientation support as runtime capabilities that can differ between Safari tab, installed PWA, and iOS releases.
- Bluetooth gamepads are optional on iPhone. Detect Gamepad API presence and connection at runtime, permit virtual controls as the fallback, and validate each advertised controller/browser combination on an actual phone. A paired system controller is not proof the browser exposes it.

### Mode suggestion and responsive shell

Build the suggestion from touch points, coarse/fine pointer media queries, Gamepad API availability/connection, fullscreen support, and installed display mode. These signals can inform the default layout but do not prove a device is an iPhone or that a controller works. No single signal (especially user-agent) selects the mode; persist an explicit user override and provide a visible PC / iPhone layout switch at all times. Keep the emulator viewport independent of the overlay so resizing/repositioning controls never reloads a running core.

On wide/keyboard-oriented displays, prioritize the emulator viewport, keyboard hints, controller status/profile settings, and a user-gesture fullscreen control. On touch-first displays, reserve safe-area-aware space for the virtual controls and offer portrait and landscape layouts. The DS layout must preserve both displays and lower-screen input in either orientation; N64's on-screen analog stick/C buttons need adjustable spacing and simultaneous input.

Avoid letting emulator globals or DOM mutation enter React's application shell. The official Embed guide warns React/SPA users that embedding directly on the app page can break the SPA and recommends an iframe. Use a dedicated same-origin player document/route in a sandboxed iframe, with a narrowly scoped `postMessage` protocol. Validate `event.origin`, `event.source`, message schema, request IDs, and allowed message types on both sides. Do not enable top navigation, popups, or same-origin privileges without a demonstrated requirement; review sandbox flags before use. Pass a one-game capability with short expiry, not an account token.

## Lifecycle

1. Server authenticates the session, checks ownership of the selected game and storage status, then issues a short-lived, read-only ROM capability.
2. Client creates the player frame only after the user presses Play. The player loads pinned, self-hosted EmulatorJS assets and the required core.
3. Display loading/progress and a recoverable error if resource loading fails. Only transition to `ready` on an actual emulator-ready signal.
4. Keyboard controls are scoped to the player while focused. Use the browser Gamepad API where exposed, and show a clear remapping/status surface. Test hotplug and disconnect behavior.
5. The shared input coordinator merges keyboard, controller, and optional virtual-touch frames without letting one source release another source's held action. On focus loss, page hide, disconnect, and teardown, release that source's held actions.
6. Nintendo DS needs a responsive layout for two screens (stacked and side-by-side) plus touch input mapped to the lower display. Test rotation, scaling, touch hit regions, and games that rely on both displays.
7. Nintendo 64 needs explicit mapping for the analog stick, C buttons, Z, triggers, and Start. Handle axes and dead zones; test gamepad, keyboard, and virtual-touch fallbacks. Do not assume a generic pad mapping is correct.
8. On stop, request supported battery-save export and wait for completion before disposal. Keep state save separate from SRAM/battery saves. On unload/crash, best-effort flushing is not a durability guarantee.
9. Tear down frame, input listeners, pointer capture, object URLs, WebAssembly memory, and temporary capabilities. Pause on hidden tab and resume only on explicit user action if required.

## Acceptance before a console is marked supported

- Test one legally redistributable homebrew image per console and record its license/source/checksum, but do not commit binaries unless the license permits it.
- Test current Chromium, Firefox, and Safari desktop versions selected by the project support policy, with at least one low-spec device; note required WebAssembly/WebGL capabilities.
- Verify cold load, reload, pause/resume, keyboard remapping, Xbox and PlayStation controller connection/remapping, compatible USB/Bluetooth gamepads, hot-plug, fullscreen, battery save export/import, deletion, and player teardown on real desktop browsers/devices.
- For NDS specifically test both-screen layout/touch; for N64 test analog/controller mapping and WebGL fallback behavior.
- On actual iPhone hardware, test current Safari tab and Home Screen-installed PWA separately in portrait and landscape. Record iPhone model/iOS/Safari, core and ROM test ID, FPS/frame pacing, memory pressure, audio start/resume/mute, touch latency, simultaneous multi-touch/stuck-button recovery, safe-area occlusion, scrolling/text-selection suppression, controller availability, IndexedDB write/reopen, and save export/import.
- Test iPhone Safari and installed-PWA modes with no gamepad, with each specifically advertised Bluetooth controller, and after orientation changes/background/resume. If interactive fullscreen or a controller API is unavailable, verify the documented fallback rather than treating it as a failure of feature detection.
- Do not claim full iPhone compatibility until real gameplay, input, audio, persistence, and performance all pass; label partial results per console, browser mode, and device.
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
- [W3C Gamepad API](https://www.w3.org/TR/gamepad/)
- [WebKit: Gamepad API and controller support](https://webkit.org/blog/7477/new-web-features-in-safari-10-1/)
- [WebKit: web apps on iOS/iPadOS and standalone display mode](https://webkit.org/blog/13878/)
- [Apple Developer: iOS safe areas and viewport-fit](https://developer.apple.com/videos/play/wwdc2021/10104/)
- [W3C Pointer Events: touch-action and pointer capture](https://www.w3.org/TR/pointerevents3/)
