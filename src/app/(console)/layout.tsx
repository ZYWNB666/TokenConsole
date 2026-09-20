import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireConsoleSession } from "@/server/auth/server-session";

/**
 * Server-side gate for every console page: the encrypted session cookie is
 * verified here, BEFORE any protected HTML is produced. Unauthenticated,
 * tampered and expired sessions are redirected to /login with a safe
 * returnTo — the header never acts as the first line of defense.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const guard = await requireConsoleSession();
  if (guard.kind === "redirect") {
    redirect(guard.location);
  }

  return <AppShell>{children}</AppShell>;
}
