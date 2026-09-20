"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronDownIcon, CircleAlertIcon, LogOutIcon, MenuIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchCurrentUser, signOut } from "@/features/auth/auth-client";
import { brand } from "@/lib/brand";
import { consoleRoutes } from "@/lib/navigation";

import type { AuthUser } from "@/types/auth";

type HeaderProps = {
  onOpenMobileNav: () => void;
  /** Header menu button; the mobile sheet restores focus to it on close. */
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
};

/**
 * Console header. Page protection happens in the (console) layout before
 * this component ever renders; the /me call here only loads the user's
 * identity. A rejected session (401) returns the browser to /login, while a
 * temporary backend outage keeps the session and shows an unobtrusive
 * error state instead of signing anybody out.
 */
export function Header({ onOpenMobileNav, menuButtonRef }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const route = consoleRoutes.find((item) => item.href === pathname);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userState, setUserState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    fetchCurrentUser().then((result) => {
      if (!active) return;
      if (result.status === "authenticated") {
        setUser(result.user);
        setUserState("ready");
        return;
      }
      if (result.status === "unauthenticated") {
        // The BFF has already cleared the session cookies on the 401 —
        // return the browser to the sign-in page.
        router.replace("/login");
        return;
      }
      setUserState("unavailable");
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  const displayName = user?.display_name || user?.username || "";

  return (
    <header className="sticky top-0 z-40 flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          ref={menuButtonRef}
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <MenuIcon aria-hidden="true" className="size-4.5" />
        </button>

        {/* Mobile shows the brand; desktop shows the current section. */}
        <span className="truncate text-sm font-semibold text-foreground lg:hidden">
          {brand.name}
        </span>
        <span className="hidden min-w-0 truncate text-sm font-medium text-foreground lg:inline">
          {route?.title ?? brand.name}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Badge variant="neutral" className="hidden sm:inline-flex">
          Demo data
        </Badge>
        <div className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 md:flex">
          <span className="hidden text-xs text-muted-foreground lg:inline">
            API endpoint
          </span>
          <span className="font-mono text-xs text-foreground">
            {brand.apiEndpoint}
          </span>
          <CopyButton value={brand.apiEndpoint} />
        </div>

        {userState === "ready" && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-haspopup="menu"
                className="flex items-center gap-1.5 rounded-md py-1 pl-1 pr-1.5 text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  {displayName.slice(0, 1).toUpperCase() || "?"}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
                <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="space-y-0.5">
                <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
                {user.email ? (
                  <div className="truncate">{user.email}</div>
                ) : (
                  <div>@{user.username}</div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <SettingsIcon aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOutIcon aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : userState === "unavailable" ? (
          <span
            role="status"
            title="User information is temporarily unavailable"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground"
          >
            <CircleAlertIcon aria-hidden="true" className="size-4 text-warning" />
            <span className="hidden sm:inline">Temporarily unavailable</span>
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="h-7 w-16 animate-pulse rounded-md bg-surface-muted"
          />
        )}
      </div>
    </header>
  );
}
