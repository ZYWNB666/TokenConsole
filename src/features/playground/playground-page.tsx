"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SendIcon, SquareTerminalIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet } from "@/lib/api-fetch";
import { useFormat, useT } from "@/i18n/provider";
import { useAsyncData } from "@/lib/use-async-data";

import type { ModelsData } from "@/features/models/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RunState =
  | { phase: "idle" }
  | { phase: "streaming" }
  | { phase: "done"; error: string | null; promptTokens: number | null; completionTokens: number | null };

/**
 * Playground: run real chat completions against the gateway. The browser
 * never holds a customer key — the BFF mints a single-use key per request,
 * relays the call and deletes the key (see /api/v1/playground/chat).
 */
export function PlaygroundPage() {
  const t = useT();
  const format = useFormat();
  const router = useRouter();
  const modelsState = useAsyncData(useCallback(() => apiGet<ModelsData>("/api/v1/models"), []));
  const models = useMemo(
    () => (modelsState.status === "ready" ? modelsState.data.models : []),
    [modelsState],
  );
  const [selectedModel, setSelectedModel] = useState("");
  // First available model until the user picks one explicitly.
  const model = selectedModel || models[0]?.modelId || "";
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, run]);

  const busy = run.phase === "streaming";

  async function send() {
    if (busy || !input.trim() || !model) return;
    const prompt = input.trim();
    setInput("");
    setMessages((current) => [...current, { role: "user", content: prompt }, { role: "assistant", content: "" }]);
    setRun({ phase: "streaming" });

    try {
      const response = await fetch("/api/v1/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: true }),
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = body?.error?.code ?? "upstream_unavailable";
        setRun({ phase: "done", error: t(`playground.error.${code === "invalid_model" ? "invalidModel" : code === "insufficient_balance" ? "insufficientBalance" : code === "rate_limited" ? "rateLimited" : "generic"}`), promptTokens: null, completionTokens: null });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: unknown } }>;
              };
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                content += delta;
                setMessages((current) => {
                  const next = [...current];
                  next[next.length - 1] = { role: "assistant", content };
                  return next;
                });
              }
            } catch {
              // Ignore malformed SSE fragments; the stream continues.
            }
          }
        }
      }
      setRun({ phase: "done", error: null, promptTokens: null, completionTokens: null });
    } catch {
      setRun({ phase: "done", error: t("playground.error.generic"), promptTokens: null, completionTokens: null });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("playground.title")}
        description={t("playground.description")}
        actions={
          models.length > 0 ? (
            <NativeSelect
              label={t("playground.model")}
              value={model}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {models.map((option) => (
                <option key={option.modelId} value={option.modelId}>
                  {option.modelId}
                </option>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />

      <Card className="flex h-[calc(100vh-16rem)] min-h-96 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle as="h2">{t("playground.conversation")}</CardTitle>
          <CardDescription>{t("playground.conversationDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div
            ref={logRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-surface-muted/40 p-4"
            role="log"
            aria-live="polite"
            aria-label={t("playground.conversation")}
          >
            {messages.length === 0 ? (
              <EmptyState
                icon={<SquareTerminalIcon className="size-8" />}
                title={t("playground.empty.title")}
                description={t("playground.empty.description")}
              />
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground"
                      : "mr-auto max-w-[85%] whitespace-pre-wrap rounded-lg rounded-bl-sm border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground shadow-sm"
                  }
                >
                  {message.content || (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                      {t("playground.thinking")}
                    </span>
                  )}
                </div>
              ))
            )}
            {run.phase === "done" && run.error ? (
              <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                {run.error}
              </p>
            ) : null}
            {run.phase === "done" && !run.error && run.completionTokens !== null ? (
              <p className="text-right text-xs text-muted-foreground">
                {format.number(run.promptTokens ?? 0)} → {format.number(run.completionTokens)} tokens
              </p>
            ) : null}
          </div>

          <form
            className="flex items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="playground-input" className="sr-only">
                {t("playground.inputLabel")}
              </label>
              <Textarea
                id="playground-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("playground.inputPlaceholder")}
                rows={2}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy || !input.trim() || !model}>
              <SendIcon aria-hidden="true" className="size-4" />
              {busy ? t("playground.running") : t("playground.send")}
            </Button>
          </form>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("playground.hint")}</p>
            {messages.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMessages([]);
                  setRun({ phase: "idle" });
                }}
              >
                {t("playground.clear")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {modelsState.status === "error" ? (
        <p className="text-xs text-muted-foreground">{t("playground.modelsUnavailable")}</p>
      ) : null}
      {models.length === 0 && modelsState.status === "ready" ? (
        <Badge variant="warning">{t("playground.noModels")}</Badge>
      ) : null}
    </div>
  );
}
