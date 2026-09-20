import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ModelUsageEntry } from "../types";

/** Descending indigo tones — one accent, no multi-color bars. */
const barTones = [
  "bg-primary",
  "bg-primary/75",
  "bg-primary/55",
  "bg-primary/40",
  "bg-primary/30",
] as const;

export function ModelUsageCard({ models }: { models: ModelUsageEntry[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2" id="model-usage-heading">
          Model Usage
        </CardTitle>
        <CardDescription>Share of requests, last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {models.map((model, index) => (
          <div key={model.modelId} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-[13px] text-foreground">
                {model.modelId}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {Math.round(model.share * 100)}%
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className={cn("h-full rounded-full", barTones[index % barTones.length])}
                style={{ width: `${model.share * 100}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {model.requests.toLocaleString("en-US")} requests
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
