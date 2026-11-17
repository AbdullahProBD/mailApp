import { z } from "zod";

/**
 * Environment schemas and pure parsers.
 *
 * This module deliberately has no `server-only` marker: `next.config.ts` runs
 * in a plain Node context during `next build` and must validate the same
 * contract. Never import it from a client component. Use `src/lib/env.ts`
 * (server) or `src/lib/env.public.ts` (browser) instead.
 */
const ENCRYPTION_KEY_PATTERN = /^v[1-9]\d*$/;

const encryptionKeysSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const entries = value.split(",").map((entry) => entry.trim());
    const versions = new Set<string>();
    return entries.every((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex < 2) {
        return false;
      }
      const version = entry.slice(0, separatorIndex);
      const encodedKey = entry.slice(separatorIndex + 1);
      if (!ENCRYPTION_KEY_PATTERN.test(version) || versions.has(version)) {
        return false;
      }
      versions.add(version);
      const decoded = Buffer.from(encodedKey, "base64");
      return decoded.length === 32 && decoded.toString("base64") === encodedKey;
    });
  }, "ENCRYPTION_KEYS must contain unique vN-prefixed base64-encoded 32-byte keys");

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OWNER_EMAIL: z.email("OWNER_EMAIL must be a valid email address"),
  SETUP_TOKEN: z.string().min(32, "SETUP_TOKEN must be at least 32 characters"),
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
  SUPABASE_URL: z.url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(32, "SUPABASE_SERVICE_ROLE_KEY must be at least 32 characters"),
  ENCRYPTION_KEYS: encryptionKeysSchema,
  SESSION_PEPPER: z.string().min(32, "SESSION_PEPPER must be at least 32 characters"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
  UPSTASH_REDIS_REST_URL: z.url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(16, "UPSTASH_REDIS_REST_TOKEN must be at least 16 characters"),
  APP_URL: z.url("APP_URL must be a valid URL"),
  TRUSTED_PROXY_HEADERS: z.enum(["true", "false"]).default("false"),
  AUTH_SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(5, "AUTH_SESSION_IDLE_MINUTES must be at least 5")
    .max(720, "AUTH_SESSION_IDLE_MINUTES must be at most 720")
    .default(30),
  AUTH_SESSION_ABSOLUTE_HOURS: z.coerce
    .number()
    .int()
    .min(1, "AUTH_SESSION_ABSOLUTE_HOURS must be at least 1")
    .max(168, "AUTH_SESSION_ABSOLUTE_HOURS must be at most 168")
    .default(12),
  /** Have I Been Pwned range API base. Overridable so tests never hit the network. */
  HIBP_API_URL: z.url("HIBP_API_URL must be a valid URL").default("https://api.pwnedpasswords.com"),
  SENTRY_DSN: z.url("SENTRY_DSN must be a valid URL").optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parses and validates the full environment.
 *
 * Errors name the offending variables but never include their values.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`Invalid server environment configuration: ${names}`);
  }

  if (parsed.data.NODE_ENV === "production") {
    assertProductionSafety(parsed.data);
  }

  return parsed.data;
}

/**
 * Parses the versioned encryption key list into an ordered array. The first
 * entry is the active key for new writes; the rest support decryption during
 * rotation. Call only with a validated value.
 */
export function parseEncryptionKeys(value: string): ReadonlyArray<{
  version: string;
  key: Buffer;
}> {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      return {
        version: entry.slice(0, separatorIndex),
        key: Buffer.from(entry.slice(separatorIndex + 1), "base64"),
      };
    });
}

/** Production invariants that must never be relaxed for convenience. */
function assertProductionSafety(env: ServerEnv): void {
  if (new URL(env.APP_URL).protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }

  if (env.TRUSTED_PROXY_HEADERS !== "true") {
    throw new Error("TRUSTED_PROXY_HEADERS must be true in production");
  }
}
