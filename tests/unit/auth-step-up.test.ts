import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Secret, TOTP } from "otpauth";

const cookieState = vi.hoisted(() => ({ value: "" }));
const sentCodes = vi.hoisted(() => [] as string[]);

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (cookieState.value ? { value: cookieState.value } : undefined),
      set: (_name: string, value: string) => {
        cookieState.value = value;
      },
    }),
  headers: () => Promise.resolve(new Headers({ "user-agent": "step-up-tests" })),
}));

vi.mock("@/server/services/otp-mailer.service", () => ({
  sendOwnerOtp: ({ code }: { code: string }) => {
    sentCodes.push(code);
    return Promise.resolve({ ok: true as const });
  },
}));

vi.mock("@/server/services/password.service", () => ({
  verifyPassword: (passwordHash: string, password: string) =>
    Promise.resolve(
      passwordHash === "$argon2id$step-up-test-password-hash" && password === "correct-password",
    ),
}));

import { encryptString } from "@/lib/crypto";
import { setDatabaseForTesting } from "@/lib/db/client";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  setOwnerPasswordHash,
} from "@/server/repositories/owner-profile.repository";
import {
  getVerifiedMfaMethod,
  listMfaMethods,
  upsertMfaMethod,
  verifyMfaMethod,
} from "@/server/repositories/mfa-methods.repository";
import { createSenderProvider } from "@/server/repositories/mail-sender-providers.repository";
import { countUnusedRecoveryCodes } from "@/server/repositories/recovery-codes.repository";
import { findUsableAuthChallenge } from "@/server/repositories/auth-challenges.repository";
import { findActiveSessionByTokenHash } from "@/server/repositories/sessions.repository";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import {
  getCurrentSession,
  hashSessionToken,
  issueSession,
} from "@/server/services/session.service";
import {
  beginOwnerStepUp,
  completeOwnerStepUp,
  isOwnerStepUpFresh,
  regenerateOwnerRecoveryCodes,
  removeOwnerMfaMethod,
  setOwnerPreferredMfaMethod,
} from "@/server/services/auth.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const OWNER_EMAIL = "owner@example.com";
const PASSWORD_HASH = "$argon2id$step-up-test-password-hash";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

let database: TestDatabase;
let ownerId: string;
let sessionId: string;
let providerId: string;

function totpAt(now: Date): string {
  return new TOTP({
    issuer: "Mail",
    label: OWNER_EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(TOTP_SECRET),
  }).generate({ timestamp: now.getTime() });
}

async function addVerifiedTotp(now = new Date()) {
  const pending = await upsertMfaMethod(
    { ownerId, type: "totp", secretEncrypted: "pending" },
    database.db,
  );
  await upsertMfaMethod(
    {
      ownerId,
      type: "totp",
      secretEncrypted: encryptString(TOTP_SECRET, { table: "mfa_methods", rowId: pending.id }),
    },
    database.db,
  );
  await verifyMfaMethod(ownerId, "totp", now, database.db);
}

async function beginWithPassword(password = "correct-password", now = new Date()) {
  return beginOwnerStepUp(password, now);
}

beforeEach(async () => {
  cookieState.value = "";
  sentCodes.length = 0;
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: OWNER_EMAIL }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(ownerId, PASSWORD_HASH, database.db);
  await completeOwnerSetup(ownerId, database.db);
  const provider = await createSenderProvider(
    {
      kind: "resend",
      fromAddress: "codes@example.com",
      credentials: { apiKey: "test-api-key" },
    },
    database.db,
  );
  providerId = provider.id;
  await addVerifiedTotp();

  const now = new Date();
  const issued = await issueSession({
    now,
    mfaVerifiedAt: now,
    context: { ipHash: "a".repeat(64), userAgent: "step-up-tests", country: null },
    db: database.db,
  });
  sessionId = issued.session.id;
  cookieState.value = issued.token;
});

