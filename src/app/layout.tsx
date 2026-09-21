import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getLocale } from "@/i18n/server";
import { I18nProvider } from "@/i18n/provider";
import { getThemeSetting } from "@/theme/server";
import { ThemeProvider } from "@/theme/provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TokenAPI — Enterprise AI API Console",
    template: "%s — TokenAPI",
  },
  description:
    "TokenAPI is an enterprise console for AI API management: keys, usage, reliability and billing.",
};

/*
 * Resolves the `tc_theme` cookie before first paint. The server already
 * renders the class for an explicit light/dark choice; only "system" needs
 * the browser, so this tiny script reads the OS preference and sets the
 * class before anything is painted — no flash of the wrong theme. React
 * never owns this class (hence suppressHydrationWarning on <html>); the
 * theme provider reconciles its state after mount.
 */
const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )tc_theme=(light|dark|system)/);var t=m?m[1]:"system";if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getLocale();
  const theme = await getThemeSetting();

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <I18nProvider locale={locale}>
          <ThemeProvider initial={theme}>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
