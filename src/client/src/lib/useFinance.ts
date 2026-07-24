import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Quote, OHLCVSeries, NewsItem, NewsArticle, PortfolioAnalytics, PortfolioPositionInput, EconomicsSnapshot, EconomicCalendarEvent, EconomicEventDetail, DataStatus } from "./finance";
import { useRealtime, type LiveQuote } from "./realtime";

// Finance data hooks — all fetched from /api/finance/* proxy

/** Overlay live WebSocket price onto a polled quote. */
export function applyLiveOverlay(q: Quote, live: Record<string, LiveQuote>): Quote {
  const l = live[q.symbol.toUpperCase()];
  if (!l || !Number.isFinite(l.price)) return q;
  const prev = q.previousClose || q.price;
  const change = l.price - prev;
  const isCrypto = q.assetClass === "crypto" || q.symbol.endsWith("-USD");
  return {
    ...q,
    price: l.price,
    change,
    changePercent: prev ? (change / prev) * 100 : 0,
    isLive: true,
    quoteSource: isCrypto ? "Binance (live)" : "Live",
  };
}

/**
 * Polled quotes, overlaid with live prices from the realtime bus.
 * When a symbol has a live tick, price/change/changePercent reflect it
 * and isLive becomes true.
 */
export function useQuotes(symbols: string[]) {
  const { quotes: live } = useRealtime();

  return useQuery<Quote[]>({
    queryKey: ["/api/finance/quotes", symbols.join(",")],
    queryFn: async () => {
      if (!symbols.length) return [];
      const res = await fetch(`/api/finance/quotes?symbols=${symbols.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    select: (data) => data.map((q) => applyLiveOverlay(q, live)),
    refetchInterval: 15000, // poll keeps name/metadata fresh; live overlays the price
    staleTime: 10000,
    enabled: symbols.length > 0,
  });
}

export function useQuote(symbol: string) {
  const { quotes: live } = useRealtime();

  return useQuery<Quote>({
    queryKey: ["/api/finance/quote", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/quotes?symbols=${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      const data = await res.json();
      return data[0];
    },
    select: (q) => applyLiveOverlay(q, live),
    refetchInterval: 10000,
    staleTime: 8000,
    enabled: !!symbol,
  });
}

export function useOHLCV(symbol: string, range: string = "1Y", interval: "5m" | "15m" | "1h" | "1d" = "1d") {
  return useQuery<OHLCVSeries>({
    queryKey: ["/api/finance/ohlcv", symbol, range, interval],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol, range, interval });
      const res = await fetch(`/api/finance/ohlcv?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch OHLCV");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!symbol,
  });
}

export function useMarketSentiment() {
  return useQuery<{ sentiment: string; score: number; bullish: number; bearish: number }>({
    queryKey: ["/api/finance/sentiment"],
    queryFn: async () => {
      const res = await fetch("/api/finance/sentiment");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useMarketGainers() {
  const { quotes: live } = useRealtime();

  return useQuery<Quote[]>({
    queryKey: ["/api/finance/gainers"],
    queryFn: async () => {
      const res = await fetch("/api/finance/gainers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    select: (data) => data.map((q) => applyLiveOverlay(q, live)),
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useMarketLosers() {
  const { quotes: live } = useRealtime();

  return useQuery<Quote[]>({
    queryKey: ["/api/finance/losers"],
    queryFn: async () => {
      const res = await fetch("/api/finance/losers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    select: (data) => data.map((q) => applyLiveOverlay(q, live)),
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useMostActive() {
  const { quotes: live } = useRealtime();

  return useQuery<Quote[]>({
    queryKey: ["/api/finance/active"],
    queryFn: async () => {
      const res = await fetch("/api/finance/active");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    select: (data) => data.map((q) => applyLiveOverlay(q, live)),
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useNews(symbol?: string, query?: string) {
  return useQuery<NewsItem[]>({
    queryKey: ["/api/finance/news", symbol ?? "market", query ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (symbol) params.set("symbol", symbol);
      if (query?.trim()) params.set("query", query.trim());
      const url = params.size ? `/api/finance/news?${params.toString()}` : "/api/finance/news";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 55000,
  });
}

type NewsArticleRequest = Pick<NewsItem, "url" | "title" | "source" | "feedProvider" | "publishedAt" | "summary">;

export function buildNewsArticleParams(item: NewsArticleRequest) {
  const params = new URLSearchParams({
    url: item.url,
    title: item.title,
    source: item.source,
    publishedAt: item.publishedAt,
  });

  if (item.feedProvider) params.set("feedProvider", item.feedProvider);
  if (item.summary) params.set("summary", item.summary);

  return params;
}

export function useNewsArticle(item?: NewsArticleRequest | null) {
  return useQuery<NewsArticle>({
    queryKey: ["/api/finance/news/read", item?.url ?? "", item?.title ?? ""],
    queryFn: async () => {
      if (!item) throw new Error("Missing article");
      const params = buildNewsArticleParams(item);
      const res = await fetch(`/api/finance/news/read?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch article");
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(item?.url),
  });
}

export function usePortfolioAnalytics(positions: PortfolioPositionInput[]) {
  return useQuery<PortfolioAnalytics>({
    queryKey: ["/api/finance/portfolio-analytics", JSON.stringify(positions)],
    queryFn: async () => {
      const res = await fetch("/api/finance/portfolio-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!res.ok) throw new Error("Failed to fetch portfolio analytics");
      return res.json();
    },
    staleTime: 60_000,
    enabled: positions.length > 0,
  });
}

export function useEconomics() {
  return useQuery<EconomicsSnapshot>({
    queryKey: ["/api/finance/economics"],
    queryFn: async () => {
      const res = await fetch("/api/finance/economics");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 300000,
    staleTime: 250000,
  });
}

export function useEconomicCalendar() {
  return useQuery<EconomicCalendarEvent[]>({
    queryKey: ["/api/finance/economics/calendar"],
    queryFn: async () => {
      const res = await fetch("/api/finance/economics/calendar");
      if (!res.ok) throw new Error("Failed to fetch economic calendar");
      return res.json();
    },
    refetchInterval: 15 * 60_000,
    staleTime: 14 * 60_000,
  });
}

export function useEconomicEventDetail(releaseId?: number | null) {
  return useQuery<EconomicEventDetail>({
    queryKey: ["/api/finance/economics/events", releaseId ?? 0],
    queryFn: async () => {
      if (!releaseId) throw new Error("Missing releaseId");
      const res = await fetch(`/api/finance/economics/events/${releaseId}`);
      if (!res.ok) throw new Error("Failed to fetch economic event detail");
      return res.json();
    },
    staleTime: 60 * 60_000,
    enabled: Boolean(releaseId),
  });
}

export function usePeers(symbol: string) {
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/peers", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/peers?symbol=${symbol}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 300000,
    enabled: !!symbol,
  });
}

export function useIndexSparklines() {
  return useQuery<Record<string, number[]>>({
    queryKey: ["/api/finance/sparklines"],
    queryFn: async () => {
      const res = await fetch("/api/finance/sparklines");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 300000, // sparklines are intraday, refresh every 5 min
    refetchInterval: 300000,
  });
}

export function useScreener(filters: Record<string, string>) {
  const { quotes: live } = useRealtime();
  const params = new URLSearchParams(filters).toString();

  return useQuery<Quote[]>({
    queryKey: ["/api/finance/screener", params],
    queryFn: async () => {
      const res = await fetch(`/api/finance/screener?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    select: (data) => data.map((q) => applyLiveOverlay(q, live)),
    staleTime: 60000,
  });
}

export interface IncomeRow {
  period_ending: string;
  total_revenue?: number;
  cost_of_revenue?: number;
  gross_profit?: number;
  operating_income?: number;
  net_income?: number;
  basic_earnings_per_share?: number;
}

export interface MetricsData {
  pe_ratio?: number;
  forward_pe?: number;
  peg_ratio?: number;
  enterprise_to_ebitda?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  quick_ratio?: number;
  current_ratio?: number;
  debt_to_equity?: number;
  gross_margin?: number;
  operating_margin?: number;
  profit_margin?: number;
  return_on_assets?: number;
  return_on_equity?: number;
  dividend_yield?: number;
  payout_ratio?: number;
  market_cap?: number;
  enterprise_value?: number;
  book_value?: number;
  price_to_book?: number;
  beta?: number;
}

export interface ConsensusData {
  symbol?: string;
  target_high?: number;
  target_low?: number;
  target_consensus?: number;
  target_median?: number;
  recommendation?: string;
  recommendation_mean?: number;
  number_of_analysts?: number;
  current_price?: number;
  currency?: string;
}

export interface DividendData {
  ex_dividend_date: string;
  amount: number;
}

export interface ProfileData {
  symbol?: string;
  name?: string;
  stock_exchange?: string;
  long_description?: string;
  company_url?: string;
  hq_address1?: string;
  hq_address_city?: string;
  hq_state?: string;
  hq_country?: string;
  employees?: number;
  sector?: string;
  industry_category?: string;
  market_cap?: number;
  shares_outstanding?: number;
  shares_float?: number;
  dividend_yield?: number;
  beta?: number;
}

export interface FundamentalsResponse {
  incomeStatement?: IncomeRow[];
  metrics?: MetricsData;
  consensus?: ConsensusData;
  dividends?: DividendData[];
  profile?: ProfileData;
  status?: DataStatus;
}

export function useFundamentals(symbol: string) {
  return useQuery<FundamentalsResponse>({
    queryKey: ["/api/finance/fundamentals", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/fundamentals?symbol=${symbol.toUpperCase()}`);
      if (!res.ok) throw new Error(`Failed to fetch fundamentals: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: !!symbol,
  });
}

export interface OptionsContract {
  symbol: string;
  expiration: string;
  strike: number;
  optionType: "call" | "put";
  bid?: number;
  ask?: number;
  lastPrice?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
}

export interface OptionsResponse {
  underlyingPrice?: number;
  contracts: OptionsContract[];
  status: DataStatus;
}

export function useOptions(symbol: string) {
  return useQuery<OptionsResponse>({
    queryKey: ["/api/finance/options", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/options?symbol=${symbol.toUpperCase()}`);
      if (!res.ok) throw new Error("Failed to fetch options");
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!symbol,
  });
}

export interface YieldCurvePoint {
  date: string;
  month_1?: number;
  month_3?: number;
  month_6?: number;
  year_1?: number;
  year_2?: number;
  year_3?: number;
  year_5?: number;
  year_7?: number;
  year_10?: number;
  year_20?: number;
  year_30?: number;
}

export function useYieldCurve() {
  return useQuery<YieldCurvePoint[]>({
    queryKey: ["/api/finance/yield-curve"],
    queryFn: async () => {
      const res = await fetch("/api/finance/yield-curve");
      if (!res.ok) throw new Error("Failed to fetch yield curve");
      return res.json();
    },
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });
}

// ── Social Sentiment ────────────────────────────────────────────────────────

interface PostBase {
  title: string;
  url: string;
  score: number;
  platform: string;
  thumbnail?: string;
}

export interface MentionCount {
  symbol: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  sentiment: number;
  source: string;
  posts: PostBase[];
}

interface SocialSentimentResponse {
  mentions: MentionCount[];
  source: string;
  generatedAt: string;
}

export function useSocialSentiment(symbol?: string) {
  return useQuery<SocialSentimentResponse>({
    queryKey: ["/api/finance/social-sentiment", symbol ?? "all"],
    queryFn: async () => {
      const params = symbol ? `?symbol=${symbol}` : "";
      const res = await fetch(`/api/finance/social-sentiment${params}`);
      if (!res.ok) throw new Error("Failed to fetch social sentiment");
      return res.json();
    },
    staleTime: 60_000,
    enabled: true,
  });
}

// ── Options Flow ────────────────────────────────────────────────────────────

interface SummaryResponse {
  putCallRatio: number;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  date: string;
}

export interface UnusualActivity {
  symbol: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string;
  volume: number;
  openInterest: number;
  vOiRatio: number;
  sentiment: "bullish" | "bearish" | "neutral";
  underlyingPrice: number;
}

export interface BlockTrade {
  symbol: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string;
  premium: number;
  size: number;
  sentiment: "bullish" | "bearish" | "neutral";
  timestamp: string;
}

interface OptionsFlowResponse {
  summary: SummaryResponse;
  activity: UnusualActivity[];
  source: string;
}

export function useOptionsFlow(symbol?: string) {
  return useQuery<OptionsFlowResponse>({
    queryKey: ["/api/finance/options-flow", symbol ?? "market"],
    queryFn: async () => {
      const params = symbol ? `?symbol=${symbol}` : "";
      const res = await fetch(`/api/finance/options-flow${params}`);
      if (!res.ok) throw new Error("Failed to fetch options flow");
      return res.json();
    },
    staleTime: 60_000,
    enabled: true,
  });
}

// ── On-Chain ────────────────────────────────────────────────────────────────

export interface WhaleTransaction {
  id: string;
  blockchain: string;
  symbol: string;
  amount: number;
  usdAmount: number | null;
  fromAddress: string;
  fromLabel: string | null;
  toAddress: string;
  toLabel: string | null;
  timestamp: string;
  txHash: string;
  type: "transfer" | "exchange_in" | "exchange_out" | "unknown";
}

interface OnChainResponse {
  transactions: WhaleTransaction[];
  source: string;
  requiresApiKey: boolean;
}

export function useOnChain(symbol?: string) {
  return useQuery<OnChainResponse>({
    queryKey: ["/api/finance/onchain", symbol ?? "all"],
    queryFn: async () => {
      const params = symbol ? `?symbol=${symbol}` : "";
      const res = await fetch(`/api/finance/onchain${params}`);
      if (!res.ok) throw new Error("Failed to fetch on-chain data");
      return res.json();
    },
    staleTime: 60_000,
    enabled: true,
  });
}

// ─── Market Scorecard ────────────────────────────────────────────────────────

export interface ScorecardRow {
  symbol: string;
  label: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  weekChange: number;
  monthChange: number;
  ytdChange: number;
  high52: number;
  low52: number;
  high52Pct: number;
  low52Pct: number;
  keyLevel: string;
  status: DataStatus;
}

export function useScorecard() {
  return useQuery<ScorecardRow[]>({
    queryKey: ["/api/finance/scorecard"],
    queryFn: async () => {
      const res = await fetch("/api/finance/scorecard");
      if (!res.ok) throw new Error("Failed to fetch scorecard");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

// ─── Sector Performance ──────────────────────────────────────────────────────

export interface SectorPerformance {
  symbol: string;
  label: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  weekChange: number;
  monthChange: number;
  ytdChange: number;
  relativeStrength: number;
  status: DataStatus;
}

export function useSectorPerformance() {
  return useQuery<SectorPerformance[]>({
    queryKey: ["/api/finance/sectors"],
    queryFn: async () => {
      const res = await fetch("/api/finance/sectors");
      if (!res.ok) throw new Error("Failed to fetch sector performance");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

// ─── Market Breadth ──────────────────────────────────────────────────────────

export interface MarketBreadth {
  advanceDecline: number;
  advanceDeclineRatio: number;
  percentAbove200dma: number;
  percentAbove50dma: number;
  newHighs: number;
  newLows: number;
  newHighLowRatio: number;
  status: DataStatus;
}

export function useMarketBreadth() {
  return useQuery<MarketBreadth>({
    queryKey: ["/api/finance/breadth"],
    queryFn: async () => {
      const res = await fetch("/api/finance/breadth");
      if (!res.ok) throw new Error("Failed to fetch market breadth");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 55000,
  });
}

// ─── Credit Spreads ──────────────────────────────────────────────────────────

export interface CreditSpread {
  igOas: number;
  igOasChange: number;
  hyOas: number;
  hyOasChange: number;
  igOasPercentile: number;
  hyOasPercentile: number;
  trend: "widening" | "tightening" | "stable";
  status: DataStatus;
}

export function useCreditSpreads() {
  return useQuery<CreditSpread>({
    queryKey: ["/api/finance/credit"],
    queryFn: async () => {
      const res = await fetch("/api/finance/credit");
      if (!res.ok) throw new Error("Failed to fetch credit spreads");
      return res.json();
    },
    refetchInterval: 300000, // 5 min
    staleTime: 290000,
  });
}

// ─── VIX Term Structure ──────────────────────────────────────────────────────

export interface VixTermStructure {
  spot: number;
  vix2m: number | null;
  vix3m: number | null;
  curveShape: "contango" | "backwardation" | "flat";
  termSpread: number | null;
  status: DataStatus;
}

export function useVixTermStructure() {
  return useQuery<VixTermStructure>({
    queryKey: ["/api/finance/vix-term"],
    queryFn: async () => {
      const res = await fetch("/api/finance/vix-term");
      if (!res.ok) throw new Error("Failed to fetch VIX term structure");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

// ─── Technical Indicators ────────────────────────────────────────────────────

export interface TechnicalIndicators {
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  atr14: number | null;
  obv: number | null;
  vwap: number | null;
  support: number | null;
  resistance: number | null;
  status: DataStatus;
}

export function useTechnicalIndicators(symbol: string) {
  return useQuery({
    queryKey: ["/api/finance/technical", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/technical?symbol=${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch technical indicators");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 55000,
    enabled: !!symbol,
  });
}

// ─── Social Feed Hooks ─────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  platform: "reddit" | "x" | "truth";
  author: string;
  title: string;
  text: string;
  url: string;
  createdAt: string;
  score: number;
  engagementScore: number;
  tickers: string[];
  sentiment: { positive: number; negative: number; score: number };
  contentType: string;
  thumbnail?: string;
  accountName: string;
  accountUrl: string;
}

export interface SocialFeedResponse {
  posts: SocialPost[];
  byPlatform: Record<string, SocialPost[]>;
  byAccount: SocialPost[];
  sentiment: Record<string, { positive: number; negative: number; score: number; count: number }>;
  source: string;
  error?: string;
}

// ─── Unified Feed Item (news + social) ─────────────────────────────────────

export type FeedItem =
  | { kind: "news"; item: NewsItem }
  | { kind: "social"; item: SocialPost };

/** Platform badge colors for social items in the unified feed. */
export const PLATFORM_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  reddit: { bg: "bg-orange-500/20", text: "text-orange-400", label: "REDDIT" },
  x: { bg: "bg-blue-500/20", text: "text-blue-400", label: "X" },
  truth: { bg: "bg-gray-500/20", text: "text-gray-400", label: "TRUTH" },
};

/**
 * Rank a feed item by recency, engagement, and sentiment.
 * Higher score = should appear higher in the feed.
 */
function feedItemScore(item: FeedItem): number {
  const now = Date.now();
  if (item.kind === "news") {
    const age = now - new Date(item.item.publishedAt).getTime();
    const hoursOld = Math.max(0.1, age / 3_600_000);
    const recency = 1 / Math.pow(hoursOld, 0.6); // decay over time
    const sentimentBoost =
      item.item.sentiment === "positive" ? 0.15 :
      item.item.sentiment === "negative" ? 0.1 : 0;
    return recency + sentimentBoost;
  }
  // Social post
  const age = now - new Date(item.item.createdAt).getTime();
  const hoursOld = Math.max(0.1, age / 3_600_000);
  const recency = 1 / Math.pow(hoursOld, 0.6);
  const engagement = Math.log10(Math.max(1, item.item.engagementScore)) * 0.3;
  const sentimentBoost = Math.abs(item.item.sentiment.score) * 0.15;
  return recency + engagement + sentimentBoost;
}

/** Merge news and social posts into a single ranked feed. */
export function mergeFeed(news: NewsItem[], posts: SocialPost[]): FeedItem[] {
  const items: FeedItem[] = [
    ...news.map((item) => ({ kind: "news" as const, item })),
    ...posts.map((item) => ({ kind: "social" as const, item })),
  ];
  items.sort((a, b) => feedItemScore(b) - feedItemScore(a));
  return items;
}

export function useStoredSocialSources(): string[] {
  try {
    const raw = localStorage.getItem("terminal-social-sources");
    if (raw) {
      const sources = JSON.parse(raw) as { platform: string; identifier: string; enabled: boolean }[];
      return sources
        .filter((s) => s.enabled)
        .map((s) => `${s.platform}:${s.identifier}`);
    }
  } catch {}
  return [];
}

export function useSocialFeed(sources?: string[], symbol?: string) {
  const sourcesParam = sources?.length ? sources.join("|") : "";
  return useQuery<SocialFeedResponse>({
    queryKey: ["/api/finance/social/feed", sourcesParam, symbol ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourcesParam) params.set("sources", sourcesParam);
      if (symbol) params.set("symbol", symbol);
      const qs = params.toString();
      const res = await fetch(`/api/finance/social/feed${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch social feed");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 55000,
  });
}

export function useSocialSources() {
  return useQuery({
    queryKey: ["/api/finance/social/sources"],
    queryFn: async () => {
      const res = await fetch("/api/finance/social/sources");
      if (!res.ok) throw new Error("Failed to fetch social sources");
      return res.json();
    },
    staleTime: 300000,
  });
}

// ─── OAuth Connection Hooks ────────────────────────────────────────────────

interface OAuthConnection {
  provider: string;
  displayName: string;
  scope: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export function useOAuthConnections() {
  return useQuery<OAuthConnection[]>({
    queryKey: ["/api/oauth/connections"],
    staleTime: 30_000,
  });
}

export function useConnectOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/authorize?provider=${provider}`);
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
      return data;
    },
  });
}

export function useDisconnectOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/connections/${provider}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/connections"] });
    },
  });
}

export function useTestOAuth() {
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/test/${provider}`, { method: "POST" });
      return res.json();
    },
  });
}

// ─── Discord Hooks ─────────────────────────────────────────────

export function useDiscordStatus() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discord-status"],
    queryFn: async () => {
      const response = await fetch("/api/discord/status");
      if (!response.ok) throw new Error("Failed to fetch Discord status");
      return response.json() as Promise<{ configured: boolean }>;
    },
  });
  return { configured: data?.configured ?? false, isLoading, refetch };
}

export function useDiscordSetToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch("/api/discord/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to set Discord token");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discord-status"] });
    },
  });
}

export function useDiscordClearToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/discord/token", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to clear Discord token");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discord-status"] });
      queryClient.invalidateQueries({ queryKey: ["discord-tracked"] });
    },
  });
}

export function useDiscordGuilds() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discord-guilds"],
    queryFn: async () => {
      const response = await fetch("/api/discord/guilds");
      if (!response.ok) throw new Error("Failed to fetch Discord guilds");
      return response.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: false, // Only fetch when explicitly triggered
  });
  return { guilds: data ?? [], isLoading, refetch };
}

export function useDiscordChannels(guildId: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discord-channels", guildId],
    queryFn: async () => {
      if (!guildId) return [];
      const response = await fetch(`/api/discord/guilds/${guildId}/channels`);
      if (!response.ok) throw new Error("Failed to fetch Discord channels");
      return response.json() as Promise<{ id: string; name: string; type: number }[]>;
    },
    enabled: !!guildId,
  });
  return { channels: data ?? [], isLoading, refetch };
}

export function useDiscordTrackedChannels() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discord-tracked"],
    queryFn: async () => {
      const response = await fetch("/api/discord/tracked");
      if (!response.ok) throw new Error("Failed to fetch tracked channels");
      return response.json();
    },
  });
  return { channels: data ?? [], isLoading, refetch };
}

export function useDiscordTrackChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channel: {
      channelId: string;
      channelName: string;
      guildId: string;
      guildName: string;
    }) => {
      const response = await fetch("/api/discord/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      if (!response.ok) throw new Error("Failed to track channel");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discord-tracked"] });
    },
  });
}

