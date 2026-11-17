/**
 * Timezone-aware date/time helpers.
 *
 * The date-time picker returns a UTC instant plus the IANA zone it should be
 * displayed in. The hard part is converting a wall-clock time in a zone to an
 * instant across DST transitions, which `Date` cannot do directly because it
 * always interprets input in the host's local zone. These helpers use
 * `Intl.DateTimeFormat` to compute the zone's offset and resolve ambiguities
 * with an explicit, documented policy.
 */

const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = DTF_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  DTF_CACHE.set(timeZone, formatter);
  return formatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = Number(part.value);
  }
  // Intl formats midnight as hour 24 in some environments.
  const hour = lookup.hour === 24 ? 0 : (lookup.hour ?? 0);
  return {
    year: lookup.year ?? 1970,
    month: lookup.month ?? 1,
    day: lookup.day ?? 1,
    hour,
    minute: lookup.minute ?? 0,
    second: lookup.second ?? 0,
  };
}

/** Offset of `timeZone` at `instant`, in minutes east of UTC. */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const base = instant.getTime();
  // Round to the nearest minute: offsets are whole minutes, and `instant` may
  // carry milliseconds that would otherwise skew the result.
  return Math.round((asUtc - base) / 60_000);
}

/** A short label such as "GMT+5:30" or "GMT" for the zone at `instant`. */
export function formatOffset(instant: Date, timeZone: string): string {
  const minutes = offsetMinutes(instant, timeZone);
  if (minutes === 0) return "GMT";
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `GMT${sign}${String(hours)}${remainder ? `:${String(remainder).padStart(2, "0")}` : ""}`;
}

export interface ZonedDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

export type AmbiguityPolicy = "earlier" | "later";

/** The wall-clock reading of `instant` in `timeZone`, expressed as if it were UTC. */
function wallTimeAsUtc(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

/**
 * Converts a wall-clock time in `timeZone` to a UTC instant.
 *
 * The zone's offset at the target is not knowable without first knowing the
 * instant, so this evaluates the offset a day before and a day after and
 * resolves the wall time against both candidates:
 *
 *   - two valid candidates  -> a DST "fall back" overlap; `policy` picks one
 *   - one valid candidate   -> a normal, unambiguous time
 *   - no valid candidate    -> a DST "spring forward" gap; moves forward to the
 *                              first valid instant, matching calendar behaviour
 */
export function zonedTimeToUtc(
  input: ZonedDateTime,
  timeZone: string,
  policy: AmbiguityPolicy = "earlier",
): Date {
  const { year, month, day, hour, minute } = input;
  const second = input.second ?? 0;
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  const dayMs = 24 * 60 * 60_000;

  const offsets = uniqueNumbers([
    offsetMinutes(new Date(target - dayMs), timeZone),
    offsetMinutes(new Date(target + dayMs), timeZone),
  ]);

  const candidates = uniqueNumbers(offsets.map((offset) => target - offset * 60_000)).sort(
    (a, b) => a - b,
  );

  const valid = candidates.filter(
    (candidate) => wallTimeAsUtc(new Date(candidate), timeZone) === target,
  );

  if (valid.length >= 2) {
    return new Date(policy === "earlier" ? (valid[0] ?? 0) : (valid[valid.length - 1] ?? 0));
  }
  if (valid.length === 1) {
    return new Date(valid[0] ?? 0);
  }
  // Gap: the wall time does not exist. Shift forward to the first valid instant.
  return new Date(candidates[candidates.length - 1] ?? target);
}

/** Formats an instant in a zone using a stable, locale-independent pattern. */
export function formatInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/** The calendar date (YYYY-MM-DD) for an instant in a zone. */
export function dateKeyInZone(instant: Date, timeZone: string): string {
  const parts = partsInZone(instant, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

/** Adds whole days to a UTC instant while preserving the wall-clock time. */
export function addDays(instant: Date, days: number, timeZone: string): Date {
  const parts = partsInZone(instant, timeZone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second),
  );
  return zonedTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    },
    timeZone,
  );
}

/** 12-hour clock label for a UTC instant in a zone, e.g. "9:05 PM". */
export function formatTime12(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

export interface DateTimeValue {
  /** The resolved instant. */
  instant: Date;
  /** The zone the value should be displayed in. */
  timeZone: string;
}

export type { ZonedDateTime as DateTimeParts };
