import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = {
  NODE_ENV: "test",
  OWNER_EMAIL: "owner@example.com",
  SETUP_TOKEN: "a".repeat(32),
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mailapp",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "b".repeat(32),
  ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString("base64")}`,
  SESSION_PEPPER: "c".repeat(32),
  CRON_SECRET: "d".repeat(32),
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "e".repeat(16),
  APP_URL: "https://mail.example.com",
};

const originalEnv: Record<string, string | undefined> = { ...process.env };

describe("server environment entry point", () => {
  afterEach(() => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    for (const key of Object.keys(mutableEnv)) {
      if (!(key in originalEnv)) {
        Reflect.deleteProperty(mutableEnv, key);
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("memoizes the parsed environment for the process lifetime", async () => {
    vi.resetModules();
    Object.assign(process.env, ENV);
    const { getServerEnv } = await import("@/lib/env");
    const first = getServerEnv();
    process.env.OWNER_EMAIL = "someone-else@example.com";
    expect(getServerEnv()).toBe(first);
  });

  it("can forget the memoized value for a fresh read", async () => {
    vi.resetModules();
    Object.assign(process.env, ENV);
    const { getServerEnv, resetServerEnvForTesting } = await import("@/lib/env");
    getServerEnv();
    process.env.OWNER_EMAIL = "someone-else@example.com";
    resetServerEnvForTesting();
    expect(getServerEnv().OWNER_EMAIL).toBe("someone-else@example.com");
  });

  it("throws instead of returning a partially configured object", async () => {
    vi.resetModules();
    Object.assign(process.env, ENV);
    Reflect.deleteProperty(process.env, "CRON_SECRET");
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/CRON_SECRET/);
  });
});
