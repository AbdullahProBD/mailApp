import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Secret, TOTP } from "otpauth";

import { encryptString } from "@/lib/crypto";
import { hmacSha256Hex } from "@/lib/crypto/hash";
import { generateToken, normalizeRecoveryCode } from "@/lib/crypto/tokens";
import { setDatabaseForTesting } from "@/lib/db/client";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import {
  computeBrowserBinding,
  hashSessionToken,
  issueSession,
  type SessionFingerprint,
} from "@/server/services/session.service";
import { completeRecoveryLogin, completeTotpLogin } from "@/server/services/auth.service";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  setOwnerPasswordHash,
} from "@/server/repositories/owner-profile.repository";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  findUsableAuthChallenge,
  recordChallengeFailure,
} from "@/server/repositories/auth-challenges.repository";
import {
  countUnusedRecoveryCodes,
  findUnusedRecoveryCode,
  replaceRecoveryCodes,
} from "@/server/repositories/recovery-codes.repository";
import { upsertMfaMethod, verifyMfaMethod } from "@/server/repositories/mfa-methods.repository";
import {
  findActiveSessionByTokenHash,
  revokeSession,
} from "@/server/repositories/sessions.repository";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const SESSION_PEPPER = process.env.SESSION_PEPPER ?? "session-pepper-for-unit-tests-000000";
const FINGERPRINT: SessionFingerprint = {
  ipHash: "a".repeat(32),
  userAgent: "auth-security-tests",
};
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const RECOVERY_CODE = "ABCD-EFGH-JKMP";

let database: TestDatabase;
let ownerId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: "owner@example.com" }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(owner.id, "$argon2id$test-password-hash-long-enough", database.db);
  await completeOwnerSetup(owner.id, database.db);

  const encryptedSecret = encryptString(TOTP_SECRET, {
    table: "mfa_methods",
    rowId: (
      await upsertMfaMethod(
        { ownerId: owner.id, type: "totp", secretEncrypted: "pending" },
        database.db,
      )
    ).id,
  });
  await upsertMfaMethod(
    { ownerId: owner.id, type: "totp", secretEncrypted: encryptedSecret },
    database.db,
  );
  await verifyMfaMethod(owner.id, "totp", new Date(), database.db);
});

afterAll(async () => {
  resetRateLimiterForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

function totpAt(now: Date): string {
  return new TOTP({
    issuer: "Mail",
    label: "owner@example.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TOTP_SECRET),
  }).generate({ timestamp: now.getTime() });
}

async function createLoginChallenge(
  fingerprint: SessionFingerprint = FINGERPRINT,
  now = new Date(),
): Promise<{ id: string; token: string }> {
  const token = generateToken(32);
  const challenge = await createAuthChallenge(
    {
      purpose: "login_mfa",
      codeHmac: hmacSha256Hex(token, SESSION_PEPPER),
      browserBindingHash: computeBrowserBinding(fingerprint),
      expiresAt: new Date(now.getTime() + 5 * 60_000),
      data: { ownerId, mfaType: "totp" },
    },
    database.db,
  );
  return { id: challenge.id, token };
}

describe("auth challenge repository security boundaries", () => {
  it("stops accepting attempts at the configured budget and never increments past it", async () => {
    const now = new Date();
    const challenge = await createAuthChallenge(
      { purpose: "login_mfa", expiresAt: new Date(now.getTime() + 60_000) },
      database.db,
    );

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await recordChallengeFailure(challenge.id, now, database.db)).toBe(attempt);
    }
    expect(await recordChallengeFailure(challenge.id, now, database.db)).toBe(0);
    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).toBeNull();
  });

  it("rejects consumption at expiry and permits a live challenge to be consumed once", async () => {
    const now = new Date();
    const expired = await createAuthChallenge({ purpose: "setup", expiresAt: now }, database.db);
    expect(await consumeAuthChallenge(expired.id, now, database.db)).toBe(false);
    expect(await recordChallengeFailure(expired.id, now, database.db)).toBe(0);

    const live = await createAuthChallenge(
      { purpose: "step_up", expiresAt: new Date(now.getTime() + 60_000) },
      database.db,
    );
    expect(await consumeAuthChallenge(live.id, now, database.db)).toBe(true);
    expect(await consumeAuthChallenge(live.id, now, database.db)).toBe(false);
    expect(await findUsableAuthChallenge(live.id, now, 5, database.db)).toBeNull();
  });
});

