import { XMLParser } from "fast-xml-parser";
import { buildDataStatus, type DataStatus } from "./dataStatus";
import { fetchText, getCached, setCached, resilientFetchJson, resilientFetch } from "./providerUtils";
import { fetchOpenBBFundamentals, fetchOpenBBOptions, fetchOpenBBYieldCurve } from "./openbbProvider";
import { extendedStorage } from "./storage";
import { getLiveMacroSnapshot } from "./economicsData";
import {
  getScreenerUniverse,
  getPeerMap,
  getPeersForSymbol,
  getProfileCatalog,
  getIndexSparklineSymbols,
  getEconomicsCommodities,
} from "./symbolRegistry";

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type OhlcvInterval = "5m" | "15m" | "1h" | "1d";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
  high52: number;
  low52: number;
  open: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  avgVolume: number;
  exchange: string;
  sector?: string;
  assetClass?: string;
  quoteSource: string;
  isLive: boolean;
  status: DataStatus;
}

export interface OHLCVSeries {
  bars: OHLCVBar[];
  status: DataStatus;
  supportsIntraday: boolean;
}

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  feedProvider: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
  status: DataStatus;
  image?: string;
}

export interface NewsArticle {
  title: string;
  source: string;
  feedProvider: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  content: string[];
  status: DataStatus;
}
interface CurrentQuoteSnapshot {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  time: string;
}

interface InstrumentProfile {
  name: string;
  exchange: string;
  sector?: string;
  marketCap?: number;
  referencePrice?: number;
  eps?: number;
  assetClass?: "equity" | "etf" | "index" | "commodity" | "crypto" | "forex";
  coinGeckoId?: string;
}

interface BuildQuoteInput {
  symbol: string;
  provider: string;
  profile?: InstrumentProfile;
  current: CurrentQuoteSnapshot;
  history: OHLCVBar[];
  isLive?: boolean;
  status?: DataStatus;
}

interface RssFeedConfig {
  url: string;
  fallbackSource: string;
}

interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
});

const QUOTE_TTL_MS = 60_000;
const HISTORY_TTL_MS = 10 * 60_000;
const NEWS_TTL_MS = 5 * 60_000;
const ARTICLE_TTL_MS = 15 * 60_000;
const CATALOG_FALLBACK_SOURCE = "Reference fallback";

const quoteCache = new Map<string, { expiresAt: number; value: Quote }>();
// 52-week ranges change slowly — cache for an hour to limit CoinGecko calls.
const cryptoRangeCache = new Map<string, { expiresAt: number; value: { high: number; low: number } }>();
const CRYPTO_RANGE_TTL_MS = 60 * 60_000;
const historyCache = new Map<string, { expiresAt: number; value: OHLCVBar[] }>();
const newsCache = new Map<string, { expiresAt: number; value: NewsItem[] }>();
const articleCache = new Map<string, { expiresAt: number; value: NewsArticle }>();

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistQuoteToDb(quote: Quote): Promise<void> {
  if (!extendedStorage) return;
  try {
    const instrument = await extendedStorage.getInstrumentBySymbol(quote.symbol);
    if (!instrument) return;
    await extendedStorage.persistQuote({
      instrumentId: instrument.id,
      symbol: quote.symbol,
      price: quote.price,
      open: quote.open,
      high: quote.dayHigh,
      low: quote.dayLow,
      close: quote.price,
      volume: quote.volume,
      change: quote.change,
      changePercent: quote.changePercent,
      marketCap: quote.marketCap,
      pe: quote.pe,
      eps: quote.eps,
      high52: quote.high52,
      low52: quote.low52,
      quoteSource: quote.quoteSource,
      isLive: quote.isLive,
    });
  } catch (e) {
    console.error(`Failed to persist quote for ${quote.symbol}:`, e);
  }
}

async function persistOhlcvToDb(symbol: string, bars: OHLCVBar[], interval: OhlcvInterval): Promise<void> {
  if (!extendedStorage || !bars.length) return;
  try {
    const instrument = await extendedStorage.getInstrumentBySymbol(symbol);
    if (!instrument) return;
    
    const lastBar = bars[bars.length - 1];
    const existing = await extendedStorage.getOhlcvHistory(instrument.id, interval, 1);
    const lastExistingDate = existing[0]?.date;
    
    const newBars = lastExistingDate
      ? bars.filter(bar => bar.date > lastExistingDate)
      : bars.slice(-30);
    
    if (newBars.length > 0) {
      await extendedStorage.persistOhlcvBars(newBars.map(bar => ({
        instrumentId: instrument.id,
        symbol,
        date: bar.date,
        interval,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })));
    }
  } catch (e) {
    console.error(`Failed to persist OHLCV for ${symbol}:`, e);
  }
}

