/**
 * Theme configuration. The choice is persisted in the `tc_theme` cookie so
 * the server can render the right class on <html> and the first paint
 * already carries the right theme — the same approach the language choice
 * uses. "system" follows the OS preference and is resolved client-side by
 * the inline pre-paint script, because only the browser knows it.
 */

export const themeSettings = ["light", "dark", "system"] as const;

export type ThemeSetting = (typeof themeSettings)[number];

/** What the browser actually renders once "system" is resolved. */
export type ResolvedTheme = "light" | "dark";

export const defaultThemeSetting: ThemeSetting = "system";

export const themeCookieName = "tc_theme";

export function isThemeSetting(value: string | undefined | null): value is ThemeSetting {
  return value === "light" || value === "dark" || value === "system";
}

/** Class on <html> for a resolved theme. */
export function resolvedThemeClass(resolved: ResolvedTheme): string {
  return resolved === "dark" ? "dark" : "";
}
