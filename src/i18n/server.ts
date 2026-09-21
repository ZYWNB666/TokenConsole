import "server-only";

import { cookies } from "next/headers";

import { defaultLocale, isLocale, localeCookieName, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";

const dictionaries: Record<Locale, Dictionary> = { en, zh };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * The active locale, from the `tc_lang` cookie. Unknown or missing values
 * fall back to English; this never throws, because a broken cookie must not
 * take the console down.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(localeCookieName)?.value;
  return isLocale(value) ? value : defaultLocale;
}
