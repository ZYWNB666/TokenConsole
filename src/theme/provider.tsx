"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { setThemeCookie } from "./actions";
import type { ResolvedTheme, ThemeSetting } from "./config";

type ThemeContextValue = {
  /** The user's persisted choice ("system" follows the OS preference). */
  setting: ThemeSetting;
  /** What the page actually renders once "system" has been resolved. */
  resolved: ResolvedTheme;
  /** Switches the theme: applies it immediately and persists the cookie. */
  setTheme: (next: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Provides the theme to the client tree. The server layout reads the
 * `tc_theme` cookie and renders the matching class on <html>, so the first
 * paint is already correct for light and dark. For "system" the server
 * cannot know the OS preference: the inline pre-paint script sets the class
 * before hydration, and this provider reconciles React state after mount
 * (and whenever the OS preference changes while "system" is active).
 */
export function ThemeProvider({
  initial,
  children,
}: {
  initial: ThemeSetting;
  children: ReactNode;
}) {
  const [setting, setSetting] = useState<ThemeSetting>(initial);
  // Must match the server render: the server only renders the dark class for
  // an explicit "dark" cookie; "system" is resolved client-side after mount.
  const [resolved, setResolved] = useState<ResolvedTheme>(initial === "dark" ? "dark" : "light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next: ResolvedTheme =
        setting === "system" ? (media.matches ? "dark" : "light") : setting;
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [setting]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      setting,
      resolved,
      setTheme: (next) => {
        setSetting(next);
        void setThemeCookie(next);
      },
    }),
    [setting, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}

/** The theme choice for switcher UI. */
export function useThemeSetting(): ThemeSetting {
  return useTheme().setting;
}

/**
 * The resolved theme for content that must know it (charts pick palettes,
 * since SVG attributes cannot carry CSS variables).
 */
export function useResolvedTheme(): ResolvedTheme {
  return useTheme().resolved;
}

export function useSetTheme(): ThemeContextValue["setTheme"] {
  return useTheme().setTheme;
}
