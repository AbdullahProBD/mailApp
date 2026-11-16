import { describe, expect, it } from "vitest";
import { parseEncryptionKeys, parseServerEnv } from "@/lib/env-schema";

const REQUIRED_ENV: Record<string, string> = {
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

describe("server environment validation", () => {
  it("accepts a complete configuration", () => {
    const env = parseServerEnv({ ...REQUIRED_ENV, NODE_ENV: "test" });
    expect(env.OWNER_EMAIL).toBe("owner@example.com");
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development when unset", () => {
    expect(parseServerEnv(REQUIRED_ENV).NODE_ENV).toBe("development");
  });

  it("fails fast and names the missing variable", () => {
    const withoutCronSecret: Record<string, string> = { ...REQUIRED_ENV };
    Reflect.deleteProperty(withoutCronSecret, "CRON_SECRET");
    expect(() => parseServerEnv(withoutCronSecret)).toThrow(/CRON_SECRET/);
  });

  it("rejects an encryption key that is not 32 base64 bytes", () => {
    expect(() => parseServerEnv({ ...REQUIRED_ENV, ENCRYPTION_KEYS: "v1:not-a-key" })).toThrow(
      /ENCRYPTION_KEYS/,
    );
  });

  it("rejects an encryption key without a version prefix", () => {
    expect(() =>
      parseServerEnv({
        ...REQUIRED_ENV,
        ENCRYPTION_KEYS: Buffer.alloc(32, 1).toString("base64"),
      }),
    ).toThrow(/ENCRYPTION_KEYS/);
  });

  it("rejects an encryption key that is not canonical base64", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    const nonCanonical = `v1:${key.slice(0, -4)}!!!!`;
    expect(() => parseServerEnv({ ...REQUIRED_ENV, ENCRYPTION_KEYS: nonCanonical })).toThrow(
      /ENCRYPTION_KEYS/,
    );
  });

  it("rejects duplicate key versions, which would make rotation ambiguous", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    expect(() =>
      parseServerEnv({ ...REQUIRED_ENV, ENCRYPTION_KEYS: `v1:${key},v1:${key}` }),
    ).toThrow(/ENCRYPTION_KEYS/);
  });

  it("accepts multiple ordered, versioned encryption keys", () => {
    const keyA = Buffer.alloc(32, 1).toString("base64");
    const keyB = Buffer.alloc(32, 2).toString("base64");
    const env = parseServerEnv({
      ...REQUIRED_ENV,
      ENCRYPTION_KEYS: `v2:${keyB}, v1:${keyA}`,
    });
    expect(env.ENCRYPTION_KEYS).toContain("v2:");
  });

  it("refuses an insecure APP_URL in production", () => {
    expect(() =>
      parseServerEnv({
        ...REQUIRED_ENV,
        NODE_ENV: "production",
        APP_URL: "http://mail.example.com",
      }),
    ).toThrow(/HTTPS/);
  });

  it("never includes rejected values in error messages", () => {
    try {
      parseServerEnv({ ...REQUIRED_ENV, OWNER_EMAIL: "not-an-email" });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect((error as Error).message).not.toContain("not-an-email");
      expect((error as Error).message).toContain("OWNER_EMAIL");
    }
  });

  it("rejects short secrets that weaken the design", () => {
    expect(() => parseServerEnv({ ...REQUIRED_ENV, SETUP_TOKEN: "short" })).toThrow(/SETUP_TOKEN/);
    expect(() => parseServerEnv({ ...REQUIRED_ENV, SESSION_PEPPER: "short" })).toThrow(
      /SESSION_PEPPER/,
    );
  });
});

describe("encryption key parsing", () => {
  it("returns keys in configured order with versions", () => {
    const keyA = Buffer.alloc(32, 1);
    const keyB = Buffer.alloc(32, 2);
    const keys = parseEncryptionKeys(`v2:${keyB.toString("base64")},v1:${keyA.toString("base64")}`);
    expect(keys.map((entry) => entry.version)).toEqual(["v2", "v1"]);
    expect(keys[0]?.key).toEqual(keyB);
    expect(keys[1]?.key).toEqual(keyA);
  });

  it("exposes the active (first) key only after validation", () => {
    const active = Buffer.alloc(32, 9);
    const parsed = parseServerEnv({
      ...REQUIRED_ENV,
      ENCRYPTION_KEYS: `v3:${active.toString("base64")}`,
    });
    expect(parseEncryptionKeys(parsed.ENCRYPTION_KEYS)[0]?.key).toEqual(active);
  });
});
