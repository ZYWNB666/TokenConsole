"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFormat, useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useChartColors } from "@/theme/chart-colors";

import type { OverviewMetricKey, UsageSeriesPoint } from "./types";

/*
 * Chart colors come from the theme-aware palette (see
 * src/theme/chart-colors.ts): SVG presentation attributes cannot reference
 * CSS variables, so recharts needs concrete values per resolved theme.
 */

/** True when the user asked the system to minimize motion. */
function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type MetricConfig = {
  labelKey: `overview.chart.metricName.${OverviewMetricKey}`;
  field: "costUsd" | "requests" | "tokens";
  formatValue: (value: number, format: ReturnType<typeof useFormat>) => string;
  formatAxis: (value: number) => string;
};

const metricConfigs: Record<OverviewMetricKey, MetricConfig> = {
  cost: {
    labelKey: "overview.chart.metricName.cost",
    field: "costUsd",
    formatValue: (value, format) => format.currency(value),
    formatAxis: (value) => `$${value}`,
  },
  requests: {
    labelKey: "overview.chart.metricName.requests",
    field: "requests",
    formatValue: (value, format) => format.number(value),
    formatAxis: (value) =>
      value >= 1_000 ? `${Math.round(value / 1_000)}k` : `${value}`,
  },
  tokens: {
    labelKey: "overview.chart.metricName.tokens",
    field: "tokens",
    formatValue: (value, format) => format.number(value),
    formatAxis: (value) =>
      value >= 1_000_000
        ? `${Math.round(value / 1_000_000)}M`
        : value >= 1_000
          ? `${Math.round(value / 1_000)}k`
          : `${value}`,
  },
};

type UsageTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
  metric: OverviewMetricKey;
};

function UsageTooltip({ active, label, payload, metric }: UsageTooltipProps) {
  const t = useT();
  const format = useFormat();
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  const iso = typeof label === "string" ? label : "";
  const dateLabel = iso ? `${format.day(iso)} (UTC)` : "";

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-md">
      <div className="text-xs text-muted-foreground">{dateLabel}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground">
        {t(metricConfigs[metric].labelKey)}:{" "}
        {metricConfigs[metric].formatValue(value, format)}
      </div>
    </div>
  );
}

export function UsageTrendChart({ series }: { series: UsageSeriesPoint[] }) {
  const t = useT();
  const format = useFormat();
  const CHART = useChartColors();
  const reducedMotion = usePrefersReducedMotion();
  const [metric, setMetric] = useState<OverviewMetricKey>("cost");
  const config = metricConfigs[metric];

  if (series.length === 0) return null;

  const values = series.map((point) => point[config.field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = series[0];
  const last = series[series.length - 1];
  const summary = t("overview.chart.summary", {
    metric: t(config.labelKey),
    start: first.date,
    end: last.date,
    min: config.formatValue(min, format),
    max: config.formatValue(max, format),
  });

  return (
    <Card className="h-full transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle as="h2" id="usage-trend-heading">
            {t("overview.chart.title")}
          </CardTitle>
          <CardDescription>{t("overview.chart.description")}</CardDescription>
        </div>
        <fieldset className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-muted/60 p-0.5">
          <legend className="sr-only">{t("overview.chart.metric")}</legend>
          {(Object.keys(metricConfigs) as OverviewMetricKey[]).map((key) => (
            <label
              key={key}
              className={cn(
                "cursor-pointer rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                metric === key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="usage-metric"
                value={key}
                checked={metric === key}
                onChange={() => setMetric(key)}
                className="sr-only"
              />
              {t(metricConfigs[key].labelKey)}
            </label>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="usage-area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.line} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={CHART.line} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={4}
                tickFormatter={(value: string) => format.day(value)}
                tick={{ fontSize: 12, fill: CHART.tick }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={config.formatAxis}
                tick={{ fontSize: 12, fill: CHART.tick }}
              />
              <Tooltip content={<UsageTooltip metric={metric} />} cursor={{ stroke: CHART.grid }} />
              <Area
                type="monotone"
                dataKey={config.field}
                stroke={CHART.line}
                strokeWidth={2}
                fill="url(#usage-area-fill)"
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
