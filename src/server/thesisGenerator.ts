/**
 * Trade thesis generator using Claude Sonnet.
 *
 * Gathers fundamentals, technicals, macro, news, and social sentiment
 * into a single context, then asks Claude to produce a structured
 * trade thesis with bull/bear cases, catalysts, and risk levels.
 *
 * Re-evaluation is triggered by:
 *  1. Time-based: stale after configurable TTL (default 4 hours)
 *  2. Event-based: material price move (>3% intraday) or high-impact news
 */

import { claudeMessages, parseClaudeJson } from "./claudeApi";
import { getFundamentals, getQuotes, getNews, type Quote, type NewsItem } from "./marketData";
import { getTechnicalIndicators, type TechnicalIndicators } from "./marketScorecard";
import { getLiveMacroSnapshot, type LiveMacroSnapshot } from "./economicsData";
import { getSocialFeed, type SocialFeedResponse } from "./socialFeed";
import { getScorecardData } from "./marketScorecard";
import { resilientFetch } from "./providerUtils";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ThesisInput {
  symbol: string;
  direction: "long" | "short";
  entryPrice?: number;
  size?: number;           // position size in USD
  thesis?: string;         // existing thesis to evaluate against
}

export interface TradeThesis {
  symbol: string;
  direction: "long" | "short";
  thesis_summary: string;           // 2-3 sentence core thesis
  bull_case: string;                // what drives the upside
  bear_case: string;                // what drives the downside
  key_catalysts: string[];          // upcoming events that could move the stock
  invalidation_level: number;       // price level that invalidates the thesis
  risk_status: "low" | "medium" | "high" | "critical";
  upside_status: "favorable" | "neutral" | "unfavorable";
  downside_status: "limited" | "moderate" | "severe";
  confidence: number;               // 0-1
  generated_at: string;             // ISO timestamp
}

export interface ThesisResult {
  thesis: TradeThesis;
  /** What data feeds were actually used */
  dataFeeds: {
    fundamentals: boolean;
    technicals: boolean;
    macro: boolean;
    news: boolean;
    social: boolean;
    scorecard: boolean;
  };
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Raw inputs logged for audit */
  auditLog: ThesisAuditLog;
}

export interface ThesisAuditLog {
  symbol: string;
  direction: string;
  entryPrice?: number;
  size?: number;
  timestamp: string;
  dataFeedsUsed: Record<string, boolean>;
  fundamentalsSnapshot?: Record<string, any>;
  technicalsSnapshot?: TechnicalIndicators;
  macroSnapshot?: LiveMacroSnapshot;
  newsDigest?: string;
  socialDigest?: string;
  scorecardSnapshot?: any;
  quoteSnapshot?: Partial<Quote>;
}

// ─── Cache & Staleness ────────────────────────────────────────────────────

const thesisCache = new Map<string, { thesis: TradeThesis; result: ThesisResult; ts: number }>();
const DEFAULT_TTL_MS = 4 * 60 * 60_000; // 4 hours
const PRICE_MOVE_THRESHOLD = 3.0; // % intraday move triggers re-evaluation

interface CacheEntry {
  thesis: TradeThesis;
  result: ThesisResult;
  ts: number;
}

function getCachedThesis(symbol: string): CacheEntry | null {
  return thesisCache.get(symbol.toUpperCase()) ?? null;
}

function setCachedThesis(symbol: string, entry: CacheEntry): void {
  thesisCache.set(symbol.toUpperCase(), entry);
}

function isStale(symbol: string, ttlMs: number): boolean {
  const entry = getCachedThesis(symbol);
  if (!entry) return true;
  return Date.now() - entry.ts > ttlMs;
}

function hasMaterialPriceMove(symbol: string, currentPrice: number): boolean {
  const entry = getCachedThesis(symbol);
  if (!entry || !entry.thesis.invalidation_level) return false;
  // Re-evaluate if price moved >3% from thesis generation time
  const thesisTime = entry.ts;
  const timeSince = Date.now() - thesisTime;
  if (timeSince < 30 * 60_000) return false; // don't re-eval within 30min
  // Check if current price is near or past invalidation
  const invalidation = entry.thesis.invalidation_level;
  const distancePct = Math.abs(currentPrice - invalidation) / invalidation * 100;
  return distancePct < 5; // within 5% of invalidation level
}

// ─── Data Gathering ────────────────────────────────────────────────────────

async function gatherFundamentals(symbol: string): Promise<{ data: any; available: boolean }> {
  try {
    const data = await getFundamentals(symbol);
    const available = !!(data?.profile || data?.metrics || data?.incomeStatement);
    return { data, available };
  } catch {
    return { data: null, available: false };
  }
}

