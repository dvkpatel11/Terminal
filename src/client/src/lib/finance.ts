// Finance data fetching via backend proxy to finance API
// All calls go through /api/finance/* which the server proxies to the finance connector

export type DataFreshness = "current" | "delayed" | "daily" | "reference" | "feed" | "schedule" | "snapshot";

export interface DataStatus {
  provider: string;
  freshness: DataFreshness;
  asOf: string | null;
  delayLabel: string;
  isFallback: boolean;
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
  assetClass?: string;
  quoteSource: string;
  isLive: boolean;
  status: DataStatus;
  ma_50d?: number;
  ma_200d?: number;
  currency?: string;
}

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  sentiment?: "positive" | "negative" | "neutral";
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

export interface EconomicsSnapshotMetric {
  value: number;
  prev: number;
  label: string;
  unit: string;
}

export interface EconomicsSnapshot {
  gdp: EconomicsSnapshotMetric;
  cpi: EconomicsSnapshotMetric;
  unemployment: EconomicsSnapshotMetric;
  fedFunds: EconomicsSnapshotMetric;
  t10y: EconomicsSnapshotMetric;
  t2y: EconomicsSnapshotMetric;
  t30y: EconomicsSnapshotMetric;
  dolllarIndex: EconomicsSnapshotMetric;
  eurUsd: EconomicsSnapshotMetric;
  gbpUsd: EconomicsSnapshotMetric;
  usdJpy: EconomicsSnapshotMetric;
  gold: EconomicsSnapshotMetric;
  oil: EconomicsSnapshotMetric;
  status: DataStatus;
}

export interface EconomicCalendarEvent {
  id: string;
  releaseId: number;
  title: string;
  category: "inflation" | "labor" | "growth" | "policy" | "consumption" | "activity" | "housing";
  importance: "high" | "medium";
  date: string;
  timeCt: string;
  releaseUrl: string;
  status: DataStatus;
}

export interface EconomicEventDetail {
  releaseId: number;
  title: string;
  category: EconomicCalendarEvent["category"];
  importance: EconomicCalendarEvent["importance"];
  sourceName: string;
  sourceUrl: string | null;
  releaseCalendarUrl: string;
  releaseWebsiteUrl: string | null;
  tables: Array<{ title: string; url: string; recordCount: number | null }>;
  upcomingDates: Array<{ date: string; timeCt: string }>;
  status: DataStatus;
}

export interface PortfolioPositionInput {
  symbol: string;
  shares: number;
  avgCost: number;
}

export interface PortfolioAnalytics {
  benchmarkSymbol: string;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  activeReturnPct: number | null;
  beta: number | null;
  annualizedVolatilityPct: number | null;
  maxDrawdownPct: number | null;
  chart: Array<{ date: string; portfolio: number; benchmark: number }>;
}

// Helper: format large numbers
export function formatBig(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}

