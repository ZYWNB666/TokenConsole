"use client";

import { useCallback, useMemo, useState } from "react";
import { ScrollTextIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

import type { ModelsData } from "@/features/models/types";
import type { RequestLogFilters, RequestLogItem } from "./types";
import { fetchRequests, requestsQuery } from "./service";

const PAGE_SIZE = 20;

/** Today, 7 days ago, 30 days ago — as UTC ISO dates. */
function utcDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Request Logs: filterable, paginated table of the caller's real requests,
 * with a filter spend summary and a per-request detail dialog.
 */
export function RequestsPage() {
  const t = useT();
  const format = useFormat();

  const [applied, setApplied] = useState<RequestLogFilters>({
    start: utcDaysAgo(6),
    end: null,
    model: "",
    key: "",
    requestId: "",
  });
  const [draft, setDraft] = useState<RequestLogFilters>(applied);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<RequestLogItem | null>(null);

  const fetcher = useCallback(
    () => fetchRequests(applied, page, PAGE_SIZE),
    [applied, page],
  );
  const state = useAsyncData(fetcher);
  const summaryFetcher = useCallback(
    () => apiGet<{ costUsd: number }>(`/api/v1/requests/summary?${requestsQuery(applied, 1, 1)}`),
    [applied],
  );
  const summaryState = useAsyncData(summaryFetcher);

  const modelsState = useAsyncData(
    useCallback(() => apiGet<ModelsData>("/api/v1/models"), []),
  );
  const modelOptions = useMemo(() => {
    const models = modelsState.status === "ready" ? modelsState.data.models : [];
    return new Set(models.map((model) => model.modelId));
  }, [modelsState]);

  const tableData = state.status === "ready" ? state.data : null;
  const summaryCost = summaryState.status === "ready" ? summaryState.data.costUsd : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("requests.title")}
        description={t("requests.description")}
        actions={
          summaryCost !== null ? (
            <span className="text-sm text-muted-foreground">
              {t("requests.summary.spend", { value: format.currency(summaryCost) })}
            </span>
          ) : undefined
        }
      />

      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied({ ...draft });
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="log-start" className="block text-xs font-medium text-muted-foreground">
              {t("requests.filter.start")}
            </label>
            <Input
              id="log-start"
              type="date"
              className="w-40"
              value={draft.start ?? ""}
              onChange={(event) => setDraft({ ...draft, start: event.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="log-end" className="block text-xs font-medium text-muted-foreground">
              {t("requests.filter.end")}
            </label>
            <Input
              id="log-end"
              type="date"
              className="w-40"
              value={draft.end ?? ""}
              onChange={(event) => setDraft({ ...draft, end: event.target.value || null })}
            />
          </div>
          <NativeSelect
            label={t("requests.filter.model")}
            value={draft.model}
            className="w-44"
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          >
            <option value="">{t("requests.filter.allModels")}</option>
            {[...modelOptions].map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </NativeSelect>
          <div className="space-y-1.5">
            <label htmlFor="log-key" className="block text-xs font-medium text-muted-foreground">
              {t("requests.filter.key")}
            </label>
            <Input
              id="log-key"
              className="w-36"
              placeholder={t("requests.filter.keyPlaceholder")}
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="log-request" className="block text-xs font-medium text-muted-foreground">
              {t("requests.filter.requestId")}
            </label>
            <Input
              id="log-request"
              className="w-48"
              placeholder={t("requests.filter.requestIdPlaceholder")}
              value={draft.requestId}
              onChange={(event) => setDraft({ ...draft, requestId: event.target.value })}
            />
          </div>
          <Button type="submit" variant="outline">
            {t("requests.filter.apply")}
          </Button>
        </form>
      </Card>

      {state.status === "loading" ? (
        <div role="status" aria-label={t("common.loading")} className="space-y-2">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-11 w-full" />
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
      ) : tableData && tableData.items.length === 0 ? (
        <EmptyState
          icon={<ScrollTextIcon className="size-8" />}
          title={t("requests.empty.title")}
          description={t("requests.empty.description")}
        />
      ) : tableData ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table label={t("requests.title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("requests.table.time")}</TableHead>
                  <TableHead>{t("requests.table.requestId")}</TableHead>
                  <TableHead>{t("requests.table.model")}</TableHead>
                  <TableHead>{t("requests.table.key")}</TableHead>
                  <TableHead>{t("requests.table.status")}</TableHead>
                  <TableHead className="text-right">{t("requests.table.latency")}</TableHead>
                  <TableHead className="text-right">{t("requests.table.tokens")}</TableHead>
                  <TableHead className="text-right">{t("requests.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.items.map((log) => (
                  <TableRow
                    key={`${log.id}-${log.createdAt}`}
                    onClick={() => setDetail(log)}
                    className="cursor-pointer"
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format.dateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate whitespace-nowrap font-mono text-xs">
                      {log.id}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {log.modelId}
                    </TableCell>
                    <TableCell className="max-w-[8rem] truncate whitespace-nowrap text-muted-foreground">
                      {log.tokenName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "success" : "error"}>
                        {t(`requests.status.${log.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {format.number(log.latencySeconds)}s
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {format.number(log.promptTokens)} / {format.number(log.completionTokens)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {format.currency(log.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={tableData.page}
              pageSize={tableData.pageSize}
              total={tableData.total}
              onPageChange={setPage}
            />
          </div>
        </Card>
      ) : null}

      <LogDetailDialog log={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function LogDetailDialog({ log, onClose }: { log: RequestLogItem | null; onClose: () => void }) {
  const t = useT();
  const format = useFormat();
  return (
    <Dialog open={log !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-all font-mono text-base">{log?.id ?? ""}</DialogTitle>
          <DialogDescription>{t("requests.detail.description")}</DialogDescription>
        </DialogHeader>
        {log ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("requests.table.time")}</dt>
              <dd className="text-foreground">{format.dateTime(log.createdAt)}</dd>
              <dt className="text-muted-foreground">{t("requests.table.model")}</dt>
              <dd className="font-mono text-xs text-foreground">{log.modelId}</dd>
              <dt className="text-muted-foreground">{t("requests.table.key")}</dt>
              <dd className="text-foreground">{log.tokenName || "—"}</dd>
              <dt className="text-muted-foreground">{t("requests.table.status")}</dt>
              <dd>
                <Badge variant={log.status === "success" ? "success" : "error"}>
                  {t(`requests.status.${log.status}`)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">{t("requests.detail.stream")}</dt>
              <dd className="text-foreground">{log.isStream ? t("common.yes") : t("common.no")}</dd>
              <dt className="text-muted-foreground">{t("requests.table.latency")}</dt>
              <dd className="tabular-nums text-foreground">{format.number(log.latencySeconds)}s</dd>
              <dt className="text-muted-foreground">{t("requests.detail.promptTokens")}</dt>
              <dd className="tabular-nums text-foreground">{format.number(log.promptTokens)}</dd>
              <dt className="text-muted-foreground">{t("requests.detail.completionTokens")}</dt>
              <dd className="tabular-nums text-foreground">{format.number(log.completionTokens)}</dd>
              <dt className="text-muted-foreground">{t("requests.table.cost")}</dt>
              <dd className="tabular-nums text-foreground">{format.currency(log.costUsd)}</dd>
            </dl>
            {log.status === "error" && log.content ? (
              <div className="rounded-md border border-error/30 bg-error/5 p-3">
                <p className="text-xs font-medium text-error">
                  {t("requests.detail.errorDetail")}
                </p>
                <p className="mt-1 break-words font-mono text-xs text-foreground">
                  {log.content}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
