"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { assertSameOrigin, getRequestContext } from "@/lib/security/request-context";
import { SENDER_PROVIDER_KINDS } from "@/server/repositories/mail-sender-providers.repository";
import { getOwnerProfile } from "@/server/repositories/owner-profile.repository";
import { setSessionTokenCookie } from "@/server/services/session.service";
import { createTotpSetup } from "@/server/services/totp.service";
import {
  beginTotpSetup,
  confirmSavedRecoveryCodes,
  configureEmailOtpSetup,
  createSetupRecoveryCodes,
  finalizeOwnerSetup,
  resendSetupEmailOtp,
  setSetupPassword,
  verifySetupEmailOtp,
  verifySetupIdentity,
  verifySetupTotp,
  type SetupProof,
} from "@/server/services/auth.service";

const proofSchema = z.object({
  ownerId: z.uuid(),
  challengeId: z.uuid(),
  challengeToken: z.string().min(40).max(128),
});

async function requestProof(input: unknown): Promise<SetupProof | null> {
  const parsed = proofSchema.safeParse(input);
  if (!parsed.success) return null;
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return null;
  }
  const { ipHash } = getRequestContext(requestHeaders);
  return { ...parsed.data, ipHash };
}

const providerSchema = z.object({
  ...proofSchema.shape,
  kind: z.enum(SENDER_PROVIDER_KINDS),
  fromAddress: z.email().max(320),
  fromName: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
});

function providerInput(parsed: z.infer<typeof providerSchema>) {
  return {
    kind: parsed.kind,
    fromAddress: parsed.fromAddress,
    credentials: parsed.credentials,
    ...(parsed.fromName ? { fromName: parsed.fromName } : {}),
  };
}

export async function verifySetupIdentityAction(formData: FormData) {
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return { ok: false as const, error: "invalid" as const };
  }
  const context = getRequestContext(requestHeaders);
  return verifySetupIdentity({
    email: formData.get("email"),
    setupToken: formData.get("setupToken"),
    ipHash: context.ipHash,
  });
}

export async function setSetupPasswordAction(input: unknown) {
  const parsed = z.object({ ...proofSchema.shape, password: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const proof = await requestProof(parsed.data);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  return setSetupPassword({ ...proof, password: parsed.data.password });
}

/** Step 3a: verify email delivery by sending the setup code through the chosen provider. */
export async function beginEmailOtpSetupAction(input: unknown) {
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const proof = await requestProof(parsed.data);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const result = await configureEmailOtpSetup(proof, providerInput(parsed.data));
  return result
    ? { ok: true as const, ...result }
    : { ok: false as const, error: "delivery" as const };
}

export async function resendEmailOtpSetupAction(input: unknown) {
  const parsed = z.object({ ...proofSchema.shape, providerId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const proof = await requestProof(parsed.data);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const result = await resendSetupEmailOtp(proof, parsed.data.providerId);
  return result
    ? { ok: true as const, ...result }
    : { ok: false as const, error: "delivery" as const };
}

export async function beginTotpSetupAction(input: unknown) {
  const proof = await requestProof(input);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const owner = await getOwnerProfile();
  if (!owner || owner.id !== proof.ownerId || owner.setupCompletedAt || !owner.passwordHash) {
    return { ok: false as const, error: "state" as const };
  }
  const setup = await createTotpSetup(owner.email);
  const result = await beginTotpSetup(proof, { secret: setup.secret });
  if (!result) return { ok: false as const, error: "state" as const };
  return { ok: true as const, ...setup };
}

export async function verifySetupTotpAction(input: unknown) {
  const parsed = z.object({ ...proofSchema.shape, code: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const proof = await requestProof(parsed.data);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const verified = await verifySetupTotp(proof, parsed.data.code);
  return verified ? { ok: true as const } : { ok: false as const, error: "invalid" as const };
}

export async function verifySetupEmailOtpAction(input: unknown) {
  const parsed = z
    .object({
      proof: proofSchema,
      otpChallengeId: z.uuid(),
      otpChallengeToken: z.string().min(40).max(128),
      code: z.string().max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const proof = await requestProof(parsed.data.proof);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const verified = await verifySetupEmailOtp(proof, {
    challengeId: parsed.data.otpChallengeId,
    challengeToken: parsed.data.otpChallengeToken,
    code: parsed.data.code,
  });
  return verified ? { ok: true as const } : { ok: false as const, error: "invalid" as const };
}

export async function generateSetupRecoveryCodesAction(input: unknown) {
  const proof = await requestProof(input);
  if (!proof) return { ok: false as const, error: "invalid" as const };
  const codes = await createSetupRecoveryCodes(proof);
  return codes ? { ok: true as const, codes } : { ok: false as const, error: "state" as const };
}

export async function confirmSetupRecoveryCodesAction(input: unknown) {
  const parsed = z.object({ ...proofSchema.shape, confirmed: z.boolean() }).safeParse(input);
  if (!parsed.success) return false;
  const proof = await requestProof(parsed.data);
  return proof ? confirmSavedRecoveryCodes(proof, parsed.data.confirmed) : false;
}

export async function finalizeSetupAction(input: unknown) {
  const proof = await requestProof(input);
  if (!proof) return { ok: false as const, error: "state" as const };
  const requestHeaders = await headers();
  const context = getRequestContext(requestHeaders);
  try {
    const session = await finalizeOwnerSetup(proof, context);
    await setSessionTokenCookie(session.token);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "state" as const };
  }
}