export function formatPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export function formatChange(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

export function pctClass(n: number): string {
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-flat";
}

// Major indices tickers
export const INDICES = [
  { symbol: "^GSPC",    label: "S&P 500",       region: "Americas" },
  { symbol: "^DJI",     label: "DOW",           region: "Americas" },
  { symbol: "^IXIC",    label: "NASDAQ",        region: "Americas" },
  { symbol: "^RUT",     label: "RUSSELL 2K",    region: "Americas" },
  { symbol: "^GSPTSE",  label: "S&P/TSX",       region: "Americas" },
  { symbol: "^BVSP",    label: "BOVESPA",       region: "Americas" },
  { symbol: "^FTSE",    label: "FTSE 100",      region: "EMEA" },
  { symbol: "^GDAXI",   label: "DAX",           region: "EMEA" },
  { symbol: "^FCHI",    label: "CAC 40",        region: "EMEA" },
  { symbol: "^STOXX50E", label: "EURO STOXX 50", region: "EMEA" },
  { symbol: "^SSMI",    label: "SMI",           region: "EMEA" },
  { symbol: "^N225",    label: "NIKKEI 225",    region: "Asia-Pac" },
  { symbol: "^HSI",     label: "HANG SENG",     region: "Asia-Pac" },
  { symbol: "000001.SS", label: "SHANGHAI",     region: "Asia-Pac" },
  { symbol: "^BSESN",   label: "SENSEX",        region: "Asia-Pac" },
  { symbol: "^AXJO",    label: "ASX 200",       region: "Asia-Pac" },
  { symbol: "^KS11",    label: "KOSPI",         region: "Asia-Pac" },
  { symbol: "BTC-USD",  label: "BTC-USD",       region: "Crypto" },
];

// Ticker tape symbols
export const TAPE_SYMBOLS = [
  "AAPL","MSFT","NVDA","TSLA","GOOGL","AMZN","META","BRK-B",
  "JPM","BAC","GS","MS","V","MA","PYPL",
  "XOM","CVX","COP","SLB",
  "^GSPC","^DJI","^IXIC","GC=F","CL=F","BTC-USD","ETH-USD",
];

// GICS Sector ETFs (SPDR Select Sector)
export const SECTOR_ETFS = [
  { symbol: "XLK", label: "Technology", sector: "Technology" },
  { symbol: "XLV", label: "Health Care", sector: "Healthcare" },
  { symbol: "XLF", label: "Financials", sector: "Financial Services" },
  { symbol: "XLE", label: "Energy", sector: "Energy" },
  { symbol: "XLI", label: "Industrials", sector: "Industrials" },
  { symbol: "XLC", label: "Comm Services", sector: "Communication Services" },
  { symbol: "XLP", label: "Consumer Staples", sector: "Consumer Defensive" },
  { symbol: "XLU", label: "Utilities", sector: "Utilities" },
  { symbol: "XLRE", label: "Real Estate", sector: "Real Estate" },
  { symbol: "XLB", label: "Materials", sector: "Basic Materials" },
  { symbol: "XLY", label: "Consumer Disc.", sector: "Consumer Cyclical" },
];

// Key assets for market scorecard
export const SCORECARD_ASSETS = [
  { symbol: "^GSPC", label: "S&P 500", category: "equity" },
  { symbol: "^IXIC", label: "Nasdaq 100", category: "equity" },
  { symbol: "^RUT", label: "Russell 2000", category: "equity" },
  { symbol: "^FTSE", label: "FTSE 100", category: "equity" },
  { symbol: "^GDAXI", label: "DAX", category: "equity" },
  { symbol: "^N225", label: "Nikkei 225", category: "equity" },
  { symbol: "DX-Y.NYB", label: "DXY (Dollar)", category: "fx" },
  { symbol: "GC=F", label: "Gold", category: "commodity" },
  { symbol: "CL=F", label: "WTI Crude", category: "commodity" },
  { symbol: "SI=F", label: "Silver", category: "commodity" },
  { symbol: "HG=F", label: "Copper", category: "commodity" },
  { symbol: "BTC-USD", label: "Bitcoin", category: "crypto" },
  { symbol: "^VIX", label: "VIX", category: "volatility" },
  { symbol: "^TNX", label: "US 10Y Yield", category: "rates" },
  { symbol: "^TYX", label: "US 30Y Yield", category: "rates" },
];

// VIX term structure symbols
export const VIX_TERMS = [
  { symbol: "^VIX", label: "VIX (Spot)", tenor: "spot" },
  { symbol: "^VIX2", label: "VIX (2M)", tenor: "2m" },
  { symbol: "^VIX3M", label: "VIX (3M)", tenor: "3m" },
];

// Screener default filters
export const SCREENER_SECTORS = [
  "Technology","Healthcare","Financial Services","Consumer Cyclical",
  "Communication Services","Industrials","Consumer Defensive","Energy",
  "Utilities","Real Estate","Basic Materials",
];
