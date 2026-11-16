import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
import { ownerProfile } from "@/lib/db/schema";

/**
 * The owner row is a singleton: the schema enforces it with a unique index on a
 * constant column, so a second setup can never claim the installation.
 */
export interface OwnerProfile {
  id: string;
  email: string;
  passwordHash: string | null;
  setupCompletedAt: Date | null;
  timezone: string;
  locale: string;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}

const claimSchema = z.object({
  email: z.email("Owner email must be a valid address").max(320),
});

const profileUpdateSchema = z
  .object({
    timezone: z.string().min(1).max(64).optional(),
    locale: z.string().min(2).max(35).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    passwordHash: z.string().min(16).max(512).optional(),
  })
  .strict();

export type OwnerProfileUpdate = z.input<typeof profileUpdateSchema>;

function toOwnerProfile(row: typeof ownerProfile.$inferSelect): OwnerProfile {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash ?? null,
    setupCompletedAt: row.setupCompletedAt ?? null,
    timezone: row.timezone,
    locale: row.locale,
    theme: row.theme,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Returns the owner row, or `null` while the installation is unclaimed. */
export async function getOwnerProfile(db: Database = getDb()): Promise<OwnerProfile | null> {
  const rows = await db.select().from(ownerProfile).limit(1);
  const row = rows[0];
  return row ? toOwnerProfile(row) : null;
}

/** Returns the owner row or throws, for routes that cannot proceed without it. */
export async function requireOwnerProfile(db: Database = getDb()): Promise<OwnerProfile> {
  const owner = await getOwnerProfile(db);
  if (!owner) {
    throw new Error("Owner profile has not been created yet");
  }
  return owner;
}

/**
 * Creates the owner row if it does not exist.
 *
 * Concurrent first-run attempts converge on the same row because the unique
 * index on `singleton` rejects the loser.
 */
export async function claimOwnerProfile(
  input: z.input<typeof claimSchema>,
  db: Database = getDb(),
): Promise<OwnerProfile> {
  const { email } = claimSchema.parse(input);

  await db.insert(ownerProfile).values({ email }).onConflictDoNothing();

  const owner = await getOwnerProfile(db);
  if (!owner) {
    throw new Error("Owner profile insert did not produce a row");
  }
  return owner;
}

/** Updates mutable owner settings. Encrypted or secret fields are never accepted. */
export async function updateOwnerProfile(
  ownerId: string,
  input: OwnerProfileUpdate,
  db: Database = getDb(),
): Promise<OwnerProfile> {
  const patch = profileUpdateSchema.parse(input);

  if (Object.keys(patch).length === 0) {
    return requireOwnerProfile(db);
  }

  const rows = await db
    .update(ownerProfile)
    .set(patch)
    .where(eq(ownerProfile.id, ownerId))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Owner profile not found");
  }
  return toOwnerProfile(row);
}

/** Marks the first-run wizard complete; setup routes return 404 afterwards. */
export async function completeOwnerSetup(
  ownerId: string,
  db: Database = getDb(),
): Promise<OwnerProfile> {
  const rows = await db
    .update(ownerProfile)
    .set({ setupCompletedAt: new Date() })
    .where(eq(ownerProfile.id, ownerId))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Owner profile not found");
  }
  return toOwnerProfile(row);
}
