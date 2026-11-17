import "server-only";

import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { decryptString, encryptString } from "@/lib/crypto";
import { getDb, withTransaction, type DbExecutor } from "@/lib/db/client";
import { mailSenderProviders } from "@/lib/db/schema";

export const SENDER_PROVIDER_KINDS = ["resend", "postmark", "ses", "smtp"] as const;
export type SenderProviderKind = (typeof SENDER_PROVIDER_KINDS)[number];

/** Provider metadata safe for the browser; credentials stay server-side. */
export interface SenderProvider {
  id: string;
  kind: SenderProviderKind;
  fromAddress: string;
  fromName: string | null;
  isDefault: boolean;
  hasCredentials: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const credentialsSchema = z.record(z.string(), z.unknown());

const createProviderSchema = z.object({
  kind: z.enum(SENDER_PROVIDER_KINDS),
  fromAddress: z.email().max(320),
  fromName: z.string().min(1).max(120).optional(),
  isDefault: z.boolean().default(false),
  credentials: credentialsSchema,
});

export type CreateSenderProviderInput = z.input<typeof createProviderSchema>;

function toSenderProvider(row: typeof mailSenderProviders.$inferSelect): SenderProvider {
  return {
    id: row.id,
    kind: row.kind as SenderProviderKind,
    fromAddress: row.fromAddress,
    fromName: row.fromName ?? null,
    isDefault: row.isDefault,
    hasCredentials: row.credentialsEncrypted.length > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Stores sender credentials encrypted with an AAD bound to the row id. */
export async function createSenderProvider(
  input: CreateSenderProviderInput,
  db: DbExecutor = getDb(),
): Promise<SenderProvider> {
  const provider = createProviderSchema.parse(input);
  const id = randomUUID();

  const rows = await withTransaction(db, async (tx) => {
    if (provider.isDefault) {
      await tx.update(mailSenderProviders).set({ isDefault: false });
    }
    return tx
      .insert(mailSenderProviders)
      .values({
        id,
        kind: provider.kind,
        fromAddress: provider.fromAddress,
        fromName: provider.fromName ?? null,
        isDefault: provider.isDefault,
        credentialsEncrypted: encryptString(JSON.stringify(provider.credentials), {
          table: "mail_sender_providers",
          rowId: id,
        }),
      })
      .returning();
  });

  const row = rows[0];
  if (!row) {
    throw new Error("Sender provider insert did not return a row");
  }
  return toSenderProvider(row);
}

export async function listSenderProviders(db: DbExecutor = getDb()): Promise<SenderProvider[]> {
  const rows = await db
    .select()
    .from(mailSenderProviders)
    .orderBy(asc(mailSenderProviders.createdAt));
  return rows.map(toSenderProvider);
}

/** Server-only credential access for the OTP sender. */
export async function getSenderProviderCredentials(
  providerId: string,
  db: DbExecutor = getDb(),
): Promise<Record<string, unknown>> {
  const rows = await db
    .select()
    .from(mailSenderProviders)
    .where(eq(mailSenderProviders.id, providerId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Sender provider not found");
  }

  return credentialsSchema.parse(
    JSON.parse(
      decryptString(row.credentialsEncrypted, {
        table: "mail_sender_providers",
        rowId: row.id,
      }),
    ),
  );
}

/** Replaces credentials (for example after a provider key rotation). */
export async function replaceSenderProviderCredentials(
  providerId: string,
  credentials: Record<string, unknown>,
  db: DbExecutor = getDb(),
): Promise<void> {
  const parsed = credentialsSchema.parse(credentials);

  await db
    .update(mailSenderProviders)
    .set({
      credentialsEncrypted: encryptString(JSON.stringify(parsed), {
        table: "mail_sender_providers",
        rowId: providerId,
      }),
    })
    .where(eq(mailSenderProviders.id, providerId));
}

export async function setDefaultSenderProvider(
  providerId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.update(mailSenderProviders).set({ isDefault: false });
    await tx
      .update(mailSenderProviders)
      .set({ isDefault: true })
      .where(eq(mailSenderProviders.id, providerId));
  });
}

export async function deleteSenderProvider(
  providerId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.delete(mailSenderProviders).where(eq(mailSenderProviders.id, providerId));
}
