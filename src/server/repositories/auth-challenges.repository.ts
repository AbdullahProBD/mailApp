import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type DbExecutor } from "@/lib/db/client";
import { authChallenges } from "@/lib/db/schema";

export const AUTH_CHALLENGE_PURPOSES = [
  "login_mfa",
  "password_reset",
  "step_up",
  "setup",
  "mfa_enroll",
] as const;

export type AuthChallengePurpose = (typeof AUTH_CHALLENGE_PURPOSES)[number];

export interface AuthChallenge {
  id: string;
  purpose: AuthChallengePurpose;
  codeHmac: string | null;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  browserBindingHash: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

const createChallengeSchema = z.object({
  id: z.uuid().optional(),
  purpose: z.enum(AUTH_CHALLENGE_PURPOSES),
  codeHmac: z.string().min(32).max(128).optional(),
  expiresAt: z.date(),
  browserBindingHash: z.string().min(16).max(128).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
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
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export async function createAuthChallenge(
  input: CreateChallengeInput,
  db: DbExecutor = getDb(),
): Promise<AuthChallenge> {
  const challenge = createChallengeSchema.parse(input);

  const rows = await db
    .insert(authChallenges)
    .values({
      ...(challenge.id ? { id: challenge.id } : {}),
      purpose: challenge.purpose,
      codeHmac: challenge.codeHmac ?? null,
      expiresAt: challenge.expiresAt,
      browserBindingHash: challenge.browserBindingHash ?? null,
      data: challenge.data,
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
  db: DbExecutor = getDb(),
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
export function recordChallengeFailure(challengeId: string, db?: DbExecutor): Promise<number>;
export function recordChallengeFailure(
  challengeId: string,
  now?: Date,
  db?: DbExecutor,
): Promise<number>;
export async function recordChallengeFailure(
  challengeId: string,
  nowOrDb: Date | DbExecutor = new Date(),
  suppliedDb: DbExecutor = getDb(),
): Promise<number> {
  const now = nowOrDb instanceof Date ? nowOrDb : new Date();
  const db = nowOrDb instanceof Date ? suppliedDb : nowOrDb;
  const rows = await db
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(
      and(
        eq(authChallenges.id, challengeId),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now),
        sql`${authChallenges.attempts} < 5`,
      ),
    )
    .returning({ attempts: authChallenges.attempts });

  return rows[0]?.attempts ?? 0;
}

/** Marks a challenge consumed. A consumed challenge can never be reused. */
export async function consumeAuthChallenge(
  challengeId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.id, challengeId),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now),
        sql`${authChallenges.attempts} < 5`,
      ),
    )
    .returning({ id: authChallenges.id });

  return rows.length === 1;
}
