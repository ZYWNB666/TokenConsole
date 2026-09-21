"use client";

import { useCallback, useState } from "react";
import { LockIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPatch } from "@/lib/api-fetch";
import { useFormat, useT } from "@/i18n/provider";
import { isApiFailure } from "@/types/api";
import { useAsyncData } from "@/lib/use-async-data";

import type { MembersPage, MemberView } from "./types";

const PAGE_SIZE = 20;

/**
 * Organization: member directory and role/enable management, backed by the
 * gateway's admin user management. Only admin/owner roles can manage —
 * members see an honest, non-destructive "requires admin" state (the 403
 * carries a distinct `forbidden` error code).
 */
export function OrganizationPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    () => apiGet<MembersPage>(`/api/v1/org/members?page=${page}&pageSize=${PAGE_SIZE}`),
    [page],
  );
  const state = useAsyncData(fetcher);

  async function updateMember(id: number, input: { role?: "member" | "admin"; enabled?: boolean }) {
    setActionError(null);
    const result = await apiPatch("/api/v1/org/members", { id, ...input });
    if (isApiFailure(result)) {
      setActionError(t(result.error.code === "forbidden" ? "org.error.forbidden" : "org.error.action"));
      return;
    }
    state.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("org.title")}
        description={t("org.description")}
      />

      {actionError ? (
        <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {actionError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <div role="status" aria-label={t("common.loading")} className="space-y-2">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : state.status === "error" && state.code === "forbidden" ? (
        <EmptyState
          icon={<LockIcon className="size-8" />}
          title={t("org.adminRequired.title")}
          description={t("org.adminRequired.description")}
        />
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
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table label={t("org.title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("org.table.user")}</TableHead>
                  <TableHead>{t("org.table.role")}</TableHead>
                  <TableHead>{t("org.table.status")}</TableHead>
                  <TableHead>{t("org.table.created")}</TableHead>
                  <TableHead className="text-right">{t("org.table.balance")}</TableHead>
                  <TableHead className="text-right">{t("org.table.spend")}</TableHead>
                  <TableHead className="text-right">{t("org.table.requests")}</TableHead>
                  <TableHead className="text-right">{t("org.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.items.map((member) => (
                  <MemberRow key={member.id} member={member} onUpdate={updateMember} />
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPageChange={setPage}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onUpdate,
}: {
  member: MemberView;
  onUpdate: (id: number, input: { role?: "member" | "admin"; enabled?: boolean }) => Promise<void>;
}) {
  const t = useT();
  const format = useFormat();
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {member.displayName || member.username}
          </p>
          <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
        </div>
      </TableCell>
      <TableCell>
        <RoleBadge role={member.role} />
      </TableCell>
      <TableCell>
        <Badge variant={member.status === "active" ? "success" : "neutral"}>
          {member.status === "active" ? t("org.status.active") : t("org.status.banned")}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {format.day(member.createdAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {format.currency(member.balanceUsd)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {format.currency(member.usedUsd)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {format.number(member.requestCount)}
      </TableCell>
      <TableCell>
        {member.role === "owner" ? (
          <span className="block text-right text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onUpdate(member.id, { role: member.role === "admin" ? "member" : "admin" })}
            >
              {member.role === "admin" ? t("org.action.demote") : t("org.action.promote")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onUpdate(member.id, { enabled: member.status !== "active" })}
            >
              {member.status === "active" ? t("org.action.disable") : t("org.action.enable")}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function RoleBadge({ role }: { role: MemberView["role"] }) {
  const t = useT();
  if (role === "owner") return <Badge variant="info">{t("org.role.owner")}</Badge>;
  if (role === "admin") return <Badge variant="neutral">{t("org.role.admin")}</Badge>;
  return <Badge variant="neutral">{t("org.role.member")}</Badge>;
}
