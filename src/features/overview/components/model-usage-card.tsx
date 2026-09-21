"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFormat, useT } from "@/i18n/provider";
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
  const t = useT();
  const format = useFormat();
  // Bars grow to their width after mount; the global reduced-motion rule
  // collapses the transition for users who prefer no motion.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Card className="h-full transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
      <CardHeader>
        <CardTitle as="h2" id="model-usage-heading">
          {t("overview.models.title")}
        </CardTitle>
        <CardDescription>{t("overview.models.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {models.length === 0 ? (
          <EmptyState
            title={t("overview.models.empty.title")}
            description={t("overview.models.empty.description")}
          />
        ) : (
          models.map((model, index) => (
            <div key={model.modelId} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-[13px] text-foreground">
                  {model.modelId}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {format.percent(model.share)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
              >
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700 ease-out", barTones[index % barTones.length])}
                  style={{ width: grown ? `${model.share * 100}%` : "0%" }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {t("overview.models.requests", { count: format.number(model.requests) })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
