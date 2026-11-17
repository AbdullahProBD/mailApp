import "server-only";

import { Redis } from "@upstash/redis";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { hmacSha256Hex } from "@/lib/crypto/hash";
import {
  consumeRateLimit,
  type RateLimitResult,
} from "@/server/repositories/rate-limits.repository";

const redisKeySchema = z.string().min(1).max(200);
const limiterConfigSchema = z.object({
  limit: z.int().min(1).max(100_000),
  windowSeconds: z.int().min(1).max(31_536_000),
});

let redisClient: Redis | null = null;
let forceDatabaseForTesting = false;

/**
 * A rate limiter that hangs is as bad as one that is down: the request would
 * never complete. Redis is therefore always raced against a short deadline and
 * the durable fallback takes over.
 */
const REDIS_TIMEOUT_MS = 2_000;

async function withRedisDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Rate limiter timed out"));
        }, REDIS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function getRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }
  const env = getServerEnv();
  redisClient = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redisClient;
}

function opaqueKey(key: string): string {
  return `mailapp:ratelimit:${hmacSha256Hex(key, getServerEnv().SESSION_PEPPER)}`;
}

function millisecondsFromTtl(ttl: number | null, now: number): number {
  return ttl && ttl > 0 ? now + ttl * 1000 : now + 60_000;
}

async function consumeRedis(
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const storageKey = opaqueKey(key);
  const script = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;
  const counterScript = redis.createScript<[number | string, number | string]>(script);
  const result = await counterScript.eval([storageKey], [String(windowSeconds)]);
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(limit - count, 0),
    resetAt: new Date(millisecondsFromTtl(Number.isFinite(ttl) ? ttl : null, now.getTime())),
  };
}

/**
 * Atomically consumes a distributed rate-limit slot.
 *
 * Redis is the primary store. A Redis error fails closed if Postgres is also
 * unavailable; Postgres is used as a durable fallback for local development
 * and transient Redis outages. Auth-sensitive limits are therefore never
 * silently skipped.
 */
export async function consumeDistributedRateLimit(
  input: { key: string; limit: number; windowSeconds: number },
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const { key, ...config } = input;
  const parsedKey = redisKeySchema.parse(key);
  const parsedConfig = limiterConfigSchema.parse(config);

  if (!forceDatabaseForTesting) {
    try {
      return await withRedisDeadline(
        consumeRedis(parsedKey, parsedConfig.limit, parsedConfig.windowSeconds, now),
      );
    } catch {
      // Use the atomic database fallback below. Do not log keys or payloads.
    }
  }

  return consumeRateLimit({ key: opaqueKey(parsedKey), ...parsedConfig }, now);
}

/** Removes the counter for a specific key in the active stores. */
export async function resetDistributedRateLimit(key: string): Promise<void> {
  const parsedKey = redisKeySchema.parse(key);
  const storageKey = opaqueKey(parsedKey);
  if (!forceDatabaseForTesting) {
    try {
      await withRedisDeadline(getRedis().del(storageKey));
    } catch {
      // Continue with the local durable store.
    }
  }
  const { resetRateLimit } = await import("@/server/repositories/rate-limits.repository");
  await resetRateLimit(storageKey);
}

/** Test seam for deterministic repository tests. */
export function configureRateLimiterForTesting(useDatabase: boolean): void {
  forceDatabaseForTesting = useDatabase;
}

/** Test-only: forget cached Upstash client and reset mode. */
export function resetRateLimiterForTesting(): void {
  redisClient = null;
  forceDatabaseForTesting = false;
}
