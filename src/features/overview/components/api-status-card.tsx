import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ApiStatusRegion } from "../types";

export function ApiStatusCard({ regions }: { regions: ApiStatusRegion[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2" id="api-status-heading">
          API Status
        </CardTitle>
        <CardDescription>Regional availability, last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {regions.map((region) => (
            <li
              key={region.region}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {region.region}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Operational · {region.note}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-medium tabular-nums text-foreground">
                  {region.availability}
                </div>
                <div className="text-xs text-muted-foreground">30-day uptime</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Part of the demo dataset — not a live status feed.
        </p>
      </CardContent>
    </Card>
  );
}
