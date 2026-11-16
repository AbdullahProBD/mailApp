import "server-only";

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/lib/db/client";
import { scheduledEmails } from "@/lib/db/schema";

export const SCHEDULED_EMAIL_STATES = [
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type ScheduledEmailState = (typeof SCHEDULED_EMAIL_STATES)[number];

export interface ScheduledEmail {
  id: string;
  accountId: string;
  draftPayload: Record<string, unknown>;
  sendAtUtc: Date;
  timeZone: string;
  localSendTime: Date;
  state: ScheduledEmailState;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
}

const enqueueSchema = z.object({
  accountId: z.uuid(),
  draftPayload: z.record(z.string(), z.unknown()),
  sendAtUtc: z.date(),
  timeZone: z.string().min(1).max(64),
  localSendTime: z.date(),
  idempotencyKey: z.string().min(8).max(200),
});

export type EnqueueScheduledEmailInput = z.input<typeof enqueueSchema>;

function toScheduledEmail(row: typeof scheduledEmails.$inferSelect): ScheduledEmail {
  return {
    id: row.id,
    accountId: row.accountId,
    draftPayload: row.draftPayload as Record<string, unknown>,
    sendAtUtc: row.sendAtUtc,
    timeZone: row.timeZone,
    localSendTime: row.localSendTime,
    state: row.state as ScheduledEmailState,
    attempts: row.attempts,
    lastError: row.lastError ?? null,
    idempotencyKey: row.idempotencyKey,
    leaseExpiresAt: row.leaseExpiresAt ?? null,
    nextAttemptAt: row.nextAttemptAt ?? null,
    sentAt: row.sentAt ?? null,
  };
}

/**
 * Adds a message to the send queue. The unique idempotency key makes retries
 * from the client safe: a repeated request does not create a second send.
 */
export async function enqueueScheduledEmail(
  input: EnqueueScheduledEmailInput,
  db: Database = getDb(),
): Promise<ScheduledEmail> {
  const email = enqueueSchema.parse(input);

  const rows = await db
    .insert(scheduledEmails)
    .values({
      accountId: email.accountId,
      draftPayload: email.draftPayload,
      sendAtUtc: email.sendAtUtc,
      timeZone: email.timeZone,
      localSendTime: email.localSendTime,
      idempotencyKey: email.idempotencyKey,
    })
    .onConflictDoNothing({ target: scheduledEmails.idempotencyKey })
    .returning();

  const inserted = rows[0];
  if (inserted) {
    return toScheduledEmail(inserted);
  }

  const existing = await db
    .select()
    .from(scheduledEmails)
    .where(eq(scheduledEmails.idempotencyKey, email.idempotencyKey))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new Error("Scheduled email insert did not return a row");
  }
  return toScheduledEmail(row);
}

export async function listScheduledEmails(
  accountId: string,
  db: Database = getDb(),
): Promise<ScheduledEmail[]> {
  const rows = await db
    .select()
    .from(scheduledEmails)
    .where(eq(scheduledEmails.accountId, accountId))
    .orderBy(asc(scheduledEmails.sendAtUtc));
  return rows.map(toScheduledEmail);
}

/**
 * Claims due rows for one dispatcher tick.
 *
 * `FOR UPDATE SKIP LOCKED` lets several dispatchers run concurrently without
 * sending the same message twice: each row is visible to exactly one claimer.
 * The lease timestamp lets a crashed worker's row be reclaimed after timeout.
 */
export async function claimDueScheduledEmails(
  limit = 10,
  now: Date = new Date(),
  leaseSeconds = 120,
  db: Database = getDb(),
): Promise<ScheduledEmail[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: scheduledEmails.id })
      .from(scheduledEmails)
      .where(and(eq(scheduledEmails.state, "scheduled"), lte(scheduledEmails.sendAtUtc, now)))
      .orderBy(asc(scheduledEmails.sendAtUtc))
      .limit(safeLimit)
      .for("update", { skipLocked: true });

    if (due.length === 0) {
      return [];
    }

    const ids = due.map((row) => row.id);
    const claimed = await tx
      .update(scheduledEmails)
      .set({
        state: "sending",
        attempts: sql`${scheduledEmails.attempts} + 1`,
        leaseExpiresAt,
        lastError: null,
      })
      .where(inArray(scheduledEmails.id, ids))
      .returning();

    return claimed.map(toScheduledEmail);
  });
}

/** Reclaims rows whose worker died before finishing (lease expired). */
export async function reclaimExpiredLeases(
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .update(scheduledEmails)
    .set({ state: "scheduled", leaseExpiresAt: null, nextAttemptAt: now })
    .where(and(eq(scheduledEmails.state, "sending"), lte(scheduledEmails.leaseExpiresAt, now)))
    .returning({ id: scheduledEmails.id });
  return rows.length;
}

export async function markScheduledEmailSent(
  emailId: string,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(scheduledEmails)
    .set({ state: "sent", sentAt: now, leaseExpiresAt: null, lastError: null })
    .where(eq(scheduledEmails.id, emailId));
}

/**
 * Records a failure. Retries use exponential backoff; after `maxAttempts` the
 * row is dead-lettered as `failed` so it is visible instead of retrying forever.
 */
export async function markScheduledEmailFailed(
  emailId: string,
  errorMessage: string,
  maxAttempts = 5,
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<{ state: ScheduledEmailState; nextAttemptAt: Date | null }> {
  const rows = await db
    .select({ attempts: scheduledEmails.attempts })
    .from(scheduledEmails)
    .where(eq(scheduledEmails.id, emailId))
    .limit(1);

  const attempts = rows[0]?.attempts ?? 0;
  const exhausted = attempts >= maxAttempts;
  const delaySeconds = Math.min(60 * 2 ** Math.max(attempts - 1, 0), 60 * 60);
  const nextAttemptAt = exhausted ? null : new Date(now.getTime() + delaySeconds * 1000);

  await db
    .update(scheduledEmails)
    .set({
      state: exhausted ? "failed" : "scheduled",
      lastError: errorMessage.slice(0, 2000),
      leaseExpiresAt: null,
      nextAttemptAt,
    })
    .where(eq(scheduledEmails.id, emailId));

  return { state: exhausted ? "failed" : "scheduled", nextAttemptAt };
}

export async function cancelScheduledEmail(
  emailId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(scheduledEmails)
    .set({ state: "cancelled", leaseExpiresAt: null })
    .where(and(eq(scheduledEmails.id, emailId), eq(scheduledEmails.state, "scheduled")))
    .returning({ id: scheduledEmails.id });
  return rows.length === 1;
}