async function gatherTechnicals(symbol: string): Promise<{ data: TechnicalIndicators; available: boolean }> {
  try {
    const data = await getTechnicalIndicators(symbol);
    const available = !!(data.rsi14 || data.macd || data.vwap);
    return { data, available };
  } catch {
    return { data: {} as TechnicalIndicators, available: false };
  }
}

async function gatherMacro(): Promise<{ data: LiveMacroSnapshot; available: boolean }> {
  try {
    const data = await getLiveMacroSnapshot();
    const available = !!(data.gdp || data.cpi || data.fedFunds);
    return { data, available };
  } catch {
    return { data: {} as LiveMacroSnapshot, available: false };
  }
}

async function gatherNews(symbol: string): Promise<{ data: NewsItem[]; digest: string; available: boolean }> {
  try {
    const response = await getNews(symbol);
    const items = Array.isArray(response) ? response : (response as any)?.items ?? [];
    if (!items.length) return { data: [], digest: "", available: false };

    // Create a compact digest of recent headlines + sentiment
    const digest = items.slice(0, 10).map((n: NewsItem) =>
      `[${n.sentiment ?? "neutral"}] ${n.title} (${n.source}, ${new Date(n.publishedAt).toLocaleDateString()})`
    ).join("\n");

    return { data: items, digest, available: true };
  } catch {
    return { data: [], digest: "", available: false };
  }
}

async function gatherSocial(symbol: string): Promise<{ data: SocialFeedResponse; digest: string; available: boolean }> {
  try {
    const data = await getSocialFeed([], false, symbol);
    if (!data.posts.length) return { data, digest: "", available: false };

    // Compact digest: top 10 posts by engagement
    const top = data.posts
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 10);

    const sentimentSummary = data.sentiment[symbol]
      ? `Overall sentiment for ${symbol}: score=${data.sentiment[symbol].score}, mentions=${data.sentiment[symbol].count}`
      : "No direct sentiment data";

    const postDigest = top.map(p =>
      `[${p.sentiment.score > 0.3 ? "bull" : p.sentiment.score < -0.3 ? "bear" : "neut"}|${p.platform}] ${p.title || p.text.slice(0, 120)} (engagement: ${p.engagementScore.toFixed(1)})`
    ).join("\n");

    return { data, digest: `${sentimentSummary}\n\nTop posts:\n${postDigest}`, available: true };
  } catch {
    return { data: {} as SocialFeedResponse, digest: "", available: false };
  }
}

async function gatherScorecard(symbol: string): Promise<{ data: any; available: boolean }> {
  try {
    const rows = await getScorecardData();
    const row = rows.find((r: any) => r.symbol === symbol);
    return { data: row ?? null, available: !!row };
  } catch {
    return { data: null, available: false };
  }
}

async function gatherQuote(symbol: string): Promise<{ data: Partial<Quote>; available: boolean }> {
  try {
    const quotes = await getQuotes([symbol]);
    const q = quotes[0];
    if (!q) return { data: {}, available: false };
    return {
      data: {
        symbol: q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        marketCap: q.marketCap,
        pe: q.pe,
        eps: q.eps,
        high52: q.high52,
        low52: q.low52,
        open: q.open,
        previousClose: q.previousClose,
        dayHigh: q.dayHigh,
        dayLow: q.dayLow,
        avgVolume: q.avgVolume,
      },
      available: true,
    };
  } catch {
    return { data: {}, available: false };
  }
}

// ─── Prompt ────────────────────────────────────────────────────────────────

const THESIS_SYSTEM = `You are a senior equity research analyst at a top-tier hedge fund. Given comprehensive market data for a stock, produce a structured trade thesis.

Return ONLY a JSON object (no markdown, no explanation) with this exact schema:
{
  "symbol": "TICKER",
  "direction": "long" | "short",
  "thesis_summary": "<2-3 sentences: the core investment thesis>",
  "bull_case": "<1-2 sentences: what drives the upside>",
  "bear_case": "<1-2 sentences: what drives the downside>",
  "key_catalysts": ["<catalyst 1>", "<catalyst 2>", "<catalyst 3>"],
  "invalidation_level": <price level that invalidates the thesis>,
  "risk_status": "low" | "medium" | "high" | "critical",
  "upside_status": "favorable" | "neutral" | "unfavorable",
  "downside_status": "limited" | "moderate" | "severe",
  "confidence": <0-1, how conviction-worthy this thesis is>
}

Rules:
- Be specific and data-driven. Reference actual numbers from the provided data.
- invalidation_level should be a concrete price (not a percentage).
- key_catalysts should be forward-looking (earnings dates, FDA approvals, macro events).
- confidence reflects conviction based on data quality and clarity of signal.
- If data is missing for a section, note it briefly but still provide your best assessment.
- Risk status considers: volatility, drawdown from highs, macro environment, sector risk.
- upside_status considers: upside to fair value, technical setup, catalyst timing.
- downside_status considers: max drawdown risk, support levels, tail risks.`;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a trade thesis for a symbol.
 *
 * @param input      Thesis parameters (symbol, direction, position details)
 * @param ttlMs      Cache TTL before re-evaluation (default 4 hours)
 * @param forceNew   Bypass cache and generate fresh thesis
 */
