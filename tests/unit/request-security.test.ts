import { describe, expect, it } from "vitest";

import { issueCsrfToken, verifyCsrfToken } from "@/lib/security/csrf";
import {
  assertSameOrigin,
  getClientAddress,
  isSameOriginRequest,
} from "@/lib/security/request-context";

const APP_ORIGIN = new URL(process.env.APP_URL ?? "https://mail.example.com").origin;

function requestHeaders(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("origin and fetch-metadata checks", () => {
  it("accepts a mutation from the configured origin", () => {
    expect(() => {
      assertSameOrigin(requestHeaders({ origin: APP_ORIGIN, "sec-fetch-site": "same-origin" }));
    }).not.toThrow();
  });

  it("rejects a cross-origin mutation", () => {
    expect(() => {
      assertSameOrigin(requestHeaders({ origin: "https://evil.example" }));
    }).toThrow(/origin/i);
    expect(isSameOriginRequest(requestHeaders({ origin: "https://evil.example" }))).toBe(false);
  });

  it("rejects a mutation without an Origin header", () => {
    expect(() => {
      assertSameOrigin(requestHeaders({ "sec-fetch-site": "same-origin" }));
    }).toThrow(/origin/i);
    expect(() => {
      assertSameOrigin(requestHeaders({ origin: "null" }));
    }).toThrow(/origin/i);
  });

  it("rejects cross-site fetch metadata even with a matching Origin", () => {
    expect(() => {
      assertSameOrigin(requestHeaders({ origin: APP_ORIGIN, "sec-fetch-site": "cross-site" }));
    }).toThrow(/origin/i);
  });

  it("never trusts forwarding headers without an explicit trusted proxy", () => {
    expect(
      getClientAddress(
        requestHeaders({
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "203.0.113.9",
        }),
      ),
    ).toBe("untrusted-client");
  });
});

describe("route-handler CSRF token", () => {
  it("accepts only the token whose digest is stored", () => {
    const token = issueCsrfToken();
    expect(verifyCsrfToken(token.value, token.digest)).toBe(true);
    expect(verifyCsrfToken(`${token.value}x`, token.digest)).toBe(false);
    expect(verifyCsrfToken(token.value, issueCsrfToken().digest)).toBe(false);
  });

  it("rejects empty input instead of comparing equal empty strings", () => {
    expect(verifyCsrfToken("", "")).toBe(false);
    expect(verifyCsrfToken("", issueCsrfToken().digest)).toBe(false);
  });
});
