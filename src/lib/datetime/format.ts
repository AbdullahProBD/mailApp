/**
 * The only way UI code renders times.
 *
 * The product rule is that screens show hours and minutes, never seconds
 * (a drip batch can send several messages inside the same minute, so seconds
 * would mislead and are resolved by batch position, not display). Every value
 * is an instant in UTC; the caller supplies the zone to display it in.
 *
 * This module is intentionally dependency-free and safe to import from client
 * components. `tests/unit/format.test.ts` asserts the output can never contain
 * seconds, and an ESLint rule forbids `Intl.DateTimeFormat` in UI source.
 */

export interface TimeFormatOptions {
  /** IANA zone used to render the instant. */
  timeZone: string;
  /** 12 or 24 hour clock. Defaults to 24. */
  hourCycle?: 12 | 24;
  /** BCP 47 locale. Defaults to en-GB. */
  locale?: string;
}

export interface DateFormatOptions {
  timeZone: string;
  /** Defaults to "medium" (e.g. "18 Nov 2026"). */
  dateStyle?: "short" | "medium" | "long" | "full";
  locale?: string;
}

const DEFAULT_LOCALE = "en-GB";

function clockOptions(options: TimeFormatOptions): Intl.DateTimeFormatOptions {
  const hourCycle = options.hourCycle === 12 ? "h12" : "h23";
  return {
    timeZone: options.timeZone,
    // h23 keeps midnight as 00 rather than 24 in every locale.
    hourCycle,
    hour: hourCycle === "h12" ? "numeric" : "2-digit",
    minute: "2-digit",
  };
}

/** Renders "21:05" or "9:05 PM". Never includes seconds. */
export function formatTime(value: Date | number, options: TimeFormatOptions): string {
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, clockOptions(options)).format(
    value,
  );
}

/**
 * Renders a date and time, e.g. "18 Nov 2026, 21:05". Never includes seconds.
 *
 * `dateStyle` cannot be combined with time fields in one formatter, so the
 * date and clock are formatted separately by the shared helpers.
 */
export function formatDateTime(
  value: Date | number,
  options: TimeFormatOptions & Pick<DateFormatOptions, "dateStyle">,
): string {
  const dateOptions: DateFormatOptions = {
    timeZone: options.timeZone,
    dateStyle: options.dateStyle ?? "medium",
  };
  if (options.locale !== undefined) dateOptions.locale = options.locale;
  const date = formatDate(value, dateOptions);
  return `${date}, ${formatTime(value, options)}`;
}

/** Renders just the date, e.g. "18 Nov 2026". */
export function formatDate(value: Date | number, options: DateFormatOptions): string {
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: options.timeZone,
    dateStyle: options.dateStyle ?? "medium",
  }).format(value);
}

/** Renders a month heading, e.g. "November 2026". */
export function formatMonthYear(
  value: Date | number,
  timeZone: string,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, month: "long", year: "numeric" }).format(
    value,
  );
}