describe("auth service second-factor flows", () => {
  it("records a bad TOTP attempt, then consumes the challenge after successful verification", async () => {
    const now = new Date();
    const challenge = await createLoginChallenge(FINGERPRINT, now);
    const validCode = totpAt(now);
    const invalidCode = String((Number(validCode) + 1) % 1_000_000).padStart(6, "0");

    const failed = await completeTotpLogin({
      challengeId: challenge.id,
      challengeToken: challenge.token,
      code: invalidCode,
      fingerprint: FINGERPRINT,
      now,
    });
    expect(failed).toEqual({ ok: false, error: "invalid" });
    expect((await findUsableAuthChallenge(challenge.id, now, 5, database.db))?.attempts).toBe(1);

    const completed = await completeTotpLogin({
      challengeId: challenge.id,
      challengeToken: challenge.token,
      code: validCode,
      fingerprint: FINGERPRINT,
      now,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).toBeNull();
    const session = await findActiveSessionByTokenHash(
      hashSessionToken(completed.token),
      now,
      database.db,
    );
    expect(session?.mfaVerifiedAt?.getTime()).toBe(now.getTime());

    const replay = await completeTotpLogin({
      challengeId: challenge.id,
      challengeToken: challenge.token,
      code: validCode,
      fingerprint: FINGERPRINT,
      now,
    });
    expect(replay).toEqual({ ok: false, error: "invalid" });
  });

  it("requires a browser-bound challenge and consumes recovery codes exactly once", async () => {
    const now = new Date();
    const challenge = await createLoginChallenge(FINGERPRINT, now);
    const digest = hmacSha256Hex(normalizeRecoveryCode(RECOVERY_CODE), SESSION_PEPPER);
    await replaceRecoveryCodes({ ownerId, codeHmacs: [digest] }, database.db);

    const wrongBrowser: SessionFingerprint = {
      ipHash: "b".repeat(32),
      userAgent: FINGERPRINT.userAgent,
    };
    expect(
      await completeRecoveryLogin(challenge.id, challenge.token, RECOVERY_CODE, wrongBrowser, now),
    ).toBeNull();
    expect(await countUnusedRecoveryCodes(ownerId, database.db)).toBe(1);
    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).not.toBeNull();

    const completed = await completeRecoveryLogin(
      challenge.id,
      challenge.token,
      RECOVERY_CODE,
      FINGERPRINT,
      now,
    );
    expect(completed).not.toBeNull();
    expect(await countUnusedRecoveryCodes(ownerId, database.db)).toBe(0);
    expect(await findUnusedRecoveryCode(digest, database.db)).toBeNull();
    expect(await findUsableAuthChallenge(challenge.id, now, 5, database.db)).toBeNull();

    expect(
      await completeRecoveryLogin(challenge.id, challenge.token, RECOVERY_CODE, FINGERPRINT, now),
    ).toBeNull();
    if (completed) {
      expect(
        await findActiveSessionByTokenHash(hashSessionToken(completed.token), now, database.db),
      ).not.toBeNull();
    }
  });
});

describe("session issue and repository enforcement", () => {
  it("stores only the token hash and enforces expiry and revocation", async () => {
    const now = new Date();
    const issued = await issueSession({ now, mfaVerifiedAt: now, db: database.db });
    expect(issued.token).not.toBe(issued.session.tokenHash);
    expect(issued.session.tokenHash).toBe(hashSessionToken(issued.token));

    const active = await findActiveSessionByTokenHash(issued.session.tokenHash, now, database.db);
    expect(active?.tokenHash).toBe(hashSessionToken(issued.token));
    expect(active?.mfaVerifiedAt?.getTime()).toBe(now.getTime());
    expect(
      await findActiveSessionByTokenHash(
        issued.session.tokenHash,
        issued.session.idleExpiresAt,
        database.db,
      ),
    ).toBeNull();

    const rememberDevice = await issueSession({
      now,
      rememberDevice: true,
      mfaVerifiedAt: now,
      db: database.db,
    });
    expect(rememberDevice.session.idleExpiresAt.getTime()).toBe(
      rememberDevice.session.absoluteExpiresAt.getTime(),
    );
    expect(
      await findActiveSessionByTokenHash(
        rememberDevice.session.tokenHash,
        rememberDevice.session.absoluteExpiresAt,
        database.db,
      ),
    ).toBeNull();

    await revokeSession(issued.session.id, now, database.db);
    expect(
      await findActiveSessionByTokenHash(issued.session.tokenHash, now, database.db),
    ).toBeNull();
  });
});
