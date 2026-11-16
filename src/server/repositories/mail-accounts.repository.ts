import "server-only";

import { randomUUID } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { decryptString, encryptString } from "@/lib/crypto";
import { getDb, type Database } from "@/lib/db/client";
import { mailAccounts } from "@/lib/db/schema";

export const MAIL_PROVIDER_TYPES = ["gmail", "microsoft", "imap"] as const;
export type MailProviderType = (typeof MAIL_PROVIDER_TYPES)[number];

export const MAIL_ACCOUNT_STATUSES = ["active", "needs_reauth", "error", "disconnected"] as const;
export type MailAccountStatus = (typeof MAIL_ACCOUNT_STATUSES)[number];

/** Account metadata safe to send to the browser: never includes credentials. */
export interface MailAccount {
  id: string;
  providerType: MailProviderType;
  address: string;
  displayName: string;
  icon: string | null;
  iconColor: string | null;
  status: MailAccountStatus;
  sortOrder: number;
  isDefaultSender: boolean;
  replyTo: string | null;
  syncIntervalMinutes: number;
  lastSyncedAt: Date | null;
  maskedCredentials: string | null;
  hasOauthTokens: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const credentialBagSchema = z.record(z.string(), z.unknown());

const createAccountSchema = z.object({
  providerType: z.enum(MAIL_PROVIDER_TYPES),
  address: z.email().max(320),
  displayName: z.string().min(1).max(120),
  icon: z.string().max(2048).optional(),
  iconColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  replyTo: z.email().max(320).optional(),
  sortOrder: z.int().min(0).max(10_000).default(0),
  isDefaultSender: z.boolean().default(false),
  syncIntervalMinutes: z.int().min(1).max(1440).default(5),
  credentials: credentialBagSchema.optional(),
  oauthTokens: credentialBagSchema.optional(),
});

export type CreateMailAccountInput = z.input<typeof createAccountSchema>;

function toMailAccount(
  row: typeof mailAccounts.$inferSelect,
  credentials: { hasCredentials: boolean; hasOauthTokens: boolean },
): MailAccount {
  return {
    id: row.id,
    providerType: row.providerType as MailProviderType,
    address: row.address,
    displayName: row.displayName,
    icon: row.icon ?? null,
    iconColor: row.iconColor ?? null,
    status: row.status as MailAccountStatus,
    sortOrder: row.sortOrder,
    isDefaultSender: row.isDefaultSender,
    replyTo: row.replyTo ?? null,
    syncIntervalMinutes: row.syncIntervalMinutes,
    lastSyncedAt: row.lastSyncedAt ?? null,
    maskedCredentials: credentials.hasCredentials ? "stored" : null,
    hasOauthTokens: credentials.hasOauthTokens,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Creates an account and encrypts credentials before they touch Postgres.
 *
 * The row id is generated up front so it can be bound as authenticated data:
 * ciphertext copied onto another account fails to decrypt.
 */
export async function createMailAccount(
  input: CreateMailAccountInput,
  db: Database = getDb(),
): Promise<MailAccount> {
  const account = createAccountSchema.parse(input);
  const id = randomUUID();

  const encryptedCredentials = account.credentials
    ? encryptString(JSON.stringify(account.credentials), { table: "mail_accounts", rowId: id })
    : null;
  const encryptedOauthTokens = account.oauthTokens
    ? encryptString(JSON.stringify(account.oauthTokens), { table: "mail_accounts", rowId: id })
    : null;

  const rows = await db
    .insert(mailAccounts)
    .values({
      id,
      providerType: account.providerType,
      address: account.address,
      displayName: account.displayName,
      icon: account.icon ?? null,
      iconColor: account.iconColor ?? null,
      replyTo: account.replyTo ?? null,
      sortOrder: account.sortOrder,
      isDefaultSender: account.isDefaultSender,
      syncIntervalMinutes: account.syncIntervalMinutes,
      credentialsEncrypted: encryptedCredentials,
      oauthTokensEncrypted: encryptedOauthTokens,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Mail account insert did not return a row");
  }
  return toMailAccount(row, {
    hasCredentials: encryptedCredentials !== null,
    hasOauthTokens: encryptedOauthTokens !== null,
  });
}

export async function listMailAccounts(db: Database = getDb()): Promise<MailAccount[]> {
  const rows = await db.select().from(mailAccounts).orderBy(asc(mailAccounts.sortOrder));
  return rows.map((row) =>
    toMailAccount(row, {
      hasCredentials: row.credentialsEncrypted !== null,
      hasOauthTokens: row.oauthTokensEncrypted !== null,
    }),
  );
}

/**
 * Decrypts credentials for a single account.
 *
 * Server-only by construction: the module is marked `server-only`, and callers
 * must never place the result in a response, log or error message.
 */
export async function getMailAccountCredentials(
  accountId: string,
  db: Database = getDb(),
): Promise<{
  credentials: Record<string, unknown> | null;
  oauthTokens: Record<string, unknown> | null;
}> {
  const rows = await db.select().from(mailAccounts).where(eq(mailAccounts.id, accountId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Mail account not found");
  }

  const context = { table: "mail_accounts", rowId: row.id };
  return {
    credentials: row.credentialsEncrypted
      ? credentialBagSchema.parse(JSON.parse(decryptString(row.credentialsEncrypted, context)))
      : null,
    oauthTokens: row.oauthTokensEncrypted
      ? credentialBagSchema.parse(JSON.parse(decryptString(row.oauthTokensEncrypted, context)))
      : null,
  };
}

const statusPatchSchema = z.enum(MAIL_ACCOUNT_STATUSES);

export async function setMailAccountStatus(
  accountId: string,
  status: z.input<typeof statusPatchSchema>,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(mailAccounts)
    .set({ status: statusPatchSchema.parse(status) })
    .where(eq(mailAccounts.id, accountId));
}

export async function recordMailAccountSync(
  accountId: string,
  syncedAt: Date = new Date(),
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(mailAccounts)
    .set({ lastSyncedAt: syncedAt, status: "active" })
    .where(eq(mailAccounts.id, accountId));
}

/** Deletes the account; cached folders, threads and messages cascade away. */
export async function deleteMailAccount(accountId: string, db: Database = getDb()): Promise<void> {
  await db.delete(mailAccounts).where(eq(mailAccounts.id, accountId));
}

/** Ensures exactly one account is the default sender. */
export async function setDefaultSender(accountId: string, db: Database = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(mailAccounts).set({ isDefaultSender: false });
    await tx
      .update(mailAccounts)
      .set({ isDefaultSender: true })
      .where(eq(mailAccounts.id, accountId));
  });
}

/** Re-numbers accounts in the given order (drag-and-drop). */
export async function reorderMailAccounts(
  orderedIds: readonly string[],
  db: Database = getDb(),
): Promise<void> {
  const ids = z.array(z.uuid()).min(1).max(100).parse(orderedIds);

  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(mailAccounts).set({ sortOrder: index }).where(eq(mailAccounts.id, id));
    }
  });
}

/** Safe incremental counter used by sync bookkeeping. */
export async function bumpSyncRevision(accountId: string, db: Database = getDb()): Promise<void> {
  await db
    .update(mailAccounts)
    .set({
      syncState: sql`jsonb_set(${mailAccounts.syncState}, '{revision}', to_jsonb(coalesce((${mailAccounts.syncState} ->> 'revision')::int, 0) + 1))`,
    })
    .where(eq(mailAccounts.id, accountId));
}
