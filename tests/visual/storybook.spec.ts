import { expect, test } from "@playwright/test";

import { openStory } from "./story";
import { DARK_STORIES, STATIC_STORIES } from "./stories";

/**
 * Every story is a stable frame of the design system: local fonts, fixed time,
 * no network and no server state. A failure here means a pixel moved — either
 * an intended design change that needs a refreshed baseline, or a regression.
 */

for (const id of STATIC_STORIES) {
  test(`renders ${id}`, async ({ page }) => {
    await openStory(page, id);
    await expect(page).toHaveScreenshot(`${id}.png`);
  });
}

test.describe("dark theme", () => {
  for (const id of DARK_STORIES) {
    test(`renders ${id} in dark mode`, async ({ page }) => {
      await openStory(page, id, { theme: "dark" });
      await expect(page).toHaveScreenshot(`${id}--dark.png`);
    });
  }

  test("renders the palette with the rose accent and compact density", async ({ page }) => {
    await openStory(page, "foundations-colour--palette", {
      accent: "rose",
      density: "compact",
    });
    await expect(page).toHaveScreenshot("foundations-colour--palette--rose-compact.png");
  });
});

test.describe("interactive states", () => {
  test("opens the folder select", async ({ page }) => {
    await openStory(page, "primitives-forms--select-and-combobox");
    await page.locator('[aria-haspopup="listbox"]').first().click();
    await expect(page.getByRole("listbox").first()).toBeVisible();
    await expect(page).toHaveScreenshot("primitives-forms--select-open.png");
  });

  test("opens the recipient combobox", async ({ page }) => {
    await openStory(page, "primitives-forms--select-and-combobox");
    await page.locator("#combobox-recipient").click();
    await expect(page.getByRole("listbox").first()).toBeVisible();
    await expect(page).toHaveScreenshot("primitives-forms--combobox-open.png");
  });

  test("opens the action menu", async ({ page }) => {
    await openStory(page, "primitives-navigation--action-menu");
    await page.locator('[aria-haspopup="menu"]').click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page).toHaveScreenshot("primitives-navigation--action-menu-open.png");
  });

  test("shows the tooltip on hover", async ({ page }) => {
    await openStory(page, "primitives-overlays--tooltip-label");
    await page.getByRole("button", { name: "Archive message" }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page).toHaveScreenshot("primitives-overlays--tooltip-visible.png");
  });
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps cards and buttons within a phone viewport", async ({ page }) => {
    await openStory(page, "primitives-display--cards");
    await expect(page).toHaveScreenshot("primitives-display--cards--mobile.png");
  });

  test("wraps button rows on a phone", async ({ page }) => {
    await openStory(page, "primitives-buttons--variants");
    await expect(page).toHaveScreenshot("primitives-buttons--variants--mobile.png");
  });
});
