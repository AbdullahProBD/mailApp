"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { assertSameOrigin, getRequestContext } from "@/lib/security/request-context";
import {
  authenticatePassword,
  completeEmailOtpLogin,
  completeLoginWithRecovery,
  completeTotpLogin,
  resendLoginEmailOtp,
} from "@/server/services/auth.service";
import { setSessionTokenCookie } from "@/server/services/session.service";

const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
const challengeSchema = z.object({
  challengeId: z.uuid(),
  challengeToken: z.string().min(40).max(128),
});

/** Runs the framework's CSRF protection plus the app's own origin check. */
async function sameOriginContext() {
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return null;
  }
  const context = getRequestContext(requestHeaders);
  return { ipHash: context.ipHash, userAgent: context.userAgent, country: context.country };
}

export async function loginPasswordAction(formData: FormData) {
  const context = await sameOriginContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    rememberDevice: formData.get("rememberDevice") === "on",
  });
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const result = await authenticatePassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    country: context.country,
  });
  return result.ok
    ? {
        ok: true as const,
        challengeId: result.challengeId,
        challengeToken: result.challengeToken,
        mfaType: result.mfaType,
      }
    : result;
}

export async function resendLoginEmailOtpAction(input: unknown) {
  const context = await sameOriginContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z.object({ ...challengeSchema.shape }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return resendLoginEmailOtp({
    ...parsed.data,
    fingerprint: {
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      country: context.country,
    },
  });
}

export async function loginTotpAction(input: unknown) {
  const context = await sameOriginContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z.object({ ...challengeSchema.shape, code: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const result = await completeTotpLogin({
    ...parsed.data,
    fingerprint: { ipHash: context.ipHash, userAgent: context.userAgent, country: context.country },
  });
  if (!result.ok) return result;
  await setSessionTokenCookie(result.token);
  return { ok: true as const };
}

export async function loginEmailOtpAction(input: unknown) {
  const context = await sameOriginContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z.object({ ...challengeSchema.shape, code: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const result = await completeEmailOtpLogin({
    ...parsed.data,
    fingerprint: { ipHash: context.ipHash, userAgent: context.userAgent, country: context.country },
  });
  if (!result.ok) return result;
  await setSessionTokenCookie(result.token);
  return { ok: true as const };
}

export async function loginRecoveryAction(input: unknown) {
  const context = await sameOriginContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z
    .object({ ...challengeSchema.shape, recoveryCode: z.string().max(32) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  const result = await completeLoginWithRecovery({
    ...parsed.data,
    fingerprint: { ipHash: context.ipHash, userAgent: context.userAgent, country: context.country },
  });
  if (!result.ok) return result;
  await setSessionTokenCookie(result.token);
  return { ok: true as const };
}
