import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
import { mfaMethods } from "@/lib/db/schema";

export const MFA_TYPES = ["email_otp", "totp"] as const;
export type MfaType = (typeof MFA_TYPES)[number];

export interface MfaMethod {
  id: string;
  ownerId: string;
  type: MfaType;
  secretEncrypted: string | null;
  verifiedAt: Date | null;
  preferred: boolean;
  lastUsedStep: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const upsertSchema = z.object({
  ownerId: z.uuid(),
  type: z.enum(MFA_TYPES),
  secretEncrypted: z.string().min(1).optional(),
});

export type UpsertMfaMethodInput = z.input<typeof upsertSchema>;

function toMfaMethod(row: typeof mfaMethods.$inferSelect): MfaMethod {
  return {
    id: row.id,
    ownerId: row.ownerId,
    type: row.type as MfaType,
    secretEncrypted: row.secretEncrypted ?? null,
    verifiedAt: row.verifiedAt ?? null,
    preferred: row.preferred,
    lastUsedStep: row.lastUsedStep ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Creates or updates the owner's method of a given type.
 *
 * `secretEncrypted` must already be ciphertext produced by the crypto module;
 * this layer never sees or stores a plaintext TOTP secret.
 */
export async function upsertMfaMethod(
  input: UpsertMfaMethodInput,
  db: Database = getDb(),
): Promise<MfaMethod> {
  const method = upsertSchema.parse(input);

  const rows = await db
    .insert(mfaMethods)
    .values({
      ownerId: method.ownerId,
      type: method.type,
      secretEncrypted: method.secretEncrypted ?? null,
    })
    .onConflictDoUpdate({
      target: [mfaMethods.ownerId, mfaMethods.type],
      set: {
        secretEncrypted: method.secretEncrypted ?? null,
        verifiedAt: null,
        preferred: false,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("MFA method upsert did not return a row");
  }
  return toMfaMethod(row);
}

export async function listMfaMethods(
  ownerId: string,
  db: Database = getDb(),
): Promise<MfaMethod[]> {
  const rows = await db
    .select()
    .from(mfaMethods)
    .where(eq(mfaMethods.ownerId, ownerId))
    .orderBy(mfaMethods.createdAt);
  return rows.map(toMfaMethod);
}

export async function getVerifiedMfaMethod(
  ownerId: string,
  type: MfaType,
  db: Database = getDb(),
): Promise<MfaMethod | null> {
  const rows = await db
    .select()
    .from(mfaMethods)
    .where(
      and(
        eq(mfaMethods.ownerId, ownerId),
        eq(mfaMethods.type, type),
        eq(mfaMethods.preferred, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row && row.verifiedAt ? toMfaMethod(row) : null;
}

/** Marks a method verified and makes it the preferred method. */
export async function verifyMfaMethod(
  ownerId: string,
  type: MfaType,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<MfaMethod> {
  return db.transaction(async (tx) => {
    await tx.update(mfaMethods).set({ preferred: false }).where(eq(mfaMethods.ownerId, ownerId));

    const rows = await tx
      .update(mfaMethods)
      .set({ verifiedAt: now, preferred: true })
      .where(and(eq(mfaMethods.ownerId, ownerId), eq(mfaMethods.type, type)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("MFA method not found");
    }
    return toMfaMethod(row);
  });
}

/**
 * Records the TOTP step that was accepted, so the same code cannot be replayed
 * inside its validity window.
 */
export async function recordMfaStep(
  ownerId: string,
  type: MfaType,
  step: number,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(mfaMethods)
    .set({ lastUsedStep: step })
    .where(and(eq(mfaMethods.ownerId, ownerId), eq(mfaMethods.type, type)));
}