export async function generateTradeThesis(
  input: ThesisInput,
  ttlMs = DEFAULT_TTL_MS,
  forceNew = false,
): Promise<ThesisResult> {
  const symbol = input.symbol.toUpperCase();

  // Check cache staleness
  if (!forceNew && !isStale(symbol, ttlMs)) {
    const cached = getCachedThesis(symbol)!;
    return cached.result;
  }

  // Gather all data feeds in parallel
  const [fundamentals, technicals, macro, news, social, scorecard, quote] = await Promise.all([
    gatherFundamentals(symbol),
    gatherTechnicals(symbol),
    gatherMacro(),
    gatherNews(symbol),
    gatherSocial(symbol),
    gatherScorecard(symbol),
    gatherQuote(symbol),
  ]);

  // Build the user message with all context
  const sections: string[] = [];

  sections.push(`## Position
Symbol: ${symbol}
Direction: ${input.direction.toUpperCase()}
${input.entryPrice ? `Entry Price: $${input.entryPrice}` : ""}
${input.size ? `Position Size: $${input.size.toLocaleString()}` : ""}
${input.thesis ? `Existing Thesis: ${input.thesis}` : ""}`);

  if (quote.available && quote.data) {
    const q = quote.data;
    sections.push(`## Current Quote
Price: $${q.price ?? "N/A"}
Change: ${q.change != null ? `$${q.change}` : "N/A"} (${q.changePercent != null ? `${q.changePercent.toFixed(2)}%` : "N/A"})
Volume: ${q.volume?.toLocaleString() ?? "N/A"} (avg: ${q.avgVolume?.toLocaleString() ?? "N/A"})
Market Cap: $${q.marketCap ? (q.marketCap / 1e9).toFixed(1) + "B" : "N/A"}
P/E: ${q.pe ?? "N/A"} | EPS: ${q.eps != null ? `$${q.eps}` : "N/A"}
52W Range: $${q.low52 ?? "N/A"} - $${q.high52 ?? "N/A"}
Day Range: $${q.dayLow ?? "N/A"} - $${q.dayHigh ?? "N/A"}`);
  }

  if (fundamentals.available && fundamentals.data) {
    const f = fundamentals.data;
    const profile = f.profile ?? {};
    sections.push(`## Fundamentals
Sector: ${profile.sector ?? "N/A"}
Industry: ${profile.industry_category ?? "N/A"}
Employees: ${profile.employees?.toLocaleString() ?? "N/A"}
Description: ${(profile.long_description ?? "").slice(0, 500)}`);
  }

  if (technicals.available) {
    const t = technicals.data;
    sections.push(`## Technical Indicators
RSI(14): ${t.rsi14?.toFixed(1) ?? "N/A"}
MACD: ${t.macd?.toFixed(3) ?? "N/A"} | Signal: ${t.macdSignal?.toFixed(3) ?? "N/A"} | Histogram: ${t.macdHistogram?.toFixed(3) ?? "N/A"}
Bollinger: Lower ${t.bollingerLower?.toFixed(2) ?? "N/A"} | Mid ${t.bollingerMiddle?.toFixed(2) ?? "N/A"} | Upper ${t.bollingerUpper?.toFixed(2) ?? "N/A"}
ATR(14): ${t.atr14?.toFixed(2) ?? "N/A"}
VWAP: ${t.vwap?.toFixed(2) ?? "N/A"}
Support: $${t.support?.toFixed(2) ?? "N/A"} | Resistance: $${t.resistance?.toFixed(2) ?? "N/A"}`);
  }

  if (macro.available) {
    const m = macro.data;
    sections.push(`## Macro Environment
GDP Growth: ${m.gdp != null ? `${m.gdp.toFixed(1)}%` : "N/A"} (prev: ${m.gdpPrev != null ? `${m.gdpPrev.toFixed(1)}%` : "N/A"})
CPI YoY: ${m.cpi != null ? `${m.cpi.toFixed(1)}%` : "N/A"} (prev: ${m.cpiPrev != null ? `${m.cpiPrev.toFixed(1)}%` : "N/A"})
Unemployment: ${m.unemployment != null ? `${m.unemployment.toFixed(1)}%` : "N/A"}
Fed Funds Rate: ${m.fedFunds != null ? `${m.fedFunds.toFixed(2)}%` : "N/A"}
10Y Treasury: ${m.t10y != null ? `${m.t10y.toFixed(2)}%` : "N/A"}
2Y Treasury: ${m.t2y != null ? `${m.t2y.toFixed(2)}%` : "N/A"}
Yield Curve (2s10s): ${m.t10y != null && m.t2y != null ? `${(m.t10y - m.t2y).toFixed(2)}%` : "N/A"}`);
  }

  if (news.available) {
    sections.push(`## Recent News
${news.digest}`);
  }

  if (social.available) {
    sections.push(`## Social Sentiment
${social.digest}`);
  }

  if (scorecard.available && scorecard.data) {
    const s = scorecard.data;
    sections.push(`## Scorecard
Price: $${s.price?.toFixed(2) ?? "N/A"}
1D Change: ${s.changePercent != null ? `${s.changePercent.toFixed(2)}%` : "N/A"}
YTD Change: ${s.ytdChange != null ? `${s.ytdChange.toFixed(2)}%` : "N/A"}
52W High: $${s.high52?.toFixed(2) ?? "N/A"} | 52W Low: $${s.low52?.toFixed(2) ?? "N/A"}`);
  }

  const userMessage = sections.join("\n\n");

  // Generate thesis via Claude Sonnet
  const result = await claudeMessages(
    THESIS_SYSTEM,
    [{ role: "user", content: userMessage }],
    "sonnet",
    2048,
  );

  const thesis = parseClaudeJson<TradeThesis>(result.content);

  // Validate
  thesis.symbol = symbol;
  thesis.direction = input.direction;
  thesis.confidence = Math.max(0, Math.min(1, thesis.confidence ?? 0.5));
  thesis.generated_at = new Date().toISOString();

  const dataFeeds = {
    fundamentals: fundamentals.available,
    technicals: technicals.available,
    macro: macro.available,
    news: news.available,
    social: social.available,
    scorecard: scorecard.available,
  };

  // Build audit log
  const auditLog: ThesisAuditLog = {
    symbol,
    direction: input.direction,
    entryPrice: input.entryPrice,
    size: input.size,
    timestamp: new Date().toISOString(),
    dataFeedsUsed: dataFeeds,
    fundamentalsSnapshot: fundamentals.available ? fundamentals.data : undefined,
    technicalsSnapshot: technicals.available ? technicals.data : undefined,
    macroSnapshot: macro.available ? macro.data : undefined,
    newsDigest: news.available ? news.digest : undefined,
    socialDigest: social.available ? social.digest : undefined,
    scorecardSnapshot: scorecard.available ? scorecard.data : undefined,
    quoteSnapshot: quote.available ? quote.data : undefined,
  };

  const thesisResult: ThesisResult = {
    thesis,
    dataFeeds,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: result.latencyMs,
    auditLog,
  };

  // Cache the result
  setCachedThesis(symbol, { thesis, result: thesisResult, ts: Date.now() });

  return thesisResult;
}

