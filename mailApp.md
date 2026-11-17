# Master Prompt: Secure Next.js Mail App (Step-by-Step)

Nov 16, 2026 · @AbdullahProBD

## How to use this prompt, and the Master Context

Paste the Master Context below into your coding agent once (or save it as AGENTS.md or CLAUDE.md in the repo root), then paste one Phase prompt at a time. Never start a phase until the previous phase's acceptance checks pass.

**MASTER CONTEXT (paste first)**

Role: You are a senior full-stack and application-security engineer. You are building \[APP\_NAME\], a private, single-owner, production-grade web mail client with the quality bar of Superhuman, Hey and Gmail web. Stack: Next.js on Vercel, Supabase (Postgres) as the database.

Product summary:

- Single-owner app. The owner's email lives in the env var OWNER\_EMAIL. Nobody else can ever sign in. There is no public sign-up and no password-reset-by-email that bypasses 2FA.
- First run: a locked setup wizard asks for the owner email (must equal OWNER\_EMAIL), then a password, then a 2FA method (email OTP through a chosen email provider, or an authenticator app). After setup, every login is username (the owner email) + password + 2FA.
- After login the owner connects many external mail accounts, sets each account's icon and icon colour, writes and reads mail, and can schedule sends in a chosen time zone.
- UI: premium and professional. Every control is a custom-designed component (dropdown, scrollbar, date and time picker, calendar, notes, toasts, dialogs). Every data-loading layout shows skeleton loaders. Motion is smooth and never blocks input.

**Non-negotiable engineering rules**

1. TypeScript strict mode. No `any`, no non-null assertions without a comment, no ts-ignore.
2. Validate every input on the server with Zod (server actions, route handlers, webhooks, cron). Validate environment variables at boot and fail fast if one is missing or malformed.
3. Secrets never reach the client bundle, logs, error messages or URLs. Only variables with the NEXT\_PUBLIC\_ prefix may be public, and none of them may be a secret.
4. Supabase is accessed server-side only, with the service-role key. The browser never talks to Supabase. Row Level Security is enabled on every table with no permissive policies (deny-all) as a second wall.
5. Every state-changing endpoint performs, in this order: authentication, owner authorization, origin/CSRF check, rate limit, input validation, the action, an audit-log entry.
6. Security target: OWASP ASVS Level 2 overall, Level 3 for authentication, session management and cryptography. Follow OWASP Top 10 and the OWASP Cheat Sheet Series.
7. No placeholder, mock, fake-security or TODO code in finished work. If a requirement cannot be met safely, stop and ask me instead of working around it.
8. Use only actively maintained, widely used libraries. Verify the latest stable versions and current APIs in official documentation before using them. Pin versions, commit the lockfile, and run the dependency audit in CI.
9. Code quality: feature-based folders, small single-purpose modules, descriptive names, typed error results instead of thrown strings, no console.log (use a structured logger with secret and PII redaction), comments only where the reason is not obvious (always on security-critical code).
10. Accessibility: WCAG 2.2 AA, full keyboard operation, visible focus, correct ARIA, respects prefers-reduced-motion and prefers-color-scheme.
11. Constant-time comparison for every secret, token or code check. Generic error messages for auth failures (no account enumeration).

**Working protocol for every phase**

1. Before coding, restate the plan in a few lines and list your assumptions and open questions. If anything is ambiguous, ask first.
2. Implement the phase fully.
3. Run lint, typecheck, unit tests, end-to-end tests and a production build. All must pass.
4. Self-review the diff against the Security Checklist in Phase 10 and fix findings.
5. Reply with a short report: what was built, key files, security decisions, known limitations, and whether the next phase can start.
6. Stop and wait for me to say "continue".

## Architecture decisions the agent must follow

Paste this right after the Master Context. These choices remove the biggest risks (hijacked setup, leaked mail credentials, Vercel serverless limits) before any code exists.

