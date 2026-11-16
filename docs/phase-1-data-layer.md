# Phase 1 — Secure data layer

## What was built

- Ordered, checksummed SQL migrations for the full mail schema, roles, indexes,
  deny-all RLS and the append-only audit log.
- A Drizzle schema mirror and a server-only database client tuned for the
  Supabase transaction pooler.
- Repository modules for every security-sensitive table. They are the only code
  that issues SQL, and every input is validated with Zod before it reaches the
  database.
- A crypto module: AES-256-GCM envelope encryption with versioned keys, a fresh
  96-bit IV per record, AAD bound to table and row id, rotation, HMAC-SHA-256,
  constant-time comparison, and secure token, OTP and recovery-code generators.
- A development-only seed guarded against production, a post-migration schema
  verifier, and a CI job that runs migrations against a real Postgres service.
- Unit/integration tests covering migrations, crypto, repositories and the seed.

## Schema

| Group          | Tables                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Owner and auth | `owner_profile`, `mfa_methods`, `recovery_codes`, `sessions`, `auth_challenges`, `mail_sender_providers`       |
| Mail           | `mail_accounts`, `folders`, `labels`, `threads`, `messages`, `message_labels`, `message_bodies`, `attachments` |
| Composition    | `drafts`, `scheduled_emails`, `signatures`, `templates`                                                        |
| Power features | `contacts`, `rules`, `snoozes`, `notes`, `calendar_events`, `saved_searches`                                   |
| Operations     | `audit_log`, `rate_limits`, `schema_migrations`                                                                |

Conventions:

- UUID primary keys from `gen_random_uuid()`.
- `created_at` and `updated_at` on every mutable table, maintained by a shared
  trigger. `audit_log` and `recovery_codes` intentionally have no `updated_at`.
- `owner_profile` is a singleton via a unique index on a constant column.
- `messages.search_vector` is a generated `tsvector` with a GIN index.
- `scheduled_emails` has a partial due-time index and an idempotency key.
- `scheduled_emails.local_send_time` is stored without a time zone; the IANA
  zone is stored alongside it.

## Security controls

1. **Deny-all RLS.** Every public table has `ENABLE ROW LEVEL SECURITY` and no
   policies. `anon` and `authenticated` have no table or sequence privileges,
   and default privileges are revoked for future tables.
2. **Server-only database access.** `src/lib/db/client.ts` and every repository
   import `server-only`. Only the service role is used, and the browser never
   receives credentials.
3. **Encryption at rest.**
   - Format: `aesgcm.<keyVersion>.<iv>.<ciphertext+tag>` (base64url).
   - Keys: `vN:<32-byte base64>` entries, newest first; the first key encrypts
     new data, the rest decrypt during rotation.
   - AAD: `["mailapp", 1, table, rowId]`, so ciphertext moved to another row or
     table fails authentication.
   - Rotation decrypts first, so tampered rows fail instead of being carried
     forward.
   - Encrypted fields: mail account credentials and OAuth tokens, TOTP secrets,
     sender-provider credentials, cached message bodies, notes.
4. **Hashed, not encrypted.** Passwords will use Argon2id in Phase 2. Session
   tokens, OTPs and recovery codes are stored only as HMAC-SHA-256 digests and
   verified through constant-time comparison.
5. **Append-only audit log.** Privileges are revoked from `PUBLIC`, `anon` and
   `authenticated`, and triggers reject UPDATE, DELETE and TRUNCATE even for the
   owner role.
6. **Parameterized SQL only.** Repositories use Drizzle's query builder or
   parameterized `sql` templates. `sql.raw` and string-concatenated SQL are
   rejected by a unit test and by a CI grep step. The only unparameterized call
   site is the migration runner, which executes static committed files.
7. **Migration integrity.** `schema_migrations` stores a sha256 checksum per
   file; editing an applied migration fails the next run.
