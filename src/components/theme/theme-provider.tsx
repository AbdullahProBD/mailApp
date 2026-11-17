"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyThemeSettings,
  DEFAULT_THEME_SETTINGS,
  parseThemeSettings,
  readStoredThemeSettings,
  resolveTheme,
  writeStoredThemeSettings,
  type Accent,
  type Density,
  type Theme,
  type ThemeSettings,
} from "@/lib/theme/theme";

interface ThemeContextValue {
  settings: ThemeSettings;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setDensity: (density: Density) => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);

  // The inline script already applied the stored theme before paint; sync React
  // state to it after mount so controls reflect reality without a flash.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the pre-paint script's value
    setSettings(readStoredThemeSettings());
  }, []);

  // Apply to the document and persist whenever settings change.
  useEffect(() => {
    applyThemeSettings(settings, { documentElement: document.documentElement }, prefersDark());
    writeStoredThemeSettings(settings);
  }, [settings]);

  // Follow the OS when the user has not pinned a light/dark choice.
  useEffect(() => {
    if (settings.theme !== "system" || typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyThemeSettings(settings, { documentElement: document.documentElement }, query.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, [settings]);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);
  const setAccent = useCallback((accent: Accent) => {
    setSettings((current) => ({ ...current, accent }));
  }, []);
  const setDensity = useCallback((density: Density) => {
    setSettings((current) => ({ ...current, density }));
  }, []);
  const reset = useCallback(() => {
    setSettings(DEFAULT_THEME_SETTINGS);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      settings,
      resolvedTheme: resolveTheme(settings.theme, prefersDark()),
      setTheme,
      setAccent,
      setDensity,
      reset,
    }),
    [settings, setTheme, setAccent, setDensity, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/** Re-exported so consumers can validate persisted values without a deep import. */
export { parseThemeSettings };