/**
 * Check if a thesis needs re-evaluation based on price movement or news.
 * Returns true if the thesis should be regenerated.
 */
export function needsReEvaluation(symbol: string, currentPrice: number): boolean {
  if (isStale(symbol, DEFAULT_TTL_MS)) return true;
  if (hasMaterialPriceMove(symbol, currentPrice)) return true;
  return false;
}

/**
 * Get the cached thesis for a symbol, if any.
 */
export function getCachedThesisForSymbol(symbol: string): ThesisResult | null {
  const entry = getCachedThesis(symbol);
  return entry?.result ?? null;
}

/**
 * Log thesis inputs to console for audit/traceability.
 */
export function logThesisAudit(result: ThesisResult): void {
  const { auditLog, thesis, dataFeeds } = result;
  console.log(`[thesis:${thesis.symbol}] Generated at ${auditLog.timestamp}`);
  console.log(`[thesis:${thesis.symbol}] Direction: ${thesis.direction} | Confidence: ${thesis.confidence}`);
  console.log(`[thesis:${thesis.symbol}] Data feeds: ${Object.entries(dataFeeds).map(([k, v]) => `${k}=${v ? "✓" : "✗"}`).join(" ")}`);
  console.log(`[thesis:${thesis.symbol}] Model: ${result.model} | Tokens: ${result.inputTokens}in/${result.outputTokens}out | Latency: ${result.latencyMs}ms`);
  console.log(`[thesis:${thesis.symbol}] Risk: ${thesis.risk_status} | Upside: ${thesis.upside_status} | Downside: ${thesis.downside_status}`);
  console.log(`[thesis:${thesis.symbol}] Invalidation: $${thesis.invalidation_level}`);
}
