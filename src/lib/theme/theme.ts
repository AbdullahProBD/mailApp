/**
 * Theme resolution and persistence.
 *
 * Pure, DOM-free logic lives here so it can be unit tested; the React provider
 * and the pre-hydration script are thin wrappers around these functions.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = ["indigo", "blue", "emerald", "rose", "amber", "violet", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export interface ThemeSettings {
  theme: Theme;
  accent: Accent;
  density: Density;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  theme: "system",
  accent: "indigo",
  density: "comfortable",
};

export const THEME_STORAGE_KEY = "mailapp:theme";

/** Resolves `system` against a boolean that already reflects the OS preference. */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value);
}

/** Coerces untrusted JSON (localStorage, server props) into valid settings. */
export function parseThemeSettings(value: unknown): ThemeSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_THEME_SETTINGS;
  const record = value as Record<string, unknown>;
  return {
    theme: isTheme(record.theme) ? record.theme : DEFAULT_THEME_SETTINGS.theme,
    accent: isAccent(record.accent) ? record.accent : DEFAULT_THEME_SETTINGS.accent,
    density: isDensity(record.density) ? record.density : DEFAULT_THEME_SETTINGS.density,
  };
}

export function readStoredThemeSettings(storage?: Storage): ThemeSettings {
  const target = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return DEFAULT_THEME_SETTINGS;
  try {
    const raw = target.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    return parseThemeSettings(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

export function writeStoredThemeSettings(settings: ThemeSettings, storage?: Storage): void {
  const target = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can throw in private mode; the in-memory state still applies.
  }
}

export interface ThemeElements {
  documentElement: HTMLElement;
}

/** Applies settings to the document so CSS custom properties take effect. */
export function applyThemeSettings(
  settings: ThemeSettings,
  elements: ThemeElements,
  prefersDark: boolean,
): "light" | "dark" {
  const resolved = resolveTheme(settings.theme, prefersDark);
  const root = elements.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = settings.accent;
  root.dataset.density = settings.density;
  root.style.colorScheme = resolved;
  return resolved;
}

/**
 * Pre-hydration script. Runs synchronously in <head> before the body paints so
 * the stored theme/accent/density is already applied and there is no flash of
 * the wrong theme.
 *
 * The script is a constant string with no interpolation: the storage key and
 * accent list are duplicated here on purpose so nothing dynamic is ever built
 * into executable code. `theme.test.ts` asserts this stays in sync with
 * THEME_STORAGE_KEY and ACCENTS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("mailapp:theme")||"{}");var t=s.theme==="light"||s.theme==="dark"?s.theme:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var r=document.documentElement;r.dataset.theme=t;r.dataset.accent=["indigo","blue","emerald","rose","amber","violet","slate"].indexOf(s.accent)>-1?s.accent:"indigo";r.dataset.density=s.density==="compact"?"compact":"comfortable";r.style.colorScheme=t;}catch(e){}})();`;
