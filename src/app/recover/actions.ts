"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { assertSameOrigin, getRequestContext } from "@/lib/security/request-context";
import {
  beginPasswordReset,
  completePasswordReset,
  verifyPasswordReset,
} from "@/server/services/auth.service";

async function requestContext() {
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return null;
  }
  const { ipHash, userAgent, country } = getRequestContext(requestHeaders);
  return { ipHash, userAgent, country };
}

export async function beginPasswordResetAction(input: unknown) {
  const context = await requestContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z.object({ email: z.email().max(320) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return beginPasswordReset({ email: parsed.data.email, ...context });
}

export async function verifyPasswordResetAction(input: unknown) {
  const context = await requestContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      code: z.string().max(20).optional(),
      recoveryCode: z.string().max(32).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return verifyPasswordReset({
    challengeId: parsed.data.challengeId,
    challengeToken: parsed.data.challengeToken,
    ...(parsed.data.code ? { code: parsed.data.code } : {}),
    ...(parsed.data.recoveryCode ? { recoveryCode: parsed.data.recoveryCode } : {}),
    fingerprint: context,
  });
}

export async function completePasswordResetAction(input: unknown) {
  const context = await requestContext();
  if (!context) return { ok: false as const, error: "invalid" as const };
  const parsed = z
    .object({
      challengeId: z.uuid(),
      challengeToken: z.string().min(40).max(128),
      password: z.string().max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  return completePasswordReset({ ...parsed.data, fingerprint: context });
}
