import { defineConfig, devices } from "@playwright/test";

const PORT = "3100";
/** HTTPS so `__Host-` Secure cookies work and production env validation holds. */
const BASE_URL = `https://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec tsx scripts/e2e-server.ts`,
    url: BASE_URL,
    // The readiness probe also has to accept the throwaway certificate.
    ignoreHTTPSErrors: true,
    // Each run gets a fresh in-memory database, so setup always starts clean.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NODE_ENV: "production",
      // The harness only talks to itself over its throwaway certificate (the
      // readiness probe and Next's internal redirect fetches), so the test
      // process trusts that self-signed chain. App code never runs like this.
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      OWNER_EMAIL: "owner@example.com",
      SETUP_TOKEN: "e2e-only-not-a-production-secret-0000000",
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:5432/mailapp",
      SUPABASE_URL: "https://e2e.supabase.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-only-not-a-production-secret-000000",
      ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString("base64")}`,
      SESSION_PEPPER: "e2e-only-not-a-production-secret-0000000",
      CRON_SECRET: "e2e-only-not-a-production-secret-0000000",
      // Point the distributed limiter at a closed loopback port: the call fails
      // immediately and the atomic Postgres fallback is exercised. A made-up
      // hostname would instead depend on DNS resolution speed.
      UPSTASH_REDIS_REST_URL: "http://127.0.0.1:5439",
      UPSTASH_REDIS_REST_TOKEN: "e2e-only-not-a-production-secret",
      APP_URL: BASE_URL,
      TRUSTED_PROXY_HEADERS: "true",
      HIBP_API_URL: "http://127.0.0.1:5433",
    },
  },
});
