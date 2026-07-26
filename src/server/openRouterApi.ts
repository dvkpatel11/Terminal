/**
 * OpenRouter API wrapper for DeepSeek V4-Flash.
 *
 * Uses resilientFetch for retry/circuit-breaker. No SDK dependency.
 * Model: deepseek/deepseek-v4-flash (free tier on OpenRouter)
 */

import { resilientFetch } from "./providerUtils";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = "deepseek/deepseek-v4-flash";

export interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenRouterResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  model: string;
  latencyMs: number;
}

/**
 * Send a request to the OpenRouter API.
 *
 * @param system   System prompt
 * @param messages Conversation history
 * @param maxTokens Max tokens for the response
 */
export async function openRouterMessages(
  system: string,
  messages: OpenRouterMessage[],
  maxTokens = 4096,
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const start = Date.now();

  const res = await resilientFetch(
    {
      name: "openrouter",
      retry: { maxAttempts: 2, baseDelayMs: 1500 },
      circuitBreaker: { threshold: 5, cooldownMs: 120_000 },
    },
    `${OPENROUTER_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://terminal.app",
        "X-Title": "BLMTRM Terminal",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.95,
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const msg = body?.error?.message || res.statusText;
    throw new Error(`OpenRouter API ${res.status}: ${msg}`);
  }

  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - start;

  return {
    content: text,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    stopReason: data.choices?.[0]?.finish_reason ?? "unknown",
    model: data.model ?? MODEL,
    latencyMs,
  };
}

/**
 * Parse an OpenRouter response as JSON, stripping markdown fences if present.
 */
export function parseOpenRouterJson<T>(content: string): T {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return JSON.parse(cleaned) as T;
}
