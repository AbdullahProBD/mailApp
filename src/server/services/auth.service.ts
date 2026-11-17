import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { constantTimeEqual, hmacSha256Hex } from "@/lib/crypto/hash";
import { generateRecoveryCode, generateToken, normalizeRecoveryCode } from "@/lib/crypto/tokens";
import { encryptString, decryptString } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { evaluatePassword } from "@/lib/auth/password-policy";
import { getDb, withTransaction, type DbExecutor } from "@/lib/db/client";
import { consumeDistributedRateLimit } from "@/server/services/rate-limit.service";
import { appendAuditEntry } from "@/server/repositories/audit-log.repository";
import {
  claimOwnerProfile,
  completeOwnerSetup,
  getOwnerProfile,
  setOwnerPasswordHash,
  confirmSetupRecoveryCodes,
  clearSetupRecoveryConfirmation,
  updateOwnerProfile,
} from "@/server/repositories/owner-profile.repository";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  findUsableAuthChallenge,
  recordChallengeFailure,
} from "@/server/repositories/auth-challenges.repository";
import {
  getVerifiedMfaMethod,
  listMfaMethods,
  recordMfaStep,
  setPreferredMfaMethod,
  upsertMfaMethod,
  verifyMfaMethod,
} from "@/server/repositories/mfa-methods.repository";
import {
  countUnusedRecoveryCodes,
  consumeRecoveryCode,
  findUnusedRecoveryCode,
  replaceRecoveryCodes,
} from "@/server/repositories/recovery-codes.repository";
import {
  createSession,
  listActiveSessions,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  type SessionRecord,
} from "@/server/repositories/sessions.repository";
import {
  checkPasswordBreach,
  hashPassword,
  verifyPassword,
  burnPasswordVerification,
} from "@/server/services/password.service";
import {
  computeBrowserBinding,
  hashSessionToken,
  type RequestContext,
  type SessionFingerprint,
  rotateSessionToken,
  setSessionCookie,
} from "@/server/services/session.service";
import { createEmailOtp, createTotpSetup, verifyTotpCode } from "@/server/services/totp.service";
import { sendOwnerOtp } from "@/server/services/otp-mailer.service";

const EMAIL_SCHEMA = z.email().max(320);
const identitySchema = z.object({
  email: EMAIL_SCHEMA,
  setupToken: z.string().min(1).max(512),
  ipHash: z.string().min(16).max(128),
});
const passwordSchema = z.string().min(1).max(200);
const loginSchema = z.object({
  email: EMAIL_SCHEMA,
  password: z.string().min(1).max(200),
  ipHash: z.string().min(16).max(128),
  userAgent: z.string().max(512).nullable(),
});
const verifyChallengeSchema = z.object({
  challengeId: z.uuid(),
  challengeToken: z.string().min(40).max(128),
  code: z.string().regex(/^\d{6,8}$/),
  fingerprint: z.object({
    ipHash: z.string().min(16).max(128),
    userAgent: z.string().max(512).nullable(),
  }),
  now: z.date().optional(),
});

export type AuthFailure = "invalid" | "locked" | "unavailable";
export type SetupResult =
  | { ok: true; ownerId: string; challengeId: string; challengeToken: string }
  | { ok: false; error: "invalid" | "locked" | "policy" | "breached" | "unavailable" | "state" };

export interface SetupProof {
  ownerId: string;
  challengeId: string;
  challengeToken: string;
  ipHash: string;
}

export interface EmailSetupProof extends SetupProof {
  providerId?: string;
}

export interface SetupEmailOtpChallenge {
  challengeId: string;
  challengeToken: string;
  /** Existing setup provider reused for a resend, when one was supplied. */
  providerId: string;
}

const GENERIC_AUTH_FAILURE = "The email or password is incorrect.";
const IDENTITY_WINDOW_SECONDS = 15 * 60;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const LOGIN_DELAY_BASE_MS = 250;
const LOGIN_DELAY_MAX_MS = 8_000;
const LOGIN_FAILURE_LIMIT = 10;
const TOTP_RATE_LIMIT = 10;

function safeEmailEqual(left: string, right: string): boolean {
  return constantTimeEqual(left.trim().toLowerCase(), right.trim().toLowerCase());
}

function actorForAudit(): string {
  return "owner";
}

function recoveryDigest(code: string): string {
  return hmacSha256Hex(normalizeRecoveryCode(code), getServerEnv().SESSION_PEPPER);
}

function setupRateKey(scope: string, ipHash: string): string {
  return `auth:setup:${scope}:${ipHash}`;
}

