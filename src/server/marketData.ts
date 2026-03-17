import { XMLParser } from "fast-xml-parser";

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
  quoteSource: string;
  isLive: boolean;
}

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  content: string[];
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
}

interface RssFeedConfig {
  url: string;
  fallbackSource: string;
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
const historyCache = new Map<string, { expiresAt: number; value: OHLCVBar[] }>();
const newsCache = new Map<string, { expiresAt: number; value: NewsItem[] }>();
const articleCache = new Map<string, { expiresAt: number; value: NewsArticle }>();

const POSITIVE_WORDS = [
  "beat", "beats", "surge", "surges", "jump", "jumps", "rally", "rallies", "gain", "gains",
  "upgrade", "upgrades", "tops", "strong", "record", "optimism", "expands", "growth", "bullish",
];
const NEGATIVE_WORDS = [
  "fall", "falls", "drop", "drops", "miss", "misses", "weak", "weaker", "downgrade", "downgrades",
  "fears", "fear", "probe", "scrutiny", "recession", "pressure", "lawsuit", "slump", "bearish",
];

const PROFILE_CATALOG: Record<string, InstrumentProfile> = {
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", sector: "Technology", marketCap: 3.4e12, referencePrice: 242, eps: 6.5, assetClass: "equity" },
  MSFT: { name: "Microsoft Corp.", exchange: "NASDAQ", sector: "Technology", marketCap: 3.2e12, referencePrice: 430, eps: 11.8, assetClass: "equity" },
  NVDA: { name: "NVIDIA Corp.", exchange: "NASDAQ", sector: "Technology", marketCap: 2.7e12, referencePrice: 875, eps: 2.9, assetClass: "equity" },
  TSLA: { name: "Tesla Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical", marketCap: 8.0e11, referencePrice: 250, eps: 3.1, assetClass: "equity" },
  GOOGL: { name: "Alphabet Inc.", exchange: "NASDAQ", sector: "Communication Services", marketCap: 2.2e12, referencePrice: 180, eps: 7.2, assetClass: "equity" },
  AMZN: { name: "Amazon.com Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical", marketCap: 2.1e12, referencePrice: 200, eps: 6.3, assetClass: "equity" },
  META: { name: "Meta Platforms", exchange: "NASDAQ", sector: "Communication Services", marketCap: 1.4e12, referencePrice: 560, eps: 18.7, assetClass: "equity" },
  "BRK-B": { name: "Berkshire Hathaway", exchange: "NYSE", sector: "Financial Services", marketCap: 1.0e12, referencePrice: 455, eps: 35.5, assetClass: "equity" },
  JPM: { name: "JPMorgan Chase", exchange: "NYSE", sector: "Financial Services", marketCap: 6.5e11, referencePrice: 235, eps: 17.6, assetClass: "equity" },
  BAC: { name: "Bank of America", exchange: "NYSE", sector: "Financial Services", marketCap: 3.5e11, referencePrice: 44, eps: 3.3, assetClass: "equity" },
  GS: { name: "Goldman Sachs", exchange: "NYSE", sector: "Financial Services", marketCap: 1.8e11, referencePrice: 520, eps: 37.2, assetClass: "equity" },
  MS: { name: "Morgan Stanley", exchange: "NYSE", sector: "Financial Services", marketCap: 2.3e11, referencePrice: 124, eps: 6.7, assetClass: "equity" },
  V: { name: "Visa Inc.", exchange: "NYSE", sector: "Financial Services", marketCap: 6.0e11, referencePrice: 300, eps: 10.2, assetClass: "equity" },
  MA: { name: "Mastercard Inc.", exchange: "NYSE", sector: "Financial Services", marketCap: 5.0e11, referencePrice: 500, eps: 14.1, assetClass: "equity" },
  PYPL: { name: "PayPal Holdings", exchange: "NASDAQ", sector: "Financial Services", marketCap: 8.0e10, referencePrice: 74, eps: 4.2, assetClass: "equity" },
  XOM: { name: "Exxon Mobil", exchange: "NYSE", sector: "Energy", marketCap: 5.0e11, referencePrice: 119, eps: 8.6, assetClass: "equity" },
  CVX: { name: "Chevron Corp.", exchange: "NYSE", sector: "Energy", marketCap: 2.9e11, referencePrice: 160, eps: 10.4, assetClass: "equity" },
  COP: { name: "ConocoPhillips", exchange: "NYSE", sector: "Energy", marketCap: 1.4e11, referencePrice: 112, eps: 8.7, assetClass: "equity" },
  SLB: { name: "Schlumberger", exchange: "NYSE", sector: "Energy", marketCap: 6.5e10, referencePrice: 50, eps: 3.4, assetClass: "equity" },
  UNH: { name: "UnitedHealth Group", exchange: "NYSE", sector: "Healthcare", marketCap: 4.5e11, referencePrice: 560, eps: 27.5, assetClass: "equity" },
  JNJ: { name: "Johnson & Johnson", exchange: "NYSE", sector: "Healthcare", marketCap: 3.9e11, referencePrice: 155, eps: 10.1, assetClass: "equity" },
  PFE: { name: "Pfizer Inc.", exchange: "NYSE", sector: "Healthcare", marketCap: 1.8e11, referencePrice: 28, eps: 2.6, assetClass: "equity" },
  KO: { name: "Coca-Cola Co.", exchange: "NYSE", sector: "Consumer Defensive", marketCap: 2.8e11, referencePrice: 69, eps: 2.8, assetClass: "equity" },
  PEP: { name: "PepsiCo Inc.", exchange: "NASDAQ", sector: "Consumer Defensive", marketCap: 2.4e11, referencePrice: 170, eps: 8.2, assetClass: "equity" },
  WMT: { name: "Walmart Inc.", exchange: "NYSE", sector: "Consumer Defensive", marketCap: 6.5e11, referencePrice: 87, eps: 2.4, assetClass: "equity" },
  HD: { name: "Home Depot", exchange: "NYSE", sector: "Consumer Cyclical", marketCap: 3.7e11, referencePrice: 380, eps: 15.1, assetClass: "equity" },
  DIS: { name: "Walt Disney Co.", exchange: "NYSE", sector: "Communication Services", marketCap: 2.1e11, referencePrice: 110, eps: 4.8, assetClass: "equity" },
  NFLX: { name: "Netflix Inc.", exchange: "NASDAQ", sector: "Communication Services", marketCap: 5.5e11, referencePrice: 990, eps: 19.3, assetClass: "equity" },
  CRM: { name: "Salesforce", exchange: "NYSE", sector: "Technology", marketCap: 3.1e11, referencePrice: 325, eps: 7.9, assetClass: "equity" },
  ADBE: { name: "Adobe Inc.", exchange: "NASDAQ", sector: "Technology", marketCap: 2.4e11, referencePrice: 520, eps: 16.1, assetClass: "equity" },
  AMD: { name: "Advanced Micro Devices", exchange: "NASDAQ", sector: "Technology", marketCap: 3.2e11, referencePrice: 178, eps: 1.6, assetClass: "equity" },
  INTC: { name: "Intel Corp.", exchange: "NASDAQ", sector: "Technology", marketCap: 9.0e10, referencePrice: 24, eps: 0.9, assetClass: "equity" },
  QCOM: { name: "Qualcomm Inc.", exchange: "NASDAQ", sector: "Technology", marketCap: 1.9e11, referencePrice: 170, eps: 8.1, assetClass: "equity" },
  TXN: { name: "Texas Instruments", exchange: "NASDAQ", sector: "Technology", marketCap: 1.7e11, referencePrice: 188, eps: 6.2, assetClass: "equity" },
  AVGO: { name: "Broadcom Inc.", exchange: "NASDAQ", sector: "Technology", marketCap: 8.0e11, referencePrice: 1400, eps: 12.4, assetClass: "equity" },
  MU: { name: "Micron Technology", exchange: "NASDAQ", sector: "Technology", marketCap: 1.4e11, referencePrice: 125, eps: 4.8, assetClass: "equity" },
  AMAT: { name: "Applied Materials", exchange: "NASDAQ", sector: "Technology", marketCap: 1.8e11, referencePrice: 220, eps: 8.8, assetClass: "equity" },
  ASML: { name: "ASML Holding", exchange: "NASDAQ", sector: "Technology", marketCap: 3.5e11, referencePrice: 950, eps: 24.5, assetClass: "equity" },
  SPY: { name: "SPDR S&P 500 ETF", exchange: "ARCA", sector: "ETF", referencePrice: 581, assetClass: "etf" },
  QQQ: { name: "Invesco QQQ Trust", exchange: "NASDAQ", sector: "ETF", referencePrice: 492, assetClass: "etf" },
  IWM: { name: "iShares Russell 2000 ETF", exchange: "ARCA", sector: "ETF", referencePrice: 249, assetClass: "etf" },
  "^GSPC": { name: "S&P 500", exchange: "INDEX", sector: "Index", referencePrice: 5780, assetClass: "index" },
  "^DJI": { name: "Dow Jones", exchange: "INDEX", sector: "Index", referencePrice: 43250, assetClass: "index" },
  "^IXIC": { name: "NASDAQ Composite", exchange: "INDEX", sector: "Index", referencePrice: 18450, assetClass: "index" },
  "^RUT": { name: "Russell 2000", exchange: "INDEX", sector: "Index", referencePrice: 2180, assetClass: "index" },
  "^VIX": { name: "CBOE Volatility Index", exchange: "CBOE", sector: "Index", referencePrice: 17.5, assetClass: "index" },
  "GC=F": { name: "Gold Futures", exchange: "COMEX", sector: "Commodity", referencePrice: 2985, assetClass: "commodity" },
  "CL=F": { name: "Crude Oil WTI", exchange: "NYMEX", sector: "Commodity", referencePrice: 68.4, assetClass: "commodity" },
  "BTC-USD": { name: "Bitcoin USD", exchange: "CRYPTO", sector: "Crypto", assetClass: "crypto", coinGeckoId: "bitcoin" },
  "ETH-USD": { name: "Ethereum USD", exchange: "CRYPTO", sector: "Crypto", assetClass: "crypto", coinGeckoId: "ethereum" },
  "SOL-USD": { name: "Solana USD", exchange: "CRYPTO", sector: "Crypto", assetClass: "crypto", coinGeckoId: "solana" },
  "XRP-USD": { name: "XRP USD", exchange: "CRYPTO", sector: "Crypto", assetClass: "crypto", coinGeckoId: "ripple" },
};

const SCREENER_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META", "BRK-B",
  "JPM", "BAC", "GS", "V", "MA", "XOM", "CVX", "UNH", "JNJ", "PFE",
  "KO", "PEP", "WMT", "HD", "DIS", "NFLX", "CRM", "ADBE", "PYPL",
  "AMD", "INTC", "QCOM", "TXN", "AVGO", "MU", "AMAT", "ASML",
];

