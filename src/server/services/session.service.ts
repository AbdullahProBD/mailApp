import "server-only";

import { cookies, headers } from "next/headers";

import { getServerEnv } from "@/lib/env";
import { constantTimeEqual, hmacSha256Hex, sha256Hex } from "@/lib/crypto/hash";
import { generateToken } from "@/lib/crypto/tokens";
import type { DbExecutor } from "@/lib/db/client";
import { getRequestContext, type RequestContext } from "@/lib/security/request-context";
import {
  createSession,
  findActiveSessionByTokenHash,
  revokeSession,
  touchSession,
  type SessionRecord,
} from "@/server/repositories/sessions.repository";

/**
 * Session token handling.
 *
 * The cookie carries a 256-bit random token. The database stores only its
 * SHA-256 digest, so a database leak cannot be replayed as a session. The
 * `__Host-` prefix forces HTTPS, forbids a `Domain` attribute and pins the
 * path to `/`, which prevents subdomain cookie injection.
 */
export const SESSION_COOKIE_NAME = "__Host-mailapp_session";
const TOKEN_BYTES = 32;
const MINUTE_MS = 60_000;
/** Sliding refresh is throttled so a busy tab cannot hammer the database. */
const TOUCH_INTERVAL_MS = MINUTE_MS;

export interface SessionPolicy {
  idleMinutes: number;
  absoluteHours: number;
}

export interface AuthSession {
  id: string;
  token: string;
  tokenHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  rememberDevice: boolean;
}

export function getSessionPolicy(): SessionPolicy {
  const env = getServerEnv();
  return {
    idleMinutes: env.AUTH_SESSION_IDLE_MINUTES,
    absoluteHours: env.AUTH_SESSION_ABSOLUTE_HOURS,
  };
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

interface CreateSessionOptions {
  now?: Date;
  rememberDevice?: boolean;
  mfaVerifiedAt?: Date | null;
  context?: RequestContext;
  db?: DbExecutor;
}

/**
 * Issues a new session and returns the plaintext token exactly once. The
 * caller is responsible for writing the cookie; this keeps the service usable
 * from a Server Component, a Server Action and a route handler alike.
 */
export async function issueSession(
  options: CreateSessionOptions = {},
): Promise<{ session: AuthSession; token: string }> {
  const now = options.now ?? new Date();
  const policy = getSessionPolicy();
  const rememberDevice = options.rememberDevice ?? false;

  // "Remember this device" lifts only the idle timeout, never the absolute
  // lifetime and never the 2FA requirement.
  const idleMs = rememberDevice
    ? policy.absoluteHours * 60 * MINUTE_MS
    : policy.idleMinutes * MINUTE_MS;
  const absoluteMs = policy.absoluteHours * 60 * MINUTE_MS;

  const token = generateToken(TOKEN_BYTES);
  const tokenHash = hashSessionToken(token);

  const record = await createSession(
    {
      tokenHash,
      idleExpiresAt: new Date(now.getTime() + idleMs),
      absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
      ipHash: options.context?.ipHash,
      userAgent: options.context?.userAgent ?? undefined,
      mfaVerifiedAt: options.mfaVerifiedAt ?? undefined,
      rememberDevice,
    },
    options.db,
  );

  return {
    token,
    session: {
      id: record.id,
      token,
      tokenHash,
      idleExpiresAt: record.idleExpiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt,
      rememberDevice: record.rememberDevice,
    },
  };
}

export async function setSessionCookie(session: AuthSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: session.absoluteExpiresAt,
    priority: "high",
  });
}

