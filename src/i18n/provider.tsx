"use client";

import { createContext, useContext, type ReactNode } from "react";

import { intlLocale, type Locale } from "./config";
import { en, type Dictionary, type DictionaryKey } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";

const dictionaries: Record<Locale, Dictionary> = { en, zh };

type I18nContextValue = {
  locale: Locale;
  dictionary: Dictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the active locale to the client tree. The server layout reads the
 * `tc_lang` cookie and passes the locale down, so the first paint already
 * carries the right language; the (small) dictionaries ship in the client
 * bundle rather than the RSC payload, keeping even redirect responses lean.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value: I18nContextValue = { locale, dictionary: dictionaries[locale] };
  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return context;
}

export type Translate = (key: DictionaryKey, params?: Record<string, string | number>) => string;

/** Translates a key, interpolating `{name}` placeholders when given. */
export function useT(): Translate {
  const { dictionary } = useI18n();
  return (key, params) => {
    const template = dictionary[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/**
 * Locale-aware number, currency, date and time formatting. All dates are
 * rendered in UTC so values stay consistent with the API's ISO timestamps.
 */
export function useFormat() {
  const { locale } = useI18n();
  const intl = intlLocale(locale);
  return {
    locale,
    number(value: number, options?: Intl.NumberFormatOptions): string {
      return new Intl.NumberFormat(intl, options).format(value);
    },
    currency(value: number): string {
      return new Intl.NumberFormat(intl, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 4 : 2,
      }).format(value);
    },
    /** Short UTC date, e.g. "Sep 20" / "9月20日". */
    day(iso: string): string {
      return new Intl.DateTimeFormat(intl, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${iso.length <= 10 ? `${iso}T00:00:00Z` : iso}`));
    },
    /** UTC date and time, e.g. "Sep 20, 14:32". */
    dateTime(iso: string): string {
      return new Intl.DateTimeFormat(intl, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(new Date(iso));
    },
    /** Percentage for 0–1 shares, e.g. "42%". */
    percent(share: number): string {
      return new Intl.NumberFormat(intl, {
        style: "percent",
        maximumFractionDigits: 0,
      }).format(share);
    },
  };
}