/** Step 1: validate the configured identity and setup token with hard limits. */
export async function verifySetupIdentity(input: unknown): Promise<SetupResult> {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { email, setupToken, ipHash } = parsed.data;
  const ipLimit = await consumeDistributedRateLimit({
    key: setupRateKey("ip", ipHash),
    limit: 5,
    windowSeconds: IDENTITY_WINDOW_SECONDS,
  });
  const globalLimit = await consumeDistributedRateLimit({
    key: setupRateKey("global", "all"),
    limit: 50,
    windowSeconds: IDENTITY_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed || !globalLimit.allowed) return { ok: false, error: "locked" };

  const env = getServerEnv();
  const identityMatches = safeEmailEqual(email, env.OWNER_EMAIL);
  const tokenMatches = constantTimeEqual(setupToken, env.SETUP_TOKEN);
  if (!identityMatches || !tokenMatches) return { ok: false, error: "invalid" };

  const owner = await getOwnerProfile();
  if (owner?.setupCompletedAt) return { ok: false, error: "state" };
  let claimed = owner;
  try {
    claimed ??= await claimOwnerProfile({ email: env.OWNER_EMAIL });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!safeEmailEqual(claimed.email, env.OWNER_EMAIL)) return { ok: false, error: "state" };
  const challengeToken = generateToken(32);
  const contextBinding = hmacSha256Hex(`${ipHash}:${challengeToken}`, env.SESSION_PEPPER);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const challenge = await createAuthChallenge({
    purpose: "setup",
    codeHmac: hmacSha256Hex(challengeToken, env.SESSION_PEPPER),
    browserBindingHash: contextBinding,
    expiresAt,
    data: { ownerId: claimed.id },
  });
  return { ok: true, ownerId: claimed.id, challengeId: challenge.id, challengeToken };
}

/** Step 2: apply zxcvbn policy, HIBP k-anonymity check, then Argon2id. */
export async function setSetupPassword(
  input: SetupProof & { password: unknown },
): Promise<SetupResult> {
  const parsed = passwordSchema.safeParse(input.password);
  const owner = await verifySetupProof(input);
  if (!parsed.success || !owner || owner.setupCompletedAt) {
    return { ok: false, error: "state" };
  }
  if (!evaluatePassword(parsed.data, owner.email).acceptable) {
    return { ok: false, error: "policy" };
  }

  const breach = await checkPasswordBreach(parsed.data);
  if (breach === "unavailable") return { ok: false, error: "unavailable" };
  if (breach === "breached") return { ok: false, error: "breached" };

  const passwordHash = await hashPassword(parsed.data);
  await setOwnerPasswordHash(owner.id, passwordHash);
  await appendAuditEntry({
    action: "auth.setup.password_set",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: owner.id,
  });
  return {
    ok: true,
    ownerId: owner.id,
    challengeId: input.challengeId,
    challengeToken: input.challengeToken,
  };
}

async function verifySetupProof(proof: SetupProof, db: DbExecutor = getDb()) {
  const schema = z.object({
    ownerId: z.uuid(),
    challengeId: z.uuid(),
    challengeToken: z.string().min(40).max(128),
    ipHash: z.string().min(16).max(128),
  });
  const parsed = schema.safeParse(proof);
  if (!parsed.success) return null;
  const now = new Date();
  const challenge = await findUsableAuthChallenge(parsed.data.challengeId, now, 5, db);
  const owner = await getOwnerProfile(db);
  const bindingHash = hmacSha256Hex(
    `${parsed.data.ipHash}:${parsed.data.challengeToken}`,
    getServerEnv().SESSION_PEPPER,
  );
  if (
    !owner ||
    owner.id !== parsed.data.ownerId ||
    !challenge ||
    challenge.purpose !== "setup" ||
    challenge.data.ownerId !== owner.id ||
    !challenge.codeHmac ||
    !challenge.browserBindingHash ||
    !constantTimeEqual(
      challenge.codeHmac,
      hmacSha256Hex(parsed.data.challengeToken, getServerEnv().SESSION_PEPPER),
    ) ||
    !constantTimeEqual(challenge.browserBindingHash, bindingHash)
  )
    return null;
  return owner;
}

/** Step 3: create a TOTP method draft, encrypting its secret against row id. */
export async function configureEmailOtpSetup(
  proof: EmailSetupProof,
  input: {
    kind: "resend" | "postmark" | "ses" | "smtp";
    fromAddress: string;
    fromName?: string;
    credentials: Record<string, unknown>;
  },
): Promise<SetupEmailOtpChallenge | null> {
  const owner = await verifySetupProof(proof);
  const parsed = z
    .object({
      kind: z.enum(["resend", "postmark", "ses", "smtp"]),
      fromAddress: EMAIL_SCHEMA,
      fromName: z.string().min(1).max(120).optional(),
      credentials: z.record(z.string(), z.unknown()),
    })
    .safeParse(input);
  if (!owner || owner.setupCompletedAt || !owner.passwordHash || !parsed.success) return null;
  const emailSetupRate = await consumeDistributedRateLimit({
    key: setupRateKey("email-otp", proof.ipHash),
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!emailSetupRate.allowed) return null;
  const code = createEmailOtp(6);
  const { createSenderProvider } =
    await import("@/server/repositories/mail-sender-providers.repository");
  const provider = await createSenderProvider({
    kind: parsed.data.kind,
    fromAddress: parsed.data.fromAddress,
    credentials: parsed.data.credentials,
    ...(parsed.data.fromName ? { fromName: parsed.data.fromName } : {}),
    isDefault: false,
  });
  const challengeToken = generateToken(32);
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const browserBindingHash = hmacSha256Hex(
    `${proof.ipHash}:${challengeToken}`,
    getServerEnv().SESSION_PEPPER,
  );
  await createAuthChallenge({
    id: challengeId,
    purpose: "setup",
    codeHmac: hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
    browserBindingHash,
    expiresAt,
    data: {
      ownerId: owner.id,
      setupChallengeId: proof.challengeId,
      mfaType: "email_otp",
      providerId: provider.id,
      otpHmac: hmacSha256Hex(`${challengeId}:${code}`, getServerEnv().SESSION_PEPPER),
    },
  });
  const delivery = await sendOwnerOtp({ code, now: new Date(), providerId: provider.id });
  if (!delivery.ok) {
    await consumeAuthChallenge(challengeId);
    const { deleteSenderProvider } =
      await import("@/server/repositories/mail-sender-providers.repository");
    await deleteSenderProvider(provider.id);
    return null;
  }
  return { challengeId, challengeToken, providerId: provider.id };
}

/**
 * Re-sends the setup code through a provider created moments ago by
 * `configureEmailOtpSetup`, so retrying never accumulates provider rows.
 */
export async function resendSetupEmailOtp(
  proof: SetupProof,
  providerId: string,
): Promise<SetupEmailOtpChallenge | null> {
  const owner = await verifySetupProof(proof);
  const parsedProvider = z.uuid().safeParse(providerId);
  if (!owner || owner.setupCompletedAt || !owner.passwordHash || !parsedProvider.success)
    return null;
  const cooldown = await consumeDistributedRateLimit({
    key: setupRateKey("email-resend", proof.ipHash),
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!cooldown.allowed) return null;
  const { listSenderProviders } =
    await import("@/server/repositories/mail-sender-providers.repository");
  const providers = await listSenderProviders();
  const provider = providers.find((entry) => entry.id === parsedProvider.data);
  if (!provider || Date.now() - provider.createdAt.getTime() > 30 * 60_000) return null;

  const code = createEmailOtp(6);
  const challengeId = randomUUID();
  const challengeToken = generateToken(32);
  await createAuthChallenge({
    id: challengeId,
    purpose: "setup",
    codeHmac: hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
    browserBindingHash: hmacSha256Hex(
      `${proof.ipHash}:${challengeToken}`,
      getServerEnv().SESSION_PEPPER,
    ),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    data: {
      ownerId: owner.id,
      setupChallengeId: proof.challengeId,
      mfaType: "email_otp",
      providerId: provider.id,
      otpHmac: hmacSha256Hex(`${challengeId}:${code}`, getServerEnv().SESSION_PEPPER),
    },
  });
  const delivery = await sendOwnerOtp({ code, now: new Date(), providerId: provider.id });
  if (!delivery.ok) {
    await consumeAuthChallenge(challengeId);
    return null;
  }
  return { challengeId, challengeToken, providerId: provider.id };
}

export async function verifySetupEmailOtp(
  proof: SetupProof,
  input: { challengeId: string; challengeToken: string; code: string },
  now = new Date(),
): Promise<boolean> {
  const owner = await verifySetupProof(proof);
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      code: z.string().max(20),
    })
    .safeParse(input);
  if (!owner || owner.setupCompletedAt || !parsed.success) return false;
  const challenge = await findUsableAuthChallenge(parsed.data.challengeId, now, 5);
  if (
    !challenge ||
    challenge.purpose !== "setup" ||
    challenge.data.ownerId !== owner.id ||
    challenge.data.setupChallengeId !== proof.challengeId ||
    challenge.data.mfaType !== "email_otp" ||
    !challenge.codeHmac ||
    !challenge.browserBindingHash
  )
    return false;
  const parsedCode = z
    .string()
    .regex(/^\d{6,8}$/)
    .safeParse(parsed.data.code);
  const suppliedToken = hmacSha256Hex(parsed.data.challengeToken, getServerEnv().SESSION_PEPPER);
  const expectedBinding = hmacSha256Hex(
    `${proof.ipHash}:${parsed.data.challengeToken}`,
    getServerEnv().SESSION_PEPPER,
  );
  const storedOtpHmac = z.string().length(64).safeParse(challenge.data.otpHmac);
  const suppliedOtpHmac = hmacSha256Hex(
    `${challenge.id}:${parsedCode.success ? parsedCode.data : "invalid"}`,
    getServerEnv().SESSION_PEPPER,
  );
  const tokenMatches = constantTimeEqual(challenge.codeHmac, suppliedToken);
  const bindingMatches = constantTimeEqual(challenge.browserBindingHash, expectedBinding);
  const codeMatches =
    storedOtpHmac.success && constantTimeEqual(storedOtpHmac.data, suppliedOtpHmac);
  if (!tokenMatches || !bindingMatches) return false;
  if (!parsedCode.success || !codeMatches) {
    await recordChallengeFailure(challenge.id, now);
    return false;
  }
  const providerId = z.uuid().safeParse(challenge.data.providerId);
  if (!providerId.success) return false;
  // The OTP challenge is single-use; the original setup proof remains live
  // for recovery confirmation and atomic setup finalization.
  if (!(await consumeAuthChallenge(challenge.id, now))) return false;
  const pendingMethod = await upsertMfaMethod({
    ownerId: owner.id,
    type: "email_otp",
    secretEncrypted: "pending",
  });
  const encryptedProviderId = encryptString(providerId.data, {
    table: "mfa_methods",
    rowId: pendingMethod.id,
  });
  await upsertMfaMethod({
    ownerId: owner.id,
    type: "email_otp",
    secretEncrypted: encryptedProviderId,
  });
  await verifyMfaMethod(owner.id, "email_otp", now);
  await appendAuditEntry({
    action: "auth.setup.mfa_verified",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: owner.id,
  });
  return true;
}

export async function beginTotpSetup(
  proof: SetupProof,
  setup: { secret: string },
): Promise<{ methodId: string } | null> {
  const owner = await verifySetupProof(proof);
  const secretSchema = z.string().regex(/^[A-Z2-7]{16,64}$/);
  if (
    !owner ||
    owner.setupCompletedAt ||
    !owner.passwordHash ||
    !secretSchema.safeParse(setup.secret).success
  )
    return null;
  const existing = await listMfaMethods(owner.id);
  const current = existing.find((method) => method.type === "totp");
  if (current?.verifiedAt) return null;
  if (current) {
    const encrypted = encryptString(setup.secret, { table: "mfa_methods", rowId: current.id });
    const method = await upsertMfaMethod({
      ownerId: owner.id,
      type: "totp",
      secretEncrypted: encrypted,
    });
    return { methodId: method.id };
  }
  const pending = await upsertMfaMethod({
    ownerId: owner.id,
    type: "totp",
    secretEncrypted: "pending",
  });
  const encrypted = encryptString(setup.secret, { table: "mfa_methods", rowId: pending.id });
  const method = await upsertMfaMethod({
    ownerId: owner.id,
    type: "totp",
    secretEncrypted: encrypted,
  });
  return { methodId: method.id };
}

/** Verify and activate the setup TOTP, rejecting replayed time steps. */
export async function verifySetupTotp(
  proof: SetupProof,
  code: string,
  now = new Date(),
): Promise<boolean> {
  const owner = await verifySetupProof(proof);
  if (!owner || owner.setupCompletedAt) return false;
  const challenge = await findUsableAuthChallenge(proof.challengeId, now, 5);
  if (
    !challenge ||
    challenge.purpose !== "setup" ||
    challenge.data.ownerId !== owner.id ||
    challenge.data.mfaType === "email_otp"
  )
    return false;
  const methods = await listMfaMethods(owner.id);
  const method = methods.find((entry) => entry.type === "totp" && entry.secretEncrypted);
  if (!method?.secretEncrypted) return false;
  let secret: string;
  try {
    secret = decryptString(method.secretEncrypted, { table: "mfa_methods", rowId: method.id });
  } catch {
    return false;
  }
  const result = verifyTotpCode(secret, code, owner.email, now);
  if (
    !result.valid ||
    result.step === null ||
    !(await recordMfaStep(owner.id, "totp", result.step))
  ) {
    await recordChallengeFailure(proof.challengeId, now);
    return false;
  }
  await verifyMfaMethod(owner.id, "totp", now);
  await appendAuditEntry({
    action: "auth.setup.mfa_verified",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: owner.id,
  });
  return true;
}

/** Creates 10 one-time recovery codes and persists only HMAC digests. */
export async function createSetupRecoveryCodes(proof: SetupProof): Promise<string[] | null> {
  const owner = await verifySetupProof(proof);
  if (!owner || owner.setupCompletedAt) return null;
  const methods = await listMfaMethods(owner.id);
  if (!methods.some((method) => method.verifiedAt)) return null;
  const codes = Array.from({ length: 10 }, generateRecoveryCode);
  await clearSetupRecoveryConfirmation(owner.id);
  await replaceRecoveryCodes({ ownerId: owner.id, codeHmacs: codes.map(recoveryDigest) });
  return codes;
}

export async function confirmSavedRecoveryCodes(
  proof: SetupProof,
  confirmed: boolean,
): Promise<boolean> {
  if (!confirmed) return false;
  const owner = await verifySetupProof(proof);
  if (!owner || owner.setupCompletedAt) return false;
  if ((await countUnusedRecoveryCodes(owner.id)) !== 10) return false;
  await confirmSetupRecoveryCodes(owner.id);
  return true;
}

/** Finalization is intentionally a transaction: the session and audit record
 * cannot exist unless the verified owner setup becomes complete. */
export async function finalizeOwnerSetup(
  proof: SetupProof,
  context: RequestContext,
  now = new Date(),
  db?: DbExecutor,
): Promise<{ sessionId: string; token: string }> {
  const run = async (tx: DbExecutor): Promise<{ sessionId: string; token: string }> => {
    const owner = await verifySetupProof(proof, tx);
    const lockedOwner = await getOwnerProfile(tx);
    const methods = lockedOwner ? await listMfaMethods(proof.ownerId, tx) : [];
    const codes = lockedOwner ? await countUnusedRecoveryCodes(proof.ownerId, tx) : 0;
    if (
      !owner ||
      !lockedOwner ||
      lockedOwner.id !== proof.ownerId ||
      lockedOwner.setupCompletedAt ||
      !lockedOwner.passwordHash ||
      !lockedOwner.setupRecoveryConfirmedAt ||
      codes !== 10 ||
      !methods.some((method) => method.verifiedAt)
    ) {
      throw new Error("Setup requirements are incomplete");
    }
    if (!(await consumeAuthChallenge(proof.challengeId, now, tx)))
      throw new Error("Setup challenge expired");
    const completed = await completeOwnerSetup(proof.ownerId, tx, now);
    const token = generateToken(32);
    const idleExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_IDLE_MINUTES * 60_000,
    );
    const absoluteExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_ABSOLUTE_HOURS * 3_600_000,
    );
    const session = await createSession(
      {
        tokenHash: hashSessionToken(token),
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash: context.ipHash,
        userAgent: context.userAgent ?? undefined,
        country: context.country ?? undefined,
        mfaVerifiedAt: now,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.setup.completed",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: completed.id,
        ipHash: context.ipHash,
        userAgent: context.userAgent ?? undefined,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.session.created",
        actor: actorForAudit(),
        targetType: "session",
        targetId: session.id,
        ipHash: context.ipHash,
      },
      tx,
    );
    return { sessionId: session.id, token };
  };
  return withTransaction(db ?? getDb(), run);
}

