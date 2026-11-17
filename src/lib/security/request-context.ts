import "server-only";

import { getServerEnv } from "../env";
import { hmacSha256Hex } from "../crypto/hash";

/**
 * Everything the auth layer may know about the client, reduced to values that
 * are safe to store. The raw IP address is never persisted.
 */
export interface RequestContext {
  ipHash: string;
  userAgent: string | null;
  country: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;
const MAX_FORWARDED_ENTRIES = 4;

function firstHeaderValue(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Best-effort client address.
 *
 * Only the left-most `X-Forwarded-For` entry is meaningful and it is trusted
 * solely because the deployment terminates TLS at a proxy that overwrites it.
 * The value is hashed, so an attacker-supplied address is useless for tracking.
 */
export function getClientAddress(headers: Headers): string {
  // These headers are attacker-controlled unless the deployment's trusted edge
  // proxy is explicitly configured to strip and replace them. Never trust them
  // in local/default installations.
  if (getServerEnv().TRUSTED_PROXY_HEADERS === "true") {
    const forwarded = firstHeaderValue(headers, "x-forwarded-for");
    if (forwarded) {
      const entries = forwarded.split(",").slice(0, MAX_FORWARDED_ENTRIES);
      const candidate = entries[0]?.trim();
      if (candidate) {
        return candidate;
      }
    }
    const proxyAddress = firstHeaderValue(headers, "x-real-ip");
    if (proxyAddress) return proxyAddress;
  }
  return "untrusted-client";
}

/** Keyed hash so stored values cannot be reversed into an address list. */
export function hashClientAddress(address: string): string {
  return hmacSha256Hex(address, getServerEnv().SESSION_PEPPER);
}

export function getRequestContext(headers: Headers): RequestContext {
  const userAgent = headers.get("user-agent");
  const country = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry");

  return {
    ipHash: hashClientAddress(getClientAddress(headers)),
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    country: country ? country.slice(0, 2).toUpperCase() : null,
  };
}

export class OriginCheckError extends Error {
  constructor(message = "Request origin is not allowed") {
    super(message);
    this.name = "OriginCheckError";
  }
}

/**
 * Rejects cross-site mutation attempts.
 *
 * Defence in depth alongside the Server Action built-in check:
 *   * `Origin` must equal `APP_URL` when present;
 *   * `Sec-Fetch-Site`, when the browser sends it, must be `same-origin`
 *     (or `none` for a direct navigation);
 *   * a mutating request with no `Origin` header is rejected.
 */
export function assertSameOrigin(headers: Headers): void {
  const appOrigin = new URL(getServerEnv().APP_URL).origin;
  const origin = headers.get("origin");

  if (!origin || origin === "null") {
    throw new OriginCheckError();
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw new OriginCheckError();
  }

  if (requestOrigin !== appOrigin) {
    throw new OriginCheckError();
  }

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new OriginCheckError();
  }
}

/** True when the request looks like a same-origin mutation. Never throws. */
export function isSameOriginRequest(headers: Headers): boolean {
  try {
    assertSameOrigin(headers);
    return true;
  } catch {
    return false;
  }
}
