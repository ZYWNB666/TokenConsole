import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CONSOLE_PATHS } from "@/lib/console-paths";
import { consoleRoutes } from "@/lib/navigation";
import { sealSession } from "@/server/auth/session";

/**
 * Page-protection integration test: boots the real production server
 * (`next start`) and asserts that every console page performs its
 * server-side session check BEFORE any protected HTML is produced.
 *
 * Run through `pnpm test` / `pnpm test:integration`, which first deletes
 * .next and rebuilds from the current source — so a present BUILD_ID here
 * is, by construction, from this test run. A missing build fails loudly
 * instead of skipping: this suite must never pass vacuously.
 */

const BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");
const NEXT_BIN = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

if (!existsSync(BUILD_ID)) {
  throw new Error(
    "console-protection integration test requires a production build — run `corepack pnpm test` (or `pnpm test:integration`), which builds fresh. Refusing to skip.",
  );
}

describe("console page protection (integration)", () => {
  let child: ChildProcess | null = null;
  let baseUrl = "";
  const secret = randomBytes(32).toString("base64");
  let validCookie = "";

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = secret;
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
      env: {
        ...process.env,
        AUTH_SESSION_SECRET: secret,
        // Pages never call the upstream in this suite; point it somewhere
        // inert to prove page protection is independent of the backend.
        NEW_API_INTERNAL_URL: "http://127.0.0.1:9",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForServer(`${baseUrl}/login`, 20_000);
  }, 30_000);

  afterAll(async () => {
    delete process.env.AUTH_SESSION_SECRET;
    const handle = child;
    child = null;
    if (!handle) return;
    await new Promise<void>((resolve) => {
      handle.once("exit", () => resolve());
      handle.kill("SIGTERM");
      const killer = setTimeout(() => {
        handle.kill("SIGKILL");
        resolve();
      }, 5_000);
      killer.unref();
    });
  });

  beforeEach(() => {
    const now = Math.floor(Date.now() / 1000);
    validCookie = `tc_session=${sealSession({
      at: `at-${randomUUID()}`,
      ae: now + 900,
      rt: `rt-${randomUUID()}`,
      sid: `sid-${randomUUID().slice(0, 8)}`,
      exp: now + 3600,
    })}`;
  });

  it("redirects every console path to /login before any protected HTML", async () => {
    for (const pathname of CONSOLE_PATHS) {
      const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
      expect(response.status, pathname).toBe(307);
      const location = response.headers.get("location") ?? "";
      expect(location.endsWith(`/login?returnTo=${encodeURIComponent(pathname)}`), location).toBe(true);
      const body = await response.text();
      // No console navigation, no dashboard content, no shell markup.
      expect(body, pathname).not.toContain('href="/api-keys"');
      expect(body, pathname).not.toContain("Usage Trend");
      expect(body, pathname).not.toContain("Recent Requests");
      // The bare redirect document is ~7KB; a leaked page render is 40KB+.
      expect(body.length, pathname).toBeLessThan(8_000);
    }
  });

  it("rejects a tampered session cookie before rendering", async () => {
    const tampered = `${validCookie.slice(0, -4)}AAAA`;
    const response = await fetch(`${baseUrl}/overview`, {
      redirect: "manual",
      headers: { cookie: tampered },
    });
    expect(response.status).toBe(307);
    expect((response.headers.get("location") ?? "").endsWith("/login?returnTo=%2Foverview")).toBe(true);
    const body = await response.text();
    expect(body).not.toContain("Usage Trend");
  });

  it("ignores a forged readable hint cookie entirely", async () => {
    const response = await fetch(`${baseUrl}/overview`, {
      redirect: "manual",
      headers: { cookie: "tc_session_hint=1" },
    });
    expect(response.status).toBe(307);
    const body = await response.text();
    expect(body).not.toContain("Usage Trend");
    expect(body).not.toContain('href="/api-keys"');
  });

  it("renders the console for a valid session and bounces /login to /overview", async () => {
    const page = await fetch(`${baseUrl}/overview`, { redirect: "manual", headers: { cookie: validCookie } });
    expect(page.status).toBe(200);
    const body = await page.text();
    expect(body).toContain("Usage Trend");
    expect(body).toContain('href="/api-keys"');

    const login = await fetch(`${baseUrl}/login`, { redirect: "manual", headers: { cookie: validCookie } });
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toContain("/overview");
  });

  it("keeps unknown sections 404 for authenticated visitors and redirects anonymous ones", async () => {
    // Anonymous: the session gate fires before the 404 — no route probing.
    const anonymous = await fetch(`${baseUrl}/does-not-exist`, { redirect: "manual" });
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get("location")).toContain("/login");

    const authed = await fetch(`${baseUrl}/does-not-exist`, { redirect: "manual", headers: { cookie: validCookie } });
    expect(authed.status).toBe(404);
  });

  it("protects exactly the navigation's console destinations", () => {
    // The registry drives the loop above; keep it pinned to the nav metadata.
    expect(CONSOLE_PATHS.length).toBe(consoleRoutes.length);
  });
});

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("no port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "server never became ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`integration server not ready: ${lastError}`);
}
