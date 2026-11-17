import { describe, expect, it } from "vitest";

import {
  addDays,
  dateKeyInZone,
  formatInZone,
  formatOffset,
  offsetMinutes,
  zonedTimeToUtc,
} from "@/lib/datetime/timezone";

/** Zones chosen to cover whole-hour, half-hour, DST and southern-hemisphere rules. */
const ZONES = [
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Australia/Sydney",
  "America/Los_Angeles",
] as const;

describe("timezone offsets", () => {
  it("computes standard and daylight offsets", () => {
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/London")).toBe(0);
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/London")).toBe(60);
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "Australia/Sydney")).toBe(660);
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), "Australia/Sydney")).toBe(600);
  });

  it("formats offsets including half-hour zones", () => {
    expect(formatOffset(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata")).toBe("GMT+5:30");
    expect(formatOffset(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe("GMT-5");
    expect(formatOffset(new Date("2026-01-15T12:00:00Z"), "UTC")).toBe("GMT");
  });
});

describe("zoned wall time to UTC", () => {
  it("converts unambiguous wall times in each zone", () => {
    for (const zone of ZONES) {
      const instant = zonedTimeToUtc({ year: 2026, month: 6, day: 15, hour: 9, minute: 5 }, zone);
      // Round-trip: the instant must render back to the same wall time.
      expect(dateKeyInZone(instant, zone)).toBe("2026-06-15");
      expect(formatInZone(instant, zone)).toContain("09:05");
    }
  });

  it("resolves a spring-forward gap forward (New York)", () => {
    // 02:30 does not exist on 2026-03-08; it becomes 03:30 EDT = 07:30Z.
    const instant = zonedTimeToUtc(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      "America/New_York",
    );
    expect(instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves a spring-forward gap forward (London)", () => {
    // 01:30 does not exist on 2026-03-29; it becomes 02:30 BST = 01:30Z.
    const instant = zonedTimeToUtc(
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
      "Europe/London",
    );
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("picks the earlier and later occurrence in a fall-back overlap", () => {
    const wall = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
    const earlier = zonedTimeToUtc(wall, "America/New_York", "earlier");
    const later = zonedTimeToUtc(wall, "America/New_York", "later");
    expect(earlier.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(later.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("keeps the wall time when adding days across a DST boundary", () => {
    const before = zonedTimeToUtc(
      { year: 2026, month: 3, day: 7, hour: 12, minute: 0 },
      "America/New_York",
    );
    const after = addDays(before, 1, "America/New_York");
    // Same wall clock (12:00) one day later, now in EDT (UTC-4).
    expect(after.toISOString()).toBe("2026-03-08T16:00:00.000Z");
    expect(formatInZone(after, "America/New_York")).toContain("12:00");
  });
});
