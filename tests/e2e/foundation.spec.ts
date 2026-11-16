import { expect, test } from "@playwright/test";

test("the public home page displays a safe, non-functional welcome state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your inbox, on your terms." })).toBeVisible();
  await expect(page.getByText("Do not enter credentials or connect a mail account.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("service_role");
});

test("the health endpoint exposes only liveness", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("baseline security headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
});
