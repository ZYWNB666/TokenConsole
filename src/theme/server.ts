import "server-only";

import { cookies } from "next/headers";

import {
  defaultThemeSetting,
  isThemeSetting,
  themeCookieName,
  type ThemeSetting,
} from "./config";

/**
 * Reads the theme choice from the `tc_theme` cookie. Unknown or missing
 * values fall back to "system"; a broken cookie must never take the console
 * down.
 */
export async function getThemeSetting(): Promise<ThemeSetting> {
  const store = await cookies();
  const value = store.get(themeCookieName)?.value;
  return isThemeSetting(value) ? value : defaultThemeSetting;
}