export function useDiscordUntrackChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const response = await fetch(`/api/discord/track/${channelId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to untrack channel");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discord-tracked"] });
    },
  });
}

export function useDiscordMessages() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discord-messages"],
    queryFn: async () => {
      const response = await fetch("/api/discord/fetch");
      if (!response.ok) throw new Error("Failed to fetch Discord messages");
      return response.json() as Promise<{ posts: any[] }>;
    },
    enabled: false,
  });
  return { posts: data?.posts ?? [], isLoading, refetch };
}

// ─── AI Sentiment & Thesis Hooks ──────────────────────────────────────────

export interface SentimentTag {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  tickers: string[];
  rationale_short: string;
}

export interface SentimentTagResult {
  tag: SentimentTag;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface TradeThesis {
  symbol: string;
  direction: "long" | "short";
  thesis_summary: string;
  bull_case: string;
  bear_case: string;
  key_catalysts: string[];
  invalidation_level: number;
  risk_status: "low" | "medium" | "high" | "critical";
  upside_status: "favorable" | "neutral" | "unfavorable";
  downside_status: "limited" | "moderate" | "severe";
  confidence: number;
  generated_at: string;
}

export interface ThesisResult {
  thesis: TradeThesis;
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
}

/** Tag a single social post's sentiment via Claude. */
export function useTagSentiment() {
  return useMutation({
    mutationFn: async (input: { text: string; title?: string; platform?: string; author?: string; tickers?: string[] }) => {
      const res = await fetch("/api/ai/sentiment/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Sentiment tagging failed");
      return res.json() as Promise<SentimentTagResult>;
    },
  });
}

/** Generate a trade thesis for a symbol. */
export function useGenerateThesis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { symbol: string; direction: "long" | "short"; entryPrice?: number; size?: number; thesis?: string }) => {
      const res = await fetch("/api/ai/thesis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Thesis generation failed");
      return res.json() as Promise<ThesisResult>;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/thesis", variables.symbol] });
    },
  });
}

/** Fetch cached thesis for a symbol. */
export function useThesis(symbol: string, enabled = true) {
  return useQuery<ThesisResult | { error: string }>({
    queryKey: ["/api/ai/thesis", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/ai/thesis/${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error("Failed to fetch thesis");
      return res.json();
    },
    staleTime: 60_000,
    enabled,
  });
}
