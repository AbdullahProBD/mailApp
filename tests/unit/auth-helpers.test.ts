import { describe, expect, it } from "vitest";

import {
  describeScore,
  evaluatePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-policy";
import { describeDevice, formatLastActive } from "@/lib/auth/device";

describe("password policy helpers", () => {
  it("reports length, email, and predictability problems", () => {
    const short = evaluatePassword("short", "owner@example.com");
    expect(short.acceptable).toBe(false);
    expect(short.reasons).toContain(`Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`);
    expect(short.reasons).toContain("Choose a less predictable password.");

    const tooLong = evaluatePassword("x".repeat(PASSWORD_MAX_LENGTH + 1), "owner@example.com");
    expect(tooLong.reasons).toContain(`Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`);

    const containsEmail = evaluatePassword(
      "Owner@example.com-unique-phrase-928!",
      "Owner@Example.com",
    );
    expect(containsEmail.reasons).toContain("Your password must not contain your email address.");
    expect(containsEmail.reasons).toContain(
      "Your password must not contain the name part of your email address.",
    );
  });

  it("does not compare a too-short email local part and accepts a strong password", () => {
    const result = evaluatePassword("LemonTree-Canopy-7#vQ2", "ab@example.com");
    expect(result.acceptable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.warning === null || typeof result.warning === "string").toBe(true);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("maps scores to readable labels", () => {
    expect([0, 1, 2, 3, 4].map(describeScore)).toEqual([
      "Very weak",
      "Weak",
      "Fair",
      "Strong",
      "Very strong",
    ]);
  });
});

describe("session device descriptions", () => {
  it("recognizes supported browsers and platforms", () => {
    expect(
      describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537"),
    ).toEqual({
      browser: "Chrome",
      platform: "Windows",
    });
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Safari/605")).toEqual(
      {
        browser: "Safari",
        platform: "iOS",
      },
    );
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64) Firefox/120")).toEqual({
      browser: "Firefox",
      platform: "Linux",
    });
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Edg/120")).toEqual({
      browser: "Microsoft Edge",
      platform: "macOS",
    });
    expect(describeDevice("Mozilla/5.0 (Android 14) OPR/90")).toEqual({
      browser: "Opera",
      platform: "Android",
    });
    expect(describeDevice("curl/8.0")).toEqual({ browser: "curl", platform: "Unknown platform" });
  });

  it("handles missing and unrecognized user agents", () => {
    expect(describeDevice(null)).toEqual({
      browser: "Unknown browser",
      platform: "Unknown platform",
    });
    expect(describeDevice("unrecognized client")).toEqual({
      browser: "Unknown browser",
      platform: "Unknown platform",
    });
  });

  it("formats activity into non-negative minute, hour, and day buckets", () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    expect(formatLastActive(now, now)).toBe("Active now");
    expect(formatLastActive(new Date(now.getTime() - 10_000), now)).toBe("Active now");
    expect(formatLastActive(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
    expect(formatLastActive(new Date(now.getTime() - 2 * 60 * 60_000), now)).toBe("2 h ago");
    expect(formatLastActive(new Date(now.getTime() - 3 * 24 * 60 * 60_000), now)).toBe("3 d ago");
    expect(formatLastActive(new Date(now.getTime() + 60_000), now)).toBe("Active now");
  });
});
