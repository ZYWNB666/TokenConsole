"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphoneIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-fetch";
import { useFormat, useT } from "@/i18n/provider";
import { isApiFailure } from "@/types/api";
import { useAsyncData } from "@/lib/use-async-data";

import type { SessionsData } from "./types";
import type { AuthUser } from "@/types/auth";
import { fetchCurrentUser } from "@/features/auth/auth-client";

/**
 * Settings: display-name profile and active login-session management.
 * Password change requires the gateway's interactive security verification
 * and is deliberately not proxied here.
 */
export function SettingsPage() {
  const t = useT();
  const format = useFormat();
  const sessionsState = useAsyncData(useCallback(() => apiGet<SessionsData>("/api/v1/settings/sessions"), []));
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    fetchCurrentUser().then((result) => {
      if (active && result.status === "authenticated") setUser(result.user);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <ProfileCard user={user} onSaved={() => undefined} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("settings.sessions.title")}</CardTitle>
          <CardDescription>{t("settings.sessions.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionsState.status === "loading" ? (
            <div role="status" aria-label={t("common.loading")} className="space-y-2">
              <span className="sr-only">{t("common.loading")}</span>
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : sessionsState.status === "error" ? (
            <EmptyState
              title={t("common.error.title")}
              description={t("common.error.description")}
              action={
                <Button type="button" variant="outline" size="sm" onClick={sessionsState.reload}>
                  {t("common.tryAgain")}
                </Button>
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                {sessionsState.data.sessions.map((session) => (
                  <div
                    key={session.sid}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <MonitorSmartphoneIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {session.userAgent || t("settings.sessions.unknownDevice")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {session.ip || "—"} · {t("settings.sessions.created")}{" "}
                          {format.dateTime(session.createdAt)} · {t("settings.sessions.expires")}{" "}
                          {format.day(session.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {session.current ? (
                        <Badge variant="info">{t("settings.sessions.current")}</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await apiDelete(`/api/v1/settings/sessions/${session.sid}`);
                            sessionsState.reload();
                          }}
                        >
                          {t("settings.sessions.revoke")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await apiPost("/api/v1/settings/sessions", { action: "revoke-others" });
                  sessionsState.reload();
                }}
              >
                {t("settings.sessions.revokeOthers")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileCard({ user, onSaved }: { user: AuthUser | null; onSaved: () => void }) {
  const t = useT();
  // Draft is null until the user edits; the shown value falls back to the
  // loaded profile, so no state-syncing effect is needed.
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const displayName = draft ?? user?.display_name ?? "";

  async function save() {
    if (state === "saving" || !user) return;
    setState("saving");
    const result = await apiPatch("/api/v1/settings/profile", { displayName: displayName.trim() });
    if (!isApiFailure(result)) {
      setState("saved");
      onSaved();
    } else {
      setState("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!user ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="min-w-64 space-y-1.5">
              <label htmlFor="display-name" className="block text-xs font-medium text-muted-foreground">
                {t("settings.profile.displayName")}
              </label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setState("idle");
                }}
                required
                minLength={1}
                maxLength={64}
              />
            </div>
            <Button
              type="submit"
              disabled={state === "saving" || !user || displayName.trim() === user.display_name}
            >
              {state === "saving" ? t("settings.profile.saving") : t("settings.profile.save")}
            </Button>
            {state === "saved" ? (
              <p role="status" className="pb-2 text-xs text-success">
                {t("settings.profile.saved")}
              </p>
            ) : null}
            {state === "error" ? (
              <p role="alert" className="pb-2 text-xs text-error">
                {t("settings.profile.error")}
              </p>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
