"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/security/request-context";
import { appendAuditEntry } from "@/server/repositories/audit-log.repository";
import {
  createMailAccount,
  deleteMailAccount,
  reorderMailAccounts,
  setDefaultSender,
  updateMailAccount,
} from "@/server/repositories/mail-accounts.repository";
import { getOwner, isOwnerStepUpFresh } from "@/server/services/auth.service";
import { consumeDistributedRateLimit } from "@/server/services/rate-limit.service";
import {
  CONNECTION_ERROR_MESSAGES,
  testMailConnection,
} from "@/server/services/mail-connection.service";

const serverSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.int().min(1).max(65_535),
  secure: z.boolean(),
});

const connectSchema = z.object({
  providerType: z.enum(["gmail", "microsoft", "imap"]),
  address: z.email().max(320),
  displayName: z.string().min(1).max(120),
  password: z.string().min(1).max(1_024),
  imap: serverSchema.optional(),
  smtp: serverSchema.optional(),
  iconColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

type GuardOptions = {
  /** Account add/remove requires a fresh password + second factor. */
  stepUp: boolean;
  /** Rate-limit bucket and window; every mutation path is limited. */
  scope: string;
  limit: number;
};

type GuardResult = { ok: true; ownerId: string } | { ok: false; error?: string };

/**
 * Enforces the mutation order from the master context: authentication, owner
 * authorization, origin check, rate limit, then (optionally) fresh step-up.
 * Validation and the action follow in each caller.
 */
async function guard(options: GuardOptions): Promise<GuardResult> {
  const requestHeaders = await headers();
  try {
    assertSameOrigin(requestHeaders);
  } catch {
    return { ok: false };
  }

  const authenticated = await getOwner();
  if (!authenticated) return { ok: false };

  const rate = await consumeDistributedRateLimit({
    key: `${options.scope}:${authenticated.owner.id}`,
    limit: options.limit,
    windowSeconds: 15 * 60,
  });
  if (!rate.allowed) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  if (options.stepUp && !(await isOwnerStepUpFresh())) {
    return {
      ok: false,
      error: "Verification required. Complete the security check and try again.",
    };
  }

  return { ok: true, ownerId: authenticated.owner.id };
}

export async function connectMailAccountAction(input: unknown) {
  const access = await guard({ stepUp: true, scope: "mail-account-connect", limit: 10 });
  if (!access.ok) {
    return {
      ok: false as const,
      error: access.error ?? "Verification required. Complete the security check and try again.",
    };
  }

  const parsed = connectSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Check the account details and try again." };

  // OAuth is scaffolded but cannot complete until client credentials exist.
  if (parsed.data.providerType !== "imap") {
    return {
      ok: false as const,
      error:
        "OAuth sign-in is not configured on this deployment. Connect the mailbox with an app password instead.",
    };
  }

  const test = await testMailConnection({
    user: parsed.data.address,
    password: parsed.data.password,
    ...(parsed.data.imap ? { imap: parsed.data.imap } : {}),
    ...(parsed.data.smtp ? { smtp: parsed.data.smtp } : {}),
  });
  if (!test.ok) {
    return { ok: false as const, error: CONNECTION_ERROR_MESSAGES[test.error] };
  }

  const created = await createMailAccount({
    providerType: parsed.data.providerType,
    address: parsed.data.address,
    displayName: parsed.data.displayName,
    ...(parsed.data.iconColor ? { iconColor: parsed.data.iconColor } : {}),
    credentials: {
      user: parsed.data.address,
      password: parsed.data.password,
      ...(parsed.data.imap ? { imap: parsed.data.imap } : {}),
      ...(parsed.data.smtp ? { smtp: parsed.data.smtp } : {}),
    },
  });
  await appendAuditEntry({
    action: "mail.account.connected",
    actor: "owner",
    targetType: "mail_account",
    targetId: created.id,
    metadata: { address: parsed.data.address, provider: parsed.data.providerType },
  });
  revalidatePath("/settings/accounts");
  revalidatePath("/");
  return { ok: true as const };
}

const updateSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string().min(1).max(120).optional(),
  icon: z.string().max(2048).optional(),
  iconColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  replyTo: z.email().max(320).optional(),
  syncIntervalMinutes: z.int().min(1).max(1440).optional(),
});

export async function updateMailAccountAction(input: unknown) {
  const access = await guard({ stepUp: false, scope: "mail-account-update", limit: 60 });
  if (!access.ok) return { ok: false as const, ...(access.error ? { error: access.error } : {}) };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid account settings." };

  const { accountId, ...patch } = parsed.data;
  const updated = await updateMailAccount(accountId, patch);
  if (!updated) return { ok: false as const, error: "Account not found." };

  await appendAuditEntry({
    action: "mail.account.updated",
    actor: "owner",
    targetType: "mail_account",
    targetId: accountId,
  });
  revalidatePath("/settings/accounts");
  revalidatePath("/");
  return { ok: true as const };
}

const deleteSchema = z.object({
  accountId: z.uuid(),
  address: z.email().max(320),
  confirmation: z.string().max(320),
});

export async function deleteMailAccountAction(input: unknown) {
  const access = await guard({ stepUp: true, scope: "mail-account-delete", limit: 10 });
  if (!access.ok) {
    return {
      ok: false as const,
      error: access.error ?? "Verification required. Complete the security check and try again.",
    };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid request." };
  if (parsed.data.confirmation.trim().toLowerCase() !== parsed.data.address.toLowerCase()) {
    return { ok: false as const, error: "Type the account address exactly to confirm." };
  }

  await deleteMailAccount(parsed.data.accountId);
  await appendAuditEntry({
    action: "mail.account.disconnected",
    actor: "owner",
    targetType: "mail_account",
    targetId: parsed.data.accountId,
    metadata: { address: parsed.data.address },
  });
  revalidatePath("/settings/accounts");
  revalidatePath("/");
  return { ok: true as const };
}

export async function setDefaultSenderAction(input: unknown) {
  const access = await guard({ stepUp: false, scope: "mail-account-default", limit: 30 });
  if (!access.ok) return { ok: false as const, ...(access.error ? { error: access.error } : {}) };

  const parsed = z.object({ accountId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid request." };
  await setDefaultSender(parsed.data.accountId);
  await appendAuditEntry({
    action: "mail.account.default_sender",
    actor: "owner",
    targetType: "mail_account",
    targetId: parsed.data.accountId,
  });
  revalidatePath("/settings/accounts");
  revalidatePath("/");
  return { ok: true as const };
}

export async function reorderMailAccountsAction(input: unknown) {
  const access = await guard({ stepUp: false, scope: "mail-account-reorder", limit: 60 });
  if (!access.ok) return { ok: false as const, ...(access.error ? { error: access.error } : {}) };

  const parsed = z.object({ ids: z.array(z.uuid()).min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid request." };
  await reorderMailAccounts(parsed.data.ids);
  revalidatePath("/settings/accounts");
  return { ok: true as const };
}
