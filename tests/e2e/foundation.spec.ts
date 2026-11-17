import { expect, test } from "@playwright/test";

const HEALTH = { status: "ok" };

test("the health endpoint exposes only liveness", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual(HEALTH);
});

test("baseline security headers are present", async ({ request }) => {
  const response = await request.get("/api/health");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
});

test("anonymous visitors never reach the inbox or settings", async ({ page, request }) => {
  // A root loading.tsx means an unauthenticated request streams a redirect
  // (200 + loading shell) instead of a bare 3xx. Either way the browser must
  // land on the auth screen and protected content must never appear.
  const home = await request.get("/", { maxRedirects: 0 });
  if (home.status() === 200) {
    const body = await home.text();
    expect(body).not.toContain("Your inbox");
    expect(body).not.toContain("Welcome,");
  } else {
    expect([307, 308]).toContain(home.status());
    expect(home.headers()["location"]).toMatch(/\/(setup|login)(\?|$)/);
  }

  const settings = await request.get("/settings", { maxRedirects: 0 });
  if (settings.status() === 200) {
    const body = await settings.text();
    expect(body).not.toContain("This device");
    expect(body).not.toContain("service_role");
  } else {
    expect([307, 308]).toContain(settings.status());
    expect(settings.headers()["location"]).toMatch(/\/login(\?|$)/);
  }

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).not.toContainText("service_role");
  await expect(page.locator("body")).not.toContainText("SUPABASE_SERVICE_ROLE_KEY");
});

test("the setup token is never rendered into the page", async ({ request }) => {
  const response = await request.get("/setup", { maxRedirects: 0 });
  if (response.status() === 404) return; // setup already completed by the auth spec
  const body = await response.text();
  expect(body).not.toContain("e2e-only-not-a-production-secret-0000000");
});
