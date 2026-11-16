import "server-only";

import { parseServerEnv, type ServerEnv } from "./env-schema";

/**
 * Server environment entry point.
 *
 * The `server-only` import makes any client-component import fail the build,
 * so secret values cannot be bundled for the browser. Parsing is memoized per
 * process; startup calls it through `instrumentation.ts`.
 */
let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

/** Test helper: forget the memoized environment. */
export function resetServerEnvForTesting(): void {
  cachedEnv = null;
}

export type { ServerEnv };
