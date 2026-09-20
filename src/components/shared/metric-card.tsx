import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTrend = {
  /** Direction of change; only selects the icon, never a color. */
  direction: "up" | "down" | "flat";
  /**
   * Whether the change is good or bad for this metric. Color comes from this
   * tone only — the component never infers meaning from the direction, since
   * a rising error rate and a rising success rate are not the same thing.
   * Defaults to "neutral".
   */
  tone?: "positive" | "negative" | "neutral";
  /** Human-readable change label supplied by the caller. */
  label: string;
};

export type MetricCardProps = {
  /** What is being measured. */
  label: string;
  /** Pre-formatted value to display; formatting is owned by the caller. */
  value: string;
  /** Optional context line under the value. */
  helper?: string;
  /** Optional trend. Presentation only — no fetching or calculation here. */
  trend?: MetricTrend;
  className?: string;
};

const trendIcons = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  flat: MinusIcon,
} as const;

export function MetricCard({
  label,
  value,
  helper,
  trend,
  className,
}: MetricCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {helper ? (
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        ) : null}
        {trend ? <MetricTrendLabel trend={trend} /> : null}
      </CardContent>
    </Card>
  );
}

function MetricTrendLabel({ trend }: { trend: MetricTrend }) {
  const Icon = trendIcons[trend.direction];
  const tone = trend.tone ?? "neutral";
  return (
    <p
      className={cn(
        "mt-3 inline-flex items-center gap-1 text-xs font-medium",
        tone === "positive" && "text-success",
        tone === "negative" && "text-error",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{trend.label}</span>
    </p>
  );
}
