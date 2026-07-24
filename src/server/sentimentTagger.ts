/**
 * Post-level sentiment tagger using Claude Haiku.
 *
 * Given a post's text and optional ticker context, returns structured
 * sentiment classification. Optimized for low cost/latency — uses
 * Haiku model with minimal tokens.
 *
 * Output: { sentiment, confidence, tickers, rationale_short }
 */

import { claudeMessages, parseClaudeJson } from "./claudeApi";
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

/**
 * Tag a single post's sentiment via Claude Haiku.
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

  const result = await claudeMessages(
    TAGGER_SYSTEM,
    [{ role: "user", content: userMessage }],
    "haiku",
    256,  // minimal output tokens — structured JSON only
  );

  const tag = parseClaudeJson<SentimentTag>(result.content);

  // Validate and clamp
  if (!["bullish", "bearish", "neutral"].includes(tag.sentiment)) {
    tag.sentiment = "neutral";
  }
  tag.confidence = Math.max(0, Math.min(1, tag.confidence ?? 0.5));
  tag.tickers = Array.isArray(tag.tickers) ? tag.tickers.map(t => t.toUpperCase()) : [];
  tag.rationale_short = String(tag.rationale_short ?? "").slice(0, 100);

  return {
    tag,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
  };
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
