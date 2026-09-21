"use client";

import { useEffect, useState } from "react";
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
  /**
   * When given together with `formatValue`, the value counts up from zero on
   * mount (skipped for reduced-motion users); `value` stays the accessible
   * final text.
   */
  numericValue?: number;
  formatValue?: (value: number) => string;
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

const COUNT_UP_DURATION_MS = 600;

/** Eased count-up from 0 to `target`, skipped under reduced motion. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(() => (enabled && target !== 0 ? 0 : target));

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = enabled && target !== 0 && !reduceMotion;
    if (!animate) {
      // Snap asynchronously; React skips the render when the value matches.
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    let frame: number | null = null;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [target, enabled]);

  return value;
}

export function MetricCard({
  label,
  value,
  numericValue,
  formatValue,
  helper,
  trend,
  className,
}: MetricCardProps) {
  const animated = typeof numericValue === "number" && typeof formatValue === "function";
  const current = useCountUp(animated ? (numericValue as number) : 0, animated);
  const display = animated ? (formatValue as (v: number) => string)(current) : value;

  return (
    <Card className={cn(
      "transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md",
      className,
    )}>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {display}
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
