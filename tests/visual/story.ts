import { expect, type Page } from "@playwright/test";

/**
 * Stories are driven through the static Storybook iframe. Fixed time keeps
 * "today" highlights and timezone offsets stable, and `storyReady` is set by
 * the preview decorator only after the document theme is applied, the local
 * Geist files are decoded and two frames have been painted.
 */
export const FIXED_TIME = new Date("2026-03-15T12:00:00.000Z");

export interface StoryGlobals {
  theme?: "light" | "dark";
  accent?: "indigo" | "blue" | "emerald" | "rose" | "amber" | "violet" | "slate";
  density?: "comfortable" | "compact";
}

export async function openStory(page: Page, id: string, globals: StoryGlobals = {}): Promise<void> {
  const theme = globals.theme ?? "light";
  const values = [`theme:${theme}`];
  if (globals.accent) values.push(`accent:${globals.accent}`);
  if (globals.density) values.push(`density:${globals.density}`);

  await page.clock.setFixedTime(FIXED_TIME);
  const query = new URLSearchParams({ id, viewMode: "story", globals: values.join(";") });
  await page.goto(`/iframe.html?${query.toString()}`);

  await page.waitForFunction(
    (expectedTheme) =>
      document.documentElement.dataset["storyReady"] === "true" &&
      document.documentElement.dataset["theme"] === expectedTheme,
    theme,
  );
  await expect(page.locator("#storybook-root")).toBeVisible();
}