/** Password-first login: always spends an Argon2 verification, even for
 * unknown identities, and emits one generic failure. */
export async function authenticatePassword(
  input: unknown,
  now = new Date(),
): Promise<
  | {
      ok: true;
      challengeId: string;
      challengeToken: string;
      bindingHash: string;
      mfaType: "totp" | "email_otp";
    }
  | { ok: false; error: AuthFailure }
> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    await burnPasswordVerification("invalid-input-dummy-password");
    return { ok: false, error: "invalid" };
  }
  const { email, password, ipHash, userAgent } = parsed.data;
  const ipLimit = await consumeDistributedRateLimit(
    { key: `auth:login:ip:${ipHash}`, limit: LOGIN_FAILURE_LIMIT, windowSeconds: 15 * 60 },
    now,
  );
  const globalLimit = await consumeDistributedRateLimit(
    { key: "auth:login:global", limit: 100, windowSeconds: 15 * 60 },
    now,
  );
  const owner = await getOwnerProfile();
  const identityMatches = owner ? safeEmailEqual(email, owner.email) : false;
  const profileUsable = Boolean(owner?.setupCompletedAt && owner.passwordHash);
  let passwordMatches = false;
  if (owner && identityMatches && profileUsable && owner.passwordHash) {
    passwordMatches = await verifyPassword(owner.passwordHash, password);
  } else {
    await burnPasswordVerification(password);
  }

  if (!ipLimit.allowed || !globalLimit.allowed) {
    if (owner)
      await appendAuditEntry({
        action: "auth.login.locked",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash,
      });
    return { ok: false, error: "locked" };
  }
  if (!identityMatches || !profileUsable || !passwordMatches || !owner) {
    if (owner)
      await appendAuditEntry({
        action: "auth.login.failed",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash,
        userAgent: userAgent ?? undefined,
      });
    const failureCount = LOGIN_FAILURE_LIMIT - ipLimit.remaining;
    const delay = Math.min(
      LOGIN_DELAY_BASE_MS * 2 ** Math.max(0, failureCount - 1),
      LOGIN_DELAY_MAX_MS,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    return { ok: false, error: "invalid" };
  }

  const fingerprint: SessionFingerprint = { ipHash, userAgent };
  const bindingHash = computeBrowserBinding(fingerprint);
  const mfaMethods = await listMfaMethods(owner.id);
  const preferredMethod = mfaMethods.find((method) => method.preferred && method.verifiedAt);
  if (!preferredMethod) return { ok: false, error: "unavailable" };
  const challengeToken = generateToken(32);
  const challengeId = randomUUID();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  let emailProviderId: string | null = null;
  if (preferredMethod.type === "email_otp" && preferredMethod.secretEncrypted) {
    try {
      emailProviderId = decryptString(preferredMethod.secretEncrypted, {
        table: "mfa_methods",
        rowId: preferredMethod.id,
      });
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!z.uuid().safeParse(emailProviderId).success) return { ok: false, error: "unavailable" };
  }
  if (preferredMethod.type === "email_otp" && !emailProviderId) {
    return { ok: false, error: "unavailable" };
  }
  const emailOtp = preferredMethod.type === "email_otp" ? createEmailOtp(6) : null;
  const challenge = await createAuthChallenge({
    id: challengeId,
    purpose: "login_mfa",
    expiresAt,
    browserBindingHash: bindingHash,
    codeHmac: hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
    data: {
      ownerId: owner.id,
      mfaType: preferredMethod.type,
      ...(emailOtp
        ? { otpHmac: hmacSha256Hex(`${challengeId}:${emailOtp}`, getServerEnv().SESSION_PEPPER) }
        : {}),
    },
  });
  if (emailOtp && emailProviderId) {
    const delivery = await sendOwnerOtp({ code: emailOtp, now, providerId: emailProviderId });
    if (!delivery.ok) {
      await consumeAuthChallenge(challenge.id, now);
      return { ok: false, error: "unavailable" };
    }
  }
  return {
    ok: true,
    challengeId: challenge.id,
    challengeToken,
    bindingHash,
    mfaType: preferredMethod.type,
  };
}

