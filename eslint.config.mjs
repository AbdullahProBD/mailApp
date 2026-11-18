import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

/**
 * `eslint-config-next` already registers the jsx-a11y plugin, so a11y rules are
 * enabled here by name rather than by spreading a second copy of the plugin
 * (ESLint refuses to define the same plugin twice).
 */
const TYPED_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts"];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: TYPED_FILES,
  })),
  {
    files: TYPED_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "no-console": "error",
    },
  },
  security.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // Disabled by design: this rule fires on every object read with a runtime
      // key and provides no meaningful signal for typed, validated access.
      "security/detect-object-injection": "off",
    },
  },
  {
    // Tests intentionally read repository files discovered by walking the tree.
    files: ["tests/**/*.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // UI time rule: screens show hours and minutes only, so every instant is
    // rendered by src/lib/datetime/format.ts. Direct Intl/locale formatting in
    // UI source is rejected because it can emit seconds.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "NewExpression[callee.object.object.name='Intl'][callee.object.property.name='DateTimeFormat']",
          message:
            "Format UI times with formatTime/formatDateTime from src/lib/datetime/format.ts, not Intl.DateTimeFormat.",
        },
        {
          selector:
            "CallExpression[callee.object.object.name='Intl'][callee.object.property.name='DateTimeFormat']",
          message:
            "Format UI times with formatTime/formatDateTime from src/lib/datetime/format.ts, not Intl.DateTimeFormat.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(toLocaleString|toLocaleTimeString|toLocaleDateString)$/]",
          message:
            "Format UI times with formatTime/formatDateTime from src/lib/datetime/format.ts, not locale methods that can emit seconds.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),
]);
