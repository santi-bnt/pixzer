# pixzer visual system

## Status and principles

This document defines the shared visual system for the existing Next.js application. Light, Dark, and System appearance are required throughout the product. Routes and components use one markup/component implementation and semantic tokens; do not fork the UI by theme. The visual direction is premium, minimal, and consumer-focused, with a white/red Light theme and black/red Dark theme. Do not reintroduce the former purple palette or imitate proprietary Apple layouts or assets.

## Theme palettes

| Token                          | Light     | Dark      | Purpose                                    |
| ------------------------------ | --------- | --------- | ------------------------------------------ |
| `--color-background`           | `#FFFFFF` | `#101014` | Main application canvas                    |
| `--color-background-secondary` | `#F5F5F7` | `#18181D` | Secondary areas and grouped sections       |
| `--color-surface`              | `#FFFFFF` | `#242429` | Cards, menus, dialogs                      |
| `--color-text-primary`         | `#1D1D1F` | `#FFFFFF` | Main text and icons                        |
| `--color-text-secondary`       | `#6E6E73` | `#A1A1AA` | Supporting text                            |
| `--color-accent`               | `#D71920` | `#FF4545` | Brand, links, selected and primary actions |

Expose semantic tokens for borders, separators, hover/pressed states, disabled controls, success/warning/error surfaces, focus indicators, shadows, and scrims as well. Derive them per theme; avoid scattering raw palette literals through route JSX. A red accent is not a substitute for semantic status colors. Focus rings must remain visible against both cards and the page background.

The primary requested pairings exceed WCAG AA's 4.5:1 normal-text contrast threshold when used as written: Light secondary text on white is about 5.07:1, Light red on white about 5.19:1, Dark secondary text on the dark base about 7.41:1, and Dark red on the dark base about 5.59:1. For red-filled controls, use a tested foreground such as `#101014` in Dark rather than assuming white text passes. Recheck every actual component pairing, including hover/disabled states, borders and focus indicators; palette-level ratios do not certify every UI state. Do not encode selection or errors by color alone.

## Appearance preference and first paint

The setting has exactly three values: `light`, `dark`, and `system`. Store the user's chosen value, not just the resolved color scheme. Before authentication, persist it locally. System follows `prefers-color-scheme` and responds to OS appearance changes while selected. Light and Dark ignore OS changes until the user chooses System.

Apply the effective theme on the document root through a stable attribute such as `data-theme`. On initial navigation, resolve the local choice and OS preference before the first rendered frame, using a small synchronous pre-paint initializer or an equivalent server-readable preference mechanism. Do not wait for a React effect after hydration; that creates a flash of the wrong palette. Keep the server fallback deterministic and avoid hydration mismatches. Theme selection updates tokens immediately without navigation or page reload.

For authenticated users, the local choice is the immediate fallback and the account preference is synchronized using Supabase Auth `user_metadata.appearance`. On sign-in, load the account preference and apply it after the authenticated preference is verified; retain a safe local choice while offline. User metadata is user-editable and is only a presentation preference, never an authorization input. On sign-out, continue with the device-local value. Theme synchronization stays independent of game/save data and does not require a service-role key or database schema change.

Theme transitions should be subtle. Disable or shorten decorative transitions under `prefers-reduced-motion: reduce`; never animate the emulator viewport, controls, or content in a way that changes layout during play.

## Component coverage

Use the same semantic components and tokens for navigation, landing page, login/invite/recovery, dashboard and library, game cards, upload states, settings, dialogs, toasts, skeletons, empty/error states, and player chrome. Include the appearance setting in Settings as a labeled radio group or select with Light, Dark, and System choices, with a visible selected state and keyboard operation.

Theme work changes presentation only. Do not create separate theme-specific route/component trees or use theme switches to change permissions, storage, emulator settings, input mappings, or saves. Keep the game canvas isolated from application surface tokens. A theme update must not steal keyboard focus, synthesize input, alter gamepad state, modify touch hit target geometry, or interfere with virtual control pointer capture.

## PC and iPhone requirements

- PC mode uses the same theme preference as the library. Theme controls remain outside the focused gameplay keyboard surface. Appearance changes must not intercept keyboard mappings, blur the player unexpectedly, alter controller profiles, or block fullscreen.
- iPhone Safari and installed PWA support all three preferences. System mode follows iOS appearance changes without reloading. Respect `env(safe-area-inset-*)` for application chrome and keep notch/home-indicator spacing stable during theme changes.
- The touch overlay can use theme-aware colors, but its control positions, sizes, opacity preference, multi-touch handling, and active-pointer tracking stay independent. Restrict `touch-action`, text-selection prevention, and context-menu suppression to active game controls.
- Do not claim full iPhone theme or gameplay compatibility from desktop emulation alone. Test Safari tab and installed PWA separately.

## Acceptance and QA

1. Render every route and shared state in Light, Dark, and System, including forms, dialogs, errors, empty states, disabled controls, navigation, and game/player chrome.
2. Verify local choice survives reload and works signed out; verify System follows OS changes; confirm changing between themes is immediate and does not reload the route.
3. Reload under each stored choice and inspect first paint for a wrong-theme flash and hydration warnings.
4. Check text, controls, focus rings, selected/disabled states, and error/status messages for contrast and non-color cues. Include reduced-motion preference checks.
5. In desktop player mode verify keyboard focus/mappings, controller input, fullscreen, and canvas output are unaffected by theme changes. In actual iPhone Safari and installed PWA test safe areas, orientation, multi-touch controls, and live System appearance changes.
6. When a Supabase project is configured, test device-local fallback, signed-in cross-device preference sync, offline behavior, sign-in after changing a local preference, and sign-out. Cloud sync is best effort and unverified until tested against an authenticated project.

Theme support is a visual preference; it does not change the separate per-console compatibility gates in [emulator architecture](emulation.md) or the device test policy in [quality](quality.md).
