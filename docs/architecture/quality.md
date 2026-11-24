# Quality and CI

## Phase 1 checks

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on pushes to `main` and pull requests. It installs the committed npm lockfile, runs ESLint, checks strict TypeScript types, and builds the production Next.js application. The workflow uses read-only repository permissions and requires no service credentials.

Local equivalents:

```sh
npm ci
npm run lint
npm run typecheck
npm run build
```

Node.js 22 is used in CI. Next.js documents Node.js 20.9 as the minimum; use a supported LTS release locally.

## Current limits

Phase 2 has 48 pgTAP assertions for grants, invitation authorization, and two-user RLS isolation in `supabase/tests/0002_auth_rls.test.sql`, plus ten profile-provisioning checks in `supabase/tests/0003_profile_provisioning.test.sql`; all 58 passed on development project `pxxtzjpjtigikolauxwc`. No browser E2E suite currently validates Google OAuth, invitation, email login, logout, recovery, or account linking against a configured Supabase project. Local R2 upload tests cover validation and URL signing only. The proposed R2 migration suite has not been run, and there is no bucket/credential environment for live transfers. A build does not establish live Auth, R2 authorization/quota behavior, emulator compatibility, or save synchronization.

## Security review checklist for later phases

- Test cross-user reads and writes against PostgreSQL RLS with at least two accounts.
- Verify ownership is derived from the authenticated session, never a request body identifier.
- Exercise expired, replayed, wrong-object, and over-quota signed URL attempts.
- Verify uploads are bounded, checksummed, validated, and recoverable after interrupted transfers.
- Confirm service role and R2 secrets never enter browser bundles, logs, or CI artifacts.
- Test account deletion and object deletion/reconciliation paths.
- Keep ROMs, BIOS/firmware, user saves, and local environment files out of source control.

## Appearance and theme validation

- Validate the same routes and component states in Light, Dark, and System using the shared tokens in [the visual system](design-system.md); do not accept one screenshot or test one theme only.
- Verify saved local preference before sign-in, OS appearance changes in System mode, immediate no-reload theme switching, and first-paint behavior without a wrong-theme flash or hydration warning.
- Check WCAG AA text contrast and visible focus indicators for both palettes, including controls, disabled/selected states, notifications, and error surfaces. State must not be conveyed by color alone. Check reduced-motion behavior.
- Theme changes must not steal player focus, change keyboard/gamepad input, resize or redraw the game canvas, move virtual controls, or change touch hit regions. Exercise actual PC player and iPhone Safari/PWA flows.
- When a Supabase project is configured, test authenticated cross-device preference sync, local fallback, offline operation, sign-in after a local preference change, and sign-out. The preference is user-editable presentation metadata, never authorization data.

## Player compatibility testing

- **PC mode:** run each redistributable ROM in current Chromium, Firefox, and Safari desktop targets. Test keyboard defaults/remapping, Xbox and PlayStation pads, compatible USB/Bluetooth devices, Gamepad API availability and hot-plug, profile persistence per console, N64 analog calibration/dead zones, fullscreen entry/exit/fallback, audio, and save lifecycle.
- **iPhone mode:** use physical iPhone hardware. Record device model, iOS, Safari version, and whether tested in a Safari tab or Home Screen-installed PWA. Test portrait and landscape, safe-area insets/home indicator, touch hit targets and simultaneous multi-touch, pointer cancellation/stuck-button release, scroll/selection/context-menu behavior within controls, DS lower-screen touch, N64 virtual stick/C buttons, audio start/resume, controller exposure where available, IndexedDB after relaunch, and frame pacing/memory under gameplay.
- **Mode selection:** test capability-based suggestions with touch and non-touch devices, connected/disconnected pads, and installed PWA; verify a manual mode override always wins and that no user-agent string is required.
- Compatibility is recorded per console × core version × browser mode × device. Full iPhone support is blocked until gameplay, input, audio, persistence, and performance all pass; a layout render alone is not acceptance.
