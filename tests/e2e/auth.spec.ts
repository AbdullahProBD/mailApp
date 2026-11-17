import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

/**
 * Full owner journey through the production build.
 *
 * One test, because every step builds on the previous one's database and cookie
 * state. This mirrors the real installation: one owner, one setup.
 */
const OWNER_EMAIL = "owner@example.com";
const SETUP_TOKEN = "e2e-only-not-a-production-secret-0000000";
const SETUP_PASSWORD = "Xk7#pQ2m9Lw4Tz8vR3";
const RECOVERED_PASSWORD = "Vb6$nR2sWq9!Zt4mK8";

let totpSecret = "";
let recoveryCodes: string[] = [];

/** TOTP codes are accepted once per 30-second step, so each use needs a fresh step. */
let lastTotpStep = -1;

function currentTotpStep(): number {
  return Math.floor(Date.now() / 30_000);
}

function generateTotp(): string {
  return new TOTP({
    issuer: "Mail",
    label: OWNER_EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(totpSecret),
  }).generate();
}

async function freshTotp(): Promise<string> {
  if (currentTotpStep() <= lastTotpStep) {
    const remaining = 30_000 - (Date.now() % 30_000);
    await new Promise((resolve) => setTimeout(resolve, remaining + 500));
  }
  lastTotpStep = currentTotpStep();
  return generateTotp();
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Verify/ })).toBeVisible();

  await page.locator("#login-code").fill(await freshTotp());
  await page.getByRole("button", { name: "Sign in securely" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Your inbox" })).toBeVisible();
  await expect(page.getByText(`Welcome, ${OWNER_EMAIL}`)).toBeVisible();
}

/** Completes the password + second-factor step-up the settings page requires. */
async function completeStepUp(page: Page, password: string): Promise<void> {
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm security code" })).toBeVisible();
  await page.locator("#settings-step-up-code").fill(await freshTotp());
  await page.getByRole("button", { name: "Confirm security code" }).click();
}

test("owner setup, session controls, recovery and sign-in", async ({ page }) => {
  // The app is closed until the owner completes setup.
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Owner email").fill(OWNER_EMAIL);
  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: password policy, breach check and Argon2id.
  await page.getByLabel("Create a strong password").fill(SETUP_PASSWORD);
  await expect(page.getByRole("button", { name: "Save password" })).toBeEnabled();
  await page.getByRole("button", { name: "Save password" }).click();

  // Step 3: choose the authenticator app and prove it works.
  await page.getByRole("button", { name: /Authenticator app/ }).click();
  await expect(page.getByRole("img", { name: "Authenticator setup QR code" })).toBeVisible();
  const manualKey = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  expect(manualKey).toMatch(/^[A-Z2-7]{16,}$/);
  totpSecret = manualKey;

  await page.locator("#setup-totp-code").fill(await freshTotp());
  await page.getByRole("button", { name: "Verify authenticator" }).click();

  // Step 4: single-use recovery codes are shown once.
  const codesList = page.getByRole("list", { name: "Recovery codes" });
  await expect(codesList.getByRole("listitem")).toHaveCount(10);
  recoveryCodes = await codesList.getByRole("listitem").allInnerTexts();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish secure setup" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Your inbox" })).toBeVisible();

  // The wizard is permanently closed after completion.
  const setupAfterCompletion = await page.goto("/setup");
  expect(setupAfterCompletion?.status()).toBe(404);
  await page.goto("/");

  // Settings lists the live session and the verified second factor.
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Authenticator app/ })).toBeChecked();

  // Regeneration replaces the whole set and shows the new codes once.
  // This is a sensitive action, so it requires a fresh password + 2FA step-up.
  await page.getByRole("button", { name: "Regenerate recovery codes" }).click();
  await completeStepUp(page, SETUP_PASSWORD);
  const regenerated = page.getByRole("list", { name: "New recovery codes" });
  await expect(regenerated.getByRole("listitem")).toHaveCount(10);
  recoveryCodes = await regenerated.getByRole("listitem").allInnerTexts();

  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("heading", { name: "Your inbox" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, SETUP_PASSWORD);

  // Bulk revocation ends this session too, and the cookie cannot be reused.
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await completeStepUp(page, SETUP_PASSWORD);
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // Recovery proves a single-use code, then sets a new password.
  await page.goto("/recover");
  await page.getByLabel("Owner email").fill(OWNER_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Recover access" })).toBeVisible();

  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByLabel("Recovery code").fill(recoveryCodes[0] ?? "");
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await page.getByLabel("New password").fill(RECOVERED_PASSWORD);
  await expect(page.getByRole("button", { name: "Set new password" })).toBeEnabled();
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect(page).toHaveURL(/\/login\?recovered=1$/);
  await expect(page.getByRole("status")).toContainText("Password updated");

  await signIn(page, RECOVERED_PASSWORD);

  // The password used before recovery is no longer accepted.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SETUP_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
});