/** Verifies a password-derived challenge token and then consumes it exactly
 * once after successful second-factor verification. */
export async function completeEmailOtpLogin(
  input: unknown,
): Promise<{ ok: true; sessionId: string; token: string } | { ok: false; error: AuthFailure }> {
  const schema = z.object({
    challengeId: z.uuid(),
    challengeToken: z.string().min(40).max(128),
    code: z.string().regex(/^\d{6,8}$/),
    fingerprint: z.object({
      ipHash: z.string().min(16).max(128),
      userAgent: z.string().max(512).nullable(),
    }),
    now: z.date().optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { challengeId, challengeToken, code, fingerprint } = parsed.data;
  const now = parsed.data.now ?? new Date();
  const rate = await consumeDistributedRateLimit(
    { key: `auth:otp:${fingerprint.ipHash}`, limit: 10, windowSeconds: 15 * 60 },
    now,
  );
  if (!rate.allowed) return { ok: false, error: "locked" };
  return withTransaction(getDb(), async (tx) => {
    const challenge = await findUsableAuthChallenge(challengeId, now, 5, tx);
    const expectedToken = hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER);
    const binding = computeBrowserBinding(fingerprint);
    if (
      !challenge ||
      challenge.purpose !== "login_mfa" ||
      challenge.data.mfaType !== "email_otp" ||
      !challenge.codeHmac ||
      !challenge.browserBindingHash ||
      !constantTimeEqual(expectedToken, challenge.codeHmac) ||
      !constantTimeEqual(binding, challenge.browserBindingHash)
    ) {
      return { ok: false, error: "invalid" } as const;
    }
    const owner = await getOwnerProfile(tx);
    const otpHmac = z.string().length(64).safeParse(challenge.data.otpHmac);
    const suppliedOtp = hmacSha256Hex(`${challenge.id}:${code}`, getServerEnv().SESSION_PEPPER);
    if (
      !owner?.setupCompletedAt ||
      challenge.data.ownerId !== owner.id ||
      !otpHmac.success ||
      !constantTimeEqual(otpHmac.data, suppliedOtp)
    ) {
      await recordChallengeFailure(challengeId, now, tx);
      if (owner)
        await appendAuditEntry(
          {
            action: "auth.login.mfa_failed",
            actor: actorForAudit(),
            targetType: "owner",
            targetId: owner.id,
            ipHash: fingerprint.ipHash,
          },
          tx,
        );
      return { ok: false, error: "invalid" } as const;
    }
    if (!(await consumeAuthChallenge(challengeId, now, tx)))
      return { ok: false, error: "invalid" } as const;
    const token = generateToken(32);
    const absoluteExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_ABSOLUTE_HOURS * 3_600_000,
    );
    const idleExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_IDLE_MINUTES * 60_000,
    );
    const session = await createSession(
      {
        tokenHash: hashSessionToken(token),
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
        mfaVerifiedAt: now,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.login.succeeded",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.session.created",
        actor: actorForAudit(),
        targetType: "session",
        targetId: session.id,
        ipHash: fingerprint.ipHash,
      },
      tx,
    );
    return { ok: true, sessionId: session.id, token } as const;
  });
}

