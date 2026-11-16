# Phase 0 — Foundation

## What was built

- A strict Next.js 16 (App Router) project in TypeScript with `src/`, the `@/*`
  alias, pnpm and a committed lockfile.
- Feature-based folders for every later domain plus a design-system folder.
- A single environment layer: `src/lib/env-schema.ts` (shared schema and pure
  parsers), `src/lib/env.ts` (server-only entry point) and
  `src/lib/env.public.ts` (browser-safe values only).
- A typed `Result` helper, a typed `AppError` hierarchy and a Pino logger with
  key-based and free-text PII redaction.
- Base layout, custom not-found page, a global error boundary and a
  dependency-free health endpoint.
- ESLint (Next, type-aware strict TypeScript, security, a11y), Prettier,
  EditorConfig, Husky with lint-staged, and commitlint.
- GitHub Actions CI: install from the frozen lockfile, formatting, linting,
  type checks, unit tests with coverage thresholds, a production build with
  placeholder CI values, Chromium end-to-end smoke tests, `pnpm audit`,
  gitleaks and CodeQL. Dependabot groups dependency updates.
- README, SECURITY.md and this phase record.

## Acceptance checks

| Requirement                                      | Result                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Fresh clone runs with documented commands        | `pnpm install --frozen-lockfile` → `pnpm dev` documented in README                  |
| Lint, typecheck, tests and production build pass | All pass locally, plus Playwright end-to-end smoke tests                            |
| Build fails when a required variable is missing  | Verified: `next build` aborts naming the missing variables                          |
| No secret in the client bundle                   | `.next/static` searched for CI placeholder secrets and secret key names: none found |
| No raw SQL concatenation                         | Enforced by a unit test that walks `src/` and `tests/`                              |
| No `console.log`, TODO or FIXME in source        | Enforced by the same hygiene test suite                                             |
| Dependency audit passes                          | `pnpm audit` → no known vulnerabilities (transitive `minimatch` pinned)             |
| Baseline security headers served                 | Asserted in `tests/e2e/foundation.spec.ts`                                          |

## Notes and deliberate limitations

- The home page is a static placeholder that explicitly says the app is not
  ready for real credentials. Real screens arrive in Phases 2 and 4.
- A nonce-based Content-Security-Policy is intentionally deferred to the
  hardening phase (Phase 10), where it can be generated per request alongside
  the authenticated surface. Baseline headers are already set.
- `pnpm audit` required a pnpm `overrides` entry to force `minimatch` 11.0.1,
  because `eslint-config-next` currently resolves an older copy transitively.
  This is a dev-only dependency and can be removed when the upstream range is
  updated.

## Next phase

Phase 1 (Supabase schema, deny-all RLS and the encryption layer) can start once
this phase is approved.
