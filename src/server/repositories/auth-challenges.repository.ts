import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
import { authChallenges } from "@/lib/db/schema";

export const AUTH_CHALLENGE_PURPOSES = ["login_mfa", "password_reset", "step_up", "setup"] as const;

export type AuthChallengePurpose = (typeof AUTH_CHALLENGE_PURPOSES)[number];

export interface AuthChallenge {
  id: string;
  purpose: AuthChallengePurpose;
  codeHmac: string | null;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  browserBindingHash: string | null;
  createdAt: Date;
}

const createChallengeSchema = z.object({
  purpose: z.enum(AUTH_CHALLENGE_PURPOSES),
  codeHmac: z.string().min(32).max(128).optional(),
  expiresAt: z.date(),
  browserBindingHash: z.string().min(16).max(128).optional(),
});

export type CreateChallengeInput = z.input<typeof createChallengeSchema>;

function toAuthChallenge(row: typeof authChallenges.$inferSelect): AuthChallenge {
  return {
    id: row.id,
    purpose: row.purpose as AuthChallengePurpose,
    codeHmac: row.codeHmac ?? null,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? null,
    browserBindingHash: row.browserBindingHash ?? null,
    createdAt: row.createdAt,
  };
}

export async function createAuthChallenge(
  input: CreateChallengeInput,
  db: Database = getDb(),
): Promise<AuthChallenge> {
  const challenge = createChallengeSchema.parse(input);

  const rows = await db
    .insert(authChallenges)
    .values({
      purpose: challenge.purpose,
      codeHmac: challenge.codeHmac ?? null,
      expiresAt: challenge.expiresAt,
      browserBindingHash: challenge.browserBindingHash ?? null,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Auth challenge insert did not return a row");
  }
  return toAuthChallenge(row);
}

/**
 * Loads a challenge that is still usable: unexpired, unconsumed and under the
 * attempt budget. The attempt budget is enforced here so a caller cannot skip
 * it by accident.
 */
export async function findUsableAuthChallenge(
  challengeId: string,
  now: Date = new Date(),
  maxAttempts = 5,
  db: Database = getDb(),
): Promise<AuthChallenge | null> {
  const rows = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.id, challengeId),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now),
        sql`${authChallenges.attempts} < ${maxAttempts}`,
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? toAuthChallenge(row) : null;
}

/** Records a failed verification attempt and returns the new count. */
export async function recordChallengeFailure(
  challengeId: string,
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(eq(authChallenges.id, challengeId))
    .returning({ attempts: authChallenges.attempts });

  return rows[0]?.attempts ?? 0;
}

/** Marks a challenge consumed. A consumed challenge can never be reused. */
export async function consumeAuthChallenge(
  challengeId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(and(eq(authChallenges.id, challengeId), isNull(authChallenges.consumedAt)))
    .returning({ id: authChallenges.id });

  return rows.length === 1;
}
