/**
 * Locale configuration for the console. Language choice is persisted in the
 * `tc_lang` cookie so the server can render the right language and set
 * <html lang> without a client round-trip.
 */

export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeCookieName = "tc_lang";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "zh";
}

/** Intl locale used for number/date formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};