const PEER_MAP: Record<string, string[]> = {
  AAPL: ["MSFT", "GOOGL", "META", "AMZN", "NVDA"],
  MSFT: ["AAPL", "GOOGL", "AMZN", "CRM", "ADBE"],
  NVDA: ["AMD", "INTC", "QCOM", "AVGO", "MU"],
  TSLA: ["AMZN", "GOOGL", "NVDA", "MSFT", "AAPL"],
  META: ["GOOGL", "NFLX", "AMZN", "AAPL", "MSFT"],
  GOOGL: ["META", "MSFT", "AAPL", "AMZN", "NFLX"],
  AMZN: ["MSFT", "GOOGL", "AAPL", "WMT", "META"],
  JPM: ["BAC", "GS", "MS", "V", "MA"],
  XOM: ["CVX", "COP", "SLB", "CL=F", "GC=F"],
};

const GENERAL_NEWS_FEEDS: RssFeedConfig[] = [
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", fallbackSource: "CNBC" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", fallbackSource: "CoinDesk" },
  { url: buildGoogleNewsSearchUrl("stock market OR federal reserve OR earnings OR inflation OR bitcoin when:2d"), fallbackSource: "Google News" },
];

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
  if (upper === "EURUSD") return "eurusd";
  if (upper === "GBPUSD") return "gbpusd";
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

function getCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "blmtrm/1.0",
      Accept: "text/plain,text/csv,application/xml,text/xml,application/rss+xml,application/json;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "blmtrm/1.0",
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json() as Promise<T>;
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

export function buildQuoteFromStooq({ symbol, provider, profile, current, history, isLive = true }: BuildQuoteInput): Quote {
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
    quoteSource: provider,
    isLive,
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

      return {
        title,
        summary,
        url,
        source,
        publishedAt,
        sentiment: inferSentiment(`${title} ${summary}`),
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

    const quote = buildQuoteFromStooq({
      symbol: "^VIX",
      provider: "CBOE",
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
    });

    return setCached(quoteCache, cacheKey, quote, QUOTE_TTL_MS);
  } catch {
    const fallback = buildReferenceFallbackQuote("^VIX");
    return setCached(quoteCache, cacheKey, fallback, QUOTE_TTL_MS);
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

  try {
    const ids = uncached
      .map((symbol) => getProfile(symbol)?.coinGeckoId)
      .filter((id): id is string => Boolean(id));

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
    const payload = await fetchJson<Record<string, { usd: number; usd_market_cap?: number; usd_24h_vol?: number; usd_24h_change?: number }>>(url);

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
        high52: round(data.usd),
        low52: round(data.usd),
        open: round(previousClose),
        previousClose: round(previousClose),
        dayHigh: round(data.usd),
        dayLow: round(data.usd),
        avgVolume: Math.round(data.usd_24h_vol ?? 0),
        exchange: profile.exchange,
        sector: profile.sector,
        quoteSource: "CoinGecko",
        isLive: true,
      };
      results.set(symbol, setCached(quoteCache, `quote:${symbol}`, quote, QUOTE_TTL_MS));
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
    const quote = buildQuoteFromStooq({
      symbol,
      provider: symbol === "^RUT" ? "Stooq (IWM proxy)" : "Stooq",
      profile: getProfile(symbol),
      current: parseStooqCurrent(currentCsv),
      history,
    });
    return setCached(quoteCache, cacheKey, quote, QUOTE_TTL_MS);
  } catch {
    const fallback = buildReferenceFallbackQuote(symbol);
    return setCached(quoteCache, cacheKey, fallback, QUOTE_TTL_MS);
  }
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const uniqueSymbols = uniqueBy(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean), (symbol) => symbol);
  const cryptoSymbols = uniqueSymbols.filter((symbol) => getProfile(symbol)?.assetClass === "crypto");
  const nonCryptoSymbols = uniqueSymbols.filter((symbol) => !cryptoSymbols.includes(symbol));
  const cryptoQuotes = await getCoinGeckoQuotes(cryptoSymbols);

  const quotes = await Promise.all(nonCryptoSymbols.map(async (symbol) => {
    if (symbol === "^VIX") return getVixQuote();
    return getStooqQuote(symbol);
  }));

  return [
    ...quotes,
    ...cryptoSymbols.map((symbol) => cryptoQuotes.get(symbol) ?? buildReferenceFallbackQuote(symbol)),
  ];
}

