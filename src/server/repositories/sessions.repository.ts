import "server-only";

import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
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
  mfaVerifiedAt: Date | null;
  rememberDevice: boolean;
  revokedAt: Date | null;
}

const createSessionSchema = z.object({
  tokenHash: z.string().min(32).max(128),
  idleExpiresAt: z.date(),
  absoluteExpiresAt: z.date(),
  ipHash: z.string().min(16).max(128).optional(),
  userAgent: z.string().max(1024).optional(),
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
    mfaVerifiedAt: row.mfaVerifiedAt ?? null,
    rememberDevice: row.rememberDevice,
    revokedAt: row.revokedAt ?? null,
  };
}

export async function createSession(
  input: CreateSessionInput,
  db: Database = getDb(),
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
  db: Database = getDb(),
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
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: now, idleExpiresAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeSession(
  sessionId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revokes every session, e.g. after a password or 2FA change. */
export async function revokeAllSessions(
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<void> {
  await db.update(sessions).set({ revokedAt: now }).where(isNull(sessions.revokedAt));
}

/** Deletes rows that can no longer authenticate anyone. */
export async function deleteDeadSessions(
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(lt(sessions.absoluteExpiresAt, now))
    .returning({ id: sessions.id });
  return rows.length;
}
