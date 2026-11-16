import { defineConfig, devices } from "@playwright/test";

const PORT = "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
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
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      OWNER_EMAIL: "owner@example.com",
      SETUP_TOKEN: "e2e-only-not-a-production-secret-0000000",
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:5432/mailapp",
      SUPABASE_URL: "https://e2e.supabase.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-only-not-a-production-secret-000000",
      ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString("base64")}`,
      SESSION_PEPPER: "e2e-only-not-a-production-secret-0000000",
      CRON_SECRET: "e2e-only-not-a-production-secret-0000000",
      UPSTASH_REDIS_REST_URL: "https://e2e.upstash.invalid",
      UPSTASH_REDIS_REST_TOKEN: "e2e-only-not-a-production-secret",
      APP_URL: `https://localhost:${PORT}`,
    },
  },
});