export async function getOHLCV(symbol: string, range = "1Y"): Promise<OHLCVBar[]> {
  const upper = symbol.toUpperCase();
  const days = Math.max(getRangeDays(range), 2);
  const cacheKey = `history:${upper}:${days}`;
  const cached = getCached(historyCache, cacheKey);
  if (cached) return cached;

  try {
    if (getProfile(upper)?.assetClass === "crypto") {
      const id = getProfile(upper)?.coinGeckoId;
      if (!id) return [];
      const payload = await fetchJson<{ prices: [number, number][]; total_volumes: [number, number][] }>(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
      );
      const bars = payload.prices.map(([timestamp, close], index) => {
        const volume = payload.total_volumes[index]?.[1] ?? 0;
        const date = new Date(timestamp).toISOString().slice(0, 10);
        return {
          date,
          open: round(close),
          high: round(close),
          low: round(close),
          close: round(close),
          volume: Math.round(volume),
        };
      });
      return setCached(historyCache, cacheKey, bars, HISTORY_TTL_MS);
    }

    const history = await getStooqHistory(upper);
    return setCached(historyCache, cacheKey, history.slice(-days), HISTORY_TTL_MS);
  } catch {
    return cached ?? [];
  }
}

export async function getIndexSparklines(): Promise<Record<string, number[]>> {
  const symbols = ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX"];
  const result: Record<string, number[]> = {};
  for (const symbol of symbols) {
    const bars = await getOHLCV(symbol, "3M");
    result[symbol] = bars.slice(-30).map((bar) => bar.close);
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

  return filterNewsItems(items, query);
}

export async function getNewsArticle(input: {
  url: string;
  title: string;
  source: string;
  publishedAt: string;
  summary?: string;
}): Promise<NewsArticle> {
  const url = sanitizeArticleUrl(input.url);
  const cacheKey = `article:${url}`;
  const cached = getCached(articleCache, cacheKey);
  if (cached) return cached;

  try {
    const html = await fetchText(url);
    const content = extractArticleContent(html);
    const article: NewsArticle = {
      title: input.title,
      source: input.source,
      url,
      publishedAt: input.publishedAt,
      excerpt: input.summary?.trim() || content[0] || "Read-through unavailable for this source.",
      content: content.length ? content : (input.summary ? [input.summary.trim()] : []),
    };
    return setCached(articleCache, cacheKey, article, ARTICLE_TTL_MS);
  } catch {
    const fallback: NewsArticle = {
      title: input.title,
      source: input.source,
      url,
      publishedAt: input.publishedAt,
      excerpt: input.summary?.trim() || "Read-through unavailable for this source.",
      content: input.summary?.trim() ? [input.summary.trim()] : [],
    };
    return setCached(articleCache, cacheKey, fallback, ARTICLE_TTL_MS);
  }
}

export async function getPeers(symbol: string) {
  const upper = symbol.toUpperCase();
  return getQuotes(PEER_MAP[upper] ?? ["AAPL", "MSFT", "GOOGL", "AMZN", "META"]);
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

  try {
    const [commodities, eurUsdCsv, gbpUsdCsv, usdJpyCsv, goldCsv] = await Promise.all([
      getQuotes(["GC=F", "CL=F"]),
      fetchText("https://stooq.com/q/l/?s=eurusd&i=5"),
      fetchText("https://stooq.com/q/l/?s=gbpusd&i=5"),
      fetchText("https://stooq.com/q/l/?s=usdjpy&i=5"),
      fetchText("https://stooq.com/q/l/?s=xauusd&i=5"),
    ]);

    eurUsd = parseStooqCurrent(eurUsdCsv).close;
    gbpUsd = parseStooqCurrent(gbpUsdCsv).close;
    usdJpy = parseStooqCurrent(usdJpyCsv).close;
    gold = parseStooqCurrent(goldCsv).close;
    oil = commodities.find((item) => item.symbol === "CL=F")?.price ?? oil;
  } catch {
    // Keep the fallback snapshot when live provider calls fail.
  }

  return {
    gdp: { value: 2.5, prev: 3.1, label: "US GDP Growth (QoQ)", unit: "%" },
    cpi: { value: 3.1, prev: 3.4, label: "CPI Inflation (YoY)", unit: "%" },
    unemployment: { value: 3.7, prev: 3.9, label: "Unemployment Rate", unit: "%" },
    fedFunds: { value: 5.33, prev: 5.5, label: "Fed Funds Rate", unit: "%" },
    t10y: { value: 4.52, prev: 4.44, label: "10Y Treasury Yield", unit: "%" },
    t2y: { value: 4.89, prev: 4.91, label: "2Y Treasury Yield", unit: "%" },
    t30y: { value: 4.72, prev: 4.68, label: "30Y Treasury Yield", unit: "%" },
    dolllarIndex: { value: 104.5, prev: 102.8, label: "USD Index (DXY)", unit: "" },
    eurUsd: { value: round(eurUsd, 4), prev: round(eurUsd * 0.997, 4), label: "EUR/USD", unit: "" },
    gbpUsd: { value: round(gbpUsd, 4), prev: round(gbpUsd * 0.997, 4), label: "GBP/USD", unit: "" },
    usdJpy: { value: round(usdJpy, 4), prev: round(usdJpy * 0.998, 4), label: "USD/JPY", unit: "" },
    gold: { value: round(gold, 2), prev: round(gold * 0.995, 2), label: "Gold ($/oz)", unit: "" },
    oil: { value: round(oil, 2), prev: round(oil * 1.01, 2), label: "WTI Crude ($/bbl)", unit: "" },
  };
}
