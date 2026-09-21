import "server-only";

import { internalBase } from "./internal";

/**
 * Server-only relay adapter for the New API fork (commit 972aed19).
 *
 * Executes real customer API traffic against the fork's OpenAI-compatible
 * relay endpoint. The caller supplies an sk- API key minted for this exact
 * request (see tokens.ts); the response is passed through raw so streaming
 * responses can be piped to the browser unchanged.
 */

export type RelayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RelayChatInput = {
  model: string;
  messages: RelayMessage[];
  maxTokens: number;
  temperature: number;
  stream: boolean;
};

const RELAY_TIMEOUT_MS = 120_000;

export async function relayChatCompletion(apiKey: string, input: RelayChatInput): Promise<Response> {
  const base = internalBase();
  return fetch(new URL("/v1/chat/completions", base), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      stream: input.stream,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  });
}

/** OpenAI-style relay error body, when the relay rejects the request. */
export type RelayErrorBody = {
  error?: { message?: unknown; type?: unknown; code?: unknown };
};

export function parseRelayError(body: string): RelayErrorBody {
  try {
    const parsed = JSON.parse(body) as RelayErrorBody;
    if (parsed && typeof parsed === "object" && parsed.error && typeof parsed.error === "object") {
      return parsed;
    }
  } catch {
    // fall through to an empty error body
  }
  return {};
}
