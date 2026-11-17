import { describe, expect, it } from "vitest";

import {
  ACCENTS,
  applyThemeSettings,
  DEFAULT_THEME_SETTINGS,
  parseThemeSettings,
  readStoredThemeSettings,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  writeStoredThemeSettings,
  type ThemeSettings,
} from "@/lib/theme/theme";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function fakeRoot(): HTMLElement {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  return { dataset, style } as unknown as HTMLElement;
}

describe("theme resolution", () => {
  it("resolves system against the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("coerces untrusted persisted values to valid settings", () => {
    expect(parseThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS);
    expect(parseThemeSettings({ theme: "neon", accent: "chartreuse", density: "huge" })).toEqual(
      DEFAULT_THEME_SETTINGS,
    );
    expect(parseThemeSettings({ theme: "dark", accent: "emerald", density: "compact" })).toEqual({
      theme: "dark",
      accent: "emerald",
      density: "compact",
    });
  });

  it("round-trips settings through storage", () => {
    const storage = new MemoryStorage();
    const settings: ThemeSettings = { theme: "dark", accent: "rose", density: "compact" };
    writeStoredThemeSettings(settings, storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify(settings));
    expect(readStoredThemeSettings(storage)).toEqual(settings);
  });

  it("falls back to defaults for corrupt storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, "{not json");
    expect(readStoredThemeSettings(storage)).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("applies theme, accent and density to the document element", () => {
    const root = fakeRoot();
    const resolved = applyThemeSettings(
      { theme: "system", accent: "violet", density: "compact" },
      { documentElement: root },
      true,
    );
    expect(resolved).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.accent).toBe("violet");
    expect(root.dataset.density).toBe("compact");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("keeps the pre-hydration script in sync with the storage key and accents", () => {
    expect(THEME_INIT_SCRIPT).toContain(`"${THEME_STORAGE_KEY}"`);
    for (const accent of ACCENTS) {
      expect(THEME_INIT_SCRIPT).toContain(`"${accent}"`);
    }
  });
});
