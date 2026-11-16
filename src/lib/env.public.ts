import { parsePublicEnv, type PublicEnv } from "./env-public-schema";

export type { PublicEnv };

/**
 * Browser-safe configuration.
 *
 * This module may be imported from client components; it only ever reads
 * `NEXT_PUBLIC_` variables, which Next.js inlines at build time. Never add a
 * secret here: everything in this file ends up in the browser bundle.
 */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
