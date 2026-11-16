# Mail

A private, single-owner web mail client. This repository currently contains the
Phase 0 foundation: strict tooling, environment validation, logging and error
primitives, base routes and CI. Mail connectivity, authentication, the database
schema and the design system arrive in later phases.

Design and security requirements live in [`mailApp.md`](./mailApp.md).

## Requirements

- Node.js 22.12 or newer (see `.nvmrc`)
- pnpm 12 (the exact version is pinned in `package.json`)
- A Postgres database (Supabase) for later phases

## Local setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill every required value in .env.local; see the comments in the file.
pnpm dev
```

`next build` and `next start` validate every required variable and refuse to
continue if one is missing or malformed. Secret values are read only through
`src/lib/env.ts` (marked `server-only`); the shared schema lives in
`src/lib/env-schema.ts` so the build config validates the same contract.

## Scripts

| Script               | Purpose                                 |
| -------------------- | --------------------------------------- |
| `pnpm dev`           | Start the development server            |
| `pnpm build`         | Production build                        |
| `pnpm start`         | Serve the production build              |
| `pnpm lint`          | ESLint with security and a11y plugins   |
| `pnpm typecheck`     | TypeScript in strict mode               |
| `pnpm test`          | Vitest unit tests                       |
| `pnpm test:coverage` | Unit tests with coverage thresholds     |
| `pnpm test:e2e`      | Playwright smoke tests (needs Chromium) |
| `pnpm format`        | Prettier write                          |
| `pnpm format:check`  | Prettier check (used in CI)             |
| `pnpm audit`         | Dependency audit at high severity       |

## Environment variables

Every variable is documented in `.env.example`. Rules:

- Server values are read only through `src/lib/env.ts`, which imports
  `server-only` so an accidental client import breaks the build.
- Only `NEXT_PUBLIC_` variables may reach the browser. None of them may carry a
  secret.
- `ENCRYPTION_KEYS` is a comma-separated list of `vN:<base64>` entries holding
  32-byte keys, newest first, to support rotation in a later phase.
- `OWNER_EMAIL` is the only identity that can ever sign in.

## Architecture

```
src/
  app/            routes only (pages, layouts, route handlers)
  components/ui/  design system primitives
  features/       auth, accounts, mail, compose, schedule, settings, notes,
                  calendar, contacts
  lib/            env, logger, result and error types, security helpers
  server/         services and repositories (added in later phases)
  styles/         shared styling assets
tests/            unit and integration tests
```

Dependency direction is one way: `app` → `features` → `server` → `lib`. Feature
code never imports from `app`, and shared modules never import feature code.

## Security posture

- TypeScript strict mode with `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and unused-code checks.
- Zod validates every environment value during `next build` and at server boot;
  production refuses non-HTTPS public URLs.
- The logger redacts secrets by key name, header and free-text email pattern.
- Security headers are set in `next.config.ts`; a nonce-based CSP is added in a
  later hardening phase.
- The health endpoint returns no configuration or dependency details.
- CI runs formatting, lint, types, tests, a production build with placeholder
  CI values, `pnpm audit`, gitleaks and CodeQL.

See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability.

## Phase status

Phase 0 is complete. Work stops here until the next phase is approved.
