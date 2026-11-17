import "server-only";

import { and, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, type DbExecutor } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

/**
 * Sessions store only a keyed hash of the opaque cookie token. The plaintext
 * token exists solely in the response cookie.
 */
export interface SessionRecord {
  id: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  ipHash: string | null;
  userAgent: string | null;
  country: string | null;
  mfaVerifiedAt: Date | null;
  stepUpVerifiedAt: Date | null;
  rememberDevice: boolean;
  tokenRotatedAt: Date | null;
  revokedAt: Date | null;
}

const createSessionSchema = z.object({
  tokenHash: z.string().min(32).max(128),
  idleExpiresAt: z.date(),
  absoluteExpiresAt: z.date(),
  ipHash: z.string().min(16).max(128).optional(),
  userAgent: z.string().max(1024).optional(),
  country: z.string().length(2).optional(),
  mfaVerifiedAt: z.date().optional(),
  rememberDevice: z.boolean().default(false),
});

export type CreateSessionInput = z.input<typeof createSessionSchema>;

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    ipHash: row.ipHash ?? null,
    userAgent: row.userAgent ?? null,
    country: row.country ?? null,
    mfaVerifiedAt: row.mfaVerifiedAt ?? null,
    stepUpVerifiedAt: row.stepUpVerifiedAt ?? null,
    rememberDevice: row.rememberDevice,
    tokenRotatedAt: row.tokenRotatedAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

export async function createSession(
  input: CreateSessionInput,
  db: DbExecutor = getDb(),
): Promise<SessionRecord> {
  const session = createSessionSchema.parse(input);

  const rows = await db
    .insert(sessions)
    .values({
      tokenHash: session.tokenHash,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      ipHash: session.ipHash ?? null,
      userAgent: session.userAgent ?? null,
      country: session.country ?? null,
      mfaVerifiedAt: session.mfaVerifiedAt ?? null,
      rememberDevice: session.rememberDevice,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Session insert did not return a row");
  }
  return toSessionRecord(row);
}

/**
 * Resolves a live session: not revoked and inside both the idle and absolute
 * windows. Expired rows are treated exactly like unknown tokens.
 */
export async function findActiveSessionByTokenHash(
  tokenHash: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<SessionRecord | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? toSessionRecord(row) : null;
}

/** Slides the idle window after authenticated activity. */
export async function touchSession(
  sessionId: string,
  idleExpiresAt: Date,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: now, idleExpiresAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeSession(
  sessionId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revokes every session, e.g. after a password or 2FA change. */
export async function revokeAllSessions(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.update(sessions).set({ revokedAt: now }).where(isNull(sessions.revokedAt));
}

/** Revokes every live session except the caller's own. */
export async function revokeOtherSessions(
  keepSessionId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<number> {
  const revocable = and(isNull(sessions.revokedAt), ne(sessions.id, keepSessionId));
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(revocable)
    .returning({ id: sessions.id });
  return rows.length;
}

/** Live sessions for the device list, most recently active first. */
export async function listActiveSessions(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<SessionRecord[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map(toSessionRecord);
}

/**
 * Atomically swaps a session's token digest.
 *
 * Returns the updated row, or `null` when the session is revoked or gone, so a
 * caller cannot resurrect a session that was killed concurrently.
 */
export async function rotateSessionTokenHash(
  sessionId: string,
  tokenHash: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<SessionRecord | null> {
  const rows = await db
    .update(sessions)
    .set({ tokenHash, tokenRotatedAt: now })
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .returning();
  const row = rows[0];
  return row ? toSessionRecord(row) : null;
}

/** Marks a session as having satisfied its second factor. */
export async function markSessionMfaVerified(
  sessionId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ mfaVerifiedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Marks a live session as freshly verified for sensitive actions. */
export async function markSessionStepUpVerified(
  sessionId: string,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(sessions)
    .set({ stepUpVerifiedAt: now })
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .returning({ id: sessions.id });
  return rows.length === 1;
}

/** Deletes rows that can no longer authenticate anyone. */
export async function deleteDeadSessions(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(lt(sessions.absoluteExpiresAt, now))
    .returning({ id: sessions.id });
  return rows.length;
}
