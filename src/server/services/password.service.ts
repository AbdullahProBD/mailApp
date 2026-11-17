import "server-only";

import { createHash } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

import { getServerEnv } from "@/lib/env";

/**
 * Argon2id with the OWASP-recommended baseline:
 * m=19 MiB, t=2, p=1. The library returns a self-describing PHC string, so
 * parameters can be raised later without invalidating existing hashes.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  // Numeric enum value: Argon2id. Avoids importing a const enum with isolatedModules.
  algorithm: 2,
} as const;

/**
 * A deterministic hash of a value that is never a valid password. Verifying
 * against it burns the same CPU as a real check, so response time does not
 * reveal whether the submitted email matched the owner.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash("mailapp-dummy-password-never-used", ARGON2_OPTIONS);
  return dummyHashPromise;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Constant-work verification. Returns `false` for malformed stored hashes. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Runs a real Argon2 verification against a throwaway hash. */
export async function burnPasswordVerification(password: string): Promise<void> {
  const dummy = await getDummyHash();
  await verifyPassword(dummy, password);
}

/** SHA-1 uppercase hex, as required by the Have I Been Pwned range API. */
function sha1Hex(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

export type BreachCheckOutcome = "safe" | "breached" | "unavailable";

const HIBP_TIMEOUT_MS = 4_000;

/**
 * k-anonymity breach check: only the first five SHA-1 characters leave the
 * server. A network failure reports `unavailable` rather than silently passing
 * an unchecked password; the caller decides whether that is fatal.
 */
export async function checkPasswordBreach(password: string): Promise<BreachCheckOutcome> {
  const digest = sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  const baseUrl = getServerEnv().HIBP_API_URL.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, HIBP_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/range/${prefix}`, {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "mailapp-owner-setup",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return "unavailable";
    }

    const body = await response.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countText] = line.trim().split(":");
      if (!hashSuffix || hashSuffix.toUpperCase() !== suffix) {
        continue;
      }
      const count = Number.parseInt(countText ?? "0", 10);
      if (Number.isFinite(count) && count > 0) {
        return "breached";
      }
    }

    return "safe";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}