afterEach(async () => {
  resetRateLimiterForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

describe("owner step-up authentication", () => {
  it("requires the current password before issuing an MFA challenge", async () => {
    expect(await beginWithPassword("wrong-password")).toBeNull();
    expect(await beginWithPassword("correct-password")).toMatchObject({ mfaType: "totp" });
  });

  it("rejects wrong codes, counts failures, and accepts a valid TOTP only once", async () => {
    const now = new Date();
    const challenge = await beginWithPassword("correct-password", now);
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    const input = { ...challenge, code: "000000" };
    expect(await completeOwnerStepUp(input, now)).toBe(false);
    expect(
      (await findUsableAuthChallenge(challenge.challengeId, now, 5, database.db))?.attempts,
    ).toBe(1);

    const validInput = { ...challenge, code: totpAt(now) };
    expect(await completeOwnerStepUp(validInput, now)).toBe(true);
    expect(await completeOwnerStepUp(validInput, now)).toBe(false);
    expect(await isOwnerStepUpFresh(now)).toBe(true);
  });

  it("expires a step-up challenge and a successful proof", async () => {
    const startedAt = new Date();
    const challenge = await beginWithPassword("correct-password", startedAt);
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    expect(
      await completeOwnerStepUp(
        { ...challenge, code: totpAt(startedAt) },
        new Date(startedAt.getTime() + 10 * 60_000),
      ),
    ).toBe(false);
    expect(await isOwnerStepUpFresh(startedAt)).toBe(false);

    const currentTime = new Date();
    const freshChallenge = await beginWithPassword("correct-password", currentTime);
    expect(freshChallenge).not.toBeNull();
    if (!freshChallenge) return;
    expect(
      await completeOwnerStepUp({ ...freshChallenge, code: totpAt(currentTime) }, currentTime),
    ).toBe(true);
    expect(await isOwnerStepUpFresh(new Date(currentTime.getTime() + 10 * 60_000 - 1))).toBe(true);
    expect(await isOwnerStepUpFresh(new Date(currentTime.getTime() + 10 * 60_000))).toBe(false);
  });

  it("binds the challenge to the active session and rotates the session token on success", async () => {
    const before = await getCurrentSession();
    const now = new Date();
    const challenge = await beginWithPassword("correct-password", now);
    expect(challenge).not.toBeNull();
    if (!challenge || !before) return;

    expect(
      await completeOwnerStepUp(
        { ...challenge, code: totpAt(now), challengeToken: `${challenge.challengeToken}x` },
        now,
      ),
    ).toBe(false);
    expect(
      await findActiveSessionByTokenHash(before.record.tokenHash, now, database.db),
    ).not.toBeNull();

    const validChallenge = await beginWithPassword("correct-password", now);
    expect(validChallenge).not.toBeNull();
    if (!validChallenge) return;
    expect(await completeOwnerStepUp({ ...validChallenge, code: totpAt(now) }, now)).toBe(true);
    const after = await getCurrentSession(now);
    expect(after?.record.id).toBe(sessionId);
    expect(after?.record.tokenHash).not.toBe(before.record.tokenHash);
    expect(after?.record.stepUpVerifiedAt).toEqual(now);
    expect(
      await findActiveSessionByTokenHash(before.record.tokenHash, now, database.db),
    ).toBeNull();
    expect(
      await findActiveSessionByTokenHash(hashSessionToken(cookieState.value), now, database.db),
    ).not.toBeNull();
  });

  it("rejects sensitive security mutations without fresh step-up proof", async () => {
    const second = await upsertMfaMethod(
      { ownerId, type: "email_otp", secretEncrypted: "pending" },
      database.db,
    );
    await upsertMfaMethod(
      {
        ownerId,
        type: "email_otp",
        secretEncrypted: encryptString(providerId, {
          table: "mfa_methods",
          rowId: second.id,
        }),
      },
      database.db,
    );
    await verifyMfaMethod(ownerId, "email_otp", new Date(), database.db);

    expect(await removeOwnerMfaMethod("email_otp")).toBe(false);
    expect(await setOwnerPreferredMfaMethod("email_otp")).toBe(false);
    expect(await regenerateOwnerRecoveryCodes()).toBeNull();
    expect(await listMfaMethods(ownerId, database.db)).toHaveLength(2);
    expect(await countUnusedRecoveryCodes(ownerId, database.db)).toBe(0);
  });

  it("prevents removal of the last verified method and selects the remaining method", async () => {
    const second = await upsertMfaMethod(
      { ownerId, type: "email_otp", secretEncrypted: "pending" },
      database.db,
    );
    await upsertMfaMethod(
      {
        ownerId,
        type: "email_otp",
        secretEncrypted: encryptString(providerId, {
          table: "mfa_methods",
          rowId: second.id,
        }),
      },
      database.db,
    );
    await verifyMfaMethod(ownerId, "email_otp", new Date(), database.db);

    const now = new Date();
    const challenge = await beginWithPassword("correct-password", now);
    expect(challenge).not.toBeNull();
    if (!challenge) return;
    expect(sentCodes).toHaveLength(1);
    expect(await completeOwnerStepUp({ ...challenge, code: sentCodes[0] ?? "" }, now)).toBe(true);

    expect(await removeOwnerMfaMethod("email_otp")).toBe(true);
    expect(await getVerifiedMfaMethod(ownerId, "totp", database.db)).toMatchObject({
      preferred: true,
    });
    expect(await listMfaMethods(ownerId, database.db)).toHaveLength(1);
    expect(await removeOwnerMfaMethod("totp")).toBe(false);
    expect(await getVerifiedMfaMethod(ownerId, "totp", database.db)).not.toBeNull();
  });
});
