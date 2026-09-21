import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getLocale } from "@/i18n/server";
import { I18nProvider } from "@/i18n/provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TokenAPI — Enterprise AI API Console",
    template: "%s — TokenAPI",
  },
  description:
    "TokenAPI is an enterprise console for AI API management: keys, usage, reliability and billing.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
