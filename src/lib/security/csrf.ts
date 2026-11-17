import "server-only";

import { getServerEnv } from "../env";
import { constantTimeEqual, hmacSha256Hex } from "../crypto/hash";
import { generateToken } from "../crypto/tokens";

/**
 * Double-submit CSRF token for route handlers.
 *
 * Server Actions rely on Next.js's Origin check plus `assertSameOrigin`; route
 * handlers cannot, so they require a token that is bound to the browser with
 * an HMAC and compared in constant time.
 */
export const CSRF_COOKIE_NAME = "__Host-mailapp_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_BYTES = 32;

export interface CsrfToken {
  /** Opaque value stored in the cookie and echoed in the form or header. */
  value: string;
  /** Keyed digest used to reject a forged cookie. */
  digest: string;
}

export function issueCsrfToken(): CsrfToken {
  const value = generateToken(CSRF_TOKEN_BYTES);
  return { value, digest: digestCsrfToken(value) };
}

export function digestCsrfToken(value: string): string {
  return hmacSha256Hex(value, getServerEnv().SESSION_PEPPER);
}

/** Validates a submitted token against the digest stored alongside it. */
export function verifyCsrfToken(value: string, expectedDigest: string): boolean {
  if (value.length === 0 || expectedDigest.length === 0) {
    return false;
  }
  return constantTimeEqual(digestCsrfToken(value), expectedDigest);
}
