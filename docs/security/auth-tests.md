# Phase 2 authentication attacker checklist

Use this checklist during security review and before changing authentication logic. The automated tests in `tests/unit/auth-security.test.ts`, `auth-email-otp-setup.test.ts`, `auth-email-otp-login.test.ts`, `auth-password-reset.test.ts`, `auth-setup-password.test.ts`, `session-rotation.test.ts`, `request-security.test.ts`, and the serial `tests/e2e/auth.spec.ts` journey cover selected paths; passing them is not a substitute for the checks below, concurrency tests on PostgreSQL, or end-to-end review of the deployed configuration.

## Setup and identity

- [ ] Try an unconfigured email, a case/whitespace variant of the owner email, a wrong setup token, malformed inputs, and repeated setup attempts. Responses must not reveal secrets or let a second owner claim the singleton profile.
- [ ] Replay a setup proof from a different IP/browser binding, after challenge expiry, after attempt exhaustion, and after setup completion. It must not advance setup or issue a session.
- [ ] Interrupt setup between password, MFA, recovery-code confirmation, and finalization. Incomplete state must not authenticate; finalization must be atomic and the setup challenge single-use.
- [ ] Confirm weak/reused or breached passwords are rejected, and failures of the breach-check dependency fail closed. Verify no password or setup token appears in logs, audit metadata, or responses.
- [ ] Complete step 3 with the email-OTP branch: confirm the provider credentials are stored encrypted, the test code goes only to `OWNER_EMAIL`, the OTP challenge is bound to the primary setup proof and to the browser, and a wrong/expired/replayed code cannot verify the method. Confirm the proof survives OTP verification so recovery codes and finalization still work, and that a failed delivery rolls back the provider row.

## Password login and MFA challenges

- [ ] Compare unknown email, wrong password, incomplete setup, and malformed request behavior. Failures should remain generic and perform the dummy password-verification path where applicable.
- [ ] Exceed IP/global login limits and TOTP limits. Check both the primary Redis path and database fallback; a limiter outage must not become fail-open.
- [ ] Try an invalid challenge id/token, wrong challenge purpose, expired/consumed challenge, wrong browser binding, and an already exhausted challenge. None should create a session.
- [ ] Submit bad OTPs until the attempt budget is reached. Verify the count stops at the cap, and neither challenge lookup nor consumption can bypass it.
- [ ] Try current and allowed-drift TOTP values, then replay the same accepted time step. Only a new permitted step should succeed; a successful challenge must be consumed once.
- [ ] Race two completions of the same challenge. At most one may create an authenticated session.

## Recovery codes

- [ ] Verify recovery codes are shown only at creation, stored only as keyed digests, normalized consistently, and never returned by later reads or written to logs.
- [ ] Submit an incorrect code, a code for another owner, an already-used code, and a valid code with the wrong browser binding. Invalid attempts must not consume a legitimate code or create a session.
- [ ] Replay a valid recovery attempt or race two requests with the same code/challenge. The code and challenge must each succeed at most once, and no second session may be issued.
- [ ] Replace the recovery-code batch and verify all prior codes stop working. Confirm recovery use is audited without recording the code itself.
- [ ] Start password recovery with an unknown address, the owner address, and the same address with different casing; only the owner path may advance. There must be no emailed reset link: the only ways forward are a recovery code or the preferred second factor (TOTP or an email code sent to `OWNER_EMAIL`).
- [ ] Attempt to skip a recovery stage or reuse the identity proof: consuming the identity challenge must yield a short-lived set-password challenge bound to the same browser, and the consumed challenge must not set a password again. Completing recovery must revoke every session and audit the event.
- [ ] Regenerate recovery codes with a wrong password, no session, and repeated attempts; only a current password inside the rate limit may replace the set, and the response must show the new codes exactly once.

## MFA enrollment in settings

- [ ] Add the second supported method while signed in. A pending TOTP secret must stay server-side and remain unverified until a valid current code is submitted; wrong codes must not activate it.
- [ ] Configure email OTP with each supported sender type. Provider credentials must be encrypted; delivery goes only to `OWNER_EMAIL`; failed delivery must not leave an active challenge or sender configuration behind.
- [ ] Try a wrong OTP, wrong challenge token, different session, expired challenge, and replay. Only the correct code from the owning authenticated session should verify once.
- [ ] After adding either method, confirm the existing preferred method remains preferred, the session token rotates, the enrollment is audited, and the newly verified method can subsequently be selected explicitly.

## Sessions and logout

- [ ] Inspect database rows and browser cookies: only a digest of the opaque session token should be stored; cookies should be `HttpOnly`, `Secure`, `SameSite=Strict`, host-only, path `/`, and use the `__Host-` prefix.
- [ ] Test idle expiry, absolute expiry (including `remember device`), revoked sessions, missing/malformed cookies, and token rotation. Every invalid session should be indistinguishable to the caller and must not be resurrected by activity or rotation.
- [ ] Verify logout revokes server-side state as well as clearing the cookie. Revoke one session, other sessions, and all sessions, then replay each corresponding cookie.
- [ ] Confirm session creation records MFA verification only after successful second-factor completion, and that renewal never extends beyond the absolute deadline.
- [ ] Change the preferred second factor and verify the session token is rotated and the cookie rewritten, so a token captured before the change is dead. Confirm `Sign out other devices` and `Sign out everywhere` revoke atomically and that the current cookie is cleared for the latter.

## Operational and regression checks

- [ ] Inspect audit events for setup, failed/successful login, recovery use, logout, and revocation. Ensure they contain no passwords, OTPs, recovery codes, challenge tokens, session tokens, or raw IP addresses.
- [ ] Verify browser-bound challenges cannot be completed from a different fingerprint, and rate-limit keys are opaque in their backing store and logs.
- [ ] Exercise simultaneous first-run setup, OTP failure/success, recovery redemption, and session revocation against real PostgreSQL; PGlite tests establish repository behavior but not production concurrency guarantees.
- [ ] Run the browser journey (`pnpm test:e2e`) against the production build over HTTPS. It covers setup with the authenticator app, recovery-code regeneration, session revocation, recovery-code password reset, and rejection of the old password while `__Host-` cookies and production environment checks are active.
- [ ] Re-run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` after auth, repository, migration, cookie, or limiter changes.
