import { defineConfig, devices } from "@playwright/test";

const PORT = "3200";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Visual regression runs against the static Storybook build, so it needs no
 * database, session or mail account. The snapshots are committed; regenerate
 * them in the same environment CI uses (the `visual` job in ci.yml).
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]]
    : "list",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Anti-aliasing differences between Chromium builds are tiny but real;
      // anything above a tenth of a percent is a design change, not noise.
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "pnpm exec tsx scripts/serve-storybook.ts",
    url: `${BASE_URL}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
