import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
import { recoveryCodes } from "@/lib/db/schema";

/**
 * Recovery codes are stored only as HMAC-SHA-256 hex digests. A leaked database
 * therefore cannot be turned into working codes.
 */
const insertCodesSchema = z.object({
  ownerId: z.uuid(),
  codeHmacs: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(32),
});

export type InsertRecoveryCodesInput = z.input<typeof insertCodesSchema>;

/** Replaces all unused codes for the owner with a fresh batch. */
export async function replaceRecoveryCodes(
  input: InsertRecoveryCodesInput,
  db: Database = getDb(),
): Promise<number> {
  const { ownerId, codeHmacs } = insertCodesSchema.parse(input);

  return db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.ownerId, ownerId));
    const rows = await tx
      .insert(recoveryCodes)
      .values(codeHmacs.map((codeHmac) => ({ ownerId, codeHmac })))
      .returning({ id: recoveryCodes.id });
    return rows.length;
  });
}

/** Returns the unused code row matching the digest, or `null`. */
export async function findUnusedRecoveryCode(
  codeHmac: string,
  db: Database = getDb(),
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: recoveryCodes.id })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.codeHmac, codeHmac), isNull(recoveryCodes.usedAt)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Consumes a code atomically. The `used_at IS NULL` predicate makes concurrent
 * attempts race safely: exactly one caller receives `true`.
 */
export async function consumeRecoveryCode(
  codeId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(recoveryCodes)
    .set({ usedAt: now })
    .where(and(eq(recoveryCodes.id, codeId), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id });

  return rows.length === 1;
}

export async function countUnusedRecoveryCodes(
  ownerId: string,
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .select({ id: recoveryCodes.id })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.ownerId, ownerId), isNull(recoveryCodes.usedAt)));
  return rows.length;
}
