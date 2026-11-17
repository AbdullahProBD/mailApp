/** Minimal class joiner. Accepts falsy values so callers can use `cond && "x"`. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
