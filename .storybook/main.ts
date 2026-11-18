import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

const src = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Storybook is the design-system workbench. It deliberately uses the plain
 * React + Vite framework rather than the Next.js one: every story renders a
 * presentational component with explicit props, so no route, server action or
 * database is involved and the visual baseline stays deterministic.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  // Telemetry is off: this project treats outbound calls as opt-in.
  core: { disableTelemetry: true },
  typescript: {
    // react-docgen would need a Babel pass over every component for docs that
    // are not rendered today; the props interfaces are the source of truth.
    reactDocgen: false,
  },
  viteFinal(viteConfig) {
    const existing = viteConfig.resolve?.alias;
    const objectAlias: Record<string, string> = {};
    if (existing && !Array.isArray(existing)) {
      for (const [key, value] of Object.entries(existing)) {
        if (typeof value === "string") objectAlias[key] = value;
      }
    }
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: { ...objectAlias, "@": src },
    };
    return viteConfig;
  },
};

export default config;
