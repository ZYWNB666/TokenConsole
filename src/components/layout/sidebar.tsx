"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { useT } from "@/i18n/provider";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";
import { NavList } from "./nav-list";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const t = useT();

  return (
    <aside
      id="console-sidebar"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <BrandMark />
        {!collapsed ? (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-foreground">
              {brand.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {brand.tagline}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <NavList collapsed={collapsed} />
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="console-sidebar"
          className="flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeftOpenIcon aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <PanelLeftCloseIcon aria-hidden="true" className="size-4 shrink-0" />
          )}
          {collapsed ? (
            <span className="sr-only">{t("header.expand")}</span>
          ) : (
            <span>{t("header.collapse")}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
