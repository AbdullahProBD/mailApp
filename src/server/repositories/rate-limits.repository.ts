import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type DbExecutor } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

/**
 * Postgres fallback limiter, used only when the distributed limiter is
 * unavailable. It is atomic: the upsert increments or resets the window in a
 * single statement, so concurrent requests cannot both slip through.
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

const consumeSchema = z.object({
  key: z.string().min(1).max(255),
  limit: z.int().min(1).max(100_000),
  windowSeconds: z.int().min(1).max(86_400),
});

export type ConsumeRateLimitInput = z.input<typeof consumeSchema>;

export async function consumeRateLimit(
  input: ConsumeRateLimitInput,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = consumeSchema.parse(input);
  const windowEnd = new Date(now.getTime() + windowSeconds * 1000);
  // Dates are passed as ISO strings with an explicit cast: the raw `sql`
  // template does not apply the column's date encoder, and the driver refuses
  // a Date instance as a bind parameter.
  const nowParam = sql`${now.toISOString()}::timestamptz`;
  const windowEndParam = sql`${windowEnd.toISOString()}::timestamptz`;

  const rows = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now, expiresAt: windowEnd })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.expiresAt} <= ${nowParam} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.expiresAt} <= ${nowParam} then ${nowParam} else ${rateLimits.windowStart} end`,
        expiresAt: sql`case when ${rateLimits.expiresAt} <= ${nowParam} then ${windowEndParam} else ${rateLimits.expiresAt} end`,
      },
    })
    .returning({ count: rateLimits.count, expiresAt: rateLimits.expiresAt });

  const row = rows[0];
  if (!row) {
    throw new Error("Rate limit upsert did not return a row");
  }

  return {
    allowed: row.count <= limit,
    limit,
    remaining: Math.max(limit - row.count, 0),
    resetAt: row.expiresAt,
  };
}

/** Reads the current counter without consuming a slot. */
export async function peekRateLimit(
  key: string,
  limit: number,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<RateLimitResult> {
  const parsed = consumeSchema.pick({ key: true, limit: true }).parse({ key, limit });
  const nowParam = sql`${now.toISOString()}::timestamptz`;

  const rows = await db
    .select({ count: rateLimits.count, expiresAt: rateLimits.expiresAt })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, parsed.key), sql`${rateLimits.expiresAt} > ${nowParam}`))
    .limit(1);

  const row = rows[0];
  const count = row?.count ?? 0;
  return {
    allowed: count < parsed.limit,
    limit: parsed.limit,
    remaining: Math.max(parsed.limit - count, 0),
    resetAt: row?.expiresAt ?? new Date(now.getTime() + 60_000),
  };
}

/** Clears a key, e.g. after a successful login. */
export async function resetRateLimit(key: string, db: DbExecutor = getDb()): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Removes expired windows; scheduled cleanup calls this. */
export async function deleteExpiredRateLimits(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<number> {
  const rows = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, now))
    .returning({ id: rateLimits.id });
  return rows.length;
}
