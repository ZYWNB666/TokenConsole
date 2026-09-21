"use client";

import { useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";

import { MetricCard, type MetricTrend } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat, useT } from "@/i18n/provider";

import { BalanceCard } from "./components/balance-card";
import { ModelUsageCard } from "./components/model-usage-card";
import { RecentRequestsCard } from "./components/recent-requests-card";
import { UsageTrendChart } from "./overview-chart";
import { fetchOverview, type OverviewState } from "./service";

import type { OverviewMetric } from "./types";

/**
 * Real-data Overview dashboard: account balance, 30-day usage metrics,
 * trend, model mix and recent requests, loaded from the owned
 * /api/v1/overview endpoint. Loading, error and empty states are explicit —
 * nothing here is simulated.
 */
export function OverviewPage() {
  const t = useT();
  const format = useFormat();
  const [state, setState] = useState<OverviewState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchOverview().then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
  }, []);

  function handleRetry() {
    setState({ status: "loading" });
    fetchOverview().then(setState);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("overview.title")}
        description={t("overview.description")}
        actions={<span className="text-sm text-muted-foreground">{t("overview.range")}</span>}
      />

      {state.status === "loading" ? (
        <OverviewSkeleton />
      ) : state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6"
        >
          <div className="flex items-center gap-2 text-foreground">
            <CircleAlertIcon aria-hidden="true" className="size-5 text-warning" />
            <span className="font-medium">{t("overview.error.title")}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("overview.error.description")}
          </p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            {t("common.tryAgain")}
          </Button>
        </div>
      ) : state.status === "ready" ? (
        <div key={`${state.data.rangeStart}:${state.data.rangeEnd}`} className="motion-safe:animate-content-in">
          <section aria-labelledby="overview-metrics-heading" className="space-y-3">
            <h2
              id="overview-metrics-heading"
              className="text-sm font-semibold text-foreground"
            >
              {t("overview.range")}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={t("overview.balance.available")}
                value={format.currency(state.data.account.balanceUsd)}
              />
              {state.data.metrics.map((metric) => (
                <MetricCard
                  key={metric.key}
                  label={t(`overview.metric.${metric.key}`)}
                  value={formatMetricTotal(metric, format)}
                  numericValue={metric.total}
                  formatValue={(value) =>
                    metric.key === "cost" ? format.currency(value) : format.number(Math.round(value))
                  }
                  trend={metricTrend(metric, t, format)}
                />
              ))}
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section aria-labelledby="usage-trend-heading" className="lg:col-span-2">
              <UsageTrendChart series={state.data.usageSeries} />
            </section>
            <section aria-labelledby="account-balance-heading">
              <BalanceCard account={state.data.account} />
            </section>
            <section aria-labelledby="model-usage-heading">
              <ModelUsageCard models={state.data.modelUsage} />
            </section>
            <section aria-labelledby="recent-requests-heading" className="lg:col-span-2">
              <RecentRequestsCard requests={state.data.recentRequests} />
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatMetricTotal(
  metric: OverviewMetric,
  format: ReturnType<typeof useFormat>,
): string {
  if (metric.key === "cost") return format.currency(metric.total);
  return format.number(metric.total);
}

/** Last 7 days vs the 7 days before that, as an honest labeled trend. */
function metricTrend(
  metric: OverviewMetric,
  t: ReturnType<typeof useT>,
  format: ReturnType<typeof useFormat>,
): MetricTrend {
  const { recent, previous } = metric;
  if (recent === previous) {
    return { direction: "flat", tone: "neutral", label: t("overview.trend.flat") };
  }
  const direction = recent > previous ? "up" : "down";
  if (previous === 0) {
    const value = metric.key === "cost"
      ? format.currency(recent)
      : format.number(recent);
    return {
      direction,
      tone: metric.key === "cost" ? "neutral" : "positive",
      label: t(`overview.trend.${direction}`, { value: `+${value}` }),
    };
  }
  const change = Math.abs((recent - previous) / previous);
  const value = format.percent(change);
  return {
    direction,
    tone: metric.key === "cost" ? "neutral" : "positive",
    label: t(`overview.trend.${direction}`, { value: `+${value}` }),
  };
}

function OverviewSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t("overview.loading")} className="space-y-6">
      <span className="sr-only">{t("overview.loading")}</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-6 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-[300px] w-full" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-4 h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