/** Writes a newly-authenticated opaque token without exposing it to the client. */
export async function setSessionTokenCookie(token: string, now = new Date()): Promise<void> {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
    throw new Error("Invalid session token");
  }
  const absoluteExpiresAt = new Date(
    now.getTime() + getServerEnv().AUTH_SESSION_ABSOLUTE_HOURS * 60 * MINUTE_MS,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: absoluteExpiresAt,
    priority: "high",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export interface ResolvedSession {
  public: {
    sessionId: string;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    rememberDevice: boolean;
  };
  record: SessionRecord;
}

/**
 * Reads and validates the current session cookie.
 *
 * Every failure (missing, malformed, expired, revoked, rotated) returns
 * `null`, so the caller cannot distinguish causes and an attacker learns
 * nothing from the response. The idle window slides at most once per minute.
 */
export async function getCurrentSession(
  now: Date = new Date(),
  db?: DbExecutor,
): Promise<ResolvedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length < 40) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const record = await findActiveSessionByTokenHash(tokenHash, now, db);
  if (!record) {
    return null;
  }

  const policy = getSessionPolicy();
  const idleMs = record.rememberDevice
    ? policy.absoluteHours * 60 * MINUTE_MS
    : policy.idleMinutes * MINUTE_MS;

  const sinceLastSeen = now.getTime() - record.lastSeenAt.getTime();
  if (sinceLastSeen >= TOUCH_INTERVAL_MS) {
    const nextIdle = new Date(Math.min(now.getTime() + idleMs, record.absoluteExpiresAt.getTime()));
    await touchSession(record.id, nextIdle, now, db);
    record.idleExpiresAt = nextIdle;
    record.lastSeenAt = now;
  }

  return {
    record,
    public: {
      sessionId: record.id,
      idleExpiresAt: record.idleExpiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt,
      rememberDevice: record.rememberDevice,
    },
  };
}

/** Ends the current session server-side and removes the cookie. */
export async function endCurrentSession(now: Date = new Date()): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashSessionToken(token);
    const record = await findActiveSessionByTokenHash(tokenHash, now);
    if (record) {
      await revokeSession(record.id, now);
    }
  }

  await clearSessionCookie();
}

/**
 * Rotates the session token after a privilege change.
 *
 * The old digest is replaced atomically, so a token captured before login or
 * 2FA completion stops working immediately (session-fixation defence).
 */
export async function rotateSessionToken(
  sessionId: string,
  now: Date = new Date(),
  db?: DbExecutor,
): Promise<AuthSession> {
  const token = generateToken(TOKEN_BYTES);
  const tokenHash = hashSessionToken(token);
  const { rotateSessionTokenHash } = await import("@/server/repositories/sessions.repository");
  const rotated = await rotateSessionTokenHash(sessionId, tokenHash, now, db);
  if (!rotated) {
    throw new Error("Session not found or already revoked");
  }

  return {
    id: rotated.id,
    token,
    tokenHash,
    idleExpiresAt: rotated.idleExpiresAt,
    absoluteExpiresAt: rotated.absoluteExpiresAt,
    rememberDevice: rotated.rememberDevice,
  };
}

export type { RequestContext } from "@/lib/security/request-context";

export interface SessionFingerprint {
  ipHash: string;
  userAgent: string | null;
}

export async function getSessionFingerprint(): Promise<SessionFingerprint> {
  const requestHeaders = await headers();
  const context = getRequestContext(requestHeaders);
  return { ipHash: context.ipHash, userAgent: context.userAgent };
}

/**
 * Binds a pre-auth challenge to the current browser.
 *
 * The binding is an HMAC of the IP hash and user agent, so a stolen challenge
 * cookie replayed from another client cannot be completed.
 */
export function computeBrowserBinding(fingerprint: SessionFingerprint): string {
  return hmacSha256Hex(
    `${fingerprint.ipHash}:${fingerprint.userAgent ?? "unknown"}`,
    getServerEnv().SESSION_PEPPER,
  );
}

export function browserBindingMatches(
  expected: string | null,
  fingerprint: SessionFingerprint,
): boolean {
  if (!expected) {
    return false;
  }
  return constantTimeEqual(computeBrowserBinding(fingerprint), expected);
}
