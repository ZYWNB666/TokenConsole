"use client";

import { useRef, useState, type ReactNode } from "react";

import { useT } from "@/i18n/provider";

import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

/**
 * Console application shell: fixed desktop sidebar (collapsible, state not
 * persisted), sticky header, single main landmark with a skip link, and a
 * sheet-based mobile navigation below the lg breakpoint.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        {t("common.skipToContent")}
      </a>

      <div className="flex min-h-screen">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            menuButtonRef={menuButtonRef}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
          >
            <div className="motion-safe:animate-content-in">{children}</div>
          </main>
        </div>
      </div>

      <MobileNav
        menuButtonRef={menuButtonRef}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />
    </div>
  );
}
