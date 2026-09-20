import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { consoleRoutes, findConsoleRoute } from "@/lib/navigation";
import { requireConsoleSession } from "@/server/auth/server-session";

/**
 * Planned-state pages for every console section except /overview (which has
 * its own static route). The session gate runs before anything renders, so
 * unauthenticated visitors never receive page content — only the redirect.
 * Only sections listed in the navigation metadata are valid; anything else
 * is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return consoleRoutes
    .filter((route) => route.section !== "overview")
    .map((route) => ({ section: route.section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const route = findConsoleRoute(section);
  return { title: route?.title };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  // Gate first: unauthenticated → /login; only then resolve the section
  // (unknown → 404 for authenticated visitors).
  const guard = await requireConsoleSession();
  if (guard.kind === "redirect") {
    redirect(guard.location);
  }

  const { section } = await params;
  const route = findConsoleRoute(section);
  if (!route) notFound();

  const Icon = route.icon;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={route.title}
        description={route.description}
        actions={<Badge variant="info">Planned</Badge>}
      />
      <EmptyState
        icon={<Icon className="size-8" />}
        title={`${route.title} is on the roadmap`}
        description="This module is planned for a later phase. The overview dashboard is available today."
      />
    </div>
  );
}
