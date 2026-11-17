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
  headers: () => Promise.resolve(new Headers()),
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
      passwordHash === "$argon2id$test-password-hash-long-enough" &&
        password === "correct-password",
    ),
}));

import { decryptString, encryptString } from "@/lib/crypto";
import { setDatabaseForTesting } from "@/lib/db/client";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  setOwnerPasswordHash,
} from "@/server/repositories/owner-profile.repository";
import {
  getVerifiedMfaMethod,
  upsertMfaMethod,
  verifyMfaMethod,
} from "@/server/repositories/mfa-methods.repository";
import { createSenderProvider } from "@/server/repositories/mail-sender-providers.repository";
import {
  configureRateLimiterForTesting,
  resetRateLimiterForTesting,
} from "@/server/services/rate-limit.service";
import { issueSession } from "@/server/services/session.service";
import {
  beginOwnerStepUp,
  completeOwnerStepUp,
  beginOwnerTotpEnrollment,
  configureOwnerEmailOtp,
  verifyOwnerEmailOtpEnrollment,
  verifyOwnerTotpEnrollment,
} from "@/server/services/auth.service";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database";

const OWNER_EMAIL = "owner@example.com";
const IP_HASH = "a".repeat(64);
const FIXED_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
// Session lookups inside the service use the real clock, so these tests anchor
// on the current time instead of a fixed past instant (which would be expired).
const NOW = new Date();

let database: TestDatabase;
let ownerId: string;
let providerId: string;

/** Creates the already-verified method the owner signed in with. */
async function completeStepUp() {
  const passwordChallenge = await beginOwnerStepUp("correct-password", new Date());
  expect(passwordChallenge).not.toBeNull();
  if (!passwordChallenge) return;

  let code = sentCodes.at(-1) ?? "";
  if (passwordChallenge.mfaType === "totp") {
    code = new TOTP({
      issuer: "Mail",
      label: OWNER_EMAIL,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(FIXED_TOTP_SECRET),
    }).generate({ timestamp: Date.now() });
  }

  expect(await completeOwnerStepUp({ ...passwordChallenge, code }, new Date())).toBe(true);
}

async function addVerifiedMethod(type: "totp" | "email_otp") {
  const pending = await upsertMfaMethod({ ownerId, type, secretEncrypted: "pending" }, database.db);
  const encrypted = encryptString(type === "totp" ? FIXED_TOTP_SECRET : providerId, {
    table: "mfa_methods",
    rowId: pending.id,
  });
  await upsertMfaMethod({ ownerId, type, secretEncrypted: encrypted }, database.db);
  await verifyMfaMethod(ownerId, type, NOW, database.db);
}

beforeEach(async () => {
  cookieState.value = "";
  sentCodes.length = 0;
  database = await createTestDatabase();
  setDatabaseForTesting(database.db);
  configureRateLimiterForTesting(true);

  const owner = await claimOwnerProfile({ email: OWNER_EMAIL }, database.db);
  ownerId = owner.id;
  await setOwnerPasswordHash(ownerId, "$argon2id$test-password-hash-long-enough", database.db);
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

  const issued = await issueSession({
    now: new Date(),
    mfaVerifiedAt: new Date(),
    context: { ipHash: IP_HASH, userAgent: "mfa-enrollment-test", country: null },
    db: database.db,
  });
  cookieState.value = issued.token;
});

afterEach(async () => {
  resetRateLimiterForTesting();
  setDatabaseForTesting(null);
  await database.close();
});

describe("settings MFA enrollment", () => {
  it("adds an authenticator without changing the existing preferred method", async () => {
    await addVerifiedMethod("email_otp");
    await completeStepUp();

    const setup = await beginOwnerTotpEnrollment(new Date());
    expect(setup).not.toBeNull();
    if (!setup) return;

    expect(setup.qrDataUrl.startsWith("data:image/")).toBe(true);

    const code = new TOTP({
      issuer: "Mail",
      label: OWNER_EMAIL,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(setup.manualKey),
    }).generate({ timestamp: NOW.getTime() });

    expect(await verifyOwnerTotpEnrollment(code, new Date())).toBe(true);

    const method = await getVerifiedMfaMethod(ownerId, "totp", database.db);
    expect(method?.verifiedAt).toBeInstanceOf(Date);
    // Enrolling a second factor must not silently move the radio button.
    expect(method?.preferred).toBe(false);
    expect(await getVerifiedMfaMethod(ownerId, "email_otp", database.db)).toMatchObject({
      preferred: true,
    });
  });

  it("rejects a wrong authenticator code without activating the method", async () => {
    await addVerifiedMethod("email_otp");
    await completeStepUp();
    expect(await beginOwnerTotpEnrollment(new Date())).not.toBeNull();

    expect(await verifyOwnerTotpEnrollment("000000", new Date())).toBe(false);
    expect(await getVerifiedMfaMethod(ownerId, "totp", database.db)).toBeNull();
  });

  it("verifies an emailed enrollment code and stores the provider reference encrypted", async () => {
    await addVerifiedMethod("totp");
    await completeStepUp();

    const challenge = await configureOwnerEmailOtp(
      {
        kind: "resend",
        fromAddress: "new-codes@example.com",
        credentials: { apiKey: "new-api-key" },
      },
      new Date(),
    );
    expect(challenge).not.toBeNull();
    expect(sentCodes).toHaveLength(1);
    if (!challenge) return;

    expect(await verifyOwnerEmailOtpEnrollment({ ...challenge, code: "000000" }, new Date())).toBe(
      false,
    );
    expect(
      await verifyOwnerEmailOtpEnrollment({ ...challenge, code: sentCodes[0] ?? "" }, new Date()),
    ).toBe(true);

    const method = await getVerifiedMfaMethod(ownerId, "email_otp", database.db);
    expect(method?.verifiedAt).toBeInstanceOf(Date);
    // The previously preferred authenticator stays selected.
    expect(method?.preferred).toBe(false);
    expect(await getVerifiedMfaMethod(ownerId, "totp", database.db)).toMatchObject({
      preferred: true,
    });

    // The stored value is the provider id, and only as ciphertext.
    expect(method?.secretEncrypted).not.toBe(providerId);
    expect(
      decryptString(method?.secretEncrypted ?? "", {
        table: "mfa_methods",
        rowId: method?.id ?? "",
      }),
    ).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("refuses to start email enrollment twice and consumes the code once", async () => {
    await addVerifiedMethod("totp");
    await completeStepUp();

    const input = {
      kind: "resend",
      fromAddress: "new-codes@example.com",
      credentials: { apiKey: "new-api-key" },
    } as const;
    const challenge = await configureOwnerEmailOtp(input, new Date());
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    expect(
      await verifyOwnerEmailOtpEnrollment({ ...challenge, code: sentCodes[0] ?? "" }, new Date()),
    ).toBe(true);
    // A verified method exists now, so a second configuration attempt is refused.
    expect(await configureOwnerEmailOtp(input, new Date())).toBeNull();
    // The challenge is single-use.
    expect(
      await verifyOwnerEmailOtpEnrollment({ ...challenge, code: sentCodes[0] ?? "" }, new Date()),
    ).toBe(false);
  });
});