8. **Production seed guard.** `pnpm db:seed` refuses `NODE_ENV=production`
   before opening a connection; CI asserts the refusal.

## Repository layer

| Module                                | Responsibility                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `owner-profile.repository.ts`         | Singleton claim, setup completion, safe preference updates                   |
| `sessions.repository.ts`              | Opaque token-hash sessions, idle/absolute expiry, touch, revoke, cleanup     |
| `auth-challenges.repository.ts`       | Purpose-bound challenges, attempt budget, single consumption                 |
| `recovery-codes.repository.ts`        | Bulk replacement, lookup, atomic single use                                  |
| `mfa-methods.repository.ts`           | Encrypted secret storage, verification, preferred method, TOTP replay step   |
| `mail-accounts.repository.ts`         | Encrypted credentials, metadata-only reads, status, ordering, default sender |
| `mail-sender-providers.repository.ts` | Encrypted provider credentials, rotation, default provider                   |
| `message-bodies.repository.ts`        | Encrypted body cache with TTL and expiry cleanup                             |
| `scheduled-emails.repository.ts`      | Idempotent enqueue, `FOR UPDATE SKIP LOCKED` claim, lease reclaim, backoff   |
| `rate-limits.repository.ts`           | Atomic Postgres fallback limiter                                             |
| `audit-log.repository.ts`             | Append-only writes and bounded reads                                         |

## Acceptance checks

| Requirement                                   | Result                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Migrations apply cleanly from empty           | Covered by `tests/unit/migrations.test.ts` (PGlite) and the CI Postgres job (`pnpm db:migrate`) |
| RLS enabled on every table                    | Asserted for all public tables, plus a CI assertion against real Postgres                       |
| No policy grants `anon` or `authenticated`    | Asserted: `pg_policies` is empty and `role_table_grants` has no matching rows                   |
| `audit_log` cannot be updated or deleted      | Asserted for UPDATE, DELETE and TRUNCATE                                                        |
| Encryption round-trip and tamper detection    | 26 crypto tests: round-trip, fresh IV, flipped byte/tag, wrong AAD, unknown version, rotation   |
| Wrong-AAD failure                             | Asserted for a different row id and a different table                                           |
| No raw SQL concatenation                      | Enforced by `tests/unit/code-hygiene.test.ts` and a CI grep step                                |
| Seed refuses production                       | Unit test and CI step                                                                           |
| Repository behavior                           | 29 tests across owner, sessions, challenges, recovery, MFA, accounts, bodies, queue and limiter |
| Format, lint, types, tests, build, e2e, audit | All pass locally; `pnpm audit` reports no known vulnerabilities                                 |

Verification commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build        # with the documented required environment
pnpm test:e2e
pnpm audit
```

Current local results: 112 unit tests pass, coverage 95.39% statements / 87.70%
branches, production build succeeds, 3 Playwright tests pass, audit clean.

## Notes and deliberate limitations

- Unit and integration tests run against PGlite (real Postgres compiled to
  WASM) because the development environment has no local Postgres or Docker.
  The CI `migration` job additionally runs the same migrations against a
  Postgres 17 service and asserts the deny-all contract with `pnpm db:verify`.
- The Drizzle schema is a typed mirror; the SQL migrations remain the source of
  truth for triggers, indexes and RLS.
- Credential encryption is implemented and tested at the repository boundary,
  but no real provider adapter uses it until Phases 3–4.
- Argon2id password hashing, session issuance and the first-run wizard belong to
  Phase 2; this phase intentionally stores a nullable `password_hash` and no
  authentication routes.
- `local_send_time` is passed as a `Date`; Phase 8 will centralize the wall-clock
  conversion with the time-zone library.
- Supabase-specific concerns (connection pooler behavior, storage buckets) are
  covered by configuration and documentation; no live Supabase project is
  required for this phase.

## Next phase

Phase 2 (owner-locked authentication, first-run setup and sessions) can start
once this phase is approved.
