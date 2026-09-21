"use client";

import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormat, useT } from "@/i18n/provider";

import type { RecentRequest, RecentRequestStatus } from "../types";

const statusBadge: Record<RecentRequestStatus, "success" | "error"> = {
  success: "success",
  error: "error",
};

export function RecentRequestsCard({ requests }: { requests: RecentRequest[] }) {
  const t = useT();
  const format = useFormat();

  return (
    <Card className="h-full overflow-hidden transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle as="h2" id="recent-requests-heading">
            {t("overview.recent.title")}
          </CardTitle>
          <CardDescription>{t("overview.recent.description")}</CardDescription>
        </div>
      </CardHeader>
      {requests.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState
            title={t("overview.recent.empty.title")}
            description={t("overview.recent.empty.description")}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table label={t("overview.recent.title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.recent.time")}</TableHead>
                <TableHead>{t("overview.recent.requestId")}</TableHead>
                <TableHead>{t("overview.recent.model")}</TableHead>
                <TableHead>{t("overview.recent.key")}</TableHead>
                <TableHead>{t("overview.recent.status")}</TableHead>
                <TableHead className="text-right">{t("overview.recent.latency")}</TableHead>
                <TableHead className="text-right">{t("overview.recent.tokens")}</TableHead>
                <TableHead className="text-right">{t("overview.recent.cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format.dateTime(request.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate whitespace-nowrap font-mono text-xs">
                    {request.id}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {request.modelId}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate whitespace-nowrap text-muted-foreground">
                    {request.tokenName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge[request.status]}>
                      {t(`overview.recent.status.${request.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {format.number(request.latencySeconds)}s
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {format.number(request.tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {format.currency(request.costUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="border-t border-border px-6 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/requests">{t("overview.recent.viewAll")}</Link>
        </Button>
      </div>
    </Card>
  );
}
