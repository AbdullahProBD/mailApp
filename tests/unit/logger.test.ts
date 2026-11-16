import { describe, expect, it } from "vitest";
import { maskEmailAddress, redactText, scrubLogValue } from "@/lib/logger";

describe("logger PII redaction", () => {
  it("masks the local part while keeping a debugging hint", () => {
    expect(maskEmailAddress("owner@example.com")).toBe("o****@example.com");
  });

  it("masks emails inside free text", () => {
    expect(redactText("failed for owner@example.com after 3 tries")).toBe(
      "failed for o****@example.com after 3 tries",
    );
  });

  it("redacts several addresses", () => {
    expect(redactText("a@b.co and someone@mail.example.org")).toBe(
      "a*@b.co and s******@mail.example.org",
    );
  });

  it("masks malformed values conservatively instead of returning them", () => {
    expect(maskEmailAddress("invalid")).toBe("[redacted]");
    expect(maskEmailAddress("@example.com")).toBe("[redacted]");
  });

  it("leaves text without addresses untouched", () => {
    expect(redactText("request 42 finished")).toBe("request 42 finished");
  });
});

describe("logger object scrubbing", () => {
  it("redacts sensitive keys at any nesting depth", () => {
    expect(
      scrubLogValue({
        password: "hunter2",
        nested: { authToken: "abc", clientSecret: "xyz" },
        cookie: "session=1",
        authorization: "Bearer abc",
        otp: "123456",
      }),
    ).toEqual({
      password: "[redacted]",
      nested: { authToken: "[redacted]", clientSecret: "[redacted]" },
      cookie: "[redacted]",
      authorization: "[redacted]",
      otp: "[redacted]",
    });
  });

  it("masks emails in nested values and arrays", () => {
    expect(scrubLogValue({ to: ["someone@example.com"], text: "sent to a@b.co" })).toEqual({
      to: ["s******@example.com"],
      text: "sent to a*@b.co",
    });
  });

  it("truncates hostile deeply nested structures", () => {
    let value: Record<string, unknown> = { password: "hunter2" };
    for (let index = 0; index < 20; index += 1) {
      value = { nested: value };
    }
    expect(JSON.stringify(scrubLogValue(value))).not.toContain("hunter2");
  });

  it("passes through primitives that are not strings", () => {
    expect(scrubLogValue(42)).toBe(42);
    expect(scrubLogValue(null)).toBeNull();
    expect(scrubLogValue(undefined)).toBeUndefined();
  });
});
