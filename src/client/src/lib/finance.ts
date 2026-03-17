// Finance data fetching via backend proxy to finance API
// All calls go through /api/finance/* which the server proxies to the finance connector

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

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  content: string[];
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
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI",  label: "DOW" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^RUT",  label: "RUSSELL 2K" },
  { symbol: "^VIX",  label: "VIX" },
];

// Ticker tape symbols
export const TAPE_SYMBOLS = [
  "AAPL","MSFT","NVDA","TSLA","GOOGL","AMZN","META","BRK-B",
  "JPM","BAC","GS","MS","V","MA","PYPL",
  "XOM","CVX","COP","SLB",
  "^GSPC","^DJI","^IXIC","GC=F","CL=F","BTC-USD","ETH-USD",
];

// Screener default filters
export const SCREENER_SECTORS = [
  "Technology","Healthcare","Financial Services","Consumer Cyclical",
  "Communication Services","Industrials","Consumer Defensive","Energy",
  "Utilities","Real Estate","Basic Materials",
];
