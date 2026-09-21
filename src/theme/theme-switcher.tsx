"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { themeSettings, type ThemeSetting } from "@/theme/config";
import { useSetTheme, useThemeSetting } from "@/theme/provider";

const SETTING_ICONS: Record<ThemeSetting, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

/**
 * Theme switcher. Applies the choice immediately on the client (the class
 * on <html> plus React state, so charts recolor too) and persists it in the
 * `tc_theme` cookie — the next server render then agrees without a
 * round-trip.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useT();
  const setting = useThemeSetting();
  const setTheme = useSetTheme();
  const SettingIcon = SETTING_ICONS[setting];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={t("theme.toggle")}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <SettingIcon aria-hidden="true" className="size-4.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("theme.toggle")}</DropdownMenuLabel>
        {themeSettings.map((option) => {
          const OptionIcon = SETTING_ICONS[option];
          return (
            <DropdownMenuItem
              key={option}
              aria-current={option === setting ? "true" : undefined}
              onSelect={() => setTheme(option)}
            >
              <OptionIcon aria-hidden="true" />
              <span className={cn(option === setting && "font-medium text-primary")}>
                {t(`theme.${option}`)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