export async function completeTotpLogin(
  input: unknown,
): Promise<{ ok: true; sessionId: string; token: string } | { ok: false; error: AuthFailure }> {
  const parsed = verifyChallengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { challengeId, challengeToken, code, fingerprint } = parsed.data;
  const now = parsed.data.now ?? new Date();
  const limit = await consumeDistributedRateLimit(
    { key: `auth:totp:${fingerprint.ipHash}`, limit: TOTP_RATE_LIMIT, windowSeconds: 15 * 60 },
    now,
  );
  const attemptLimit = await consumeDistributedRateLimit(
    { key: `auth:totp:challenge:${challengeId}`, limit: 5, windowSeconds: 15 * 60 },
    now,
  );
  if (!limit.allowed || !attemptLimit.allowed) return { ok: false, error: "locked" };
  return withTransaction(getDb(), async (tx) => {
    const challenge = await findUsableAuthChallenge(challengeId, now, 5, tx);
    const binding = computeBrowserBinding(fingerprint);
    const submittedTokenHash = hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER);
    if (
      !challenge ||
      challenge.purpose !== "login_mfa" ||
      !challenge.browserBindingHash ||
      !challenge.codeHmac ||
      !constantTimeEqual(binding, challenge.browserBindingHash) ||
      !constantTimeEqual(submittedTokenHash, challenge.codeHmac)
    ) {
      return { ok: false, error: "invalid" } as const;
    }
    const owner = await getOwnerProfile(tx);
    if (
      !owner?.setupCompletedAt ||
      challenge.data.ownerId !== owner.id ||
      challenge.data.mfaType !== "totp"
    )
      return { ok: false, error: "invalid" } as const;
    const method = await getVerifiedMfaMethod(owner.id, "totp", tx);
    if (!method?.secretEncrypted) return { ok: false, error: "invalid" } as const;
    let storedSecret: string;
    try {
      storedSecret = decryptString(method.secretEncrypted, {
        table: "mfa_methods",
        rowId: method.id,
      });
    } catch {
      return { ok: false, error: "invalid" } as const;
    }
    const result = verifyTotpCode(storedSecret, code, owner.email, now);
    if (
      !result.valid ||
      result.step === null ||
      !(await recordMfaStep(owner.id, "totp", result.step, tx))
    ) {
      await recordChallengeFailure(challengeId, now, tx);
      await appendAuditEntry(
        {
          action: "auth.login.mfa_failed",
          actor: actorForAudit(),
          targetType: "owner",
          targetId: owner.id,
          ipHash: fingerprint.ipHash,
        },
        tx,
      );
      return { ok: false, error: "invalid" } as const;
    }
    if (!(await consumeAuthChallenge(challengeId, now, tx)))
      return { ok: false, error: "invalid" } as const;
    const token = generateToken(32);
    const absoluteExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_ABSOLUTE_HOURS * 3_600_000,
    );
    const idleExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_IDLE_MINUTES * 60_000,
    );
    const session = await createSession(
      {
        tokenHash: hashSessionToken(token),
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
        mfaVerifiedAt: now,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.login.succeeded",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.session.created",
        actor: actorForAudit(),
        targetType: "session",
        targetId: session.id,
        ipHash: fingerprint.ipHash,
      },
      tx,
    );
    return { ok: true, sessionId: session.id, token } as const;
  });
}

/** Consumes a challenge token with a single-use recovery code. */
export async function completeRecoveryLogin(
  challengeId: string,
  challengeToken: string,
  recoveryCode: string,
  fingerprint: SessionFingerprint,
  now = new Date(),
): Promise<{ sessionId: string; token: string } | null> {
  const input = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      recoveryCode: z.string().min(10).max(32),
    })
    .safeParse({ challengeId, challengeToken, recoveryCode });
  if (!input.success) return null;
  const challenge = await findUsableAuthChallenge(challengeId, now, 5);
  if (
    !challenge ||
    challenge.purpose !== "login_mfa" ||
    !challenge.browserBindingHash ||
    !challenge.codeHmac ||
    !constantTimeEqual(computeBrowserBinding(fingerprint), challenge.browserBindingHash) ||
    !constantTimeEqual(
      hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
      challenge.codeHmac,
    )
  )
    return null;
  const owner = await getOwnerProfile();
  if (!owner?.setupCompletedAt || challenge.data.ownerId !== owner.id) return null;
  const code = normalizeRecoveryCode(recoveryCode);
  const row = await findUnusedRecoveryCode(recoveryDigest(code));
  if (!row) {
    await recordChallengeFailure(challengeId, now);
    await appendAuditEntry({
      action: "auth.recovery.failed",
      actor: actorForAudit(),
      targetType: "owner",
      targetId: owner.id,
      ipHash: fingerprint.ipHash,
    });
    return null;
  }
  return withTransaction(getDb(), async (tx) => {
    if (
      !(await consumeRecoveryCode(row.id, now, tx)) ||
      !(await consumeAuthChallenge(challengeId, now, tx))
    )
      return null;
    const token = generateToken(32);
    const absoluteExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_ABSOLUTE_HOURS * 3_600_000,
    );
    const idleExpiresAt = new Date(
      now.getTime() + getServerEnv().AUTH_SESSION_IDLE_MINUTES * 60_000,
    );
    const session = await createSession(
      {
        tokenHash: hashSessionToken(token),
        idleExpiresAt,
        absoluteExpiresAt,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
        mfaVerifiedAt: now,
      },
      tx,
    );
    await appendAuditEntry(
      {
        action: "auth.recovery.used",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: fingerprint.ipHash,
      },
      tx,
    );
    return { sessionId: session.id, token };
  });
}

export async function getOwner(): Promise<{
  owner: NonNullable<Awaited<ReturnType<typeof getOwnerProfile>>>;
  session: SessionRecord;
} | null> {
  const { getCurrentSession } = await import("@/server/services/session.service");
  const current = await getCurrentSession();
  const owner = await getOwnerProfile();
  if (!current || !owner?.setupCompletedAt || !current.record.mfaVerifiedAt) return null;
  return { owner, session: current.record };
}

