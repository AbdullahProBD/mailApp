import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hmacSha256Hex } from "@/lib/crypto/hash";
import { generateToken } from "@/lib/crypto/tokens";
import { setDatabaseForTesting } from "@/lib/db/client";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import {
  createAuthChallenge,
  findUsableAuthChallenge,
} from "@/server/repositories/auth-challenges.repository";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  setOwnerPasswordHash,
} from "@/server/repositories/owner-profile.repository";
import { findActiveSessionByTokenHash } from "@/server/repositories/sessions.repository";
import { completeEmailOtpLogin } from "@/server/services/auth.service";
import {
  computeBrowserBinding,
  hashSessionToken,
  type SessionFingerprint,
} from "@/server/services/session.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const PEPPER = process.env.SESSION_PEPPER ?? "session-pepper-for-unit-tests-000000";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@example.com";
const FINGERPRINT: SessionFingerprint = {
  ipHash: "a".repeat(32),
  userAgent: "email-otp-login-tests",
};

let database: TestDatabase;
let ownerId: string;

function digest(value: string): string {
  return hmacSha256Hex(value, PEPPER);
}

beforeAll(async () => {
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: OWNER_EMAIL }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(owner.id, "$argon2id$test-password-hash-long-enough", database.db);
  await completeOwnerSetup(owner.id, database.db);
});

afterAll(async () => {
  resetRateLimiterForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

/** Mirrors the challenge `authenticatePassword` creates for the email method. */
async function createLoginChallenge(
  code: string,
  fingerprint: SessionFingerprint = FINGERPRINT,
  now = new Date(),
): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = generateToken(32);
  await createAuthChallenge(
    {
      id,
      purpose: "login_mfa",
      codeHmac: digest(token),
      browserBindingHash: computeBrowserBinding(fingerprint),
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      data: {
        ownerId,
        mfaType: "email_otp",
        otpHmac: hmacSha256Hex(`${id}:${code}`, PEPPER),
      },
    },
    database.db,
  );
  return { id, token };
}

describe("email OTP login", () => {
  it("rejects a wrong code, then consumes the challenge for the right one", async () => {
    const now = new Date();
    const challenge = await createLoginChallenge("246810", FINGERPRINT, now);
    const input = {
      challengeId: challenge.id,
      challengeToken: challenge.token,
      fingerprint: FINGERPRINT,
      now,
    };

    expect(await completeEmailOtpLogin({ ...input, code: "000000" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect((await findUsableAuthChallenge(challenge.id, now, 5, database.db))?.attempts).toBe(1);

    const completed = await completeEmailOtpLogin({ ...input, code: "246810" });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const session = await findActiveSessionByTokenHash(
      hashSessionToken(completed.token),
      now,
      database.db,
    );
    expect(session?.mfaVerifiedAt?.getTime()).toBe(now.getTime());
    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).toBeNull();

    expect(await completeEmailOtpLogin({ ...input, code: "246810" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("refuses a challenge that is bound to another browser", async () => {
    const now = new Date();
    const challenge = await createLoginChallenge("112233", FINGERPRINT, now);

    expect(
      await completeEmailOtpLogin({
        challengeId: challenge.id,
        challengeToken: challenge.token,
        code: "112233",
        fingerprint: { ipHash: "b".repeat(32), userAgent: FINGERPRINT.userAgent },
        now,
      }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).not.toBeNull();
  });

  it("refuses a challenge token that does not match the stored digest", async () => {
    const now = new Date();
    const challenge = await createLoginChallenge("445566", FINGERPRINT, now);

    expect(
      await completeEmailOtpLogin({
        challengeId: challenge.id,
        challengeToken: generateToken(32),
        code: "445566",
        fingerprint: FINGERPRINT,
        now,
      }),
    ).toEqual({ ok: false, error: "invalid" });
  });
});
