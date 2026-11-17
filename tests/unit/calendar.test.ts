import { describe, expect, it } from "vitest";

import { buildMonthGrid, isDateKey, parseDateKey, toDateKey } from "@/lib/datetime/calendar";

describe("calendar grid", () => {
  it("builds a Monday-first grid with a multiple of seven cells", () => {
    const grid = buildMonthGrid(2026, 10); // November 2026 (month is 0-based)
    expect(grid.length % 7).toBe(0);
    const days = grid.filter((cell): cell is string => cell !== null);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-11-01");
    expect(days[29]).toBe("2026-11-30");
  });

  it("handles leap years", () => {
    const feb2024 = buildMonthGrid(2024, 1);
    expect(feb2024.filter((cell): cell is string => cell !== null)).toHaveLength(29);
    const feb2023 = buildMonthGrid(2023, 1);
    expect(feb2023.filter((cell): cell is string => cell !== null)).toHaveLength(28);
  });

  it("parses and validates date keys", () => {
    expect(parseDateKey("2026-11-01")).toEqual({ year: 2026, month: 10, day: 1 });
    expect(parseDateKey("2026-02-31")).toBeNull();
    expect(parseDateKey("not-a-date")).toBeNull();
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2023-02-29")).toBe(false);
    expect(toDateKey(2026, 10, 5)).toBe("2026-11-05");
  });
});
