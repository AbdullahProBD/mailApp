import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "@/lib/env-public-schema";

describe("public environment parser", () => {
  it("copies only approved public environment values", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_APP_URL: "https://mail.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "never-copy-this",
        SESSION_PEPPER: "never-copy-this-either",
      }),
    ).toEqual({ NEXT_PUBLIC_APP_URL: "https://mail.example.com" });
  });

  it("allows the public URL to be absent", () => {
    expect(parsePublicEnv({})).toEqual({ NEXT_PUBLIC_APP_URL: undefined });
  });

  it("fails with a generic message and never includes malformed values", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "not-a-url" })).toThrow(
      "Invalid public environment configuration",
    );
  });

  it("refuses an insecure public URL in production", () => {
    expect(() =>
      parsePublicEnv({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://mail.example.com" }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("accepts an HTTPS public URL in production", () => {
    expect(
      parsePublicEnv({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://mail.example.com" }),
    ).toEqual({ NEXT_PUBLIC_APP_URL: "https://mail.example.com" });
  });
});
