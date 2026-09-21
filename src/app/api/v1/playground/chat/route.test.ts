import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/playground/chat/route";
import { sealSession } from "@/server/auth/session";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/**
 * Playground chat route. The critical contracts: the requested model must
 * be available to the caller; the ephemeral key is minted, used for the
 * relay call and deleted afterwards (including on relay failure); the full
 * key value never reaches the browser.
 */

let upstream: MockUpstream;

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64");
  upstream = undefined as unknown as MockUpstream;
});

afterEach(async () => {
  delete process.env.NEW_API_INTERNAL_URL;
  delete process.env.AUTH_SESSION_SECRET;
  if (upstream) await upstream.close();
});

const NOW = Math.floor(Date.now() / 1000);

function makeSession(): { cookie: string } {
  const sealed = sealSession({
    at: `at-${randomUUID()}`,
    ae: NOW + 900,
    rt: `rt-${randomUUID()}`,
    sid: `sid-${randomUUID().slice(0, 8)}`,
    exp: NOW + 3600,
  });
  return { cookie: `tc_session=${sealed}` };
}

function chatRequest(cookie: string, body: unknown): Request {
  return new Request("http://localhost:3100/api/v1/playground/chat", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json", origin: "http://localhost:3100" },
    body: JSON.stringify(body),
  });
}

const PRICING = JSON.stringify({
  success: true,
  data: [
    { model_name: "GLM-5.2", quota_type: 0, model_ratio: 37.5, model_price: 0, completion_ratio: 1, supported_endpoint_types: ["openai"] },
  ],
});
const USER_MODELS_ROUTE = "/api/user/models";
const USER_MODELS = JSON.stringify({ success: true, data: ["GLM-5.2"] });

function mintRoutes(tokenId: number, fullKey: string) {
  return [
    { method: "POST", path: "/api/token/", body: JSON.stringify({ success: true, message: "" }) },
    {
      method: "GET",
      path: "/api/token/",
      body: JSON.stringify({
        success: true,
        data: {
          page: 1, page_size: 100, total: 1,
          items: [{ id: tokenId, name: `playground-${NOW}`, key: "abcd**********wxyz", status: 1, created_time: NOW, accessed_time: NOW, expired_time: -1, remain_quota: 0, unlimited_quota: true, used_quota: 0, model_limits_enabled: false, model_limits: "" }],
        },
      }),
    },
    { method: "POST", path: `/api/token/${tokenId}/key`, body: JSON.stringify({ success: true, data: { key: fullKey } }) },
    { method: "DELETE", path: `/api/token/${tokenId}`, body: JSON.stringify({ success: true, message: "" }) },
  ];
}

describe("POST /api/v1/playground/chat", () => {
  it("runs a non-streaming completion with an ephemeral key and deletes it", async () => {
    const session = makeSession();
    const fullKey = `sk-playground-${randomUUID()}`;
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/pricing", body: PRICING },
      { method: "GET", path: USER_MODELS_ROUTE, body: USER_MODELS },
      ...mintRoutes(11, fullKey),
      {
        method: "POST",
        path: "/v1/chat/completions",
        body: JSON.stringify({
          choices: [{ message: { content: "Hello from the gateway" } }],
          usage: { prompt_tokens: 12, completion_tokens: 34 },
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await POST(
      chatRequest(session.cookie, {
        model: "GLM-5.2",
        messages: [{ role: "user", content: "Say hello" }],
        maxTokens: 100,
        stream: false,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as { data: { content: string; promptTokens: number } };
    expect(parsed.data).toMatchObject({ content: "Hello from the gateway", promptTokens: 12 });
    // The full key must never reach the browser.
    expect(body).not.toContain(fullKey);

    // The relay call used the ephemeral key (not the session token)…
    const relay = mock.requests.find((r) => r.url === "/v1/chat/completions");
    expect(relay?.headers.authorization).toBe(`Bearer ${fullKey}`);
    // …and the ephemeral key was deleted afterwards.
    const deleteCall = mock.requests.find((r) => r.method === "DELETE");
    expect(deleteCall?.url).toBe("/api/token/11");
  });

  it("rejects a model that is not available to the caller", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/pricing", body: PRICING },
      { method: "GET", path: USER_MODELS_ROUTE, body: USER_MODELS },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await POST(
      chatRequest(session.cookie, {
        model: "not-a-model",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    );
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as { error: { code: string } };
    expect(parsed.error.code).toBe("invalid_model");
    // No key was minted for a rejected model.
    expect(mock.requests.some((r) => r.method === "POST" && r.url === "/api/token/")).toBe(false);
  });

  it("deletes the ephemeral key even when the relay rejects the call", async () => {
    const session = makeSession();
    const fullKey = `sk-playground-${randomUUID()}`;
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/pricing", body: PRICING },
      { method: "GET", path: USER_MODELS_ROUTE, body: USER_MODELS },
      ...mintRoutes(12, fullKey),
      {
        method: "POST",
        path: "/v1/chat/completions",
        status: 404,
        body: JSON.stringify({ error: { code: "model_not_found", message: "no channel", type: "not_found" } }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await POST(
      chatRequest(session.cookie, {
        model: "GLM-5.2",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    );
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as { error: { code: string } };
    expect(parsed.error.code).toBe("invalid_model");
    const deleteCall = mock.requests.find((r) => r.method === "DELETE");
    expect(deleteCall?.url).toBe("/api/token/12");
  });

  it("requires a same-origin mutation header", async () => {
    const session = makeSession();
    const response = await POST(
      new Request("http://localhost:3100/api/v1/playground/chat", {
        method: "POST",
        headers: { cookie: session.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "GLM-5.2", messages: [{ role: "user", content: "hi" }] }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
