/**
 * Thin wrapper around the Anthropic Messages API.
 *
 * Uses resilientFetch for retry/circuit-breaker. No SDK dependency.
 * Models:
 *  - "haiku"  → claude-sonnet-4-20250514  (fast, cheap — sentiment tagging)
 *  - "sonnet" → claude-sonnet-4-20250514  (quality — thesis generation)
 */

import { resilientFetch } from "./providerUtils";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

export type ClaudeModelTier = "haiku" | "sonnet";

const MODEL_MAP: Record<ClaudeModelTier, string> = {
  haiku: "claude-haiku-4-20250414",
  sonnet: "claude-sonnet-4-20250514",
};

const MAX_TOKENS: Record<ClaudeModelTier, number> = {
  haiku: 1024,
  sonnet: 4096,
};

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  model: string;
  latencyMs: number;
}

/**
 * Send a request to the Anthropic Messages API.
 *
 * @param system   System prompt (prepended by API, not counted as a user message)
 * @param messages Conversation history
 * @param tier     Model tier — "haiku" for speed/cost, "sonnet" for quality
 * @param maxTokens Override default max tokens for the tier
 */
export async function claudeMessages(
  system: string,
  messages: ClaudeMessage[],
  tier: ClaudeModelTier = "haiku",
  maxTokens?: number,
): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = MODEL_MAP[tier];
  const tokens = maxTokens ?? MAX_TOKENS[tier];
  const start = Date.now();

  const res = await resilientFetch(
    {
      name: "anthropic",
      retry: { maxAttempts: 2, baseDelayMs: 1500 },
      circuitBreaker: { threshold: 5, cooldownMs: 120_000 },
    },
    `${ANTHROPIC_BASE}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: tokens,
        system,
        messages,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const msg = body?.error?.message || res.statusText;
    throw new Error(`Claude API ${res.status}: ${msg}`);
  }

  const data = await res.json() as any;
  const text = data.content?.[0]?.text ?? "";
  const latencyMs = Date.now() - start;

  return {
    content: text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    stopReason: data.stop_reason ?? "unknown",
    model: data.model ?? model,
    latencyMs,
  };
}

/**
 * Parse a Claude response as JSON, stripping markdown fences if present.
 */
export function parseClaudeJson<T>(content: string): T {
  let cleaned = content.trim();
  // Strip ```json ... ``` fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return JSON.parse(cleaned) as T;
}
