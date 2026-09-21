"use server";

import { cookies } from "next/headers";

import { localeCookieName, type Locale } from "./config";

/**
 * Persists the language choice in the `tc_lang` cookie. Called from the
 * language switcher; the client then triggers a router refresh so the
 * server-rendered copy, <html lang> and client strings switch together.
 */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
