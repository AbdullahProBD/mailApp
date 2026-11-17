"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/security/request-context";
import { SENDER_PROVIDER_KINDS } from "@/server/repositories/mail-sender-providers.repository";
import {
  beginOwnerTotpEnrollment,
  configureOwnerEmailOtp,
  regenerateOwnerRecoveryCodes,
  revokeAllOwnerSessions,
  revokeOtherOwnerSessions,
  revokeOwnerSession,
  setOwnerPreferredMfaMethod,
  verifyOwnerEmailOtpEnrollment,
  verifyOwnerTotpEnrollment,
} from "@/server/services/auth.service";
import { getCurrentSession } from "@/server/services/session.service";

async function validateMutation() {
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return false;
  }
  return true;
}

export async function revokeSessionAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = z.object({ sessionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const ok = await revokeOwnerSession(parsed.data.sessionId);
  const current = await getCurrentSession();
  return { ok, currentSessionId: current?.record.id ?? null };
}

export async function revokeOtherSessionsAction() {
  if (!(await validateMutation())) return { ok: false as const, revoked: 0 };
  const current = await getCurrentSession();
  if (!current) return { ok: false as const, revoked: 0 };
  const revoked = await revokeOtherOwnerSessions(current.record.id);
  return { ok: true as const, revoked };
}

export async function revokeAllSessionsAction() {
  if (!(await validateMutation())) return { ok: false as const };
  await revokeAllOwnerSessions();
  return { ok: true as const };
}

export async function preferredMfaMethodAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = z.object({ type: z.enum(["totp", "email_otp"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  return { ok: await setOwnerPreferredMfaMethod(parsed.data.type) };
}

/** Regenerating invalidates every previously issued recovery code. */
export async function regenerateRecoveryCodesAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const codes = await regenerateOwnerRecoveryCodes(parsed.data.password);
  return codes ? { ok: true as const, codes } : { ok: false as const };
}

/** Adds the authenticator app while the owner is already signed in. */
export async function beginTotpEnrollmentAction() {
  if (!(await validateMutation())) return { ok: false as const };
  const setup = await beginOwnerTotpEnrollment();
  return setup ? { ok: true as const, ...setup } : { ok: false as const };
}

export async function verifyTotpEnrollmentAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = z.object({ code: z.string().min(1).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  return { ok: await verifyOwnerTotpEnrollment(parsed.data.code) };
}

const enrollmentProviderSchema = z.object({
  kind: z.enum(SENDER_PROVIDER_KINDS),
  fromAddress: z.email().max(320),
  fromName: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
});

/** Adds the email-code method by delivering a test code to the owner. */
export async function beginEmailEnrollmentAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = enrollmentProviderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const challenge = await configureOwnerEmailOtp({
    kind: parsed.data.kind,
    fromAddress: parsed.data.fromAddress,
    credentials: parsed.data.credentials,
    ...(parsed.data.fromName ? { fromName: parsed.data.fromName } : {}),
  });
  return challenge ? { ok: true as const, ...challenge } : { ok: false as const };
}

export async function verifyEmailEnrollmentAction(input: unknown) {
  if (!(await validateMutation())) return { ok: false as const };
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      code: z.string().min(1).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const };
  return { ok: await verifyOwnerEmailOtpEnrollment(parsed.data) };
}
