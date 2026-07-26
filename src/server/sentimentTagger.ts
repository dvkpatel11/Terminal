/**
 * Post-level sentiment tagger using NVIDIA free model (llama-3.1-8b-instant).
 *
 * Given a post's text and optional ticker context, returns structured
 * sentiment classification. Optimized for zero cost — uses NVIDIA NIM
 * free tier with minimal tokens.
 *
 * Output: { sentiment, confidence, tickers, rationale_short }
 */

import { resilientFetch } from "./providerUtils";
import { extractTickers } from "./sentimentAnalyzer";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SentimentTag {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;       // 0-1
  tickers: string[];
  rationale_short: string;  // max ~15 words
}

export interface TagSentimentInput {
  text: string;
  title?: string;
  platform?: string;
  author?: string;
  /** Pre-extracted tickers from the client — if provided, used as hints */
  tickers?: string[];
}

export interface TagSentimentResult {
  tag: SentimentTag;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// ─── Prompt ────────────────────────────────────────────────────────────────

const TAGGER_SYSTEM = `You are a financial sentiment classifier. Given a social media post about stocks/crypto, return ONLY a JSON object (no markdown, no explanation) with this exact schema:

{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": <number 0-1>,
  "tickers": ["SYMBOL1", "SYMBOL2"],
  "rationale_short": "<max 15 words explaining why>"
}

Rules:
- "bullish" = positive outlook, buy recommendation, optimism about price/applications
- "bearish" = negative outlook, sell recommendation, pessimism about price/applications
- "neutral" = factual reporting, question, meme with no clear direction, or mixed signals
- confidence reflects how clear the sentiment signal is (0.9+ for explicit calls, 0.5-0.7 for ambiguous)
- tickers: only include cashtags ($TSLA) or clearly referenced symbols. Use the hints if provided.
- rationale_short: be specific and data-driven, not generic
- If the post mentions no tickers/symbols, return empty tickers array
- If the post is not about finance/markets at all, return neutral with confidence 0.1`;

// ─── Public API ────────────────────────────────────────────────────────────

const NVIDIA_API_URL = process.env.NVIDIA_API_URL ?? "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? "";
const NVIDIA_MODEL = "nvidia/llama-3.1-8b-instant";

/**
 * Tag a single post's sentiment via NVIDIA free model.
 * Uses the rule-based extractTickers as pre-hints to reduce model hallucination.
 */
export async function tagPostSentiment(
  input: TagSentimentInput,
): Promise<TagSentimentResult> {
  const fullText = input.title ? `${input.title}\n\n${input.text}` : input.text;

  // Pre-extract tickers as hints for the model
  const hintTickers = input.tickers ?? extractTickers(fullText);

  const userMessage = [
    input.platform ? `Platform: ${input.platform}` : "",
    input.author ? `Author: ${input.author}` : "",
    hintTickers.length ? `Detected tickers (hints): ${hintTickers.join(", ")}` : "",
    "",
    "---",
    fullText.slice(0, 2000),  // cap input to control cost
  ].filter(Boolean).join("\n");

  if (!NVIDIA_API_KEY) {
    // Fallback: return neutral with low confidence when API not configured
    return {
      tag: { sentiment: "neutral", confidence: 0.1, tickers: hintTickers, rationale_short: "NVIDIA API not configured" },
      model: "fallback",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }

  const start = Date.now();

  const res = await resilientFetch(
    {
      name: "nvidia-sentiment",
      retry: { maxAttempts: 2, baseDelayMs: 1000 },
      circuitBreaker: { threshold: 5, cooldownMs: 60_000 },
    },
    NVIDIA_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: "system", content: TAGGER_SYSTEM },
          { role: "user", content: userMessage },
        ],
        max_tokens: 256,
        temperature: 0.3,
        top_p: 0.9,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const msg = body?.error?.message || res.statusText;
    throw new Error(`NVIDIA API ${res.status}: ${msg}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - start;

  const tag = parseNvidiaJson<SentimentTag>(content);

  // Validate and clamp
  if (!["bullish", "bearish", "neutral"].includes(tag.sentiment)) {
    tag.sentiment = "neutral";
  }
  tag.confidence = Math.max(0, Math.min(1, tag.confidence ?? 0.5));
  tag.tickers = Array.isArray(tag.tickers) ? tag.tickers.map(t => t.toUpperCase()) : [];
  tag.rationale_short = String(tag.rationale_short ?? "").slice(0, 100);

  return {
    tag,
    model: data.model ?? NVIDIA_MODEL,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

function parseNvidiaJson<T>(content: string): T {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return JSON.parse(cleaned) as T;
}

/**
 * Batch-tag multiple posts in parallel with concurrency control.
 * Returns results in the same order as inputs.
 */
export async function tagPostsBatch(
  inputs: TagSentimentInput[],
  concurrency = 5,
): Promise<TagSentimentResult[]> {
  const results: TagSentimentResult[] = [];

  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(input => tagPostSentiment(input)),
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        // Fallback: neutral with low confidence on failure
        results.push({
          tag: { sentiment: "neutral", confidence: 0.1, tickers: [], rationale_short: "Tagging failed" },
          model: "fallback",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        });
      }
    }
  }

  return results;
}
