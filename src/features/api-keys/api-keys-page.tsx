"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { isApiFailure, type ApiResult } from "@/types/api";
import { useAsyncData } from "@/lib/use-async-data";

import type { ApiKeyView } from "./types";
import { createKey, deleteKey, fetchKeys, revealKey, setKeyEnabled, updateKey } from "./service";

/**
 * API Keys management: create keys (value shown exactly once), reveal an
 * existing key once, enable/disable and delete — all through the owned
 * /api/v1/keys endpoints. The full key value only ever lives in this
 * component's transient dialog state and is cleared on close.
 */

const EXPIRY_OPTIONS = [
  { value: "never", days: null as number | null },
  { value: "7", days: 7 },
  { value: "30", days: 30 },
  { value: "90", days: 90 },
  { value: "365", days: 365 },
] as const;

export function ApiKeysPage() {
  const t = useT();
  const format = useFormat();
  const state = useAsyncData(useCallback(() => fetchKeys(), []));
  const [createOpen, setCreateOpen] = useState(false);
  const [createNonce, setCreateNonce] = useState(0);
  const [editing, setEditing] = useState<EditingKey | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiKeyView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const keys = state.status === "ready" ? state.data.keys : [];

  async function runAction(action: () => Promise<ApiResult<unknown>>) {
    const result = await action();
    if (isApiFailure(result)) {
      setActionError(t(result.error.code === "rate_limited" ? "keys.error.rateLimited" : "keys.error.action"));
      return false;
    }
    setActionError(null);
    state.reload();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("keys.title")}
        description={t("keys.description")}
        actions={
          <Button
            type="button"
            onClick={() => {
              setCreateNonce((value) => value + 1);
              setCreateOpen(true);
            }}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            {t("keys.create")}
          </Button>
        }
      />

      {actionError ? (
        <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {actionError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <KeyTableSkeleton />
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
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<KeyRoundIcon className="size-8" />}
          title={t("keys.empty.title")}
          description={t("keys.empty.description")}
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCreateNonce((value) => value + 1);
                setCreateOpen(true);
              }}
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              {t("keys.create")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard label={t("keys.stat.total")} value={format.number(keys.length)} />
            <MetricCard
              label={t("keys.stat.active")}
              value={format.number(keys.filter((key) => key.status === "active").length)}
            />
            <MetricCard
              label={t("keys.stat.spend")}
              value={format.currency(keys.reduce((sum, key) => sum + key.usedQuotaUsd, 0))}
            />
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table label={t("keys.title")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("keys.table.name")}</TableHead>
                    <TableHead>{t("keys.table.key")}</TableHead>
                    <TableHead>{t("keys.table.status")}</TableHead>
                    <TableHead>{t("keys.table.created")}</TableHead>
                    <TableHead>{t("keys.table.lastUsed")}</TableHead>
                    <TableHead className="text-right">{t("keys.table.quota")}</TableHead>
                    <TableHead className="text-right">{t("keys.table.used")}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t("keys.table.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="whitespace-nowrap font-medium text-foreground">
                        {key.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {key.maskedKey}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={key.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format.day(key.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format.dateTime(key.accessedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {key.unlimitedQuota
                          ? t("keys.unlimited")
                          : format.currency(key.remainQuotaUsd ?? 0)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {format.currency(key.usedQuotaUsd)}
                      </TableCell>
                      <TableCell>
                        <KeyActions
                          apiKey={key}
                          onEdit={() => {
                            // Impure date math lives in the event handler.
                            const now = Date.now();
                            setEditing({
                              key,
                              initial: {
                                name: key.name,
                                expiry: nearestExpiryValue(key.expiresAt, now),
                                quotaMode: key.unlimitedQuota ? "unlimited" : "limited",
                                quotaUsd: key.remainQuotaUsd === null ? "" : String(key.remainQuotaUsd),
                                modelLimits: key.modelLimits.join(", "),
                              },
                            });
                          }}
                          onReveal={async () => {
                            const shown = await revealKey(key.id);
                            if (!isApiFailure(shown)) {
                              setRevealed({ name: key.name, key: shown.data.key });
                            } else {
                              setActionError(t("keys.error.rateLimited"));
                            }
                          }}
                          onToggle={async () => {
                            await runAction(() => setKeyEnabled(key.id, key.status !== "active"));
                          }}
                          onDelete={() => setConfirmDelete(key)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      <CreateKeyDialog
        key={createNonce}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setCreateOpen(false);
          setRevealed({ name: created.name, key: created.key });
          state.reload();
        }}
      />

      <EditKeyDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          state.reload();
        }}
        onError={() => setActionError(t("keys.error.action"))}
      />

      <RevealDialog revealed={revealed} onClose={() => setRevealed(null)} />

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("keys.delete.title", { name: confirmDelete?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("keys.delete.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (confirmDelete) {
                  await runAction(() => deleteKey(confirmDelete.id));
                }
                setConfirmDelete(null);
              }}
            >
              <Trash2Icon aria-hidden="true" className="size-4" />
              {t("keys.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ApiKeyView["status"] }) {
  const t = useT();
  if (status === "active") {
    return <Badge variant="success">{t("keys.status.active")}</Badge>;
  }
  if (status === "disabled") {
    return <Badge variant="neutral">{t("keys.status.disabled")}</Badge>;
  }
  if (status === "expired") {
    return <Badge variant="warning">{t("keys.status.expired")}</Badge>;
  }
  return <Badge variant="neutral">{t("keys.status.unknown")}</Badge>;
}

function KeyActions({
  apiKey,
  onEdit,
  onReveal,
  onToggle,
  onDelete,
}: {
  apiKey: ApiKeyView;
  onEdit: () => void;
  onReveal: () => Promise<void>;
  onToggle: () => Promise<void>;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm">
          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t("keys.table.actions")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <PencilIcon aria-hidden="true" />
          {t("keys.action.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onReveal()}>
          <CopyIcon aria-hidden="true" />
          {t("keys.action.reveal")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onToggle()}>
          {apiKey.status === "active"
            ? t("keys.action.disable")
            : t("keys.action.enable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon aria-hidden="true" />
          {t("keys.action.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shared form state for the create and edit dialogs. */
type KeyFormState = {
  name: string;
  expiry: string;
  quotaMode: string;
  quotaUsd: string;
  modelLimits: string;
};

const EMPTY_FORM: KeyFormState = {
  name: "",
  expiry: "never",
  quotaMode: "unlimited",
  quotaUsd: "",
  modelLimits: "",
};

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: { name: string; key: string }) => void;
}) {
  const t = useT();
  return (
    <KeyFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("keys.create.title")}
      description={t("keys.create.description")}
      submitLabel={t("keys.create.confirm")}
      submittingLabel={t("keys.create.submitting")}
      initial={EMPTY_FORM}
      onSubmit={async (form) => {
        const result = await createKey(form);
        if (isApiFailure(result)) {
          return {
            error: t(result.error.code === "invalid_request" ? "keys.error.name" : "keys.error.action"),
          };
        }
        onCreated({ name: form.name, key: result.data.key });
        return { ok: true as const };
      }}
    />
  );
}

/** Precomputed edit form for one key (built in an event handler). */
type EditingKey = { key: ApiKeyView; initial: KeyFormState };

/** Nearest expiry option to a key's remaining days (pure helper). */
function nearestExpiryValue(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "never";
  const remainingDays = Math.max(1, Math.round((Date.parse(expiresAt) - now) / 86_400_000));
  return EXPIRY_OPTIONS.filter((option) => option.days !== null).reduce((best, option) =>
    Math.abs((option.days ?? 0) - remainingDays) < Math.abs((best.days ?? 0) - remainingDays)
      ? option
      : best,
  ).value;
}

function EditKeyDialog({
  editing,
  onClose,
  onSaved,
  onError,
}: {
  editing: EditingKey | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  const t = useT();
  if (!editing) return null;
  const { key, initial } = editing;

  return (
    <KeyFormDialog
      open={editing !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("keys.edit.title", { name: key.name })}
      description={t("keys.edit.description")}
      submitLabel={t("keys.edit.confirm")}
      submittingLabel={t("keys.edit.submitting")}
      initial={initial}
      onSubmit={async (form) => {
        const result = await updateKey(key.id, form);
        if (isApiFailure(result)) {
          onError();
          return { error: t("keys.error.action") };
        }
        onSaved();
        return { ok: true as const };
      }}
    />
  );
}

function KeyFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submittingLabel,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  submittingLabel: string;
  initial: KeyFormState;
  /** Returns {ok} on success (dialog closes) or {error} to stay open. */
  onSubmit: (form: {
    name: string;
    expiresInDays: number | null;
    quotaUsd: number | null;
    modelLimits: string[];
  }) => Promise<{ ok: true } | { error: string }>;
}) {
  const t = useT();
  const [form, setForm] = useState<KeyFormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiryDays = useMemo(
    () => EXPIRY_OPTIONS.find((option) => option.value === form.expiry)?.days ?? null,
    [form.expiry],
  );

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const parsedQuota = form.quotaMode === "limited" ? Number(form.quotaUsd) : null;
    if (form.quotaMode === "limited" && (!Number.isFinite(parsedQuota) || (parsedQuota as number) < 0)) {
      setError(t("keys.error.quota"));
      setSubmitting(false);
      return;
    }
    const modelLimits = form.modelLimits
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const result = await onSubmit({
      name: form.name.trim(),
      expiresInDays: expiryDays,
      quotaUsd: parsedQuota as number | null,
      modelLimits,
    });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="key-name" className="block text-sm font-medium text-foreground">
              {t("keys.create.name")}
            </label>
            <Input
              id="key-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              minLength={1}
              maxLength={50}
              autoFocus
            />
          </div>
          <NativeSelect
            label={t("keys.create.expiry")}
            value={form.expiry}
            onChange={(event) => setForm({ ...form, expiry: event.target.value })}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.days === null
                  ? t("keys.create.expiryNever")
                  : t("keys.create.expiryDays", { days: option.days })}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            label={t("keys.create.quota")}
            value={form.quotaMode}
            onChange={(event) => setForm({ ...form, quotaMode: event.target.value })}
          >
            <option value="unlimited">{t("keys.unlimited")}</option>
            <option value="limited">{t("keys.create.quotaLimited")}</option>
          </NativeSelect>
          {form.quotaMode === "limited" ? (
            <div className="space-y-2">
              <label htmlFor="key-quota" className="block text-sm font-medium text-foreground">
                {t("keys.create.quotaAmount")}
              </label>
              <Input
                id="key-quota"
                type="number"
                min={0}
                step="0.01"
                value={form.quotaUsd}
                onChange={(event) => setForm({ ...form, quotaUsd: event.target.value })}
                required
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="key-models" className="block text-sm font-medium text-foreground">
              {t("keys.create.modelLimits")}
            </label>
            <Input
              id="key-models"
              value={form.modelLimits}
              onChange={(event) => setForm({ ...form, modelLimits: event.target.value })}
              placeholder={t("keys.create.modelLimitsPlaceholder")}
              aria-describedby="key-models-hint"
            />
            <p id="key-models-hint" className="text-xs text-muted-foreground">
              {t("keys.create.modelLimitsHint")}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevealDialog({
  revealed,
  onClose,
}: {
  revealed: { name: string; key: string } | null;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={revealed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("keys.reveal.title", { name: revealed?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("keys.reveal.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/60 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
            {revealed?.key}
          </code>
          {revealed ? <CopyButton value={revealed.key} /> : null}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {t("keys.reveal.warning")}
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" onClick={onClose}>
              {t("keys.reveal.done")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyTableSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t("common.loading")} className="space-y-3">
      <span className="sr-only">{t("common.loading")}</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
