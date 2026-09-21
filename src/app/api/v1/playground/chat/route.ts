import { toSessionFailure } from "@/server/adapters/new-api/internal";
import { fetchAvailableModels } from "@/server/adapters/new-api/pricing";
import { parseRelayError, relayChatCompletion, type RelayMessage } from "@/server/adapters/new-api/relay";
import { mintEphemeralKey } from "@/server/adapters/new-api/tokens";
import { callWithSession } from "@/server/auth/with-session";
import { checkSameOriginMutation, withCookies } from "@/server/http";

/**
 * POST /api/v1/playground/chat — run a real chat completion against the
 * gateway from the playground.
 *
 * The browser never holds a customer key: the BFF validates the requested
 * model against the user's available catalogue, mints a single-use API key,
 * executes the relay call with it and deletes the key afterwards (also on
 * failure). Streaming responses (stream: true) are piped through unchanged
 * as Server-Sent Events; the key is deleted when the stream finishes.
 */

type ChatRequestBody = {
  model?: unknown;
  messages?: unknown;
  maxTokens?: unknown;
  temperature?: unknown;
  stream?: unknown;
};

function jsonErrorResponse(status: number, code: string, message: string, setCookies: string[] = []): Response {
  return withCookies(
    Response.json(
      { error: { code, message, request_id: "" } },
      { status },
    ),
    setCookies,
  );
}

export async function POST(request: Request): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonErrorResponse(503, "origin_config_error", "The console is temporarily unavailable.")
      : jsonErrorResponse(403, "origin_forbidden", "Request origin is not allowed.");
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonErrorResponse(400, "invalid_request", "Invalid request body.");
  }

  if (typeof body.model !== "string" || !body.model) {
    return jsonErrorResponse(400, "invalid_request", "A model is required.");
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
    return jsonErrorResponse(400, "invalid_request", "Messages must contain 1–20 entries.");
  }
  const messages: RelayMessage[] = [];
  for (const message of body.messages) {
    if (
      !message || typeof message !== "object" ||
      !("role" in message) || !("content" in message) ||
      (typeof (message as { role: unknown }).role !== "string" ||
        !["system", "user", "assistant"].includes((message as { role: string }).role)) ||
      typeof (message as { content: unknown }).content !== "string" ||
      (message as { content: string }).content.length > 32_000
    ) {
      return jsonErrorResponse(400, "invalid_request", "Invalid message entry.");
    }
    messages.push({
      role: (message as { role: RelayMessage["role"] }).role,
      content: (message as { content: string }).content,
    });
  }
  const maxTokens =
    body.maxTokens === undefined ? 1024 : body.maxTokens;
  if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
    return jsonErrorResponse(400, "invalid_request", "maxTokens must be 1–4096.");
  }
  const temperature = body.temperature === undefined ? 0.7 : body.temperature;
  if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return jsonErrorResponse(400, "invalid_request", "temperature must be 0–2.");
  }
  const stream = body.stream === true;

  const result = await callWithSession(request, async (accessToken) => {
    try {
      const available = await fetchAvailableModels(accessToken);
      return { ok: true as const, value: { accessToken, available } };
    } catch (error) {
      return toSessionFailure(error);
    }
  });

  if (!result.ok) {
    if (result.status === 403) {
      return jsonErrorResponse(403, "forbidden", "You do not have permission to perform this action.");
    }
    if (result.status === 429) {
      return jsonErrorResponse(429, "rate_limited", "Too many requests. Please wait a moment and try again.");
    }
    if (result.status === 503) {
      return jsonErrorResponse(503, "upstream_unavailable", "The console is temporarily unavailable.");
    }
    return jsonErrorResponse(401, "unauthenticated", "Sign in to continue.", result.clearCookies);
  }
  // Only models the user can actually route to may be called.
  if (!result.value.available.some((model) => model.modelId === body.model)) {
    return jsonErrorResponse(400, "invalid_model", "This model is not available to your account.");
  }

  const accessToken = result.value.accessToken;
  const ephemeral = await mintEphemeralKey(accessToken, `playground-${Date.now()}`);
  let relayResponse: Response;
  try {
    relayResponse = await relayChatCompletion(ephemeral.key, {
      model: body.model as string,
      messages,
      maxTokens,
      temperature,
      stream,
    });
  } catch {
    await ephemeral.delete().catch(() => undefined);
    return jsonErrorResponse(503, "upstream_unavailable", "The gateway did not respond.");
  }

  if (!relayResponse.ok) {
    const errorBody = parseRelayError(await relayResponse.text().catch(() => ""));
    await ephemeral.delete().catch(() => undefined);
    const code = typeof errorBody.error?.code === "string" ? errorBody.error.code : "";
    if (code === "model_not_found") {
      return jsonErrorResponse(400, "invalid_model", "This model is not available right now.");
    }
    if (code.includes("quota") || code.includes("balance")) {
      return jsonErrorResponse(402, "insufficient_balance", "Your balance is not enough for this request.");
    }
    return jsonErrorResponse(503, "upstream_unavailable", "The gateway rejected the request.");
  }

  const sessionCookies = result.setCookies;

  if (stream) {
    // Pipe the SSE stream through; delete the ephemeral key once finished.
    const pipe = new TransformStream<Uint8Array, Uint8Array>();
    const upstreamBody = relayResponse.body;
    if (!upstreamBody) {
      await ephemeral.delete().catch(() => undefined);
      return jsonErrorResponse(503, "upstream_unavailable", "The gateway returned an empty response.");
    }
    void upstreamBody.pipeTo(pipe.writable).finally(() => {
      void ephemeral.delete().catch(() => undefined);
    });
    return withCookies(
      new Response(pipe.readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      }),
      sessionCookies,
    );
  }

  const payload = await relayResponse.text();
  await ephemeral.delete().catch(() => undefined);
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return jsonErrorResponse(503, "upstream_unavailable", "The gateway returned a malformed response.");
    }
    return withCookies(
      Response.json({
        data: {
          content,
          promptTokens: typeof parsed.usage?.prompt_tokens === "number" ? parsed.usage.prompt_tokens : null,
          completionTokens: typeof parsed.usage?.completion_tokens === "number" ? parsed.usage.completion_tokens : null,
        },
      }),
      sessionCookies,
    );
  } catch {
    return jsonErrorResponse(503, "upstream_unavailable", "The gateway returned a malformed response.");
  }
}
