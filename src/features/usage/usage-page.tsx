"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api-fetch";
import { useFormat, useT } from "@/i18n/provider";
import { useAsyncData } from "@/lib/use-async-data";

import type { UsageAnalysis } from "./types";

/**
 * Usage analysis: totals, daily series and per-model breakdown over a
 * selectable window, all from the owned /api/v1/usage endpoint.
 */

const CHART = {
  line: "#4f46e5",
  grid: "#e2e8f0",
  tick: "#475569",
} as const;

const WINDOWS = [7, 30, 90, 365] as const;

export function UsagePage() {
  const t = useT();
  const format = useFormat();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);

  const fetcher = useCallback(
    () => apiGet<UsageAnalysis>(`/api/v1/usage?days=${days}`),
    [days],
  );
  const state = useAsyncData(fetcher);
  const analysis = state.status === "ready" ? state.data : null;

  const shareRows = useMemo(() => {
    if (!analysis || analysis.totals.requests === 0) return [];
    return analysis.byModel.map((row) => ({
      ...row,
      share: row.requests / analysis.totals.requests,
    }));
  }, [analysis]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("usage.title")}
        description={t("usage.description")}
        actions={
          <NativeSelect
            label={t("usage.window")}
            hideLabel
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value) as (typeof WINDOWS)[number])}
          >
            {WINDOWS.map((window) => (
              <option key={window} value={window}>
                {t("usage.windowDays", { days: window })}
              </option>
            ))}
          </NativeSelect>
        }
      />

      {state.status === "loading" ? (
        <div role="status" aria-label={t("common.loading")} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <EmptyState
          title={t("common.error.title")}
          description={t("common.error.description")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={state.reload}>
              {t("common.tryAgain")}
            </Button>
          }
        />
      ) : analysis ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label={t("usage.metric.requests")}
              value={format.number(analysis.totals.requests)}
              numericValue={analysis.totals.requests}
              formatValue={(value) => format.number(Math.round(value))}
            />
            <MetricCard
              label={t("usage.metric.tokens")}
              value={format.number(analysis.totals.tokens)}
              numericValue={analysis.totals.tokens}
              formatValue={(value) => format.number(Math.round(value))}
            />
            <MetricCard
              label={t("usage.metric.spend")}
              value={format.currency(analysis.totals.costUsd)}
              numericValue={analysis.totals.costUsd}
              formatValue={(value) => format.currency(value)}
            />
            <MetricCard
              label={t("usage.metric.rpm")}
              value={format.number(analysis.rpm, { maximumFractionDigits: 2 })}
            />
            <MetricCard
              label={t("usage.metric.tpm")}
              value={format.number(analysis.tpm, { maximumFractionDigits: 2 })}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("usage.chart.title")}</CardTitle>
              <CardDescription>{t("usage.chart.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analysis.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="usage-page-fill" x1="0" y1="0" x2="0" y2="1">
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
                      interval={analysis.days > 90 ? 29 : analysis.days > 30 ? 6 : 1}
                      tickFormatter={(value: string) => format.day(value)}
                      tick={{ fontSize: 12, fill: CHART.tick }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 12, fill: CHART.tick }}
                    />
                    <Tooltip
                      cursor={{ stroke: CHART.grid }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0]?.payload as UsageAnalysis["series"][number] | undefined;
                        if (!point) return null;
                        return (
                          <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-md">
                            <div className="text-xs text-muted-foreground">{format.day(point.date)} (UTC)</div>
                            <div className="mt-0.5 text-sm text-foreground">
                              {t("usage.metric.requests")}: {format.number(point.requests)}
                            </div>
                            <div className="text-sm text-foreground">
                              {t("usage.metric.tokens")}: {format.number(point.tokens)}
                            </div>
                            <div className="text-sm text-foreground">
                              {t("usage.metric.spend")}: {format.currency(point.costUsd)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke={CHART.line}
                      strokeWidth={2}
                      fill="url(#usage-page-fill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle as="h2">{t("usage.byModel.title")}</CardTitle>
              <CardDescription>{t("usage.byModel.description")}</CardDescription>
            </CardHeader>
            {shareRows.length === 0 ? (
              <CardContent>
                <EmptyState
                  title={t("usage.byModel.empty")}
                  description={t("usage.byModel.emptyDescription")}
                />
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <Table label={t("usage.byModel.title")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("usage.byModel.model")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.share")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.requests")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.tokens")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.spend")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shareRows.map((row) => (
                      <TableRow key={row.modelId}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {row.modelId}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.percent(row.share)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.number(row.requests)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.number(row.tokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.currency(row.costUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle as="h2">{t("usage.byKey.title")}</CardTitle>
              <CardDescription>{t("usage.byKey.description")}</CardDescription>
            </CardHeader>
            {analysis.byKey.length === 0 ? (
              <CardContent>
                <EmptyState
                  title={t("usage.byModel.empty")}
                  description={t("usage.byModel.emptyDescription")}
                />
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <Table label={t("usage.byKey.title")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("usage.byKey.key")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.requests")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.tokens")}</TableHead>
                      <TableHead className="text-right">{t("usage.byModel.spend")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.byKey.map((row) => (
                      <TableRow key={row.keyName || "deleted"}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {row.keyName || (
                            <span className="text-muted-foreground">{t("usage.byKey.deleted")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.number(row.requests)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.number(row.tokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {format.currency(row.costUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