async function persistNewsToDb(items: NewsItem[]): Promise<void> {
  if (!extendedStorage || !items.length) return;
  try {
    for (const item of items.slice(0, 10)) {
      const existing = await extendedStorage.getRecentNews(1);
      if (existing[0]?.url === item.url) continue;
      
      const persisted = await extendedStorage.persistNewsItem({
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: item.source,
        feedProvider: item.feedProvider,
        publishedAt: item.publishedAt,
        sentiment: item.sentiment,
        image: item.image,
      });
      
      if (persisted) {
        const symbols = extractSymbolsFromNews(item.title, item.summary);
        for (const sym of symbols) {
          const instrument = await extendedStorage.getInstrumentBySymbol(sym);
          if (instrument) {
            await extendedStorage.linkNewsToInstrument(persisted.id, instrument.id);
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to persist news:", e);
  }
}

function extractSymbolsFromNews(title: string, summary: string): string[] {
  const text = `${title} ${summary}`.toUpperCase();
  const symbols: string[] = [];
  for (const sym of Object.keys(PROFILE_CATALOG)) {
    if (text.includes(sym) || text.includes(PROFILE_CATALOG[sym].name.toUpperCase().split(" ")[0])) {
      symbols.push(sym);
    }
  }
  return symbols.slice(0, 5);
}

const POSITIVE_WORDS = [
  "beat", "beats", "surge", "surges", "jump", "jumps", "rally", "rallies", "gain", "gains",
  "upgrade", "upgrades", "tops", "strong", "record", "optimism", "expands", "growth", "bullish",
];
const NEGATIVE_WORDS = [
  "fall", "falls", "drop", "drops", "miss", "misses", "weak", "weaker", "downgrade", "downgrades",
  "fears", "fear", "probe", "scrutiny", "recession", "pressure", "lawsuit", "slump", "bearish",
];

const PROFILE_CATALOG: Record<string, InstrumentProfile> = getProfileCatalog() as Record<string, InstrumentProfile>;

const SCREENER_UNIVERSE = getScreenerUniverse();

const PEER_MAP: Record<string, string[]> = getPeerMap();

const GENERAL_NEWS_FEEDS: RssFeedConfig[] = [
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", fallbackSource: "CNBC" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", fallbackSource: "CoinDesk" },
  { url: "https://finance.yahoo.com/news/rssindex", fallbackSource: "Yahoo Finance" },
  { url: buildGoogleNewsSearchUrl("stock market OR federal reserve OR earnings OR inflation OR bitcoin when:2d"), fallbackSource: "Google News" },
];

function getAllUniqueSources(): RssFeedConfig[] {
  const seen = new Map<string, RssFeedConfig>();
  for (const feed of GENERAL_NEWS_FEEDS) {
    if (!seen.has(feed.fallbackSource)) seen.set(feed.fallbackSource, feed);
  }
  return Array.from(seen.values());
}

export async function testNewsSource(url: string): Promise<{ ok: boolean; latency: number; statusCode: number }> {
  const start = Date.now();
  try {
    const response = await resilientFetch(
      { name: "generic", retry: { maxAttempts: 1, baseDelayMs: 500 }, circuitBreaker: { threshold: 10, cooldownMs: 30_000 } },
      url,
    );
    return { ok: response.ok, latency: Date.now() - start, statusCode: response.status };
  } catch {
    return { ok: false, latency: Date.now() - start, statusCode: 0 };
  }
}

export async function getNewsSourceStatuses() {
  const sources = getAllUniqueSources();
  const results = await Promise.allSettled(sources.map(async (source) => {
    const test = await testNewsSource(source.url);
    return { name: source.fallbackSource, url: source.url, ...test };
  }));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { name: sources[i].fallbackSource, url: sources[i].url, ok: false, latency: 0, statusCode: 0 }
  );
}

export async function fetchNewsSourceContent(url: string): Promise<{ ok: boolean; statusCode: number; body: string }> {
  try {
    const response = await resilientFetch(
      { name: "generic", retry: { maxAttempts: 1, baseDelayMs: 500 }, circuitBreaker: { threshold: 10, cooldownMs: 30_000 } },
      url,
    );
    const text = await response.text();
    return { ok: response.ok, statusCode: response.status, body: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, statusCode: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseNumberish(raw: string | undefined) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function formatCompactDate(raw: string | undefined) {
  if (!raw || raw.length !== 8) return "";
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function formatCompactTime(raw: string | undefined) {
  if (!raw || raw.length !== 6) return "";
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchQuery(query?: string) {
  return query?.trim().toLowerCase() ?? "";
}

export function extractArticleContent(html: string): string[] {
  const preferredBlock = html.match(/<(article|main)[^>]*>[\s\S]*?<\/\1>/i)?.[0] ?? html;
  const withoutBoilerplate = preferredBlock
    .replace(/<(script|style|noscript|svg|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(header|footer|nav|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const blocks = Array.from(withoutBoilerplate.matchAll(/<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi))
    .map((match) => stripHtml(match[2]))
    .filter((text) => text.length >= 40 || text.split(" ").length >= 4);

  return uniqueBy(blocks, (text) => text).slice(0, 24);
}

export function filterNewsItems(items: NewsItem[], query?: string): NewsItem[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function sanitizeArticleUrl(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported article protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function getIntervalBucketMs(interval: OhlcvInterval) {
  switch (interval) {
    case "5m": return 5 * 60_000;
    case "15m": return 15 * 60_000;
    case "1h": return 60 * 60_000;
    case "1d":
    default:
      return 24 * 60 * 60_000;
  }
}

export function aggregatePricePoints(points: PricePoint[], interval: OhlcvInterval): OHLCVBar[] {
  if (!points.length) return [];
  const bucketMs = getIntervalBucketMs(interval);
  const buckets = new Map<number, PricePoint[]>();

  for (const point of points) {
    const bucketStart = Math.floor(point.timestamp / bucketMs) * bucketMs;
    const group = buckets.get(bucketStart) ?? [];
    group.push(point);
    buckets.set(bucketStart, group);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStart, bucketPoints]) => ({
      date: new Date(bucketStart).toISOString(),
      open: round(bucketPoints[0].price),
      high: round(Math.max(...bucketPoints.map((point) => point.price))),
      low: round(Math.min(...bucketPoints.map((point) => point.price))),
      close: round(bucketPoints.at(-1)?.price ?? bucketPoints[0].price),
      volume: Math.round(bucketPoints.reduce((sum, point) => sum + point.volume, 0)),
    }));
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function inferSentiment(text: string): NewsItem["sentiment"] {
  const input = text.toLowerCase();
  const positive = POSITIVE_WORDS.reduce((count, word) => count + Number(input.includes(word)), 0);
  const negative = NEGATIVE_WORDS.reduce((count, word) => count + Number(input.includes(word)), 0);
  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}

function splitTitleAndSource(title: string, explicitSource: string | undefined, fallbackSource: string) {
  const cleaned = stripHtml(title);
  if (explicitSource) {
    const suffix = ` - ${explicitSource}`;
    return {
      title: cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length).trim() : cleaned,
      source: explicitSource,
    };
  }

  const match = cleaned.match(/^(.*)\s+-\s+([^\-]+)$/);
  if (match) {
    return {
      title: match[1].trim(),
      source: match[2].trim(),
    };
  }

  return { title: cleaned, source: fallbackSource };
}

function mapToStooqSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  if (upper === "^GSPC") return "^spx";
  if (upper === "^DJI") return "^dji";
  if (upper === "^IXIC") return "^ndq";
  if (upper === "^RUT") return "iwm.us";
  if (upper === "GC=F") return "gc.f";
  if (upper === "CL=F") return "cl.f";
  if (upper === "AUDUSD") return "audusd";
  if (upper === "EURUSD") return "eurusd";
  if (upper === "GBPUSD") return "gbpusd";
  if (upper === "NZDUSD") return "nzdusd";
  if (upper === "USDCAD") return "usdcad";
  if (upper === "USDCHF") return "usdchf";
  if (upper === "USDJPY") return "usdjpy";
  if (upper.endsWith("-USD")) return null;
  if (upper.startsWith("^")) return upper.toLowerCase();
  return `${upper.toLowerCase()}.us`;
}

function getProfile(symbol: string): InstrumentProfile | undefined {
  return PROFILE_CATALOG[symbol.toUpperCase()];
}

function getRangeDays(range: string) {
  switch (range) {
    case "1D": return 1;
    case "5D": return 5;
    case "1M": return 31;
    case "3M": return 93;
    case "6M": return 186;
    case "2Y": return 730;
    case "1Y":
    default:
      return 366;
  }
}


async function fetchJson<T>(url: string, timeoutMs?: number, provider = "yahoo"): Promise<T> {
  return resilientFetchJson<T>(
    {
      name: provider,
      retry: { maxAttempts: 2, baseDelayMs: 1000 },
      circuitBreaker: { threshold: 5, cooldownMs: 60_000 },
    },
    url,
    {
      headers: {
        "User-Agent": "blmtrm/1.0",
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    },
  );
}

export function parseStooqCurrent(csv: string): CurrentQuoteSnapshot {
  const row = csv.trim().split(/\r?\n/).pop() ?? "";
  const [symbol, date, time, open, high, low, close, volume] = row.split(",");
  const parsedOpen = Number(open);
  const parsedHigh = Number(high);
  const parsedLow = Number(low);
  const parsedClose = Number(close);
  if (!symbol || !date || !time || date === "N/D" || close === "N/D" || !Number.isFinite(parsedOpen) || !Number.isFinite(parsedHigh) || !Number.isFinite(parsedLow) || !Number.isFinite(parsedClose)) {
    throw new Error(`Malformed current quote row: ${row}`);
  }

  return {
    open: parsedOpen,
    high: parsedHigh,
    low: parsedLow,
    close: parsedClose,
    volume: parseNumberish(volume),
    date: formatCompactDate(date),
    time: formatCompactTime(time),
  };
}

export function parseStooqHistory(csv: string): OHLCVBar[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, open, high, low, close, volume] = line.split(",");
      return {
        date,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: parseNumberish(volume),
      };
    })
    .filter((bar) => Number.isFinite(bar.close));
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
}

interface YahooChartSeries {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartSeries[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
}

const YAHOO_FINANCE_BASE_URL = "https://query1.finance.yahoo.com";

function mapRangeToYahoo(range: string) {
  switch (range) {
    case "1D": return "1d";
    case "5D": return "5d";
    case "1M": return "1mo";
    case "3M": return "3mo";
    case "6M": return "6mo";
    case "2Y": return "2y";
    case "1Y":
    default:
      return "1y";
  }
}

type YahooChartInterval = OhlcvInterval | "1m";

function mapIntervalToYahoo(interval: YahooChartInterval) {
  switch (interval) {
    case "1m": return "1m";
    case "5m": return "5m";
    case "15m": return "15m";
    case "1h": return "60m";
    case "1d":
    default:
      return "1d";
  }
}

function splitSnapshotDateTime(raw: string) {
  if (!raw.includes("T")) {
    return { date: raw, time: "00:00:00" };
  }

  const [date, time] = raw.split("T");
  return { date, time: time.slice(0, 8) };
}

function toSnapshotAsOf(snapshot: CurrentQuoteSnapshot) {
  if (!snapshot.date) return null;
  const time = snapshot.time || "00:00:00";
  return `${snapshot.date}T${time}.000Z`;
}

function buildSnapshotFromBars(
  bars: OHLCVBar[],
  overrides: { close?: number; high?: number; low?: number; volume?: number } = {},
): CurrentQuoteSnapshot {
  const first = bars[0];
  const last = bars.at(-1);
  if (!first || !last) {
    throw new Error("Cannot build a quote snapshot from empty bars");
  }

  const { date, time } = splitSnapshotDateTime(last.date);
  const close = Number.isFinite(overrides.close) ? Number(overrides.close) : last.close;
  const high = Number.isFinite(overrides.high) ? Number(overrides.high) : Math.max(...bars.map((bar) => bar.high), close);
  const low = Number.isFinite(overrides.low) ? Number(overrides.low) : Math.min(...bars.map((bar) => bar.low), close);
  const volume = Number.isFinite(overrides.volume)
    ? Number(overrides.volume)
    : Math.round(bars.reduce((sum, bar) => sum + bar.volume, 0));

  return {
    open: first.open,
    high: round(high),
    low: round(low),
    close: round(close),
    volume,
    date,
    time,
  };
}

export function parseYahooChart(payload: YahooChartResponse, interval: YahooChartInterval): OHLCVBar[] {
  const error = payload.chart?.error;
  if (error) {
    throw new Error(error.description ?? error.code ?? "Yahoo Finance chart error");
  }

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  if (!result || !quote || !timestamps.length) {
    throw new Error("Yahoo Finance returned no chart data");
  }

  const bars = timestamps.flatMap((timestamp, index) => {
    const close = quote.close?.[index];
    if (!Number.isFinite(close)) return [];

    const open = Number.isFinite(quote.open?.[index]) ? Number(quote.open?.[index]) : Number(close);
    const high = Number.isFinite(quote.high?.[index]) ? Number(quote.high?.[index]) : Number(close);
    const low = Number.isFinite(quote.low?.[index]) ? Number(quote.low?.[index]) : Number(close);
    const volume = Number.isFinite(quote.volume?.[index]) ? Number(quote.volume?.[index]) : 0;
    const iso = new Date(timestamp * 1000).toISOString();

    return [{
      date: interval === "1d" ? iso.slice(0, 10) : iso,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(Number(close)),
      volume: Math.round(volume),
    } satisfies OHLCVBar];
  });

  if (interval !== "1d") return bars;

  const deduped = new Map<string, OHLCVBar>();
  for (const bar of bars) {
    const existing = deduped.get(bar.date);
    deduped.set(bar.date, existing ? {
      ...bar,
      high: Math.max(existing.high, bar.high),
      low: Math.min(existing.low, bar.low),
    } : bar);
  }

  return Array.from(deduped.values());
}

async function fetchYahooChart(symbol: string, range: string, interval: YahooChartInterval) {
  const query = new URLSearchParams({
    range: mapRangeToYahoo(range),
    interval: mapIntervalToYahoo(interval),
    includePrePost: "false",
  });

  return fetchJson<YahooChartResponse>(
    `${YAHOO_FINANCE_BASE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?${query.toString()}`,
  );
}

export function buildQuoteFromSnapshot({ symbol, provider, profile, current, history, isLive = true, status }: BuildQuoteInput): Quote {
  const recentHistory = history.slice(-252);
  const previousCloseBar = history.length > 1
    ? (history.at(-1)?.date === current.date ? history.at(-2) : history.at(-1))
    : undefined;
  const previousClose = previousCloseBar?.close ?? current.open;
  const change = round(current.close - previousClose);
  const changePercent = previousClose === 0 ? 0 : round((change / previousClose) * 100);
  const windowBars = recentHistory.length ? recentHistory : [{ ...current, date: current.date }];
  const high52 = Math.max(current.high, ...windowBars.map((bar) => bar.high));
  const low52 = Math.min(current.low, ...windowBars.map((bar) => bar.low));
  const avgVolume = Math.round(average(windowBars.map((bar) => bar.volume).filter(Boolean)));
  const eps = profile?.eps ?? null;
  const pe = eps && eps > 0 ? round(current.close / eps, 1) : null;
  const marketCap = profile?.marketCap && profile.referencePrice
    ? profile.marketCap * (current.close / profile.referencePrice)
    : null;
  const resolvedStatus = status ?? buildDataStatus({
    provider,
    freshness: isLive ? "current" : "daily",
    asOf: toSnapshotAsOf(current),
    isFallback: !isLive,
  });

  return {
    symbol,
    name: profile?.name ?? symbol,
    price: round(current.close),
    change,
    changePercent,
    volume: current.volume,
    marketCap,
    pe,
    eps,
    high52,
    low52,
    open: current.open,
    previousClose: round(previousClose),
    dayHigh: current.high,
    dayLow: current.low,
    avgVolume,
    exchange: profile?.exchange ?? "UNKNOWN",
    sector: profile?.sector,
    assetClass: profile?.assetClass,
    quoteSource: provider,
    isLive,
    status: resolvedStatus,
  };
}

export function parseNewsFeed(xml: string, fallbackSource: string): NewsItem[] {
  const parsed = XML.parse(xml);
  const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .map((item): NewsItem | null => {
      const explicitSource = typeof item?.source === "string"
        ? stripHtml(item.source)
        : typeof item?.source?.["#text"] === "string"
          ? stripHtml(item.source["#text"])
          : undefined;
      const { title, source } = splitTitleAndSource(String(item?.title ?? ""), explicitSource, fallbackSource);
      const summary = stripHtml(String(item?.description ?? item?.summary ?? ""));
      const url = stripHtml(String(item?.link?.href ?? item?.link ?? ""));
      const publishedAt = new Date(String(item?.pubDate ?? item?.published ?? item?.updated ?? Date.now())).toISOString();
      if (!title || !url) return null;

      const mediaContent = item?.["media:content"];
      const enclosure = item?.enclosure;
      const imageUrl = typeof mediaContent?.url === "string" ? mediaContent.url
        : typeof enclosure?.url === "string" ? enclosure.url
        : undefined;

      return {
        title,
        summary,
        url,
        source,
        feedProvider: fallbackSource,
        publishedAt,
        sentiment: inferSentiment(`${title} ${summary}`),
        status: buildDataStatus({
          provider: fallbackSource,
          freshness: "feed",
          asOf: publishedAt,
        }),
        ...(imageUrl ? { image: imageUrl } : {}),
      };
    })
    .filter((item): item is NewsItem => Boolean(item));
}

function buildGoogleNewsSearchUrl(query: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

async function getStooqHistory(symbol: string): Promise<OHLCVBar[]> {
  const mapped = mapToStooqSymbol(symbol);
  if (!mapped) return [];
  const cacheKey = `history:${symbol}`;
  const cached = getCached(historyCache, cacheKey);
  if (cached) return cached;

  const csv = await fetchText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(mapped)}&i=d`);
  const bars = parseStooqHistory(csv);
  return setCached(historyCache, cacheKey, bars, HISTORY_TTL_MS);
}

async function getVixQuote(): Promise<Quote> {
  const cacheKey = "quote:^VIX";
  const cached = getCached(quoteCache, cacheKey);
  if (cached) return cached;

  try {
    const csv = await fetchText("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv");
    const bars = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [date, open, high, low, close] = line.split(",");
        const [month, day, year] = date.split("/");
        if (!month || !day || !year) return null;
        return {
          date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` ,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: 0,
        } satisfies OHLCVBar;
      })
      .filter((bar): bar is OHLCVBar => bar !== null && Number.isFinite(bar.close));

    const last = bars.at(-1);
    if (!last) throw new Error("VIX history feed is empty");

    const quote = buildQuoteFromSnapshot({
      symbol: "^VIX",
      provider: "CBOE daily",
      profile: getProfile("^VIX"),
      current: {
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: 0,
        date: last.date,
        time: "00:00:00",
      },
      history: bars,
      isLive: false,
      status: buildDataStatus({
        provider: "CBOE daily",
        freshness: "daily",
        asOf: `${last.date}T00:00:00.000Z`,
        delayLabel: "Daily index close",
        isFallback: true,
      }),
    });

    return setCached(quoteCache, cacheKey, quote, QUOTE_TTL_MS);
  } catch {
    const fallback = buildReferenceFallbackQuote("^VIX");
    return setCached(quoteCache, cacheKey, fallback, QUOTE_TTL_MS);
  }
}

/**
 * Fetch the real 52-week high/low for a CoinGecko id from its 1y daily
 * market chart. CoinGecko's simple/price endpoint does not expose this.
 */
async function getCryptoYearRange(id: string, attempt = 0): Promise<{ high: number; low: number } | null> {
  const cacheKey = `range:${id}`;
  const cached = getCached(cryptoRangeCache, cacheKey);
  if (cached) return cached;
  if (attempt >= 3) return null;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`;
    const data = await fetchJson<{ prices: [number, number][] }>(url, 8000, "coingecko");
    const prices = (data.prices ?? [])
      .map((point) => point?.[1])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!prices.length) return null;
    const range = { high: round(Math.max(...prices)), low: round(Math.min(...prices)) };
    return setCached(cryptoRangeCache, cacheKey, range, CRYPTO_RANGE_TTL_MS);
  } catch {
    // CoinGecko free tier rate-limits; back off and retry so the 52w
    // range populates once the limit resets (it is cached for an hour).
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return getCryptoYearRange(id, attempt + 1);
  }
}

async function getCoinGeckoQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const results = new Map<string, Quote>();
  const requested = symbols.filter((symbol) => getProfile(symbol)?.coinGeckoId);
  if (!requested.length) return results;

  const uncached = requested.filter((symbol) => {
    const cached = getCached(quoteCache, `quote:${symbol}`);
    if (!cached) return true;
    results.set(symbol, cached);
    return false;
  });

  if (!uncached.length) return results;

  const ids = uncached
    .map((symbol) => getProfile(symbol)?.coinGeckoId)
    .filter((id): id is string => Boolean(id));

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
    const payload = await fetchJson<Record<string, { usd: number; usd_market_cap?: number; usd_24h_vol?: number; usd_24h_change?: number }>>(url, undefined, "coingecko");

    for (const symbol of uncached) {
      const profile = getProfile(symbol);
      const id = profile?.coinGeckoId;
      const data = id ? payload[id] : undefined;
      if (!profile || !data) {
        results.set(symbol, setCached(quoteCache, `quote:${symbol}`, buildReferenceFallbackQuote(symbol), QUOTE_TTL_MS));
        continue;
      }

      const previousClose = data.usd / (1 + ((data.usd_24h_change ?? 0) / 100));
      const change = data.usd - previousClose;
      const asOf = new Date().toISOString();
      // 52w range is refreshed in the background (see below) to keep the
      // quote request fast; use the cached value if we already have one.
      const range = id ? getCached(cryptoRangeCache, `range:${id}`) : undefined;
      const quote: Quote = {
        symbol,
        name: profile.name,
        price: round(data.usd),
        change: round(change),
        changePercent: round(data.usd_24h_change ?? 0),
        volume: Math.round(data.usd_24h_vol ?? 0),
        marketCap: data.usd_market_cap ?? null,
        pe: null,
        eps: null,
        high52: range?.high ?? 0,
        low52: range?.low ?? 0,
        open: round(previousClose),
        previousClose: round(previousClose),
        dayHigh: round(data.usd),
        dayLow: round(data.usd),
        avgVolume: Math.round(data.usd_24h_vol ?? 0),
        exchange: profile.exchange,
        sector: profile.sector,
        quoteSource: "CoinGecko",
        isLive: true,
        status: buildDataStatus({
          provider: "CoinGecko",
          freshness: "current",
          asOf,
        }),
      };
      results.set(symbol, setCached(quoteCache, `quote:${symbol}`, quote, QUOTE_TTL_MS));
    }

    // Background: populate 52w ranges without blocking this response.
    // Sequential (not a parallel burst) to stay under CoinGecko's rate limit.
    let chain: Promise<unknown> = Promise.resolve();
    for (const id of ids) {
      if (!getCached(cryptoRangeCache, `range:${id}`)) {
        chain = chain.then(() => getCryptoYearRange(id).catch(() => {}));
      }
    }
  } catch {
    for (const symbol of uncached) {
      results.set(symbol, setCached(quoteCache, `quote:${symbol}`, buildReferenceFallbackQuote(symbol), QUOTE_TTL_MS));
    }
  }

  return results;
}

function buildReferenceFallbackQuote(symbol: string): Quote {
  const profile = getProfile(symbol);
  const price = profile?.referencePrice ?? 0;
  return {
    symbol,
    name: profile?.name ?? symbol,
    price,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: profile?.marketCap ?? null,
    pe: profile?.eps && price ? round(price / profile.eps, 1) : null,
    eps: profile?.eps ?? null,
    high52: price,
    low52: price,
    open: price,
    previousClose: price,
    dayHigh: price,
    dayLow: price,
    avgVolume: 0,
    exchange: profile?.exchange ?? "UNKNOWN",
    sector: profile?.sector,
    quoteSource: CATALOG_FALLBACK_SOURCE,
    isLive: false,
    status: buildDataStatus({
      provider: CATALOG_FALLBACK_SOURCE,
      freshness: "reference",
      isFallback: true,
    }),
  };
}

async function getStooqQuote(symbol: string): Promise<Quote> {
  const cacheKey = `quote:${symbol}`;
  const cached = getCached(quoteCache, cacheKey);
  if (cached) return cached;

  const mapped = mapToStooqSymbol(symbol);
  if (!mapped) {
    return buildReferenceFallbackQuote(symbol);
  }

  try {
    const [currentCsv, history] = await Promise.all([
      fetchText(`https://stooq.com/q/l/?s=${encodeURIComponent(mapped)}&i=5`),
      getStooqHistory(symbol),
    ]);
    const snapshot = parseStooqCurrent(currentCsv);
    const quote = buildQuoteFromSnapshot({
      symbol,
      provider: symbol === "^RUT" ? "Stooq delayed (IWM proxy)" : "Stooq delayed",
      profile: getProfile(symbol),
      current: snapshot,
      history,
      isLive: false,
      status: buildDataStatus({
        provider: symbol === "^RUT" ? "Stooq delayed (IWM proxy)" : "Stooq delayed",
        freshness: "delayed",
        asOf: toSnapshotAsOf(snapshot),
        delayLabel: "15-min delayed via Stooq",
        isFallback: true,
      }),
    });
    return setCached(quoteCache, cacheKey, quote, QUOTE_TTL_MS);
  } catch {
    const fallback = buildReferenceFallbackQuote(symbol);
    return setCached(quoteCache, cacheKey, fallback, QUOTE_TTL_MS);
  }
}

async function getYahooQuote(symbol: string): Promise<Quote> {
  const cacheKey = `quote:${symbol}`;
  const cached = getCached(quoteCache, cacheKey);
  if (cached) return cached;

  try {
    const [intradayPayload, history] = await Promise.all([
      fetchYahooChart(symbol, "1D", "1m"),
      getOHLCV(symbol, "1Y", "1d"),
    ]);
    const intradayBars = parseYahooChart(intradayPayload, "1m");
    const sessionBars = intradayBars.length ? intradayBars : history.slice(-1);
    if (!sessionBars.length) {
      throw new Error(`Yahoo Finance returned no quote bars for ${symbol}`);
    }

    const meta = intradayPayload.chart?.result?.[0]?.meta;
    const quote = buildQuoteFromSnapshot({
      symbol,
      provider: "Yahoo Finance",
      profile: getProfile(symbol),
      current: buildSnapshotFromBars(sessionBars, {
        close: Number.isFinite(meta?.regularMarketPrice) ? Number(meta?.regularMarketPrice) : undefined,
        high: Number.isFinite(meta?.regularMarketDayHigh) ? Number(meta?.regularMarketDayHigh) : undefined,
        low: Number.isFinite(meta?.regularMarketDayLow) ? Number(meta?.regularMarketDayLow) : undefined,
        volume: Number.isFinite(meta?.regularMarketVolume) ? Number(meta?.regularMarketVolume) : undefined,
      }),
      history,
    });

    return setCached(quoteCache, cacheKey, quote, QUOTE_TTL_MS);
  } catch {
    if (symbol === "^VIX") return getVixQuote();
    return getStooqQuote(symbol);
  }
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const uniqueSymbols = uniqueBy(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean), (symbol) => symbol);
  const cryptoSymbols = uniqueSymbols.filter((symbol) => getProfile(symbol)?.assetClass === "crypto");
  const nonCryptoSymbols = uniqueSymbols.filter((symbol) => !cryptoSymbols.includes(symbol));
  const cryptoQuotes = await getCoinGeckoQuotes(cryptoSymbols);

  const quotes: Quote[] = [];
  for (const symbol of nonCryptoSymbols) {
    quotes.push(await getYahooQuote(symbol));
  }

  const allQuotes = [
    ...quotes,
    ...cryptoSymbols.map((symbol) => cryptoQuotes.get(symbol) ?? buildReferenceFallbackQuote(symbol)),
  ];

  // Persist quotes to database (fire and forget)
  Promise.all(allQuotes.map(persistQuoteToDb)).catch(() => {});

  return allQuotes;
}

