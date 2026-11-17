import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, type DbExecutor } from "@/lib/db/client";
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
  setupRecoveryConfirmedAt: Date | null;
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
    setupRecoveryConfirmedAt: row.setupRecoveryConfirmedAt ?? null,
    timezone: row.timezone,
    locale: row.locale,
    theme: row.theme,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Returns the owner row, or `null` while the installation is unclaimed. */
export async function getOwnerProfile(db: DbExecutor = getDb()): Promise<OwnerProfile | null> {
  const rows = await db.select().from(ownerProfile).limit(1);
  const row = rows[0];
  return row ? toOwnerProfile(row) : null;
}

/** Returns the owner row or throws, for routes that cannot proceed without it. */
export async function requireOwnerProfile(db: DbExecutor = getDb()): Promise<OwnerProfile> {
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
  db: DbExecutor = getDb(),
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
  db: DbExecutor = getDb(),
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
export async function setOwnerPasswordHash(
  ownerId: string,
  passwordHash: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const parsedHash = z.string().min(16).max(512).parse(passwordHash);
  const rows = await db
    .update(ownerProfile)
    .set({ passwordHash: parsedHash })
    .where(and(eq(ownerProfile.id, ownerId), isNull(ownerProfile.setupCompletedAt)))
    .returning({ id: ownerProfile.id });
  if (rows.length !== 1) {
    throw new Error("Owner profile not found");
  }
}

export async function completeOwnerSetup(
  ownerId: string,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<OwnerProfile> {
  const rows = await db
    .update(ownerProfile)
    .set({ setupCompletedAt: now })
    .where(and(eq(ownerProfile.id, ownerId), isNull(ownerProfile.setupCompletedAt)))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Owner profile not found");
  }
  return toOwnerProfile(row);
}

export async function confirmSetupRecoveryCodes(
  ownerId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(ownerProfile)
    .set({ setupRecoveryConfirmedAt: now })
    .where(and(eq(ownerProfile.id, ownerId), isNull(ownerProfile.setupCompletedAt)));
}

/** Invalidates an earlier save acknowledgement whenever a new code batch is issued. */
export async function clearSetupRecoveryConfirmation(
  ownerId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(ownerProfile)
    .set({ setupRecoveryConfirmedAt: null })
    .where(and(eq(ownerProfile.id, ownerId), isNull(ownerProfile.setupCompletedAt)));
}
