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

There are no unit, integration, or end-to-end test suites in Phase 1. A successful build only verifies that the foundation compiles; it does not validate Supabase policies against a live project, R2 authorization/quota behavior, emulator compatibility, or save synchronization. Those acceptance checks must be added alongside the corresponding implementation phases.

## Security review checklist for later phases

- Test cross-user reads and writes against PostgreSQL RLS with at least two accounts.
- Verify ownership is derived from the authenticated session, never a request body identifier.
- Exercise expired, replayed, wrong-object, and over-quota signed URL attempts.
- Verify uploads are bounded, checksummed, validated, and recoverable after interrupted transfers.
- Confirm service role and R2 secrets never enter browser bundles, logs, or CI artifacts.
- Test account deletion and object deletion/reconciliation paths.
- Keep ROMs, BIOS/firmware, user saves, and local environment files out of source control.