export async function getOHLCV(symbol: string, range = "1Y", interval: OhlcvInterval = "1d"): Promise<OHLCVBar[]> {
  const upper = symbol.toUpperCase();
  const days = Math.max(getRangeDays(range), 1);
  const cacheKey = `history:${upper}:${days}:${interval}`;
  const cached = getCached(historyCache, cacheKey);
  if (cached) return cached;

  try {
    let bars: OHLCVBar[];
    
    if (getProfile(upper)?.assetClass === "crypto") {
      const id = getProfile(upper)?.coinGeckoId;
      if (!id) return [];
      const requestDays = interval === "5m" || interval === "15m" ? 1 : Math.min(days, 365);
      const payload = await fetchJson<{ prices: [number, number][]; total_volumes: [number, number][] }>(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${requestDays}`,
        undefined,
        "coingecko",
      );
      const points = payload.prices.map(([timestamp, price], index) => ({
        timestamp,
        price,
        volume: payload.total_volumes[index]?.[1] ?? 0,
      }));
      bars = aggregatePricePoints(points, interval);
    } else {
      const rawBars = parseYahooChart(await fetchYahooChart(upper, range, interval), interval);
      if (!rawBars.length) {
        throw new Error(`Yahoo Finance returned no OHLCV data for ${upper}`);
      }
      bars = interval === "1d" ? rawBars.slice(-days) : rawBars;
    }

    // Persist to database (fire and forget)
    persistOhlcvToDb(upper, bars, interval).catch(() => {});

    return setCached(historyCache, cacheKey, bars, HISTORY_TTL_MS);
  } catch {
    if (interval !== "1d") return cached ?? [];
    const history = await getStooqHistory(upper);
    return setCached(historyCache, cacheKey, history.slice(-days), HISTORY_TTL_MS);
  }
}

export async function getOHLCVSeries(symbol: string, range = "1Y", interval: OhlcvInterval = "1d"): Promise<OHLCVSeries> {
  const upper = symbol.toUpperCase();
  const [bars, quote] = await Promise.all([
    getOHLCV(upper, range, interval),
    getQuotes([upper]).then((items) => items[0] ?? buildReferenceFallbackQuote(upper)),
  ]);

  return {
    bars,
    status: quote.status,
    supportsIntraday: getProfile(upper)?.assetClass === "crypto" || quote.status.freshness === "current",
  };
}

export async function getIndexSparklines(): Promise<Record<string, number[]>> {
  const symbols = getIndexSparklineSymbols();
  const result: Record<string, number[]> = {};
  const entries = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const bars = await getOHLCV(symbol, "3M");
      return { symbol, data: bars.slice(-30).map((bar) => bar.close) };
    }),
  );
  for (const entry of entries) {
    if (entry.status === "fulfilled" && entry.value.data.length > 0) {
      result[entry.value.symbol] = entry.value.data;
    }
  }
  return result;
}

export async function getMarketMovers(kind: "gainers" | "losers" | "active") {
  const quotes = await getQuotes(SCREENER_UNIVERSE);
  const liveQuotes = quotes.filter((quote) => quote.isLive || quote.price > 0);
  const sorted = [...liveQuotes].sort((a, b) => {
    if (kind === "active") return b.volume - a.volume;
    if (kind === "gainers") return b.changePercent - a.changePercent;
    return a.changePercent - b.changePercent;
  });
  return sorted.slice(0, 10);
}

export async function getMarketSentiment() {
  const news = await getNews();
  if (!news.length) {
    return { sentiment: "Neutral", score: 50, bullish: 50, bearish: 50 };
  }

  const positive = news.filter((item) => item.sentiment === "positive").length;
  const negative = news.filter((item) => item.sentiment === "negative").length;
  const bullish = Math.round((positive / news.length) * 100);
  const bearish = Math.round((negative / news.length) * 100);
  const score = Math.round(Math.max(0, Math.min(100, 50 + ((positive - negative) / news.length) * 50)));
  const sentiment = bullish > bearish ? "Bullish" : bearish > bullish ? "Bearish" : "Neutral";
  return { sentiment, score, bullish, bearish };
}

function buildSymbolNewsFeeds(symbol: string): RssFeedConfig[] {
  const profile = getProfile(symbol);
  const searchTerms = [symbol];
  if (profile?.name) searchTerms.push(`"${profile.name}"`);
  if (profile?.coinGeckoId) searchTerms.push(profile.name.replace(/ USD$/, ""));

  return [
    {
      url: buildGoogleNewsSearchUrl(`${searchTerms.join(" OR ")} when:7d`),
      fallbackSource: "Google News",
    },
    {
      url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
      fallbackSource: "CNBC",
    },
    {
      url: `https://finance.yahoo.com/rss/headline?s=${symbol}`,
      fallbackSource: "Yahoo Finance",
    },
  ];
}

async function fetchNewsFeeds(cacheKey: string, feeds: RssFeedConfig[]) {
  const cached = getCached(newsCache, cacheKey);
  if (cached) return cached;

  const settled = await Promise.allSettled(feeds.map(async (feed) => {
    const xml = await fetchText(feed.url);
    return parseNewsFeed(xml, feed.fallbackSource);
  }));

  const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const normalized = uniqueBy(items, (item) => item.url || item.title)
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

  return setCached(newsCache, cacheKey, normalized.slice(0, 40), NEWS_TTL_MS);
}

export async function getNews(symbol?: string, query?: string): Promise<NewsItem[]> {
  let items: NewsItem[];

  if (symbol) {
    const upper = symbol.toUpperCase();
    const feedItems = await fetchNewsFeeds(`news:${upper}`, buildSymbolNewsFeeds(upper));
    if (!feedItems.length) return [];

    const profile = getProfile(upper);
    const symbolTokens = [upper, profile?.name?.split(" ")[0]]
      .filter(Boolean)
      .map((token) => String(token).toLowerCase());

    items = feedItems
      .filter((item) => {
        const haystack = `${item.title} ${item.summary}`.toLowerCase();
        return symbolTokens.some((token) => haystack.includes(token));
      })
      .slice(0, 20);
  } else {
    items = await fetchNewsFeeds("news:market", GENERAL_NEWS_FEEDS);
  }

  const filtered = filterNewsItems(items, query);
  
  // Persist news to database (fire and forget)
  persistNewsToDb(filtered).catch(() => {});

  return filtered;
}

export async function getNewsArticle(input: {
  url: string;
  title: string;
  source: string;
  feedProvider?: string;
  publishedAt: string;
  summary?: string;
}): Promise<NewsArticle> {
  const url = sanitizeArticleUrl(input.url);
  const cacheKey = `article:${url}`;
  const cached = getCached(articleCache, cacheKey);
  if (cached) return cached;

  const status = buildDataStatus({
    provider: input.feedProvider ?? input.source,
    freshness: "feed",
    asOf: input.publishedAt,
  });

  try {
    const html = await fetchText(url);
    const content = extractArticleContent(html);
    const article: NewsArticle = {
      title: input.title,
      source: input.source,
      feedProvider: input.feedProvider ?? input.source,
      url,
      publishedAt: input.publishedAt,
      excerpt: input.summary?.trim() || content[0] || "Read-through unavailable for this source.",
      content: content.length ? content : (input.summary ? [input.summary.trim()] : []),
      status,
    };
    return setCached(articleCache, cacheKey, article, ARTICLE_TTL_MS);
  } catch {
    const fallback: NewsArticle = {
      title: input.title,
      source: input.source,
      feedProvider: input.feedProvider ?? input.source,
      url,
      publishedAt: input.publishedAt,
      excerpt: input.summary?.trim() || "Read-through unavailable for this source.",
      content: input.summary?.trim() ? [input.summary.trim()] : [],
      status,
    };
    return setCached(articleCache, cacheKey, fallback, ARTICLE_TTL_MS);
  }
}

export async function getPeers(symbol: string) {
  const upper = symbol.toUpperCase();
  return getQuotes(getPeersForSymbol(upper));
}

export async function getScreenerResults(filters: { sector?: string; minPe?: string; maxPe?: string }) {
  let results = await getQuotes(SCREENER_UNIVERSE);
  if (filters.sector && filters.sector !== "All") {
    results = results.filter((quote) => quote.sector === filters.sector);
  }

  const minPe = filters.minPe ? Number(filters.minPe) : null;
  const maxPe = filters.maxPe ? Number(filters.maxPe) : null;
  if (minPe !== null) results = results.filter((quote) => quote.pe !== null && quote.pe >= minPe);
  if (maxPe !== null) results = results.filter((quote) => quote.pe !== null && quote.pe <= maxPe);
  return results;
}

export async function getEconomicsSnapshot() {
  let eurUsd = 1.08;
  let gbpUsd = 1.27;
  let usdJpy = 150.0;
  let gold = 3000;
  let oil = 70;
  let dxy = 104.5;

  // Fetch live macro data from FRED in parallel with forex/commodities
  const [liveMacro, commodities, eurUsdCsv, gbpUsdCsv, usdJpyCsv, goldCsv, dxyCsv] = await Promise.all([
    getLiveMacroSnapshot().catch(() => null),
    getQuotes(getEconomicsCommodities()).catch(() => []),
    fetchText("https://stooq.com/q/l/?s=eurusd&i=5").catch(() => ""),
    fetchText("https://stooq.com/q/l/?s=gbpusd&i=5").catch(() => ""),
    fetchText("https://stooq.com/q/l/?s=usdjpy&i=5").catch(() => ""),
    fetchText("https://stooq.com/q/l/?s=xauusd&i=5").catch(() => ""),
    fetchText("https://stooq.com/q/l/?s=dx-y.nya&i=5").catch(() => ""),
  ]);

  // Parse forex/commodities with fallbacks
  try { if (eurUsdCsv) eurUsd = parseStooqCurrent(eurUsdCsv).close; } catch { /* keep fallback */ }
  try { if (gbpUsdCsv) gbpUsd = parseStooqCurrent(gbpUsdCsv).close; } catch { /* keep fallback */ }
  try { if (usdJpyCsv) usdJpy = parseStooqCurrent(usdJpyCsv).close; } catch { /* keep fallback */ }
  try { if (goldCsv) gold = parseStooqCurrent(goldCsv).close; } catch { /* keep fallback */ }
  try { if (dxyCsv) dxy = parseStooqCurrent(dxyCsv).close; } catch { /* keep fallback */ }
  const oilQuote = commodities.find((item) => item.symbol === getEconomicsCommodities()[1]);
  if (oilQuote?.price) oil = oilQuote.price;

  // Track which fields are using hardcoded fallback defaults
  const usingFallbacks = {
    gdp: liveMacro?.gdp == null,
    cpi: liveMacro?.cpi == null,
    unemployment: liveMacro?.unemployment == null,
    fedFunds: liveMacro?.fedFunds == null,
    t10y: liveMacro?.t10y == null,
    t2y: liveMacro?.t2y == null,
    t30y: liveMacro?.t30y == null,
    dxy: dxyCsv === "",
  };

  const anyFallback = Object.values(usingFallbacks).some(Boolean);

  // Use live FRED values when available, otherwise fall back to hardcoded defaults
  const gdpValue = liveMacro?.gdp ?? 2.5;
  const gdpPrev = liveMacro?.gdpPrev ?? 3.1;
  const cpiValue = liveMacro?.cpi ?? 3.1;
  const cpiPrev = liveMacro?.cpiPrev ?? 3.4;
  const unemploymentValue = liveMacro?.unemployment ?? 3.7;
  const unemploymentPrev = liveMacro?.unemploymentPrev ?? 3.9;
  const fedFundsValue = liveMacro?.fedFunds ?? 5.33;
  const fedFundsPrev = liveMacro?.fedFundsPrev ?? 5.5;
  const t10yValue = liveMacro?.t10y ?? 4.52;
  const t10yPrev = liveMacro?.t10yPrev ?? 4.44;
  const t2yValue = liveMacro?.t2y ?? 4.89;
  const t2yPrev = liveMacro?.t2yPrev ?? 4.91;
  const t30yValue = liveMacro?.t30y ?? 4.72;
  const t30yPrev = liveMacro?.t30yPrev ?? 4.68;

  return {
    gdp: { value: gdpValue, prev: gdpPrev, label: "US GDP Growth (QoQ)", unit: "%" },
    cpi: { value: cpiValue, prev: cpiPrev, label: "CPI Inflation (YoY)", unit: "%" },
    unemployment: { value: unemploymentValue, prev: unemploymentPrev, label: "Unemployment Rate", unit: "%" },
    fedFunds: { value: fedFundsValue, prev: fedFundsPrev, label: "Fed Funds Rate", unit: "%" },
    t10y: { value: t10yValue, prev: t10yPrev, label: "10Y Treasury Yield", unit: "%" },
    t2y: { value: t2yValue, prev: t2yPrev, label: "2Y Treasury Yield", unit: "%" },
    t30y: { value: t30yValue, prev: t30yPrev, label: "30Y Treasury Yield", unit: "%" },
    dolllarIndex: { value: round(dxy, 2), prev: round(dxy * 0.997, 2), label: "USD Index (DXY)", unit: "" },
    eurUsd: { value: round(eurUsd, 4), prev: round(eurUsd * 0.997, 4), label: "EUR/USD", unit: "" },
    gbpUsd: { value: round(gbpUsd, 4), prev: round(gbpUsd * 0.997, 4), label: "GBP/USD", unit: "" },
    usdJpy: { value: round(usdJpy, 4), prev: round(usdJpy * 0.998, 4), label: "USD/JPY", unit: "" },
    gold: { value: round(gold, 2), prev: round(gold * 0.995, 2), label: "Gold ($/oz)", unit: "" },
    oil: { value: round(oil, 2), prev: round(oil * 1.01, 2), label: "WTI Crude ($/bbl)", unit: "" },
    status: buildDataStatus({
      provider: liveMacro ? "FRED + Mixed public snapshot" : "Mixed public snapshot",
      freshness: anyFallback ? "snapshot" : "current",
      isFallback: anyFallback,
      delayLabel: liveMacro?.asOf ? `FRED as of ${liveMacro.asOf}` : "Snapshot / mixed-source view",
    }),
  };
}

// ─── Yahoo Finance Fundamentals Fallback ────────────────────────────────────

let yahooCrumb: string | null = null;
let yahooCookie: string | null = null;
let yahooAuthExpiry = 0;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (yahooCrumb && yahooCookie && Date.now() < yahooAuthExpiry) {
    return { crumb: yahooCrumb, cookie: yahooCookie };
  }

  // Get session cookie
  const sessionRes = await resilientFetch(YAHOO_PROVIDER, "https://finance.yahoo.com/quote/MU/", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    redirect: "manual",
  });
  const setCookies = sessionRes.headers.getSetCookie();
  const cookie = setCookies
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("A3=") || c.startsWith("B=") || c.includes(".yahoo"));

  if (!cookie) throw new Error("Failed to get Yahoo session cookie");

  // Get crumb
  const crumbRes = await resilientFetch(YAHOO_PROVIDER, "https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Cookie: cookie,
    },
  });

  if (!crumbRes.ok) throw new Error(`Yahoo crumb ${crumbRes.status}`);
  const crumb = await crumbRes.text();

  yahooCrumb = crumb;
  yahooCookie = cookie;
  yahooAuthExpiry = Date.now() + 30 * 60 * 1000; // 30 min

  return { crumb, cookie };
}

