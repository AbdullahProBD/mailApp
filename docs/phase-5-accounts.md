# Phase 5 — Mail accounts, and the v2 scheduling foundation

Status: implemented and validated. Mail sync/reading starts in Phase 6.

## What was built

- **Add-account flow** (`/settings/accounts`) with provider tiles for Gmail, Outlook /
  Microsoft 365, Yahoo, iCloud, Fastmail, Zoho and custom IMAP/SMTP.
  Gmail and Microsoft are OAuth-scaffolded only until `GOOGLE_*` / `MICROSOFT_*`
  client credentials exist; the server rejects them with a clear message and the
  UI disables the action.
- **Connection test before saving** using `imapflow` (IMAP login + folder listing)
  and `nodemailer` (SMTP verify). Errors map to `invalid | auth | tls | network |
timeout` with friendly messages; raw server responses never reach the UI or logs.
- **Credential storage** through the Phase 1 AES-256-GCM module, bound to the
  `mail_accounts` row id. Credentials are decrypted only inside server code and are
  never part of the metadata returned to the browser.
- **Per-account personalization**: display name, icon colour from the Phase 4
  picker, reply-to, sync interval, default sender, and drag-and-drop / keyboard
  reordering.
- **Account health**: status badge (active, needs re-authentication, error,
  disconnected) plus a banner on the inbox for accounts that need attention.
- **Safe disconnect**: requires a fresh password + 2FA step-up and typing the
  account address exactly; deleting the row cascades to cached folders, messages
  and scheduled rows.
- **Unified inbox shell** with an account colour dot per chip and an
  "All accounts" filter that will scope the message list in Phase 6.
- **v2 time rule**: `src/lib/datetime/format.ts` is the only UI time formatter
  (`formatTime`, `formatDateTime`, `formatDate`, `formatMonthYear`), always minute
  precision. An ESLint rule rejects `Intl.DateTimeFormat` and locale methods in UI
  source, and `tests/unit/format.test.ts` scans UI files for seconds options.
- **v2 schema foundation**: migration `0010_drip_scheduling.sql` adds
  `schedule_batches`, `account_send_quota`, `scheduled_emails.batch_id` /
  `batch_position`, `UNIQUE (batch_id, batch_position)`, and a due-time index that
  still covers leased rows. Interval (5–3600 s) and count (1–500) are database
  checks. Send instants stay full-precision `timestamptz`.
- **v2 environment limits**: `DRIP_DEFAULT_INTERVAL_SECONDS` (20),
  `MAX_BATCH_SIZE` (500), `MAX_PENDING_SCHEDULED_EMAILS` (2000) and
  `DEFAULT_DAILY_SEND_CAP` (500), validated at boot.

## Security decisions

- Every account mutation runs the master-context order: authentication → owner
  authorization → same-origin check → rate limit → (step-up where required) →
  Zod validation → action → audit entry.
- Add and remove require a fresh step-up; metadata edits require a session but not
  a second step-up, because they never touch credentials.
- Rate-limit buckets are per owner: connect/delete 10 per 15 minutes; metadata,
  default-sender and reorder mutations are separately bounded.
- IMAP uses implicit TLS (`secure: true`) with certificate verification and TLS
  1.2 minimum; SMTP uses `requireTLS` on submission ports, so no plaintext
  fallback is offered.
- The repository's update schema is `.strict()`: posting credential fields to the
  metadata endpoint fails instead of silently ignoring them.

## Residual risks / not yet implemented

- **OAuth 2.0 with PKCE** is not wired: it needs registered client IDs/secrets and
  callback URLs. Until then those providers are explicitly unavailable rather
  than faked.
- **Icon upload** (image validation, re-encoding, private bucket + signed URLs) is
  not implemented; accounts use the colour/icon picker value only.
- **Manual resync, quota/storage usage and the error log** depend on the Phase 6
  mail engine and provider APIs.
- **Per-account send-as aliases and signatures** are schema-ready
  (`signature_id`) but the management UI lands with the composer.
- **Connection tests accept an arbitrary host/port** (TLS-verified). A full SSRF
  guard (private-range block, DNS re-resolution) is part of Phase 10 hardening;
  today the deployment target is serverless with no private network reachability.
- Automated tests cover the pure mapping, encryption/tamper, repository updates,
  migration constraints and the full account settings journey; a live IMAP/SMTP
  test server (GreenMail/Dovecot) is still needed for a true end-to-end connect
  test in CI.
