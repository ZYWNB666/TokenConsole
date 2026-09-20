"use client";

import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/layout/brand-mark";
import { brand } from "@/lib/brand";
import { sanitizeReturnTo } from "@/lib/auth-guards";
import { signIn, verifySignIn } from "@/features/auth/auth-client";

import type { LoginResult } from "@/types/auth";

/**
 * Sign-in screen. The two-factor flow token lives only in this component's
 * state — never in localStorage, sessionStorage or the URL.
 */
export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  const [phase, setPhase] = useState<"credentials" | "code">("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [flowToken, setFlowToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResult(result: { data?: LoginResult; error?: { message: string } }) {
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const data = result.data;
    if (!data) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (data.status === "verification_required") {
      setFlowToken(data.flow_token);
      setPhase("code");
      setError(null);
      // The password has served its purpose and must not linger in memory
      // or reappear when returning to this step.
      setPassword("");
      setShowPassword(false);
      return;
    }
    router.replace(returnTo);
  }

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await handleResult(await signIn(username, password));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !flowToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await handleResult(await verifySignIn(flowToken, "2fa", code));
    } finally {
      setSubmitting(false);
    }
  }

  function backToCredentials() {
    setPhase("credentials");
    setFlowToken(null);
    setCode("");
    setError(null);
    // The password was cleared when entering the verification step and is
    // deliberately not restored here.
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-2">
        <div className="hidden flex-col justify-between gap-16 border-r border-border bg-surface-muted/50 p-10 lg:flex">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">{brand.name}</div>
              <div className="text-xs text-muted-foreground">{brand.tagline}</div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              The enterprise console for your AI APIs.
            </p>
            <p className="text-sm text-muted-foreground">
              Manage keys, monitor usage and keep spending under control — from one place.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {brand.apiEndpoint}
          </p>
        </div>

        <div className="p-6 sm:p-10">
          {phase === "credentials" ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Sign in to {brand.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your workspace account to continue.
              </p>
              <form className="mt-6 space-y-4" onSubmit={handleCredentialsSubmit}>
                <div className="space-y-2">
                  <label htmlFor="login-username" className="block text-sm font-medium text-foreground">
                    Username
                  </label>
                  <Input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    autoFocus
                    required
                    maxLength={64}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      className="pr-10"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showPassword ? (
                        <EyeOffIcon aria-hidden="true" className="size-4" />
                      ) : (
                        <EyeIcon aria-hidden="true" className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-error">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Two-factor verification
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
              <form className="mt-6 space-y-4" onSubmit={handleCodeSubmit}>
                <div className="space-y-2">
                  <label htmlFor="login-code" className="block text-sm font-medium text-foreground">
                    Verification code
                  </label>
                  <Input
                    id="login-code"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
                    className="text-center font-mono text-lg tracking-[0.5em]"
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-error">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Verifying…" : "Verify"}
                </Button>
                <button
                  type="button"
                  onClick={backToCredentials}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
