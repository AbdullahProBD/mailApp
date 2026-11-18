import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatMonthYear, formatTime } from "@/lib/datetime/format";

const ROOT = path.resolve(import.meta.dirname, "../..");
const UI_DIRS = ["src/app", "src/components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

const hasSeconds = (value: string): boolean => /(?:\d{1,2}:\d{2}:\d{2})/.test(value);

describe("formatTime", () => {
  const instant = new Date("2026-11-18T21:05:00Z");

  it("renders 24-hour time without seconds", () => {
    expect(formatTime(instant, { timeZone: "UTC", locale: "en-GB" })).toBe("21:05");
  });

  it("renders 12-hour time without seconds", () => {
    expect(formatTime(instant, { timeZone: "UTC", locale: "en-US", hourCycle: 12 })).toBe(
      "9:05 PM",
    );
  });

  it("renders non-hour offsets correctly", () => {
    expect(formatTime(instant, { timeZone: "Asia/Kolkata", locale: "en-GB" })).toBe("02:35");
    expect(formatTime(instant, { timeZone: "Asia/Kathmandu", locale: "en-GB" })).toBe("02:50");
  });

  it("respects DST in at least five zones", () => {
    // Wiring tests for offset resolution: the same instant must show the
    // zone's summer and winter offsets respectively.
    const summer = new Date("2026-07-15T12:00:00Z");
    const winter = new Date("2026-01-15T12:00:00Z");

    expect(formatTime(new Date("2026-07-01T12:00:00Z"), { timeZone: "America/New_York" })).toBe(
      "08:00",
    );
    expect(formatTime(winter, { timeZone: "America/New_York" })).toBe("07:00");
    expect(formatTime(summer, { timeZone: "Australia/Adelaide" })).toBe("21:30");
    expect(formatTime(winter, { timeZone: "Australia/Adelaide" })).toBe("22:30");
    expect(formatTime(summer, { timeZone: "Europe/London" })).toBe("13:00");
    expect(formatTime(winter, { timeZone: "Europe/London" })).toBe("12:00");
    expect(formatTime(summer, { timeZone: "America/Los_Angeles" })).toBe("05:00");
    expect(formatTime(winter, { timeZone: "Pacific/Auckland" })).toBe("01:00");
  });

  it("never emits a seconds field in any locale or zone", () => {
    const locales = ["en-GB", "en-US", "de-DE", "fr-FR", "ja-JP", "ar-EG", "hi-IN"];
    const zones = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Kolkata",
      "Australia/Adelaide",
      "Pacific/Chatham",
    ];
    for (const locale of locales) {
      for (const timeZone of zones) {
        for (const hourCycle of [12, 24] as const) {
          const output = formatTime(new Date("2026-11-18T21:05:33Z"), {
            timeZone,
            locale,
            hourCycle,
          });
          expect(hasSeconds(output), `${locale}/${timeZone}/${String(hourCycle)}: ${output}`).toBe(
            false,
          );
        }
      }
    }
  });
});

describe("formatDateTime and formatDate", () => {
  const instant = new Date("2026-11-18T21:05:33Z");

  it("renders date and time with minute precision", () => {
    expect(formatDateTime(instant, { timeZone: "UTC", locale: "en-GB" })).toBe(
      "18 Nov 2026, 21:05",
    );
  });

  it("renders date-only values", () => {
    expect(formatDate(instant, { timeZone: "UTC", locale: "en-GB" })).toBe("18 Nov 2026");
  });

  it("renders a month heading", () => {
    expect(formatMonthYear(new Date("2026-11-01T00:00:00Z"), "UTC")).toBe("November 2026");
  });

  it("never emits a seconds field", () => {
    expect(hasSeconds(formatDateTime(instant, { timeZone: "Asia/Kathmandu" }))).toBe(false);
  });
});

describe("UI time rendering rule", () => {
  it("keeps Intl/locale formatting and seconds options out of UI source", async () => {
    const offenders: string[] = [];
    for (const dir of UI_DIRS) {
      for await (const file of walk(path.join(ROOT, dir))) {
        const content = await readFile(file, "utf8");
        const violations = [
          /Intl\.DateTimeFormat/.test(content) ? "Intl.DateTimeFormat" : null,
          /\.(?:toLocaleString|toLocaleTimeString|toLocaleDateString)\(/.test(content)
            ? "locale method"
            : null,
          /\bsecond\s*:\s*["']?(?:numeric|2-digit)["']?/.test(content) ? "second option" : null,
          /\bfractionalSecondDigits\b/.test(content) ? "fractionalSecondDigits" : null,
          /["'`][^"'`]*\bss\b[^"'`]*["'`]/.test(content) ? "ss token" : null,
        ].filter((entry): entry is string => entry !== null);
        if (violations.length > 0) {
          offenders.push(`${path.relative(ROOT, file)} (${violations.join(", ")})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
