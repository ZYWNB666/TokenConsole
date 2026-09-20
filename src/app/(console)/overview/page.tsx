import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OverviewPage } from "@/features/overview/overview-page";
import { requireConsoleSession } from "@/server/auth/server-session";

export const metadata: Metadata = {
  title: "Overview",
};

/**
 * The session gate runs here — in the page segment, before any protected
 * content renders. (Layouts and pages render in parallel in Next.js, so a
 * layout-only guard would let the page's RSC payload leak into the redirect
 * response.)
 */
export default async function Page() {
  const guard = await requireConsoleSession();
  if (guard.kind === "redirect") {
    redirect(guard.location);
  }
  return <OverviewPage />;
}
