import { useQuery } from "@tanstack/react-query";
import type { Quote, OHLCVBar, NewsItem, NewsArticle } from "./finance";

// Finance data hooks — all fetched from /api/finance/* proxy

export function useQuotes(symbols: string[]) {
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/quotes", symbols.join(",")],
    queryFn: async () => {
      if (!symbols.length) return [];
      const res = await fetch(`/api/finance/quotes?symbols=${symbols.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    refetchInterval: 15000, // refresh every 15s
    staleTime: 10000,
    enabled: symbols.length > 0,
  });
}

export function useQuote(symbol: string) {
  return useQuery<Quote>({
    queryKey: ["/api/finance/quote", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/finance/quotes?symbols=${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch quote");
      const data = await res.json();
      return data[0];
    },
    refetchInterval: 10000,
    staleTime: 8000,
    enabled: !!symbol,
  });
}

export function useOHLCV(symbol: string, range: string = "1Y") {
  return useQuery<OHLCVBar[]>({
    queryKey: ["/api/finance/ohlcv", symbol, range],
    queryFn: async () => {
      const res = await fetch(`/api/finance/ohlcv?symbol=${symbol}&range=${range}`);
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
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/gainers"],
    queryFn: async () => {
      const res = await fetch("/api/finance/gainers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useMarketLosers() {
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/losers"],
    queryFn: async () => {
      const res = await fetch("/api/finance/losers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

export function useMostActive() {
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/active"],
    queryFn: async () => {
      const res = await fetch("/api/finance/active");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
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

export function useNewsArticle(item?: Pick<NewsItem, "url" | "title" | "source" | "publishedAt" | "summary"> | null) {
  return useQuery<NewsArticle>({
    queryKey: ["/api/finance/news/read", item?.url ?? "", item?.title ?? ""],
    queryFn: async () => {
      if (!item) throw new Error("Missing article");
      const params = new URLSearchParams({
        url: item.url,
        title: item.title,
        source: item.source,
        publishedAt: item.publishedAt,
      });
      if (item.summary) params.set("summary", item.summary);
      const res = await fetch(`/api/finance/news/read?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch article");
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(item?.url),
  });
}

export function useEconomics() {
  return useQuery<any>({
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
  const params = new URLSearchParams(filters).toString();
  return useQuery<Quote[]>({
    queryKey: ["/api/finance/screener", params],
    queryFn: async () => {
      const res = await fetch(`/api/finance/screener?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
  });
}
