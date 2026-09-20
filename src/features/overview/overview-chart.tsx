"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

import type { UsageMetricKey, UsageSeriesPoint } from "./types";

/*
 * Chart colors mirror the semantic tokens (--primary, --border,
 * --muted-foreground). SVG presentation attributes cannot reference CSS
 * variables, so the values are repeated here; keep them in sync with
 * src/app/globals.css.
 */
const CHART = {
  line: "#4f46e5",
  grid: "#e2e8f0",
  tick: "#475569",
} as const;

type MetricConfig = {
  label: string;
  formatValue: (value: number) => string;
  formatAxis: (value: number) => string;
};

const metricConfigs: Record<UsageMetricKey, MetricConfig> = {
  cost: {
    label: "Cost",
    formatValue: (value) =>
      `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    formatAxis: (value) => `$${value}`,
  },
  requests: {
    label: "Requests",
    formatValue: (value) => value.toLocaleString("en-US"),
    formatAxis: (value) =>
      value >= 1_000 ? `${Math.round(value / 1_000)}k` : `${value}`,
  },
  tokens: {
    label: "Tokens",
    formatValue: (value) => value.toLocaleString("en-US"),
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
  metric: UsageMetricKey;
};

function UsageTooltip({ active, label, payload, metric }: UsageTooltipProps) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-md">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground">
        {metricConfigs[metric].label}: {metricConfigs[metric].formatValue(value)}
      </div>
    </div>
  );
}

export function UsageTrendChart({ series }: { series: UsageSeriesPoint[] }) {
  const [metric, setMetric] = useState<UsageMetricKey>("cost");
  const config = metricConfigs[metric];

  if (series.length === 0) return null;

  const values = series.map((point) => point[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = series[0];
  const last = series[series.length - 1];
  const summary = `Daily ${config.label.toLowerCase()} from ${first.date} to ${last.date}, ranging from ${config.formatValue(min)} to ${config.formatValue(max)}.`;

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle as="h2" id="usage-trend-heading">
            Usage Trend
          </CardTitle>
          <CardDescription>Daily breakdown, last 30 days</CardDescription>
        </div>
        <fieldset className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-muted/60 p-0.5">
          <legend className="sr-only">Usage metric</legend>
          {(Object.keys(metricConfigs) as UsageMetricKey[]).map((key) => (
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
              {metricConfigs[key].label}
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
                dataKey={metric}
                stroke={CHART.line}
                strokeWidth={2}
                fill="url(#usage-area-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
