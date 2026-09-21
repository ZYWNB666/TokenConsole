import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UsagePage } from "@/features/usage/usage-page";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireConsoleSession } from "@/server/auth/server-session";

/**
 * The session gate runs here — in the page segment, before any protected
 * content renders. (Layouts and pages render in parallel in Next.js, so a
 * layout-only guard would let the page's RSC payload leak into the redirect
 * response.)
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getLocale())["nav.usage.title"] };
}

export default async function Page() {
  const guard = await requireConsoleSession();
  if (guard.kind === "redirect") {
    redirect(guard.location);
  }
  return <UsagePage />;
}