export async function completeLoginWithRecovery(input: unknown) {
  const schema = z.object({
    challengeId: z.uuid(),
    challengeToken: z.string().min(40).max(128),
    recoveryCode: z.string().min(10).max(32),
    fingerprint: z.object({
      ipHash: z.string().min(16).max(128),
      userAgent: z.string().max(512).nullable(),
    }),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const rateLimit = await consumeDistributedRateLimit({
    key: `auth:recovery:${parsed.data.fingerprint.ipHash}`,
    limit: 10,
    windowSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) return { ok: false as const, error: "locked" as const };
  const completed = await completeRecoveryLogin(
    parsed.data.challengeId,
    parsed.data.challengeToken,
    parsed.data.recoveryCode,
    parsed.data.fingerprint,
  );
  if (!completed) return { ok: false as const, error: "invalid" as const };
  return { ok: true as const, ...completed };
}

/**
 * Password recovery, step 1.
 *
 * A forgotten password can only be replaced after proving possession of a
 * single-use recovery code or of the owner's verified second factor. There is
 * deliberately no emailed reset link: the recovery email, when the preferred
 * method is an email code, goes only to OWNER_EMAIL and never to an address the
 * requester supplied.
 */
export async function beginPasswordReset(
  input: unknown,
  now = new Date(),
): Promise<
  | { ok: true; challengeId: string; challengeToken: string; mfaType: "totp" | "email_otp" }
  | { ok: false; error: "invalid" | "locked" | "unavailable" }
> {
  const parsed = z
    .object({
      email: EMAIL_SCHEMA,
      ipHash: z.string().min(16).max(128),
      userAgent: z.string().max(512).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const ipLimit = await consumeDistributedRateLimit(
    { key: `auth:reset:ip:${parsed.data.ipHash}`, limit: 5, windowSeconds: 15 * 60 },
    now,
  );
  const globalLimit = await consumeDistributedRateLimit(
    { key: "auth:reset:global", limit: 20, windowSeconds: 15 * 60 },
    now,
  );
  if (!ipLimit.allowed || !globalLimit.allowed) return { ok: false, error: "locked" };

  const owner = await getOwnerProfile();
  if (
    !owner?.setupCompletedAt ||
    !owner.passwordHash ||
    !safeEmailEqual(parsed.data.email, owner.email)
  ) {
    // Spend the same verification work an existing account would, so the
    // response time does not reveal whether the address is the owner's.
    await burnPasswordVerification("password-reset-unknown-owner");
    return { ok: false, error: "invalid" };
  }

  const methods = await listMfaMethods(owner.id);
  const preferred =
    methods.find((method) => method.preferred && method.verifiedAt) ??
    methods.find((method) => method.verifiedAt);
  if (!preferred) return { ok: false, error: "unavailable" };

  let providerId: string | null = null;
  let otp: string | null = null;
  if (preferred.type === "email_otp") {
    if (!preferred.secretEncrypted) return { ok: false, error: "unavailable" };
    try {
      providerId = decryptString(preferred.secretEncrypted, {
        table: "mfa_methods",
        rowId: preferred.id,
      });
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!z.uuid().safeParse(providerId).success) return { ok: false, error: "unavailable" };
    otp = createEmailOtp(6);
  }

  const challengeId = randomUUID();
  const challengeToken = generateToken(32);
  await createAuthChallenge({
    id: challengeId,
    purpose: "password_reset",
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    browserBindingHash: computeBrowserBinding({
      ipHash: parsed.data.ipHash,
      userAgent: parsed.data.userAgent,
    }),
    codeHmac: hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
    data: {
      ownerId: owner.id,
      mfaType: preferred.type,
      stage: "verify_identity",
      ...(otp
        ? { otpHmac: hmacSha256Hex(`${challengeId}:${otp}`, getServerEnv().SESSION_PEPPER) }
        : {}),
    },
  });

  if (otp && providerId) {
    const delivery = await sendOwnerOtp({ code: otp, now, providerId });
    if (!delivery.ok) {
      await consumeAuthChallenge(challengeId, now);
      return { ok: false, error: "unavailable" };
    }
  }

  return { ok: true, challengeId, challengeToken, mfaType: preferred.type };
}

/**
 * Password recovery, step 2: verify a recovery code or the second factor.
 *
 * The identity challenge is consumed and replaced with a short-lived
 * `set_password` challenge on success, so the new password can be submitted
 * separately without ever re-using a proven challenge.
 */
export async function verifyPasswordReset(
  input: unknown,
  now = new Date(),
): Promise<
  { ok: true; challengeId: string; challengeToken: string } | { ok: false; error: AuthFailure }
> {
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      fingerprint: z.object({
        ipHash: z.string().min(16).max(128),
        userAgent: z.string().max(512).nullable(),
      }),
      code: z
        .string()
        .regex(/^\d{6,8}$/)
        .optional(),
      recoveryCode: z.string().min(10).max(32).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!parsed.data.code && !parsed.data.recoveryCode) return { ok: false, error: "invalid" };

  const { challengeId, challengeToken, fingerprint } = parsed.data;
  const rate = await consumeDistributedRateLimit(
    { key: `auth:reset:verify:${fingerprint.ipHash}`, limit: 10, windowSeconds: 15 * 60 },
    now,
  );
  if (!rate.allowed) return { ok: false, error: "locked" };

  return withTransaction(getDb(), async (tx) => {
    const challenge = await findUsableAuthChallenge(challengeId, now, 5, tx);
    const binding = computeBrowserBinding(fingerprint);
    if (
      !challenge ||
      challenge.purpose !== "password_reset" ||
      challenge.data.stage !== "verify_identity" ||
      !challenge.codeHmac ||
      !challenge.browserBindingHash ||
      !constantTimeEqual(
        hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
        challenge.codeHmac,
      ) ||
      !constantTimeEqual(binding, challenge.browserBindingHash)
    ) {
      return { ok: false, error: "invalid" } as const;
    }
    const owner = await getOwnerProfile(tx);
    if (!owner?.setupCompletedAt || challenge.data.ownerId !== owner.id) {
      return { ok: false, error: "invalid" } as const;
    }

    let proven = false;
    if (parsed.data.recoveryCode) {
      const row = await findUnusedRecoveryCode(recoveryDigest(parsed.data.recoveryCode), tx);
      proven = row !== null && (await consumeRecoveryCode(row.id, now, tx));
      if (proven) {
        await appendAuditEntry(
          {
            action: "auth.recovery.used",
            actor: actorForAudit(),
            targetType: "owner",
            targetId: owner.id,
            ipHash: fingerprint.ipHash,
          },
          tx,
        );
      }
    } else if (parsed.data.code) {
      if (challenge.data.mfaType === "email_otp") {
        const stored = z.string().length(64).safeParse(challenge.data.otpHmac);
        const supplied = hmacSha256Hex(
          `${challenge.id}:${parsed.data.code}`,
          getServerEnv().SESSION_PEPPER,
        );
        proven = stored.success && constantTimeEqual(stored.data, supplied);
      } else if (challenge.data.mfaType === "totp") {
        const method = await getVerifiedMfaMethod(owner.id, "totp", tx);
        if (method?.secretEncrypted) {
          try {
            const secret = decryptString(method.secretEncrypted, {
              table: "mfa_methods",
              rowId: method.id,
            });
            const result = verifyTotpCode(secret, parsed.data.code, owner.email, now);
            proven =
              result.valid &&
              result.step !== null &&
              (await recordMfaStep(owner.id, "totp", result.step, tx));
          } catch {
            proven = false;
          }
        }
      }
    }

    if (!proven) {
      await recordChallengeFailure(challengeId, now, tx);
      await appendAuditEntry(
        {
          action: "auth.reset.failed",
          actor: actorForAudit(),
          targetType: "owner",
          targetId: owner.id,
          ipHash: fingerprint.ipHash,
        },
        tx,
      );
      return { ok: false, error: "invalid" } as const;
    }

    if (!(await consumeAuthChallenge(challengeId, now, tx)))
      return { ok: false, error: "invalid" } as const;

    // A fresh challenge binds the next step to the same browser without
    // granting any access on its own.
    const nextId = randomUUID();
    const nextToken = generateToken(32);
    await createAuthChallenge(
      {
        id: nextId,
        purpose: "password_reset",
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        browserBindingHash: binding,
        codeHmac: hmacSha256Hex(nextToken, getServerEnv().SESSION_PEPPER),
        data: { ownerId: owner.id, mfaType: challenge.data.mfaType, stage: "set_password" },
      },
      tx,
    );

    return { ok: true, challengeId: nextId, challengeToken: nextToken } as const;
  });
}

/**
 * Password recovery, step 3: replace the password and end every session.
 *
 * The new password goes through the same policy and breach checks as setup.
 * Revoking all sessions means a stolen cookie cannot outlive the reset.
 */
export async function completePasswordReset(
  input: unknown,
  now = new Date(),
): Promise<
  { ok: true } | { ok: false; error: "invalid" | "locked" | "policy" | "breached" | "unavailable" }
> {
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      password: z.string().min(12).max(200),
      fingerprint: z.object({
        ipHash: z.string().min(16).max(128),
        userAgent: z.string().max(512).nullable(),
      }),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { challengeId, challengeToken, password, fingerprint } = parsed.data;
  const rate = await consumeDistributedRateLimit(
    { key: `auth:reset:complete:${fingerprint.ipHash}`, limit: 5, windowSeconds: 15 * 60 },
    now,
  );
  if (!rate.allowed) return { ok: false, error: "locked" };

  const challenge = await findUsableAuthChallenge(challengeId, now, 5);
  if (
    !challenge ||
    challenge.purpose !== "password_reset" ||
    challenge.data.stage !== "set_password" ||
    !challenge.codeHmac ||
    !challenge.browserBindingHash ||
    !constantTimeEqual(
      hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
      challenge.codeHmac,
    ) ||
    !constantTimeEqual(computeBrowserBinding(fingerprint), challenge.browserBindingHash)
  ) {
    return { ok: false, error: "invalid" };
  }
  const owner = await getOwnerProfile();
  if (!owner?.setupCompletedAt || challenge.data.ownerId !== owner.id)
    return { ok: false, error: "invalid" };

  if (!evaluatePassword(password, owner.email).acceptable) return { ok: false, error: "policy" };
  const breach = await checkPasswordBreach(password);
  if (breach === "unavailable") return { ok: false, error: "unavailable" };
  if (breach === "breached") return { ok: false, error: "breached" };
  const passwordHash = await hashPassword(password);

  await withTransaction(getDb(), async (tx) => {
    if (!(await consumeAuthChallenge(challengeId, now, tx))) {
      throw new Error("Password reset challenge is no longer usable");
    }
    await updateOwnerProfile(owner.id, { passwordHash }, tx);
    await revokeAllSessions(now, tx);
    await appendAuditEntry(
      {
        action: "auth.password.reset",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: fingerprint.ipHash,
        userAgent: fingerprint.userAgent ?? undefined,
      },
      tx,
    );
  });

  return { ok: true };
}

/**
 * Replaces the recovery-code set after re-entering the current password.
 *
 * The repository deletes the previous rows, so an old code can never be used
 * again even if it was photographed before regeneration.
 */
export async function regenerateOwnerRecoveryCodes(
  currentPassword: string,
): Promise<string[] | null> {
  const authenticated = await getOwner();
  if (!authenticated?.owner.passwordHash) return null;
  const parsed = z.string().min(1).max(200).safeParse(currentPassword);
  if (!parsed.success) return null;
  const rate = await consumeDistributedRateLimit({
    key: `auth:recovery:regenerate:${authenticated.session.id}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rate.allowed) return null;
  if (!(await verifyPassword(authenticated.owner.passwordHash, parsed.data))) return null;
  const codes = Array.from({ length: 10 }, generateRecoveryCode);
  await replaceRecoveryCodes({
    ownerId: authenticated.owner.id,
    codeHmacs: codes.map(recoveryDigest),
  });
  await appendAuditEntry({
    action: "auth.recovery.regenerated",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: authenticated.owner.id,
    ipHash: authenticated.session.ipHash ?? undefined,
  });
  return codes;
}

export async function logoutCurrentSession(): Promise<boolean> {
  const { getCurrentSession, clearSessionCookie } =
    await import("@/server/services/session.service");
  const current = await getCurrentSession();
  if (!current) {
    await clearSessionCookie();
    return false;
  }
  await revokeSession(current.record.id);
  await appendAuditEntry({
    action: "auth.logout",
    actor: actorForAudit(),
    targetType: "session",
    targetId: current.record.id,
    ipHash: current.record.ipHash ?? undefined,
  });
  await clearSessionCookie();
  return true;
}

export async function revokeOwnerSession(sessionId: string, now = new Date()): Promise<boolean> {
  const authenticated = await getOwner();
  if (
    !authenticated ||
    !z.uuid().safeParse(sessionId).success ||
    authenticated.session.id === sessionId
  )
    return false;
  const sessions = await listActiveSessions(now);
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) return false;
  await revokeSession(target.id, now);
  await appendAuditEntry({
    action: "auth.session.revoked",
    actor: actorForAudit(),
    targetType: "session",
    targetId: target.id,
    ipHash: authenticated.session.ipHash ?? undefined,
  });
  return true;
}

export async function setOwnerPreferredMfaMethod(type: "totp" | "email_otp"): Promise<boolean> {
  const authenticated = await getOwner();
  if (!authenticated) return false;
  const changed = await setPreferredMfaMethod(authenticated.owner.id, type);
  if (!changed) return false;
  // Changing the second factor is a privilege change, so the session token is
  // rotated: a token captured before the change cannot be replayed afterwards.
  await setSessionCookie(await rotateSessionToken(authenticated.session.id));
  await appendAuditEntry({
    action: "auth.mfa.preferred_changed",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: authenticated.owner.id,
    ipHash: authenticated.session.ipHash ?? undefined,
    metadata: { method: type },
  });
  return true;
}

export interface OwnerTotpEnrollment {
  qrDataUrl: string;
  manualKey: string;
}

/**
 * Starts adding the authenticator app to an already authenticated owner.
 *
 * The secret is generated and stored server-side; only the QR code and the
 * manual key reach the browser, so the pending secret is never exposed to the
 * client or to logs.
 */
export async function beginOwnerTotpEnrollment(
  now = new Date(),
): Promise<OwnerTotpEnrollment | null> {
  const authenticated = await getOwner();
  if (!authenticated) return null;
  const rate = await consumeDistributedRateLimit(
    {
      key: `auth:mfa:enroll:${authenticated.session.id}`,
      limit: 10,
      windowSeconds: 60 * 60,
    },
    now,
  );
  if (!rate.allowed) return null;

  const methods = await listMfaMethods(authenticated.owner.id);
  if (methods.some((method) => method.type === "totp" && method.verifiedAt)) return null;

  const setup = await createTotpSetup(authenticated.owner.email);
  const existing = methods.find((method) => method.type === "totp");
  const encrypt = (rowId: string) => encryptString(setup.secret, { table: "mfa_methods", rowId });

  if (existing) {
    await upsertMfaMethod({
      ownerId: authenticated.owner.id,
      type: "totp",
      secretEncrypted: encrypt(existing.id),
    });
  } else {
    const pending = await upsertMfaMethod({
      ownerId: authenticated.owner.id,
      type: "totp",
      secretEncrypted: "pending",
    });
    await upsertMfaMethod({
      ownerId: authenticated.owner.id,
      type: "totp",
      secretEncrypted: encrypt(pending.id),
    });
  }

  return { qrDataUrl: setup.qrDataUrl, manualKey: setup.manualKey };
}

/** Verifies the pending authenticator secret and activates it as a method. */
export async function verifyOwnerTotpEnrollment(code: string, now = new Date()): Promise<boolean> {
  const authenticated = await getOwner();
  const parsedCode = z.string().max(20).safeParse(code);
  if (!authenticated || !parsedCode.success) return false;
  const owner = authenticated.owner;

  const methods = await listMfaMethods(owner.id);
  const method = methods.find(
    (entry) => entry.type === "totp" && !entry.verifiedAt && entry.secretEncrypted,
  );
  if (!method?.secretEncrypted) return false;

  let secret: string;
  try {
    secret = decryptString(method.secretEncrypted, { table: "mfa_methods", rowId: method.id });
  } catch {
    return false;
  }

  const result = verifyTotpCode(secret, parsedCode.data, owner.email, now);
  const step = result.step;
  if (!result.valid || step === null) return false;

  // Adding a method must not silently change how the owner signs in. The
  // previously preferred method stays selected; the owner can switch it with
  // the radio buttons above.
  const previousPreferred =
    methods.find((entry) => entry.preferred && entry.verifiedAt && entry.type !== "totp")?.type ??
    null;

  const enrolled = await withTransaction(getDb(), async (tx) => {
    if (!(await recordMfaStep(owner.id, "totp", step, tx))) return false;
    await verifyMfaMethod(owner.id, "totp", now, tx);
    if (previousPreferred) {
      await setPreferredMfaMethod(owner.id, previousPreferred, tx);
    }
    await appendAuditEntry(
      {
        action: "auth.mfa.enrolled",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: authenticated.session.ipHash ?? undefined,
        metadata: { method: "totp" },
      },
      tx,
    );
    return true;
  });
  if (!enrolled) return false;

  // Enrolling a factor is a privilege change; rotate the session token so a
  // token captured before enrollment cannot outlive it.
  await setSessionCookie(await rotateSessionToken(authenticated.session.id, now));
  return true;
}

const enrollmentProviderSchema = z.object({
  kind: z.enum(["resend", "postmark", "ses", "smtp"]),
  fromAddress: EMAIL_SCHEMA,
  fromName: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string(), z.unknown()),
});

export interface OwnerEmailOtpChallenge {
  challengeId: string;
  challengeToken: string;
}

/**
 * Adds the email-code method for an authenticated owner by creating a sender
 * provider and delivering a test code to `OWNER_EMAIL` only.
 */
export async function configureOwnerEmailOtp(
  input: unknown,
  now = new Date(),
): Promise<OwnerEmailOtpChallenge | null> {
  const authenticated = await getOwner();
  const parsed = enrollmentProviderSchema.safeParse(input);
  if (!authenticated || !parsed.success) return null;
  const owner = authenticated.owner;

  const methods = await listMfaMethods(owner.id);
  if (methods.some((entry) => entry.type === "email_otp" && entry.verifiedAt)) return null;
  const pendingMethod = methods.find((entry) => entry.type === "email_otp" && !entry.verifiedAt);
  let previousProviderId: string | null = null;
  if (pendingMethod?.secretEncrypted) {
    try {
      previousProviderId = decryptString(pendingMethod.secretEncrypted, {
        table: "mfa_methods",
        rowId: pendingMethod.id,
      });
    } catch {
      // The pending value is overwritten after a successful delivery.
    }
  }

  const rate = await consumeDistributedRateLimit(
    {
      key: `auth:mfa:email:${authenticated.session.id}`,
      limit: 5,
      windowSeconds: 60 * 60,
    },
    now,
  );
  if (!rate.allowed) return null;

  const { createSenderProvider, deleteSenderProvider } =
    await import("@/server/repositories/mail-sender-providers.repository");
  const provider = await createSenderProvider({
    kind: parsed.data.kind,
    fromAddress: parsed.data.fromAddress,
    credentials: parsed.data.credentials,
    ...(parsed.data.fromName ? { fromName: parsed.data.fromName } : {}),
    isDefault: false,
  });

  const code = createEmailOtp(6);
  const challengeToken = generateToken(32);
  const challengeId = randomUUID();
  const ipHash = authenticated.session.ipHash ?? "";
  await createAuthChallenge({
    id: challengeId,
    purpose: "mfa_enroll",
    codeHmac: hmacSha256Hex(challengeToken, getServerEnv().SESSION_PEPPER),
    browserBindingHash: hmacSha256Hex(`${ipHash}:${challengeToken}`, getServerEnv().SESSION_PEPPER),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    data: {
      ownerId: owner.id,
      sessionId: authenticated.session.id,
      mfaType: "email_otp",
      providerId: provider.id,
      otpHmac: hmacSha256Hex(`${challengeId}:${code}`, getServerEnv().SESSION_PEPPER),
    },
  });

  const delivery = await sendOwnerOtp({ code, now, providerId: provider.id });
  if (!delivery.ok) {
    await consumeAuthChallenge(challengeId);
    await deleteSenderProvider(provider.id);
    return null;
  }

  const pending = await upsertMfaMethod({
    ownerId: owner.id,
    type: "email_otp",
    secretEncrypted: "pending",
  });
  const encryptedProviderId = encryptString(provider.id, {
    table: "mfa_methods",
    rowId: pending.id,
  });
  await upsertMfaMethod({
    ownerId: owner.id,
    type: "email_otp",
    secretEncrypted: encryptedProviderId,
  });
  if (previousProviderId && z.uuid().safeParse(previousProviderId).success) {
    await deleteSenderProvider(previousProviderId);
  }

  return { challengeId, challengeToken };
}

/** Verifies the emailed enrollment code and activates the email-code method. */
export async function verifyOwnerEmailOtpEnrollment(
  input: unknown,
  now = new Date(),
): Promise<boolean> {
  const authenticated = await getOwner();
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      code: z.string().max(20),
    })
    .safeParse(input);
  if (!authenticated || !parsed.success) return false;
  const owner = authenticated.owner;

  const challenge = await findUsableAuthChallenge(parsed.data.challengeId, now, 5);
  if (
    !challenge ||
    challenge.purpose !== "mfa_enroll" ||
    challenge.data.ownerId !== owner.id ||
    challenge.data.sessionId !== authenticated.session.id ||
    challenge.data.mfaType !== "email_otp" ||
    !challenge.codeHmac ||
    !challenge.browserBindingHash
  )
    return false;

  const ipHash = authenticated.session.ipHash ?? "";
  const suppliedToken = hmacSha256Hex(parsed.data.challengeToken, getServerEnv().SESSION_PEPPER);
  const expectedBinding = hmacSha256Hex(
    `${ipHash}:${parsed.data.challengeToken}`,
    getServerEnv().SESSION_PEPPER,
  );
  if (
    !constantTimeEqual(challenge.codeHmac, suppliedToken) ||
    !constantTimeEqual(challenge.browserBindingHash, expectedBinding)
  )
    return false;

  const parsedCode = z
    .string()
    .regex(/^\d{6,8}$/)
    .safeParse(parsed.data.code);
  const storedOtpHmac = z.string().length(64).safeParse(challenge.data.otpHmac);
  const suppliedOtpHmac = hmacSha256Hex(
    `${challenge.id}:${parsedCode.success ? parsedCode.data : "invalid"}`,
    getServerEnv().SESSION_PEPPER,
  );
  if (
    !parsedCode.success ||
    !storedOtpHmac.success ||
    !constantTimeEqual(storedOtpHmac.data, suppliedOtpHmac)
  ) {
    await recordChallengeFailure(challenge.id, now);
    return false;
  }

  const providerId = z.uuid().safeParse(challenge.data.providerId);
  if (!providerId.success) return false;
  if (!(await consumeAuthChallenge(challenge.id, now))) return false;

  const methods = await listMfaMethods(owner.id);
  const emailMethod = methods.find((entry) => entry.type === "email_otp");
  if (emailMethod?.verifiedAt || !emailMethod?.secretEncrypted) return false;
  let storedProviderId: string;
  try {
    storedProviderId = decryptString(emailMethod.secretEncrypted, {
      table: "mfa_methods",
      rowId: emailMethod.id,
    });
  } catch {
    return false;
  }
  if (!constantTimeEqual(storedProviderId, providerId.data)) return false;
  const previousPreferred =
    methods.find((entry) => entry.preferred && entry.verifiedAt && entry.type !== "email_otp")
      ?.type ?? null;

  const enrolled = await withTransaction(getDb(), async (tx) => {
    await verifyMfaMethod(owner.id, "email_otp", now, tx);
    if (previousPreferred) {
      await setPreferredMfaMethod(owner.id, previousPreferred, tx);
    }
    await appendAuditEntry(
      {
        action: "auth.mfa.enrolled",
        actor: actorForAudit(),
        targetType: "owner",
        targetId: owner.id,
        ipHash: authenticated.session.ipHash ?? undefined,
        metadata: { method: "email_otp" },
      },
      tx,
    );
    return true;
  });
  if (!enrolled) return false;

  await setSessionCookie(await rotateSessionToken(authenticated.session.id, now));
  return true;
}

export async function revokeOtherOwnerSessions(
  keepSessionId: string,
  now = new Date(),
): Promise<number> {
  const authenticated = await getOwner();
  if (!authenticated || authenticated.session.id !== keepSessionId) return 0;
  const revoked = await revokeOtherSessions(keepSessionId, now);
  await appendAuditEntry({
    action: "auth.sessions.revoked_others",
    actor: actorForAudit(),
    targetType: "session",
    targetId: keepSessionId,
    ipHash: authenticated.session.ipHash ?? undefined,
  });
  return revoked;
}

export async function revokeAllOwnerSessions(now = new Date()): Promise<void> {
  const authenticated = await getOwner();
  if (!authenticated) return;
  await revokeAllSessions(now);
  await appendAuditEntry({
    action: "auth.sessions.revoked_all",
    actor: actorForAudit(),
    targetType: "owner",
    targetId: authenticated.owner.id,
    ipHash: authenticated.session.ipHash ?? undefined,
  });
  const { clearSessionCookie } = await import("@/server/services/session.service");
  await clearSessionCookie();
}

export { GENERIC_AUTH_FAILURE };
