"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFormat, useT } from "@/i18n/provider";

import type { OverviewAccount } from "../types";

/** Real account balance from the gateway, in public USD units. */
export function BalanceCard({ account }: { account: OverviewAccount }) {
  const t = useT();
  const format = useFormat();

  return (
    <Card className="h-full transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
      <CardHeader>
        <CardTitle as="h2" id="account-balance-heading">
          {t("overview.balance.title")}
        </CardTitle>
        <CardDescription>{t("overview.balance.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {t("overview.balance.available")}
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {format.currency(account.balanceUsd)}
          </div>
        </div>
        <dl className="space-y-2.5 border-t border-border pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("overview.balance.lifetimeSpend")}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {format.currency(account.usedUsd)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("overview.balance.requests")}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {format.number(account.requestCount)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
