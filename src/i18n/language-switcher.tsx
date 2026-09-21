"use client";

import { LanguagesIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { setLocaleCookie } from "@/i18n/actions";
import { useLocale, useT } from "@/i18n/provider";

import { cn } from "@/lib/utils";

/**
 * Language switcher. Persists the choice through a server action that sets
 * the `tc_lang` cookie, then asks the router to refresh, so server-rendered
 * copy, <html lang> and every client string re-render in the new language
 * together.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  async function switchTo(next: Locale) {
    if (next === locale) return;
    await setLocaleCookie(next);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={t("common.language")}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <LanguagesIcon aria-hidden="true" className="size-4.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        {locales.map((option) => (
          <DropdownMenuItem
            key={option}
            aria-current={option === locale ? "true" : undefined}
            onSelect={() => switchTo(option)}
          >
            <span className={cn(option === locale && "font-medium text-primary")}>
              {localeNames[option]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