1. **Custom owner-only auth, not Supabase Auth.** Passwords are hashed with Argon2id. Sessions are opaque random tokens; only a hash is stored in the database. The cookie uses the \_\_Host- prefix with HttpOnly, Secure and SameSite=Strict. Supabase is used purely as Postgres.
2. **Setup cannot be hijacked.** The first-run wizard requires three proofs: the email equals OWNER\_EMAIL, a one-time SETUP\_TOKEN from env is entered, and a 2FA method is verified before setup completes. When setup finishes, a database singleton row makes every setup route return 404 forever.
3. **OTP delivery.** A MailSender interface with adapters for Resend, Postmark, Amazon SES and plain SMTP sends the OTP to OWNER\_EMAIL. In the wizard the owner picks the provider and enters its credentials, which are stored encrypted. Env defaults are also supported.
4. **Encryption at rest.** AES-256-GCM with versioned keys from env (supports key rotation), a random 96-bit IV per record, and the row id as authenticated data. Encrypted fields: mail account passwords, OAuth tokens, TOTP secret, email-provider credentials, cached message bodies. Hashed (not encrypted): passwords (Argon2id), session tokens, OTPs and recovery codes (HMAC-SHA-256).
5. **Mail connectivity behind one MailProvider interface.** Adapter A uses OAuth2 provider APIs (Gmail API, Microsoft Graph), which suit serverless best. Adapter B uses generic IMAP and SMTP (imapflow, nodemailer) with app passwords. Vercel functions cannot hold long-lived connections, so connect on demand, sync incrementally (UID, UIDVALIDITY, history IDs, delta tokens), and cache metadata in Postgres. New-mail freshness comes from polling plus signed provider webhooks. Use the Node.js runtime, not Edge, for crypto and IMAP.
6. **Scheduled send is a database queue.** Table scheduled\_emails stores the send time in UTC plus the IANA time zone, with a state machine (scheduled, sending, sent, failed, cancelled). A dispatcher endpoint runs every minute, claims rows with FOR UPDATE SKIP LOCKED, is idempotent, retries with exponential backoff, and dead-letters after the limit. Vercel cron frequency depends on your plan, so check the current Vercel docs; if per-minute is unavailable, trigger the endpoint with Supabase pg\_cron plus pg\_net or Upstash QStash. The endpoint is protected by a CRON\_SECRET bearer token compared in constant time.
7. **Rate limiting and lockout** with Upstash Redis (@upstash/ratelimit): per IP and per account, with progressive delays and temporary lockout on login, OTP, TOTP and recovery-code endpoints.
8. **Untrusted email is hostile.** Sanitize HTML on the server, render it in a sandboxed iframe with no scripts and a strict CSP, block remote images by default (per-sender allow), proxy allowed images so the owner's IP and open-tracking never leak, strip tracking pixels, and rewrite links to show the real destination with a warning on suspicious ones.
9. **Stack.** Next.js latest stable (App Router, Server Components, Server Actions), React, TypeScript strict, Tailwind CSS, React Aria Components as the accessible headless base that is fully restyled (dropdown, calendar, date and time picker, dialogs), Motion (Framer Motion) for animation, TanStack Query for client data, Zustand for small UI state, TipTap for the composer, Zod, date-fns with its time-zone support (or Temporal), Drizzle ORM with committed SQL migrations through the Supabase pooler, @node-rs/argon2, otpauth, qrcode, DOMPurify, Vitest, Testing Library, Playwright, axe-core, ESLint with security plugins, Prettier, Husky, lint-staged, GitHub Actions, Sentry with PII scrubbing.

## Phase 0: Project foundation, tooling and CI

**PROMPT TO PASTE**

Goal: create a clean, strict, production-ready Next.js repository that every later phase builds on.

Tasks:

1. Scaffold Next.js (latest stable, App Router, TypeScript strict, src directory, import alias @/). Use pnpm and commit the lockfile. Set the Node version in package.json engines and .nvmrc.
2. Feature-based structure: src/app (routes only), src/features/{auth,accounts,mail,compose,schedule,settings,notes,calendar,contacts}, src/components/ui (design system), src/lib (crypto, db, env, logger, rate-limit, security), src/server (services, repositories), src/styles, tests.
3. Environment layer: a single src/lib/env.ts that validates server and client variables with Zod at boot. Create .env.example listing every variable with a comment and NO real values: OWNER\_EMAIL, SETUP\_TOKEN, DATABASE\_URL, SUPABASE\_URL, SUPABASE\_SERVICE\_ROLE\_KEY, ENCRYPTION\_KEYS (versioned), SESSION\_PEPPER, CRON\_SECRET, UPSTASH\_REDIS\_REST\_URL and TOKEN, APP\_URL, provider OAuth client IDs and secrets, Sentry DSN. Mark the file server-only with the server-only package so a client import fails the build.
4. Tooling: ESLint (next, typescript-eslint strict, eslint-plugin-security, jsx-a11y), Prettier, Husky pre-commit with lint-staged, commitlint (Conventional Commits), EditorConfig.
5. Structured logger with redaction of passwords, tokens, cookies, authorization headers, OTPs and email addresses in error paths. A typed Result helper and a typed AppError hierarchy.
6. GitHub Actions CI: install with frozen lockfile, lint, typecheck, unit tests, build, dependency audit, secret scanning (gitleaks), and CodeQL. Dependabot or Renovate config.
7. Base layout, global error boundary, not-found page, and a health endpoint that returns no sensitive data.
8. Write README.md (local setup, scripts, env guide, architecture overview) and a SECURITY.md describing how to report vulnerabilities.

Acceptance: a fresh clone runs with the documented commands; CI is green; the build fails if a required env variable is missing; no secret appears in the client bundle (verify by inspecting the build output).

## Phase 1: Supabase schema, deny-all RLS and the encryption layer

**PROMPT TO PASTE**

Goal: build the secure data layer. Nothing else may touch the database except through it.

Tasks:

1. Create SQL migrations (committed, ordered, reversible where possible) for these tables, all with uuid primary keys, created\_at and updated\_at, and ENABLE ROW LEVEL SECURITY with no policies for anon and authenticated roles:
   - owner\_profile (singleton enforced by a unique constraint on a constant column): email, password\_hash, setup\_completed\_at, timezone, locale, theme.
   - mfa\_methods: type (email\_otp or totp), encrypted secret, verified\_at, preferred flag.
   - mail\_sender\_providers: kind (resend, postmark, ses, smtp), encrypted credentials, from address.
   - recovery\_codes: HMAC hash, used\_at.
   - sessions: token hash, created\_at, last\_seen\_at, idle and absolute expiry, ip hash, user agent, mfa\_verified\_at, revoked\_at.
   - auth\_challenges: purpose, code hash, attempts, expires\_at, consumed\_at.
   - mail\_accounts: provider type, address, display name, icon, icon\_color, encrypted credentials or OAuth tokens, sync state, status, sort order.
   - folders, labels, messages (metadata, snippet, flags, thread id, received\_at), message\_bodies (encrypted cache with TTL), attachments (metadata only), threads.
   - drafts, scheduled\_emails (UTC send time plus IANA zone, state, attempts, last\_error, idempotency key), signatures, templates, contacts, rules, snoozes, notes, calendar\_events, saved\_searches.
   - audit\_log (append-only: revoke UPDATE and DELETE), rate\_limit fallback table.