async function fetchYahooFundamentals(symbol: string): Promise<Record<string, any>> {
  const { crumb, cookie } = await getYahooCrumb();
  const modules = [
    "defaultKeyStatistics",
    "financialData",
    "summaryDetail",
    "assetProfile",
  ].join(",");

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const res = await resilientFetch(YAHOO_PROVIDER, url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Cookie: cookie,
    },
  });

  if (!res.ok) throw new Error(`Yahoo quoteSummary ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error("No Yahoo quoteSummary result");

  const stats = result.defaultKeyStatistics ?? {};
  const fin = result.financialData ?? {};
  const summary = result.summaryDetail ?? {};
  const profile = result.assetProfile ?? {};

  const metrics: Record<string, any> = {};
  if (stats.trailingPE?.raw != null) metrics.pe_ratio = stats.trailingPE.raw;
  if (stats.forwardPE?.raw != null) metrics.forward_pe = stats.forwardPE.raw;
  if (stats.priceToBook?.raw != null) metrics.price_to_book = stats.priceToBook.raw;
  if (stats.pegRatio?.raw != null) metrics.peg_ratio = stats.pegRatio.raw;
  if (stats.enterpriseToEbitda?.raw != null) metrics.enterprise_to_ebitda = stats.enterpriseToEbitda.raw;
  if (stats.debtToEquity?.raw != null) metrics.debt_to_equity = stats.debtToEquity.raw / 100;
  if (fin.currentRatio?.raw != null) metrics.current_ratio = fin.currentRatio.raw;
  if (fin.quickRatio?.raw != null) metrics.quick_ratio = fin.quickRatio.raw;
  if (fin.returnOnAssets?.raw != null) metrics.return_on_assets = fin.returnOnAssets.raw;
  if (fin.returnOnEquity?.raw != null) metrics.return_on_equity = fin.returnOnEquity.raw;
  if (fin.profitMargins?.raw != null) metrics.profit_margin = fin.profitMargins.raw;
  if (fin.grossMargins?.raw != null) metrics.gross_margin = fin.grossMargins.raw;
  if (fin.operatingMargins?.raw != null) metrics.operating_margin = fin.operatingMargins.raw;
  if (fin.revenueGrowth?.raw != null) metrics.revenue_growth = fin.revenueGrowth.raw;
  if (fin.earningsGrowth?.raw != null) metrics.earnings_growth = fin.earningsGrowth.raw;
  if (summary.dividendYield?.raw != null) metrics.dividend_yield = summary.dividendYield.raw;
  if (summary.payoutRatio?.raw != null) metrics.payout_ratio = summary.payoutRatio.raw;
  if (summary.marketCap?.raw != null) metrics.market_cap = summary.marketCap.raw;
  if (summary.enterpriseValue?.raw != null) metrics.enterprise_value = summary.enterpriseValue.raw;
  if (stats.bookValue?.raw != null) metrics.book_value = stats.bookValue.raw;

  const profileData: Record<string, any> = {};
  if (profile.longBusinessSummary) profileData.long_description = profile.longBusinessSummary;
  if (profile.sector) profileData.sector = profile.sector;
  if (profile.industry) profileData.industry_category = profile.industry;
  if (profile.fullTimeEmployees) profileData.employees = profile.fullTimeEmployees;
  if (summary.marketCap?.raw != null) profileData.market_cap = summary.marketCap.raw;
  if (stats.sharesOutstanding?.raw != null) profileData.shares_outstanding = stats.sharesOutstanding.raw;
  if (stats.beta?.raw != null) profileData.beta = stats.beta.raw;
  if (summary.dividendYield?.raw != null) profileData.dividend_yield = summary.dividendYield.raw;

  return {
    metrics,
    profile: profileData,
    incomeStatement: [],
    consensus: {},
    dividends: [],
  };
}

export async function getFundamentals(symbol: string) {
  const cacheKey = `fundamentals:${symbol.toUpperCase()}`;
  const cached = getCached(fundamentalsCache, cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchOpenBBFundamentals(symbol);
    const camel: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "income_statement") {
        camel["incomeStatement"] = v;
      } else {
        camel[k] = v;
      }
    }
    camel.status = buildDataStatus({ provider: "OpenBB", freshness: "reference" });
    return setCached(fundamentalsCache, cacheKey, camel, 5 * 60_000);
  } catch (error) {
    console.error(`OpenBB fundamentals error for ${symbol}, trying Yahoo fallback:`, error);
  }

  // Yahoo Finance fallback when OpenBB is unavailable
  try {
    const data = await fetchYahooFundamentals(symbol);
    data.status = buildDataStatus({ provider: "Yahoo Finance", freshness: "reference", isFallback: true });
    return setCached(fundamentalsCache, cacheKey, data, 5 * 60_000);
  } catch (fallbackError) {
    console.error(`Yahoo fundamentals fallback error for ${symbol}:`, fallbackError);
    return {
      status: buildDataStatus({ provider: "Yahoo Finance", freshness: "reference", isFallback: true }),
    };
  }
}

export async function getOptionsChain(symbol: string) {
  const cacheKey = `options:${symbol.toUpperCase()}`;
  const cached = getCached(optionsCache, cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchOpenBBOptions(symbol);
    const contracts = (data.contracts ?? []).map((c: Record<string, any>) => ({
      symbol: c.symbol,
      expiration: c.expiration,
      strike: c.strike,
      optionType: c.option_type,
      bid: c.bid,
      ask: c.ask,
      lastPrice: c.last_price,
      change: c.change,
      changePercent: c.change_percent,
      volume: c.volume,
      openInterest: c.open_interest,
      impliedVolatility: c.implied_volatility,
      inTheMoney: c.in_the_money,
    }));
    const result = {
      underlyingPrice: data.underlying_price,
      contracts,
      status: buildDataStatus({ provider: "OpenBB", freshness: "reference" }),
    };
    return setCached(optionsCache, cacheKey, result, 5 * 60_000);
  } catch (error) {
    console.error(`OpenBB options error for ${symbol}:`, error);
    return { underlyingPrice: 0, contracts: [], status: buildDataStatus({ provider: "OpenBB", freshness: "reference", isFallback: true }) };
  }
}

export async function getYieldCurve() {
  const cacheKey = "yield-curve";
  const cached = getCached(yieldCurveCache, cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchOpenBBYieldCurve();
    return setCached(yieldCurveCache, cacheKey, data, 60 * 60_000); // 1 hour cache
  } catch (error) {
    console.error("OpenBB yield curve error:", error);
    return [];
  }
}

// Caches for new data types
const fundamentalsCache = new Map<string, { expiresAt: number; value: any }>();
const optionsCache = new Map<string, { expiresAt: number; value: any }>();
const yieldCurveCache = new Map<string, { expiresAt: number; value: any }>();

// ─── Corporate Events (earnings, dividends) ─────────────────────────────────

export interface CorporateEvent {
  date: string;
  type: "earnings" | "dividend";
  label: string;
}

const eventsCache = new Map<string, { expiresAt: number; value: CorporateEvent[] }>();
const EVENTS_TTL_MS = 60 * 60_000; // 1 hour

const YAHOO_PROVIDER = { name: "yahoo", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } } as const;

export async function getEventsForSymbol(symbol: string): Promise<CorporateEvent[]> {
  const cacheKey = `events:${symbol}`;
  const cached = getCached(eventsCache, cacheKey);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includeTimestamps=true`;
    const response = await resilientFetch(YAHOO_PROVIDER, url, { headers: { "User-Agent": "blmtrm/1.0" } });
    if (!response.ok) return setCached(eventsCache, cacheKey, [], EVENTS_TTL_MS);

    const events: CorporateEvent[] = [];
    const calendarUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
    try {
      const calRes = await resilientFetch(YAHOO_PROVIDER, calendarUrl, { headers: { "User-Agent": "blmtrm/1.0" } });
      if (calRes.ok) {
        const calData = await calRes.json();
        const calEvents = calData?.quoteSummary?.result?.[0]?.calendarEvents;
        if (calEvents?.earnings?.earningsDate) {
          for (const ed of calEvents.earnings.earningsDate) {
            const ts = ed?.raw ?? ed;
            if (typeof ts === "number") {
              const d = new Date(ts * 1000);
              events.push({ date: d.toISOString().slice(0, 10), type: "earnings", label: "Earnings" });
            }
          }
        }
        if (calEvents?.dividends?.exDividendDate) {
          const ts = calEvents.dividends.exDividendDate?.raw ?? calEvents.dividends.exDividendDate;
          if (typeof ts === "number") {
            const d = new Date(ts * 1000);
            events.push({ date: d.toISOString().slice(0, 10), type: "dividend", label: "Ex-Dividend" });
          }
        }
      }
    } catch {}
    return setCached(eventsCache, cacheKey, events, EVENTS_TTL_MS);
  } catch {
    return [];
  }
}
