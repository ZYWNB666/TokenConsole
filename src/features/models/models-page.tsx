"use client";

import { useCallback, useMemo, useState } from "react";
import { BoxesIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useFormat, useT } from "@/i18n/provider";
import { useAsyncData } from "@/lib/use-async-data";

import { apiGet } from "@/lib/api-fetch";
import type { ModelsData } from "./types";

/**
 * Model catalogue: the models the caller can actually route to, with public
 * USD pricing. Search and pricing-mode filters are client-side over the
 * small catalogue.
 */
export function ModelsPage() {
  const t = useT();
  const format = useFormat();
  const state = useAsyncData(useCallback(() => apiGet<ModelsData>("/api/v1/models"), []));
  const [search, setSearch] = useState("");
  const [pricing, setPricing] = useState("all");

  const models = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.models.filter((model) => {
      if (search && !model.modelId.toLowerCase().includes(search.toLowerCase())) return false;
      if (pricing === "perToken" && model.inputUsdPerMillion === null) return false;
      if (pricing === "perCall" && model.pricePerCallUsd === null) return false;
      return true;
    });
  }, [state, search, pricing]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("models.title")}
        description={t("models.description")}
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="model-search" className="block text-xs font-medium text-muted-foreground">
            {t("models.search")}
          </label>
          <Input
            id="model-search"
            placeholder={t("models.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <NativeSelect
          label={t("models.pricing")}
          value={pricing}
          className="w-44"
          onChange={(event) => setPricing(event.target.value)}
        >
          <option value="all">{t("models.pricingAll")}</option>
          <option value="perToken">{t("models.pricingPerToken")}</option>
          <option value="perCall">{t("models.pricingPerCall")}</option>
        </NativeSelect>
      </Card>

      {state.status === "loading" ? (
        <div role="status" aria-label={t("common.loading")} className="space-y-2">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2, 3].map((index) => (
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
      ) : models.length === 0 ? (
        <EmptyState
          icon={<BoxesIcon className="size-8" />}
          title={t("models.empty.title")}
          description={t("models.empty.description")}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table label={t("models.title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("models.table.model")}</TableHead>
                  <TableHead>{t("models.table.description")}</TableHead>
                  <TableHead className="text-right">{t("models.table.input")}</TableHead>
                  <TableHead className="text-right">{t("models.table.output")}</TableHead>
                  <TableHead className="text-right">{t("models.table.perCall")}</TableHead>
                  <TableHead>{t("models.table.protocols")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.modelId}>
                    <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
                      {model.modelId}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {model.description || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {model.inputUsdPerMillion === null
                        ? "—"
                        : t("models.perMillion", { value: format.currency(model.inputUsdPerMillion) })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {model.outputUsdPerMillion === null
                        ? "—"
                        : t("models.perMillion", { value: format.currency(model.outputUsdPerMillion) })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {model.pricePerCallUsd === null
                        ? "—"
                        : format.currency(model.pricePerCallUsd)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {model.endpoints.map((endpoint) => (
                          <Badge key={endpoint} variant="neutral">
                            {endpoint}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {t("models.pricingNote")}
          </p>
        </Card>
      )}
    </div>
  );
}