2. Indexes for every query path (inbox listing, thread lookup, full-text search with a tsvector GIN index, scheduled\_emails due-time partial index).
3. Database client module marked server-only, using the Supabase pooler in transaction mode, with prepared-statement settings that work on serverless. A repository layer per feature, with parameterized queries only (no string-built SQL).
4. Crypto module src/lib/crypto: AES-256-GCM encrypt and decrypt with versioned keys, random IV, AAD bound to table and row id, key rotation helper that re-encrypts rows, and tests for tamper detection and wrong-AAD failure. Plus HMAC helper, secure random token helper, constant-time compare.
5. A migration test that runs against a local Postgres and asserts: RLS is enabled on every table, no policy grants access to anon or authenticated, and audit\_log cannot be updated or deleted.
6. Seed script for development only, guarded so it refuses to run in production.

Acceptance: migrations apply cleanly from empty; the RLS test passes; encryption round-trip and tamper tests pass; no raw SQL concatenation exists anywhere (verify with a grep rule in CI).

## Phase 2: Owner-locked authentication, first-run setup and sessions

**PROMPT TO PASTE**

Goal: implement the login system exactly as specified, with no way for anyone but the owner to get in.

First-run setup wizard (route /setup, reachable only while owner\_profile.setup\_completed\_at is null, otherwise 404):

1. Step 1, identity: owner enters the email. It must be a syntactically valid email and equal OWNER\_EMAIL (compare normalized, constant time). They also enter SETUP\_TOKEN. Wrong input returns one generic error. Rate limit hard (5 attempts per 15 minutes per IP, global cap too).
2. Step 2, password: enforce a strong policy (minimum 12 characters, a strength meter using zxcvbn, check against the Have I Been Pwned range API with k-anonymity, reject the email itself). Hash with Argon2id using OWASP-recommended parameters. Never log or echo the password.
3. Step 3, 2FA method: owner chooses either (a) email OTP, with a provider picker (Resend, Postmark, SES, SMTP), a credentials form, a send-test-code action, and code entry; or (b) authenticator app, with a QR code and manual key, then a 6-digit verification. Setup is not complete until the chosen method is verified. Allow adding the second method later in settings.
4. Step 4, recovery codes: generate 10 single-use codes, show them once with copy and download actions, store only HMAC hashes, require the owner to confirm they saved them.
5. Finalize in one database transaction: set setup\_completed\_at, create the first session, write audit entries. Abandoned setup is resumable with the same SETUP\_TOKEN and leaves no usable login.

Login (route /login):

- Username field (the owner email) and password. Always run the Argon2 verify even when the email is wrong (dummy hash) so response time does not reveal anything. Generic failure message. Progressive delay and temporary lockout, and an audit entry for each failure.
- After a correct password, create a pre-auth challenge (short-lived, single-use, bound to the browser) that only unlocks the 2FA screen. No session exists yet.
- Forgot password: only possible by proving a recovery code or the 2FA method plus OWNER\_EMAIL OTP. Never a plain emailed reset link.

Sessions and cookies:

- 256-bit random token, SHA-256 hash stored. Cookie name with the \_\_Host- prefix, HttpOnly, Secure, SameSite=Strict, Path=/. Rotate the token on login, on privilege change and on 2FA completion.
- Idle timeout (default 30 minutes, configurable) and absolute timeout (default 12 hours, configurable). Sliding refresh throttled to once per minute.
- Middleware or a server-only getOwner() guard protects every authenticated route, server action and route handler. Deny by default: unauthenticated users can only reach /login, /setup (while open) and explicitly public endpoints.
- Logout revokes the server-side session. Optional remember-this-device is limited to skipping nothing but the idle timeout, never 2FA, and can be turned off.
- Settings page for sessions: list devices (browser, OS, approximate location, last active), revoke one or all others, "log out everywhere".
- Origin and Fetch-Metadata checks on every mutating request, plus Server Actions' built-in protections; a CSRF token for route handlers.

Acceptance: automated tests cover setup lockout after completion, wrong-token rejection, timing-safe paths, lockout thresholds, session fixation (token changes after login), idle and absolute expiry, revoked session rejection, and CSRF rejection. A manual attacker checklist is added to docs/security/auth-tests.md.

## Phase 3: Two-factor authentication, recovery and step-up checks

**PROMPT TO PASTE**

Goal: make 2FA mandatory, resistant to brute force and replay, and usable.

Tasks:

1. **Email OTP:** 6 to 8 digits from a CSPRNG, stored only as an HMAC with the challenge id, valid 10 minutes, single use, maximum 5 attempts then the challenge dies, resend cooldown of 60 seconds with a daily cap. The email is plain, branded, and states the request time, approximate location and device, with a "this wasn't me" line. Delivery goes through the MailSender interface with provider errors mapped to friendly messages and no secrets in logs.
2. **Authenticator app (TOTP):** RFC 6238 with otpauth, 30-second step, accept at most one step of drift, store the last used time step and reject replays. Secret stored encrypted. Enrolment shows a QR code and manual key once.
3. **Recovery codes:** 10 single-use codes, regenerate (invalidates the old set) only after step-up. A used code triggers an alert email and an audit entry.
4. **Method management in settings:** add or remove methods, set the preferred method, send a test. The owner can never remove the last verified method.
5. **Step-up authentication:** a fresh password plus 2FA check (valid for 10 minutes) is required before: adding or removing a mail account, viewing or changing credentials, changing password, changing 2FA, exporting data, deleting data, revoking sessions in bulk.
6. **Security notifications:** email the owner (through the OTP provider) on new device login, password change, 2FA change, recovery code use and repeated failed attempts. Provide a settings toggle for non-critical ones; critical ones are always on.
7. **Optional, behind a feature flag:** passkeys (WebAuthn) as a phishing-resistant second factor, using a maintained library such as SimpleWebAuthn. Build the interface so it can be added without refactoring.

Acceptance: tests prove expiry, single use, attempt limit, resend cooldown, replay rejection for TOTP, last-method protection, and that sensitive actions fail without a fresh step-up. The 2FA screens are fully keyboard operable, auto-advance between digit boxes, support paste of the whole code and the OS one-time-code autofill.

## Phase 4: Premium design system, custom components and skeletons

**PROMPT TO PASTE**

Goal: build the visual foundation and a complete custom component library before any mail screen, so every later screen looks premium and consistent.

Design direction:

- Calm, confident, high-end productivity feel (think Linear, Superhuman, Arc). Generous spacing, a 4px grid, one refined accent colour, subtle depth through layered surfaces, soft shadows, hairline borders, and restrained glass effects used sparingly.
- Design tokens as CSS variables: colour scales (neutral, accent, success, warning, danger), semantic surfaces, radii, shadows, spacing, z-index, motion durations and easings, typography scale. Light, dark and system themes with no flash on load, plus an accent colour picker and density setting (comfortable, compact).
- Typography: a modern variable font (self-hosted with next/font), tabular numbers for dates and counts, carefully tuned line heights.
- Motion: 120 to 240 ms eased transitions, spring for panels and sheets, list items animate in and out, layout animations for reorder, all disabled under prefers-reduced-motion. Never block input while animating.

Components (all custom-styled on accessible headless primitives; native browser UI is never visible):

1. Button, IconButton, SplitButton, Toggle, Checkbox, Radio, Switch, Slider, Badge, Chip and tag input, Avatar with fallback initials, Tooltip, Kbd hint.
2. **Custom Select, Combobox and Dropdown menu** with search, groups, icons, keyboard type-ahead, multi-select, nested submenus and context menus.
3. **Custom scrollbar:** thin, auto-hiding overlay scrollbar for every scroll area (CSS scrollbar-width and ::-webkit-scrollbar styling or a maintained overlay library), keyboard and touch friendly, themed.
4. **Custom Calendar and Date picker, Time picker and Date-time picker:** month and year quick switch, keyboard navigation, min and max dates, quick presets (later today, tomorrow morning, next Monday), 12 or 24 hour display, minute stepping, and a time zone selector with search over IANA zones showing the current offset and local time. Values are always returned as an instant in UTC plus the IANA zone.
5. Dialog, Drawer, Sheet, Popover, Command palette (Cmd or Ctrl K), Toast with undo action, Alert banner, Progress and spinner, Tabs, Accordion, Breadcrumb, Pagination, Resizable split panes, Empty state, Error state.
6. Rich notes widget (small TipTap-based editor with checklists) reused by the Notes feature.
7. Icon system: one consistent icon set, plus an icon-and-colour picker (searchable icon grid, curated palette with custom hex input, live preview) that will be reused for mail accounts, labels and folders.
8. **Skeleton system:** a Skeleton primitive with a shimmer that respects reduced motion, and a dedicated skeleton for every layout (sidebar, message list row, message reader, thread, composer, settings page, calendar, contacts list, notes list). Skeletons match the real layout dimensions exactly so there is zero layout shift. Use Suspense boundaries and loading.tsx for every route segment.
9. Storybook (or an equivalent isolated gallery route that is disabled in production) documenting each component with all states: default, hover, focus, active, disabled, loading, error. Add automated accessibility checks (axe) and visual regression snapshots.

App shell: resizable three-pane layout (sidebar, message list, reader) that collapses gracefully to a two-pane and single-pane mobile layout with bottom navigation and swipe actions, plus a polished login, setup and 2FA screen set using these components.

Acceptance: every component is keyboard accessible and passes axe with no violations; the date-time picker returns correct UTC values across DST changes (tests for at least 5 zones); skeletons produce no layout shift (check CLS in Lighthouse); the gallery covers every state.

## Phase 5: Connecting mail accounts, per-account icon and colour, settings

**PROMPT TO PASTE**

Goal: let the owner add, manage and personalize unlimited mail accounts safely.

Tasks:

1. **Add-account flow** (step-up required): a guided dialog with provider tiles (Gmail, Outlook and Microsoft 365, Yahoo, iCloud, Fastmail, Zoho, custom IMAP and SMTP). Gmail and Microsoft use OAuth 2.0 with PKCE and a state parameter bound to the session; request least-privilege scopes only. Other providers use IMAP and SMTP with an app password, with server presets and an advanced form for host, port and security (TLS required; refuse plaintext, validate certificates, no insecure fallback).
2. **Connection test before saving:** verify IMAP login, SMTP login and folder listing, then show a clear success or a specific, friendly failure (wrong password, app password needed, 2FA required at provider, blocked by provider). Never reveal raw server responses that contain secrets.
3. **Credential storage:** encrypt with the Phase 1 crypto module, decrypt only inside server code at the moment of use, never send credentials to the browser, and never display them again after saving. OAuth refresh tokens are rotated and refresh failures mark the account as needs reauthentication with a banner and a one-click reconnect.
4. **Per-account personalization:** display name, an icon chosen from the icon library or an uploaded image (validated type and size, re-encoded server-side, stored in Supabase Storage with a private bucket and signed URLs), and an icon colour from the colour picker. The icon and colour appear consistently in the account switcher, unified inbox rows, composer from-field, notifications and calendar. Support drag-and-drop reordering of accounts, a default sending account, and per-account signature, send-as aliases, reply-to, and sync interval.
5. **Account health:** status dot, last sync time, quota and storage usage when the provider exposes it, error log, a manual resync, and a safe disconnect that deletes cached mail and credentials after a confirmation that requires typing the account address.
6. **Unified and per-account views:** unified inbox with the account colour dot on each row, and a filter chip to focus one account.
7. **Settings area** (route /settings, each page with its own skeleton): General (language, theme, accent, density, start page), Time zone and formats (default time zone with searchable IANA picker, 12 or 24 hour, date format, first day of week), Accounts, Signatures, Templates, Notifications (in-app, browser push, quiet hours), Reading (remote image policy, conversation view, mark-as-read delay, reading pane position), Composing (default font, reply behaviour, undo-send window of 5 to 30 seconds), Rules and filters, Labels and folders, Keyboard shortcuts (view and rebind), Security (password, 2FA methods, recovery codes, sessions, audit log viewer), Data and privacy (export, import, delete everything), and About.
8. Every setting is validated, saved optimistically with rollback on error, and applied instantly without a reload.

Acceptance: adding, editing, reordering and removing accounts works end to end against at least one OAuth provider and one generic IMAP and SMTP server (use a local test server such as GreenMail or Dovecot in tests); credentials never appear in any network response, log or client bundle (add an automated test that scans responses); icon uploads reject non-images and oversized files.

## Phase 6: Mail engine, reading, search and safe rendering

**PROMPT TO PASTE**

Goal: a fast, reliable reading experience across all connected accounts.

Tasks:

1. **Sync service** behind the MailProvider interface (Gmail API, Microsoft Graph, IMAP). Initial sync loads recent headers first (for example the last 30 days) so the inbox appears quickly, then backfills in the background in resumable chunks that respect the serverless time limit. Incremental sync uses history IDs, delta tokens or UID and UIDVALIDITY (handle UIDVALIDITY changes by resync). Idempotent upserts, per-account locks so two syncs never overlap, exponential backoff on provider rate limits, and a sync status object the UI can display.
2. **Freshness:** TanStack Query polling with focus and reconnect refetch, plus signed webhook endpoints (Gmail Pub/Sub push, Microsoft Graph subscriptions) that verify signatures and trigger a targeted sync. Subscription renewals run from the scheduled dispatcher.
3. **Message list:** virtualized (TanStack Virtual) infinite list with cursor pagination, skeleton rows, sender avatar or account icon, unread weight, snippet, attachment icon, label chips, relative time in the owner's time zone, hover quick actions (archive, delete, snooze, mark read), multi-select with shift-click and range, and bulk actions with undo toasts.
4. **Folders and navigation:** Inbox, Starred, Snoozed, Sent, Drafts, Scheduled, Outbox, Archive, Spam, Trash, All Mail, user labels or folders with nested structure and colours, unread counters, and a Focused or Other split as an optional setting.
5. **Conversation view:** thread grouping by References and In-Reply-To (and provider thread IDs), collapsed older messages, quoted-text folding, expand all, per-message actions, and inline reply.
6. **Reader pane:** sanitized HTML rendered in a sandboxed iframe (no scripts, no same-origin, strict CSP, dark-mode adaptation), plain-text fallback, remote images blocked by default with a clear banner and "load once", "always for this sender" options, image proxy for allowed images, link hover shows the true URL, suspicious-link and lookalike-domain warnings, mailto handling, and a visible phishing-risk banner when SPF, DKIM or DMARC fail or the display name spoofs a known contact.
7. **Attachments:** list with type icons and size, image and PDF preview in a modal, streamed download through an authenticated route with Content-Disposition attachment, X-Content-Type-Options nosniff and size limits, never served from the app origin as executable content. Provide a pluggable virus-scan hook.
8. **Search:** instant search across accounts using Postgres full-text search (tsvector with GIN), operators (from:, to:, subject:, has:attachment, is:unread, is:starred, before:, after:, label:, account:), a query builder with the custom date picker, search history, and saved searches. Fall back to provider-side search for mail not yet synced.
9. **Actions:** archive, delete, move, spam and not-spam, star, flag, mark read and unread, label, mute thread, report phishing, print, view source and headers, download .eml, and every action is applied optimistically and synced to the provider with retry and rollback.
10. **Unsubscribe helper:** detect List-Unsubscribe and offer one-click unsubscribe (RFC 8058 POST) with confirmation.
11. Cached bodies are stored encrypted with a TTL and cleaned by a scheduled job. Never cache more than needed.

Acceptance: sanitizer test suite using known XSS payloads (script tags, event handlers, javascript: URLs, SVG and CSS expression vectors, form posts, meta refresh, base tag) shows zero execution; inbox with 50,000 messages scrolls at 60 fps; initial sync shows content in under 3 seconds on a 1,000 message account; threads and search are verified by integration tests against the local IMAP test server.

