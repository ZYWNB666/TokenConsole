"use server";

import { cookies } from "next/headers";

import { themeCookieName, type ThemeSetting } from "./config";

/**
 * Persists the theme choice in the `tc_theme` cookie. Called from the theme
 * switcher; the client applies the new class on <html> immediately so the
 * switch is instant, and the cookie makes the next server-rendered page
 * agree with what the browser already shows.
 */
export async function setThemeCookie(theme: ThemeSetting): Promise<void> {
  const store = await cookies();
  store.set(themeCookieName, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
