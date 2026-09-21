"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  /** Called with the next page to load (1-based). */
  onPageChange: (page: number) => void;
  className?: string;
};

/** Accessible pager for table pages. `total` is the item count, not pages. */
export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const t = useT();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={t("pagination.label")}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <p className="text-xs text-muted-foreground">
        {t("pagination.summary", {
          from: from.toLocaleString(),
          to: to.toLocaleString(),
          total: total.toLocaleString(),
        })}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t("pagination.previous")}</span>
        </Button>
        <span className="px-1.5 text-xs tabular-nums text-muted-foreground">
          {t("pagination.status", { page, pageCount })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t("pagination.next")}</span>
        </Button>
      </div>
    </nav>
  );
}