## Phase 7: Composer, drafts, signatures, templates and contacts

**PROMPT TO PASTE**

Goal: a best-in-class writing experience.

Tasks:

1. **Composer** as a floating window, minimizable dock and full-screen mode, supporting several drafts at once. TipTap rich text with headings, bold, italic, underline, strike, colour, lists, checklists, quotes, code, tables, links with validation, inline images, emoji picker, and a plain-text mode. Paste cleaning that strips dangerous markup, and a sanitized HTML plus text/plain multipart output.
2. **Fields:** From (account chip with icon and colour, plus send-as aliases), To, Cc, Bcc as recipient tokens with contact autocomplete, paste of many addresses, drag between fields, address validation (RFC syntax, optional MX lookup), duplicate detection, and a warning for external or unusual recipients.
3. **Drafts:** autosave every few seconds with a saved indicator, conflict-safe versioning, synced to the provider Drafts folder, recoverable after a crash, and listed under Drafts with skeleton states.
4. **Attachments:** drag and drop and paste, chunked upload with progress and cancel, size limits per provider, type allow or deny list, inline versus attached, and a warning when the text mentions an attachment but none is attached.
5. **Send safety:** undo send window (configurable), pre-send checks (missing subject, missing attachment, large recipient list, empty body), confirm when replying all to many people, and plain-text fallback generation.
6. **Reply, reply all, forward, forward as attachment, edit as new,** with correct quoting, headers (In-Reply-To, References) and subject prefix handling.
7. **Signatures:** multiple per account and per identity, rich editor, auto-insert rules, and sanitized storage.
8. **Templates and snippets:** named templates with variables (recipient name, date), quick insert with a slash command, and a template picker.
9. **Contacts:** address book built from sent and received mail plus manual entries, groups, avatars, notes, per-contact history, import and export (CSV, vCard), merge duplicates, and a contact card popover in the reader.
10. **Delivery:** send through the MailProvider (Gmail API, Graph, SMTP), store the sent copy, handle failures with an Outbox that retries and reports clearly, and bounce detection surfaced as a notice on the thread.
11. Optional behind a flag: read receipts requested only on explicit action, and PGP or S/MIME signing and encryption designed as a pluggable module.

Acceptance: header correctness tests against RFC 5322 and threading; draft autosave survives a reload and a network drop; header and CRLF injection attempts in To, Subject and attachment names are rejected (add explicit tests); the composer is fully keyboard operable.

## Phase 8: Scheduled send with time zones, queue and retries

**PROMPT TO PASTE**

Goal: schedule mail reliably, exactly once, at the right local time.

Tasks:

