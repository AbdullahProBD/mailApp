import { getServerEnv } from "./src/lib/env";

/** Validate deployment configuration as the Node.js server starts. */
export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    getServerEnv();
  }
}
