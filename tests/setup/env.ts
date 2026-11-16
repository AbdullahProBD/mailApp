/**
 * Unit-test environment.
 *
 * The app validates a complete server environment at boot, and the crypto
 * layer derives its keyring from `ENCRYPTION_KEYS`. Tests that exercise the
 * real crypto path therefore need a complete, deterministic configuration.
 * Values are test-only and never used against a real service.
 */
Object.assign(process.env, {
  NODE_ENV: "test",
  OWNER_EMAIL: "owner@example.com",
  SETUP_TOKEN: "setup-token-for-unit-tests-0000000000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mailapp",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-unit-tests-0000000",
  ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString("base64")}`,
  SESSION_PEPPER: "session-pepper-for-unit-tests-000000000",
  CRON_SECRET: "cron-secret-for-unit-tests-0000000000000",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-for-tests",
  APP_URL: "https://mail.example.com",
});
