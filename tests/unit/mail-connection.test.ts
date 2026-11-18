import { describe, expect, it } from "vitest";

import {
  CONNECTION_ERROR_MESSAGES,
  classifyConnectionError,
  testMailConnection,
} from "@/server/services/mail-connection.service";

describe("mail connection error mapping", () => {
  it("maps provider errors to secret-free categories", () => {
    expect(classifyConnectionError(new Error("Authentication failed"))).toBe("auth");
    expect(classifyConnectionError(Object.assign(new Error("bad login"), { code: "535" }))).toBe(
      "auth",
    );
    expect(classifyConnectionError(new Error("self-signed certificate"))).toBe("tls");
    expect(classifyConnectionError(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }))).toBe(
      "timeout",
    );
    expect(
      classifyConnectionError(Object.assign(new Error("refused"), { code: "ECONNREFUSED" })),
    ).toBe("network");
  });

  it("never echoes raw server text in friendly messages", () => {
    for (const message of Object.values(CONNECTION_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/password=/i);
      expect(message).not.toMatch(/[A-Z0-9]{20,}/);
    }
  });

  it("rejects malformed input before opening a connection", async () => {
    expect(await testMailConnection({ user: "not-an-address", password: "x" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await testMailConnection({ user: "owner@example.com", password: "" })).toEqual({
      ok: false,
      error: "invalid",
    });
    // No servers at all is also invalid rather than a silent success.
    expect(await testMailConnection({ user: "owner@example.com", password: "secret" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});
