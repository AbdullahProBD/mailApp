import { parseServerEnv } from "./src/lib/env-schema";
import type { NextConfig } from "next";

// Validate required variables during `next build`, not only when a deployment
// first handles a request. Validation errors contain names only, never values.
parseServerEnv(process.env);

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ]);
  },
};

export default nextConfig;
