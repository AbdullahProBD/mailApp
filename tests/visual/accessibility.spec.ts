import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openStory } from "./story";
import { STATIC_STORIES } from "./stories";

/**
 * Component-level axe checks complement the route-level accessibility spec.
 * Stories are fragments, so the three document/page rules that require a full
 * page (a single main landmark, an h1, every node inside a landmark) are
 * disabled; every rule that concerns the components themselves stays on.
 */
for (const id of STATIC_STORIES) {
  test(`has no accessibility violations: ${id}`, async ({ page }) => {
    await openStory(page, id);
    const results = await new AxeBuilder({ page })
      .disableRules(["landmark-one-main", "page-has-heading-one", "region"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("dark theme keeps contrast for alerts and cards", async ({ page }) => {
  await openStory(page, "primitives-display--alerts", { theme: "dark" });
  const results = await new AxeBuilder({ page })
    .disableRules(["landmark-one-main", "page-has-heading-one", "region"])
    .analyze();
  expect(results.violations).toEqual([]);
});
