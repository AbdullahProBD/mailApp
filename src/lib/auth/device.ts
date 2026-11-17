/**
 * Coarse, non-identifying device descriptions for the session list.
 *
 * The full user agent is never rendered: only a short browser and platform
 * label, so the settings page stays readable and leaks nothing extra.
 */
export interface DeviceDescription {
  browser: string;
  platform: string;
}

const BROWSERS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /Edg\//, label: "Microsoft Edge" },
  { pattern: /OPR\//, label: "Opera" },
  { pattern: /Firefox\//, label: "Firefox" },
  { pattern: /Chrome\//, label: "Chrome" },
  { pattern: /Safari\//, label: "Safari" },
  { pattern: /curl\//i, label: "curl" },
];

const PLATFORMS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /iPhone|iPad|iPod/, label: "iOS" },
  { pattern: /Android/, label: "Android" },
  { pattern: /Windows/, label: "Windows" },
  { pattern: /Mac OS X|Macintosh/, label: "macOS" },
  { pattern: /Linux/, label: "Linux" },
];

export function describeDevice(userAgent: string | null): DeviceDescription {
  if (!userAgent) {
    return { browser: "Unknown browser", platform: "Unknown platform" };
  }
  return {
    browser: BROWSERS.find((entry) => entry.pattern.test(userAgent))?.label ?? "Unknown browser",
    platform: PLATFORMS.find((entry) => entry.pattern.test(userAgent))?.label ?? "Unknown platform",
  };
}

/** Formats a timestamp for the session list using the viewer's locale. */
export function formatLastActive(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "Active now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return `${String(Math.round(hours / 24))} d ago`;
}
