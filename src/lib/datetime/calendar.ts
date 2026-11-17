/**
 * Calendar grid helpers. Days are handled as `YYYY-MM-DD` keys in a target
 * zone; the grid itself is computed in UTC so it never shifts with the host's
 * timezone.
 */

export function toDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DateParts {
  year: number;
  /** 0-based month. */
  month: number;
  day: number;
}

export function parseDateKey(key: string): DateParts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible dates such as 2026-02-31.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month: month - 1, day };
}

export function isDateKey(value: string): boolean {
  return parseDateKey(value) !== null;
}

/**
 * Monday-first month grid. Returns leading/trailing `null` cells so the total
 * length is a multiple of seven.
 */
export function buildMonthGrid(year: number, month: number): Array<string | null> {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(toDateKey(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
