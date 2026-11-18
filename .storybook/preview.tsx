import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "../src/app/globals.css";
import "./preview.css";

import { useEffect, useLayoutEffect, type ReactNode } from "react";

import type { Decorator, Preview } from "@storybook/react-vite";

const ACCENTS = ["indigo", "blue", "emerald", "rose", "amber", "violet", "slate"] as const;

/**
 * Applies the real theme preferences to the preview document. The tokens and
 * the `dark` variant key off attributes on <html>, so a wrapper div would not
 * be enough — the attributes must land on the document element.
 */
function StoryFrame({
  theme,
  accent,
  density,
  children,
}: {
  theme: "light" | "dark";
  accent: (typeof ACCENTS)[number];
  density: "comfortable" | "compact";
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.dataset.density = density;
    // Tells the visual-regression harness that this is a fresh story.
    root.dataset.storyReady = "false";
  }, [theme, accent, density]);

  useEffect(() => {
    let cancelled = false;
    async function settle() {
      // Local Geist files still decode asynchronously; wait for them and for
      // two frames so a screenshot never catches a fallback font or a
      // pre-layout frame.
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      if (!cancelled) document.documentElement.dataset.storyReady = "true";
    }
    void settle();
    return () => {
      cancelled = true;
    };
  }, [theme, accent, density]);

  return <div className="story-surface">{children}</div>;
}

const withDesignSystem: Decorator = (Story, context) => {
  const theme = context.globals["theme"] === "dark" ? "dark" : "light";
  const rawAccent = String(context.globals["accent"] ?? "");
  const accent = ACCENTS.find((entry) => entry === rawAccent) ?? "indigo";
  const density = context.globals["density"] === "compact" ? "compact" : "comfortable";

  return (
    <StoryFrame theme={theme} accent={accent} density={density}>
      <Story />
    </StoryFrame>
  );
};

const preview: Preview = {
  decorators: [withDesignSystem],
  initialGlobals: { theme: "light", accent: "indigo", density: "comfortable" },
  globalTypes: {
    theme: {
      description: "Colour theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    accent: {
      description: "Accent palette",
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        items: ACCENTS.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
    density: {
      description: "Control density",
      toolbar: {
        title: "Density",
        icon: "sidebar",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    // The Storybook a11y addon keeps its manual panel, but automatic runs are
    // off: tests/visual/accessibility.spec.ts owns axe so a story is audited
    // exactly once and a second concurrent run cannot collide with it.
    a11y: { test: "off" },
    options: {
      storySort: {
        order: ["Foundations", "Primitives"],
      },
    },
  },
};

export default preview;
