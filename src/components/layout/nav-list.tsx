"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/i18n/provider";
import { consoleNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type NavListProps = {
  /** Icon-only rail mode for the collapsed desktop sidebar. */
  collapsed?: boolean;
  /** Called after a link is activated (used to close the mobile sheet). */
  onNavigate?: () => void;
  className?: string;
};

export function NavList({ collapsed = false, onNavigate, className }: NavListProps) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className={cn("flex flex-col gap-5", className)}>
      {consoleNav.map((group, groupIndex) => (
        <div
          key={group.labelKey ?? `group-${groupIndex}`}
          className="flex flex-col gap-1"
        >
          {group.labelKey && !collapsed ? (
            <div className="px-2.5 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t(group.labelKey)}
            </div>
          ) : null}
          {group.routes.map((route) => {
            const active = pathname === route.href;
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? t(route.titleKey) : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground hover:bg-surface-muted",
                  collapsed && "justify-center px-2",
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-transform"
                  />
                ) : null}
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-200 motion-safe:group-hover:scale-110"
                />
                {collapsed ? (
                  <span className="sr-only">{t(route.titleKey)}</span>
                ) : (
                  <span className="truncate">{t(route.titleKey)}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
