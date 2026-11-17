import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decryptString } from "@/lib/crypto";
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
import { getVerifiedMfaMethod } from "@/server/repositories/mfa-methods.repository";
import { createSenderProvider } from "@/server/repositories/mail-sender-providers.repository";
import { verifySetupEmailOtp, verifySetupIdentity } from "@/server/services/auth.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const PEPPER = process.env.SESSION_PEPPER ?? "session-pepper-for-unit-tests-000000";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@example.com";
const SETUP_TOKEN = process.env.SETUP_TOKEN ?? "";
const IP = "e".repeat(32);

let database: TestDatabase;
let ownerId: string;
let providerId: string;

function digest(value: string): string {
  return hmacSha256Hex(value, PEPPER);
}

function binding(ipHash: string, token: string): string {
  return hmacSha256Hex(`${ipHash}:${token}`, PEPPER);
}

beforeAll(async () => {
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: OWNER_EMAIL }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(owner.id, "$argon2id$test-password-hash-long-enough", database.db);

  const provider = await createSenderProvider(
    {
      kind: "resend",
      fromAddress: "codes@example.com",
      credentials: { apiKey: "test-key-not-used" },
    },
    database.db,
  );
  providerId = provider.id;
});

afterAll(async () => {
  resetRateLimiterForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

/** Mirrors the rows `configureEmailOtpSetup` writes, without any network send. */
async function createSetupEmailOtp(code: string): Promise<{
  proof: { ownerId: string; challengeId: string; challengeToken: string; ipHash: string };
  otpChallengeId: string;
  otpChallengeToken: string;
}> {
  const now = new Date();
  const proofToken = generateToken(32);
  const proof = await createAuthChallenge(
    {
      purpose: "setup",
      codeHmac: digest(proofToken),
      browserBindingHash: binding(IP, proofToken),
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      data: { ownerId },
    },
    database.db,
  );

  const otpChallengeId = randomUUID();
  const otpChallengeToken = generateToken(32);
  await createAuthChallenge(
    {
      id: otpChallengeId,
      purpose: "setup",
      codeHmac: digest(otpChallengeToken),
      browserBindingHash: binding(IP, otpChallengeToken),
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      data: {
        ownerId,
        setupChallengeId: proof.id,
        mfaType: "email_otp",
        providerId,
        otpHmac: hmacSha256Hex(`${otpChallengeId}:${code}`, PEPPER),
      },
    },
    database.db,
  );

  return {
    proof: { ownerId, challengeId: proof.id, challengeToken: proofToken, ipHash: IP },
    otpChallengeId,
    otpChallengeToken,
  };
}

describe("email OTP during first-run setup", () => {
  it("rejects a wrong code, then verifies the right one once and keeps the setup proof", async () => {
    const now = new Date();
    const fixture = await createSetupEmailOtp("123456");
    const proof = fixture.proof;

    expect(
      await verifySetupEmailOtp(
        proof,
        {
          challengeId: fixture.otpChallengeId,
          challengeToken: fixture.otpChallengeToken,
          code: "000000",
        },
        now,
      ),
    ).toBe(false);
    expect(
      (await findUsableAuthChallenge(fixture.otpChallengeId, now, 5, database.db))?.attempts,
    ).toBe(1);

    expect(
      await verifySetupEmailOtp(
        proof,
        {
          challengeId: fixture.otpChallengeId,
          challengeToken: fixture.otpChallengeToken,
          code: "123456",
        },
        now,
      ),
    ).toBe(true);

    // The primary proof must survive so recovery codes and finalization can run.
    expect(await findUsableAuthChallenge(proof.challengeId, now, 5, database.db)).not.toBeNull();
    expect(await findUsableAuthChallenge(fixture.otpChallengeId, now, 5, database.db)).toBeNull();

    const method = await getVerifiedMfaMethod(ownerId, "email_otp", database.db);
    expect(method?.verifiedAt).not.toBeNull();
    expect(method?.preferred).toBe(true);
    expect(method?.secretEncrypted).not.toBeNull();
    expect(
      decryptString(method?.secretEncrypted ?? "", {
        table: "mfa_methods",
        rowId: method?.id ?? "",
      }),
    ).toBe(providerId);

    // Replay of the consumed OTP challenge never verifies twice.
    expect(
      await verifySetupEmailOtp(
        proof,
        {
          challengeId: fixture.otpChallengeId,
          challengeToken: fixture.otpChallengeToken,
          code: "123456",
        },
        now,
      ),
    ).toBe(false);
  });

  it("rejects an OTP challenge that belongs to another setup proof", async () => {
    const first = await createSetupEmailOtp("654321");
    const second = await createSetupEmailOtp("111111");

    expect(
      await verifySetupEmailOtp(first.proof, {
        challengeId: second.otpChallengeId,
        challengeToken: second.otpChallengeToken,
        code: "111111",
      }),
    ).toBe(false);
  });
});

describe("setup identity lifecycle", () => {
  it("rejects a wrong setup token with the same generic failure", async () => {
    const result = await verifySetupIdentity({
      email: OWNER_EMAIL,
      setupToken: `${SETUP_TOKEN}x`,
      ipHash: "1".repeat(32),
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });

  it("issues a browser-bound proof for the owner", async () => {
    const result = await verifySetupIdentity({
      email: OWNER_EMAIL.toUpperCase(),
      setupToken: SETUP_TOKEN,
      ipHash: "2".repeat(32),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const challenge = await findUsableAuthChallenge(result.challengeId, new Date(), 5, database.db);
    expect(challenge?.purpose).toBe("setup");
    expect(challenge?.attempts).toBe(0);
  });

  it("closes the wizard permanently once setup has completed", async () => {
    await completeOwnerSetup(ownerId, database.db);
    expect(
      await verifySetupIdentity({
        email: OWNER_EMAIL,
        setupToken: SETUP_TOKEN,
        ipHash: "3".repeat(32),
      }),
    ).toEqual({ ok: false, error: "state" });
  });
});