1. **Schedule UI** in the composer: a Send split button with Send now, Schedule send, and presets (this afternoon, tomorrow morning, Monday morning, custom). Custom opens the custom date-time picker with a time zone selector (searchable IANA list with offsets, the owner's default pre-selected, a preview line such as "Tue 17 Nov, 09:00 Europe/London, which is 04:00 for you"). Block past times and warn when the chosen local time falls in a DST gap or fold, then resolve it explicitly.
2. **Storage:** persist the instant in UTC, the IANA zone the user chose, and the original local wall-clock time. Never store offsets alone. Use a single tested time library function for all conversions.
3. **Scheduled view** (route /scheduled and a folder entry): list with skeletons, account icon and colour, recipient, subject, send time in the sender's zone and the owner's zone, countdown, and actions: edit (returns to the composer), reschedule, send now, cancel, duplicate. Group by day with a calendar strip.
4. **Dispatcher** endpoint (POST, CRON\_SECRET bearer compared in constant time, optional IP allow list, no response body details): claims due rows atomically with FOR UPDATE SKIP LOCKED in a short transaction, marks them sending with a lease, sends through the MailProvider, writes the sent copy, then marks sent. Idempotency key per row so a retry after a crash never double-sends. Lease expiry returns stuck rows to the queue.
5. **Failure handling:** exponential backoff with jitter, a retry cap, then failed with a clear reason, a notification and an Outbox entry the owner can retry or edit. Account needs-reauth pauses its rows instead of failing them.
6. **Triggering:** per-minute trigger through Vercel Cron if the plan allows, else Supabase pg\_cron plus pg\_net or Upstash QStash, documented in docs/ops/scheduler.md with the exact setup steps. The same dispatcher runs maintenance jobs: webhook subscription renewal, snooze wake-ups, cache expiry, expired session and challenge cleanup, audit log retention.
7. **Other time-based features reusing the same engine:** send-later for replies, snooze until a time, follow-up reminders ("remind me if no reply in 3 days"), and recurring scheduled sends as an optional extension.
8. **Time zone settings:** a default time zone in settings, per-schedule override, automatic browser time zone detection with a prompt when it differs from the setting, and consistent time formatting across the app.

Acceptance: tests simulate a crash between claim and send, concurrent dispatchers, DST spring-forward and fall-back cases in at least 5 zones, a leap day, and clock skew; verify exactly-once delivery, correct local-time display, and that cancelled or edited messages never send.

## Phase 9: Professional power features

**PROMPT TO PASTE**

Goal: the features that make a mail app feel complete and premium. Build each as an isolated feature module with its own tests and skeleton.

Tasks:

1. **Command palette and keyboard shortcuts:** Cmd or Ctrl K for every action and navigation, Gmail-style shortcuts (j, k, e, #, r, a, f, c, /, g then i), a shortcut cheat sheet on ?, and user-rebindable keys stored in settings.
2. **Snooze and reminders:** snooze presets plus a custom date-time, reappear at the top of the inbox, and follow-up reminders when no reply arrives.
3. **Rules and filters:** a visual rule builder (conditions on from, to, subject, body, has attachment, size, account; actions: label, archive, mark read, star, forward, move, delete, never spam), run on incoming mail and on existing mail, with a dry-run preview and an ordered rule list with drag reorder.
4. **Labels, colours and smart folders:** nested labels with colours and icons, saved searches as smart folders, and pinned items.
5. **Notes:** a Notes area (and notes attachable to any thread or contact) using the custom notes widget with checklists, pinning, colours, search, and encrypted storage.
6. **Calendar:** a month, week and day calendar built on the custom calendar component showing scheduled sends, snoozes, reminders and events; detect .ics invites in mail and offer accept, decline and add to calendar; create events from an email; an optional CalDAV or Google and Microsoft calendar connection as a later flag.
7. **Tasks:** turn an email into a task with a due date and reminder; a Tasks view grouped by today, upcoming and done.
8. **Out-of-office and auto-responder:** date range with time zone, subject and message, apply only once per sender, and skip mailing lists.
9. **Contacts intelligence:** VIP senders with priority notifications, blocked senders, muted threads, and a sender-reputation hint.
10. **Notifications:** in-app toasts, browser push (Web Push with VAPID, opt-in), unread count in the tab title and favicon, quiet hours, and per-account and per-label rules.
11. **Multi-select, drag and drop:** move messages to folders or labels by dragging, with accessible keyboard alternatives.
12. **Productivity:** split inbox, pin to top, mark important, bulk clean-up suggestions (newsletters, large attachments), storage overview, and an AI-free and privacy-first stance by default (no third-party content scanning).
13. **Data portability and privacy:** export all data (mbox, eml, JSON of settings), import from mbox, delete-everything flow with step-up, and a privacy dashboard that lists what is stored and what is cached.
14. **PWA and offline:** installable, service worker caching of the app shell and recent mail metadata only (no credentials, no bodies unless the owner enables encrypted offline), offline compose that queues to the Outbox, and a clear offline indicator.
15. **Internationalization:** next-intl with extracted strings, locale-aware dates and numbers, and right-to-left layout support.
16. **Print and share:** print-friendly stylesheet for messages, copy link to a message (internal link only), and save as PDF.

Acceptance: each feature has unit and end-to-end tests; shortcuts do not fire inside inputs; rules never loop (guard against forward loops); no feature stores plaintext secrets or sends data to third parties.

## Phase 10: Security hardening and the Security Checklist

**PROMPT TO PASTE**

Goal: audit and harden the whole application, then keep it hardened. This is also the checklist the agent uses to self-review every earlier phase.

Hardening tasks:

1. **HTTP security headers** on every response via next.config and middleware: strict Content-Security-Policy with per-request nonces and strict-dynamic (no unsafe-inline, no unsafe-eval), frame-ancestors none, Strict-Transport-Security with preload, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy denying camera, microphone, geolocation and others, Cross-Origin-Opener-Policy same-origin, Cross-Origin-Resource-Policy same-origin, and Cache-Control no-store on every authenticated page and API response. Set a separate, tighter CSP on the sandboxed message iframe.
2. **Rate limiting** audit: confirm every endpoint has a limit tuned to its risk, with stricter limits on auth, OTP, search, attachment download and the image proxy. Add global request-size limits and timeouts.
3. **Input and output:** Zod on every boundary, output encoding by React, no dangerouslySetInnerHTML except through the one audited sanitizer component, safe file name handling, path traversal prevention, SSRF protection on the image proxy and any URL fetcher (block private, loopback and link-local ranges, re-resolve after redirects, limit size and time, allow only http and https).
4. **Authorization:** one central owner guard, deny by default, tests proving every route and server action rejects unauthenticated and expired sessions. Add a route inventory test that fails if a new route is added without an explicit auth annotation.
5. **Secrets and keys:** no secrets in git history (gitleaks in CI and pre-commit), documented key rotation for ENCRYPTION\_KEYS, SESSION\_PEPPER, CRON\_SECRET and webhook secrets, and a break-glass procedure for the owner losing every 2FA factor (offline recovery using a recovery code, or a documented database-level reset that needs the service-role key and OWNER\_EMAIL and is fully audited).
6. **Audit log:** append-only entries for logins, failures, 2FA events, step-up, account add or remove, credential access, exports, deletions, setting changes and session revocations, with a viewer, filters and retention. Never log message content or secrets.
7. **Supply chain:** pinned versions, lockfile integrity, npm audit and OSV scanning in CI, Dependabot or Renovate with grouped updates, minimal dependencies, no postinstall scripts from unknown packages, and an SBOM generated in CI.
8. **Webhook and cron security:** signature verification, timestamp tolerance and replay protection, constant-time compare, strict body parsing.
9. **Privacy:** no third-party analytics or trackers, fonts self-hosted, Sentry configured with PII scrubbing and message content excluded, cookies strictly necessary only.
10. **Threat model:** write docs/security/threat-model.md using STRIDE covering setup hijack, credential theft, session theft, XSS through email, CSRF, SSRF, brute force, replay, insider and supply-chain risks, with the mitigation and the test that proves each.

**Security Checklist (answer yes or no with evidence for each):**

- Is any secret reachable from the client bundle, a log, a URL or an error response?
- Does every mutating endpoint check auth, origin, rate limit, validation, and write an audit entry?
- Are all auth comparisons constant time and all auth errors generic?
- Is every table protected by RLS with no permissive policy, and is the service-role key server-only?
- Is every SQL statement parameterized?
- Is untrusted email HTML sanitized and rendered in a sandbox with no script execution?
- Are cookies \_\_Host-, HttpOnly, Secure and SameSite=Strict?
- Are sessions rotated on login and 2FA, and revoked on logout?
- Can the setup route be reached after setup completes?
- Are encryption keys versioned and rotatable, and does decryption fail on tampered data?
- Do outbound fetches block private network ranges?
- Does the dependency audit pass?

Acceptance: run an automated scan (OWASP ZAP baseline) against a preview deployment and a manual pass using the OWASP ASVS checklist; zero high or critical findings; the report is saved to docs/security/audit-report.md.

## Phase 11: Testing, accessibility, performance and observability

**PROMPT TO PASTE**

Goal: prove the app works, stays fast, and can be diagnosed in production without leaking data.

Tasks:

1. **Test pyramid:** Vitest unit tests for crypto, auth, time zone math, sanitizer, rules engine and parsers (target at least 90 percent coverage on security-critical modules, 80 percent overall); integration tests for repositories and services against a real Postgres (Testcontainers or Supabase local) and a local IMAP and SMTP server; Playwright end-to-end tests for setup, login with each 2FA method, add account, read, search, compose, schedule, cancel, settings, session revoke, and failure paths. Run them across Chromium, Firefox and WebKit and at desktop and mobile sizes.
2. **Security tests in CI:** the XSS payload corpus, header assertions, route auth inventory, RLS test, secret scan, and a test that scans every API response in end-to-end runs for credential patterns.
3. **Accessibility:** automated axe in every end-to-end flow, plus a manual screen reader pass (NVDA or VoiceOver) and keyboard-only pass documented in docs/a11y.md. Fix everything at WCAG 2.2 AA.
4. **Performance budgets:** Lighthouse CI with thresholds (performance at least 90, accessibility 100, best practices 100, LCP under 2.0 s, INP under 200 ms, CLS under 0.05), bundle size budgets per route with code splitting and dynamic imports for the composer, calendar and editor, image optimization, streaming with Suspense, caching rules that never cache private data in shared caches, and database query plans reviewed with EXPLAIN for every hot query.
5. **Smoothness:** verify no dropped frames in list scrolling, panel resizing and animations (Chrome performance traces), optimistic updates on every action, and prefetch on hover for the next message.
6. **Observability:** Sentry for errors with PII and body scrubbing, structured logs with request ids, health and readiness endpoints, a cron and sync status page inside Settings, uptime monitoring, and alerts on repeated auth failures, dispatcher failures and sync errors.
7. **Resilience:** graceful degradation when a provider is down, circuit breakers and timeouts on provider calls, retry with backoff, and clear user-facing error states with a retry button.

Acceptance: CI runs the full suite on every pull request and blocks merging on failure; the budgets above are met on a production build; a documented manual QA script exists in docs/qa.md.

## Phase 12: Vercel deployment, operations and Definition of Done

**PROMPT TO PASTE**

Goal: ship to production safely and leave the owner with a runbook.

Tasks:

1. **Vercel project setup:** separate Production and Preview environments with distinct secrets, environment variables set in the dashboard (never committed), Node runtime pinned, function regions chosen close to the Supabase region, maxDuration set per route, a custom domain with HTTPS and HSTS, and Deployment Protection enabled on previews.
2. **Supabase production setup:** separate project for production, migrations applied through CI (never by hand in production), connection pooling, point-in-time recovery or daily backups enabled, network restrictions if available, the service-role key stored only in Vercel, database password rotation documented, and a restore drill performed once and documented.
3. **Release process:** protected main branch, required reviews and checks, preview deployment per pull request, migration run before promote, smoke tests after deploy, instant rollback procedure, and semantic versioning with a changelog.
4. **Operations runbook** in docs/ops: deploy, rollback, rotate each secret, rotate encryption keys, add or remove the scheduler trigger, recover from lost 2FA, restore from backup, and incident response with a contact path.
5. **Final first-run checklist for the owner:** set the env variables, deploy, open /setup, enter OWNER\_EMAIL and SETUP\_TOKEN, set password, set 2FA, store recovery codes, then remove SETUP\_TOKEN from env (setup is already permanently closed, this is defense in depth).
6. **Compliance hygiene:** privacy notice for the owner's own data, data retention settings, and a documented data deletion path.

**Definition of Done (all must be true):**

- Every phase's acceptance criteria pass in CI on a production build.
- The Security Checklist is answered with evidence and the audit report shows no high or critical findings.
- Lighthouse budgets are met and axe reports zero violations.
- No TODO, mock, placeholder, console.log or commented-out code remains.
- No secret exists in the repository history, the client bundle or any log.
- Setup is unreachable after completion, and login requires password plus 2FA with no bypass.
- Scheduled sends deliver exactly once at the correct local time across DST.
- Docs are complete: README, SECURITY.md, threat model, runbook, scheduler guide, a11y and QA notes.

Final instruction to the agent: when all phases are complete, produce a closing report listing every feature built, every security control with the file that implements it, every known limitation, and recommended next steps. Then stop.
