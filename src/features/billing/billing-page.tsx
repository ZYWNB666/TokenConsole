"use client";

import { useCallback } from "react";
import { CreditCardIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

import type { BillingView } from "./types";

/**
 * Billing Overview: balance, lifetime and month spend, plus the real top-up
 * history. Payment/recharge is intentionally absent — it requires a real
 * payment-provider integration and must never be simulated.
 */
export function BillingPage() {
  const t = useT();
  const format = useFormat();
  const state = useAsyncData(useCallback(() => apiGet<BillingView>("/api/v1/billing"), []));
  const billing = state.status === "ready" ? state.data : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("billing.title")}
        description={t("billing.description")}
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
      ) : billing ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("billing.balance")}
              value={format.currency(billing.balanceUsd)}
              numericValue={billing.balanceUsd}
              formatValue={(value) => format.currency(value)}
              helper={t("billing.balanceHelper")}
            />
            <MetricCard
              label={t("billing.monthSpend")}
              value={format.currency(billing.monthSpendUsd)}
            />
            <MetricCard
              label={t("billing.lifetimeSpend")}
              value={format.currency(billing.usedUsd)}
              helper={t("billing.requests", { count: format.number(billing.requestCount) })}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle as="h2">{t("billing.topups.title")}</CardTitle>
              <CardDescription>{t("billing.topups.description")}</CardDescription>
            </CardHeader>
            {billing.topups.length === 0 ? (
              <div className="px-6 pb-6">
                <EmptyState
                  icon={<CreditCardIcon className="size-8" />}
                  title={t("billing.topups.empty")}
                  description={t("billing.topups.emptyDescription")}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table label={t("billing.topups.title")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("billing.topups.time")}</TableHead>
                      <TableHead className="text-right">{t("billing.topups.amount")}</TableHead>
                      <TableHead>{t("billing.topups.method")}</TableHead>
                      <TableHead>{t("billing.topups.status")}</TableHead>
                      <TableHead>{t("billing.topups.reference")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billing.topups.map((topup) => (
                      <TableRow key={topup.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {format.dateTime(topup.createdAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {format.currency(topup.amountUsd)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{topup.method || "—"}</TableCell>
                        <TableCell>
                          {topup.status === "completed" ? (
                            <Badge variant="success">{t("billing.topups.completed")}</Badge>
                          ) : topup.status === "pending" ? (
                            <Badge variant="warning">{t("billing.topups.pending")}</Badge>
                          ) : (
                            <Badge variant="neutral">{t("billing.topups.unknown")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                          {topup.tradeNo || "—"}
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
