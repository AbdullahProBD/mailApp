import nextEnv from "@next/env";

/**
 * Loads `.env*` files exactly as Next.js does, so CLI scripts see the same
 * configuration as the running app. Call before reading `process.env`.
 *
 * `@next/env` ships CommonJS; the default import works across Node versions
 * where named-export detection is not available.
 */
export function loadScriptEnv(isDev = process.env.NODE_ENV !== "production"): void {
  nextEnv.loadEnvConfig(process.cwd(), isDev);
}
