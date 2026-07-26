import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage, extendedStorage } from "./storage";
import { insertWatchlistItemSchema, insertAlertSchema, insertPositionSchema, insertPositionFillSchema, insertAgentSkillSchema } from "@shared/schema";
import axios from "axios";
import { evaluateAlerts } from "./alertsEngine";
import {
  getEconomicsSnapshot,
  getIndexSparklines,
  getMarketMovers,
  getMarketSentiment,
  getNews,
  getNewsArticle,
  getNewsSourceStatuses,
  fetchNewsSourceContent,
  getOHLCV,
  getOHLCVSeries,
  getPeers,
  getQuotes,
  getScreenerResults,
  getFundamentals,
  getOptionsChain,
  getYieldCurve,
  getEventsForSymbol,
} from "./marketData";
import { handleSocialSentimentRequest, getSentimentSourceStatuses, testSentimentSource } from "./socialSentiment";
import { getSocialFeed, parseSocialUrl, type SocialSourceConfig } from "./socialFeed";
import { handleOptionsFlowRequest, handleOptionsSRRequest } from "./optionsFlow";
import { handleOnChainRequest } from "./onchain";
import { tagPostSentiment, tagPostsBatch, type TagSentimentInput } from "./sentimentTagger";
import { generateTradeThesis, needsReEvaluation, getCachedThesisForSymbol, logThesisAudit, type ThesisInput } from "./thesisGenerator";
import { getEconomicCalendar, getEconomicEventDetail } from "./economicsData";
import { getUnifiedCalendar } from "./calendarAggregator";
import { calculatePortfolioAnalytics } from "./portfolioAnalytics";
import {
  getSectorPerformance,
  getMarketBreadth,
  getCreditSpreads,
  getVixTermStructure,
  getTechnicalIndicators,
  getScorecardData,
} from "./marketScorecard";
import {
  loadSymbolConfig,
  reloadSymbolConfig,
} from "./symbolRegistry";
import { generateOAuthState, validateOAuthState, exchangeCodeForTokens, fetchUserInfo, refreshAccessToken, encryptToken, decryptToken, setAppCredentials, getAppCredentials, hasAppCredentials } from "./oauth";
import { OAUTH_PROVIDERS } from "./oauthProviders";
import discordRouter from "./discordRoutes";
import { buildSystemPrompt, getAllSkills, setDbSkills, type PromptContext } from "./promptConfig";
import { getToolByName, getToolSchemas } from "./agentTools";
import { getBreakerState } from "./providerUtils";

function parseSymbols(value: unknown) {
  return String(value || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

const portfolioAnalyticsRequestSchema = z.object({
  positions: z.array(z.object({
    symbol: z.string().trim().min(1),
    shares: z.number().positive(),
    avgCost: z.number().positive(),
  })).min(1),
});

// ─── Route Registration ─────────────────────────────────────────────────────
export async function registerRoutes(
  httpServer: Server,
  app: Express,
  bus?: import("./realtime/quoteBus").QuoteBus,
): Promise<void> {
  const handleFinance = <T>(loader: (req: any) => Promise<T>) => {
    return async (req: any, res: any) => {
      try {
        res.json(await loader(req));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown finance data error";
        res.status(502).json({ error: detail });
      }
    };
  };

  // ─── Health check ─────────────────────────────────────────────────────────
  const startTime = Date.now();
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      dataSources: {
        storage: process.env.DATABASE_URL ? "postgres" : "in-memory",
        nvidiaNim: !!process.env.NVIDIA_API_KEY,
        openRouter: !!process.env.OPENROUTER_API_KEY,
        finnhub: !!process.env.FINNHUB_API_KEY,
      },
      // Circuit-breaker states per upstream provider: "closed" (healthy),
      // "half-open" (recovering), "open" (failing — data is fallback/stale),
      // or null if the provider has not been called yet this session.
      providers: {
        yahoo: getBreakerState("yahoo") ?? null,
        coingecko: getBreakerState("coingecko") ?? null,
        fred: getBreakerState("fred") ?? null,
        web: getBreakerState("generic") ?? null,
      },
    });
  });

  // ─── Finance proxy routes ─────────────────────────────────────────────────
  app.get("/api/finance/sparklines", handleFinance(async () => getIndexSparklines()));

  app.get("/api/finance/tick", handleFinance(async (req) => {
    const symbols = parseSymbols(req.query.symbols);
    if (!symbols.length) return [];
    const quotes = await getQuotes(symbols);
    return quotes.map(({ symbol, price, change, changePercent, quoteSource, isLive, status }) => ({
      symbol,
      price,
      change,
      changePercent,
      quoteSource,
      isLive,
      status,
    }));
  }));

  app.get("/api/finance/quotes", handleFinance(async (req) => {
    const symbols = parseSymbols(req.query.symbols);
    if (!symbols.length) return [];
    return getQuotes(symbols);
  }));

  app.get("/api/finance/ohlcv", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    const range = String(req.query.range || "1Y");
    const interval = String(req.query.interval || "1d") as "5m" | "15m" | "1h" | "1d";
    return getOHLCVSeries(symbol, range, interval);
  }));

  app.get("/api/finance/events", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return { events: await getEventsForSymbol(symbol) };
  }));

  app.get("/api/finance/gainers", handleFinance(async () => getMarketMovers("gainers")));
  app.get("/api/finance/losers", handleFinance(async () => getMarketMovers("losers")));
  app.get("/api/finance/active", handleFinance(async () => getMarketMovers("active")));
  app.get("/api/finance/sentiment", handleFinance(async () => getMarketSentiment()));

  // ─── Symbol config ────────────────────────────────────────────────────────
  app.get("/api/symbols", (_req, res) => {
    res.json(loadSymbolConfig());
  });

  app.post("/api/symbols/reload", (_req, res) => {
    reloadSymbolConfig();
    res.json({ ok: true });
  });

  app.get("/api/finance/social-sentiment", handleFinance(async (req) => {
    const query: Record<string, string> = {};
    if (typeof req.query.symbol === "string") query.symbol = req.query.symbol;
    if (typeof req.query.subreddits === "string") query.subreddits = req.query.subreddits;
    return handleSocialSentimentRequest(query);
  }));

  app.get("/api/finance/sentiment/sources", handleFinance(async () => getSentimentSourceStatuses()));

  app.get("/api/finance/sentiment/source-test", async (req, res) => {
    const subreddit = String(req.query.subreddit || "");
    if (!subreddit) return res.status(400).json({ error: "subreddit required" });
    res.json(await testSentimentSource(subreddit));
  });

  // ─── Social Feed ────────────────────────────────────────────────────────────
  app.get("/api/finance/social/feed", handleFinance(async (req) => {
    const sourcesRaw = String(req.query.sources || '');
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    const useUserTokens = req.query.user_tokens === "true";
    const sources: SocialSourceConfig[] = sourcesRaw
      ? sourcesRaw.split('|').map(s => parseSocialUrl(s)).filter((s): s is SocialSourceConfig => s !== null)
      : [
          { platform: 'reddit', identifier: 'wallstreetbets', displayName: 'r/wallstreetbets', url: 'https://reddit.com/r/wallstreetbets', enabled: true },
          { platform: 'reddit', identifier: 'stocks', displayName: 'r/stocks', url: 'https://reddit.com/r/stocks', enabled: true },
          { platform: 'reddit', identifier: 'CryptoCurrency', displayName: 'r/CryptoCurrency', url: 'https://reddit.com/r/CryptoCurrency', enabled: true },
        ];
    return getSocialFeed(sources, useUserTokens, symbol);
  }));

  app.get("/api/finance/social/sources", handleFinance(async () => {
    return {
      reddit: { configured: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) },
      x: { configured: !!process.env.TWITTER_BEARER_TOKEN },
      truth: { configured: true },
      claude: { configured: !!process.env.ANTHROPIC_API_KEY },
    };
  }));

  // ─── AI Sentiment Tagger ────────────────────────────────────────────────
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI request rate limit exceeded" },
  });

  app.post("/api/ai/sentiment/tag", aiLimiter, async (req, res) => {
    try {
      const { text, title, platform, author, tickers } = req.body as TagSentimentInput;
      if (!text?.trim()) {
        return res.status(400).json({ error: "text is required" });
      }
      const result = await tagPostSentiment({ text, title, platform, author, tickers });
      res.json(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Sentiment tagging failed";
      res.status(502).json({ error: detail });
    }
  });

  app.post("/api/ai/sentiment/batch", aiLimiter, async (req, res) => {
    try {
      const { posts } = req.body as { posts: TagSentimentInput[] };
      if (!Array.isArray(posts) || posts.length === 0) {
        return res.status(400).json({ error: "posts array is required" });
      }
      if (posts.length > 20) {
        return res.status(400).json({ error: "Maximum 20 posts per batch" });
      }
      const results = await tagPostsBatch(posts);
      res.json({ results });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Batch tagging failed";
      res.status(502).json({ error: detail });
    }
  });

  // ─── AI Trade Thesis Generator ─────────────────────────────────────────
  app.post("/api/ai/thesis/generate", aiLimiter, async (req, res) => {
    try {
      const input = req.body as ThesisInput;
      if (!input.symbol?.trim()) {
        return res.status(400).json({ error: "symbol is required" });
      }
      if (!["long", "short"].includes(input.direction)) {
        return res.status(400).json({ error: "direction must be 'long' or 'short'" });
      }
      const result = await generateTradeThesis(input);
      logThesisAudit(result);
      res.json(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Thesis generation failed";
      res.status(502).json({ error: detail });
    }
  });

  app.get("/api/ai/thesis/:symbol", handleFinance(async (req) => {
    const symbol = String(req.params.symbol || "").toUpperCase();
    const currentPrice = req.query.price ? Number(req.query.price) : undefined;

    // Check if re-evaluation is needed
    if (currentPrice && needsReEvaluation(symbol, currentPrice)) {
      // Re-generate in background — return cached for now
      const cached = getCachedThesisForSymbol(symbol);
      if (cached) return cached;
    }

    const cached = getCachedThesisForSymbol(symbol);
    if (cached) return cached;

    return { error: "No thesis generated yet. POST /api/ai/thesis/generate first." };
  }));

  app.get("/api/finance/options-flow", handleFinance(async (req) => {
    const query: Record<string, string> = {};
    if (typeof req.query.symbol === "string") query.symbol = req.query.symbol;
    return handleOptionsFlowRequest(query);
  }));

  app.get("/api/finance/options-sr", handleFinance(async (req) => {
    const query: Record<string, string> = {};
    if (typeof req.query.symbol === "string") query.symbol = req.query.symbol;
    return handleOptionsSRRequest(query);
  }));

  app.get("/api/finance/onchain", handleFinance(async (req) => {
    const query: Record<string, string> = {};
    if (typeof req.query.symbol === "string") query.symbol = req.query.symbol;
    return handleOnChainRequest(query);
  }));

  app.get("/api/finance/news", handleFinance(async (req) => {
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol.toUpperCase() : undefined;
    const query = typeof req.query.query === "string" ? req.query.query : undefined;
    return getNews(symbol, query);
  }));

  app.get("/api/finance/news/read", handleFinance(async (req) => {
    const url = String(req.query.url || "");
    const title = String(req.query.title || "Untitled article");
    const source = String(req.query.source || "Unknown source");
    const publishedAt = String(req.query.publishedAt || new Date(0).toISOString());
    const summary = typeof req.query.summary === "string" ? req.query.summary : undefined;
    const feedProvider = typeof req.query.feedProvider === "string" ? req.query.feedProvider : undefined;

    return getNewsArticle({
      url,
      title,
      source,
      feedProvider,
      publishedAt,
      summary,
    });
  }));

  app.get("/api/finance/news/sources", handleFinance(async () => getNewsSourceStatuses()));

  app.get("/api/finance/news/source-test", async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ error: "url required" });
    res.json(await fetchNewsSourceContent(url));
  });

  app.get("/api/finance/economics", handleFinance(async () => getEconomicsSnapshot()));
  app.get("/api/finance/economics/calendar", handleFinance(async () => getEconomicCalendar()));

  app.get("/api/finance/economics/events/:releaseId", async (req, res) => {
    const releaseId = Number(req.params.releaseId);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: "Invalid releaseId" });
    }
    try {
      res.json(await getEconomicEventDetail(releaseId));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown economics event error";
      res.status(502).json({ error: detail });
    }
  });

  // Unified calendar endpoint
  app.get("/api/finance/calendar/unified", handleFinance(async (req) => {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 14));
    // Get watchlist symbols for corporate events
    const watchlist = await storage.getWatchlist();
    const symbols = watchlist.map(item => item.symbol).filter(Boolean);
    return getUnifiedCalendar(symbols, days);
  }));

  app.get("/api/finance/peers", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return getPeers(symbol);
  }));

  // Instruments — upsert or fetch by symbol
  app.get("/api/finance/instruments", async (req, res) => {
    const symbol = String(req.query.symbol || "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    try {
      if (extendedStorage) {
        const existing = await extendedStorage.getInstrumentBySymbol(symbol);
        if (existing) return res.json({ instrument: existing });
        // Auto-create from market data
        const inst = await extendedStorage.upsertInstrument({
          symbol,
          name: symbol,
          exchange: "UNKNOWN",
          assetClass: "equity",
        });
        return res.json({ instrument: inst });
      }
      // MemStorage fallback — return a stub
      res.json({ instrument: { id: 0, symbol, name: symbol, exchange: "UNKNOWN", assetClass: "equity", isActive: true } });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Instrument lookup failed";
      res.status(500).json({ error: detail });
    }
  });

  app.get("/api/finance/screener", handleFinance(async (req) => {
    return getScreenerResults({
      sector: typeof req.query.sector === "string" ? req.query.sector : undefined,
      minPe: typeof req.query.minPe === "string" ? req.query.minPe : undefined,
      maxPe: typeof req.query.maxPe === "string" ? req.query.maxPe : undefined,
    });
  }));

  app.post("/api/finance/portfolio-analytics", async (req, res) => {
    const parsed = portfolioAnalyticsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const positions = parsed.data.positions.map((position) => ({
        symbol: position.symbol.toUpperCase(),
        shares: position.shares,
        avgCost: position.avgCost,
      }));
      const symbols: string[] = Array.from(new Set(positions.map((position) => position.symbol)));
      const historyEntries = await Promise.all(symbols.map(async (symbol) => ([
        symbol,
        (await getOHLCV(symbol, "1Y", "1d")).map((point) => ({ date: point.date, close: point.close })),
      ] as const)));
      const benchmark = (await getOHLCV("SPY", "1Y", "1d")).map((point) => ({ date: point.date, close: point.close }));

      res.json(calculatePortfolioAnalytics({
        positions,
        histories: Object.fromEntries(historyEntries),
        benchmark,
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown portfolio analytics error";
      res.status(502).json({ error: detail });
    }
  });

  // ─── Fundamental Data ────────────────────────────────────────────────────────
  app.get("/api/finance/fundamentals", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return getFundamentals(symbol);
  }));

  // ─── Options Chain ───────────────────────────────────────────────────────────
  app.get("/api/finance/options", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return getOptionsChain(symbol);
  }));

  // ─── Yield Curve ─────────────────────────────────────────────────────────────
  app.get("/api/finance/yield-curve", handleFinance(async () => {
    return getYieldCurve();
  }));

  // ─── Market Scorecard ────────────────────────────────────────────────────────
  app.get("/api/finance/scorecard", handleFinance(async () => {
    return getScorecardData();
  }));

  // ─── Sector Performance ──────────────────────────────────────────────────────
  app.get("/api/finance/sectors", handleFinance(async () => {
    return getSectorPerformance();
  }));

  // ─── Market Breadth ──────────────────────────────────────────────────────────
  app.get("/api/finance/breadth", handleFinance(async () => {
    return getMarketBreadth();
  }));

  // ─── Credit Spreads ──────────────────────────────────────────────────────────
  app.get("/api/finance/credit", handleFinance(async () => {
    return getCreditSpreads();
  }));

  // ─── VIX Term Structure ──────────────────────────────────────────────────────
  app.get("/api/finance/vix-term", handleFinance(async () => {
    return getVixTermStructure();
  }));

  // ─── Technical Indicators ────────────────────────────────────────────────────
  app.get("/api/finance/technical", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return getTechnicalIndicators(symbol);
  }));

  // ─── Symbol Search ──────────────────────────────────────────────────────────
  app.get("/api/finance/search", handleFinance(async (req) => {
    const query = String(req.query.q || "").toUpperCase();
    if (!query) return [];
    try {
      const { openbbFetch } = await import("./openbbProvider");
      const data = await openbbFetch(`/api/v1/equity/search?query=${query}&provider=sec&limit=5`);
      const results = data?.results ?? [];
      return Array.isArray(results) ? results.map((r: any) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
      })) : [];
    } catch {
      return [];
    }
  }));

  // ─── Watchlist ─────────────────────────────────────────────────────────────
  // ─── Watchlist ─────────────────────────────────────────────────────────────
  app.get("/api/watchlist", async (_req, res) => {
    const items = await storage.getWatchlist();
    res.json(items);
  });

  app.post("/api/watchlist", async (req, res) => {
    const parsed = insertWatchlistItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const item = await storage.addWatchlistItem(parsed.data);
    res.json(item);
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    await storage.removeWatchlistItem(Number(req.params.id));
    res.json({ ok: true });
  });

  // ─── Alerts ────────────────────────────────────────────────────────────────
  app.get("/api/alerts", async (_req, res) => {
    const items = await storage.getAlerts();
    items.sort((a, b) => {
      if (a.triggered !== b.triggered) return Number(a.triggered) - Number(b.triggered);
      const left = a.triggeredAt ?? a.createdAt;
      const right = b.triggeredAt ?? b.createdAt;
      return +new Date(right) - +new Date(left);
    });
    res.json(items);
  });

  app.post("/api/alerts", async (req, res) => {
    const parsed = insertAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const alert = await storage.addAlert(parsed.data);
    res.json(alert);
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    await storage.deleteAlert(Number(req.params.id));
    res.json({ ok: true });
  });

  // ─── Positions ────────────────────────────────────────────────────────────
  app.get("/api/portfolio/positions", async (_req, res) => {
    const positions = await storage.getPositions();
    res.json(positions);
  });

  app.post("/api/portfolio/positions", async (req, res) => {
    const parsed = insertPositionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const position = await storage.addPosition(parsed.data);
    res.json(position);
  });

  app.patch("/api/portfolio/positions/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid position id" });
    }
    const existing = await storage.getPosition(id);
    if (!existing) {
      return res.status(404).json({ error: "Position not found" });
    }
    const position = await storage.updatePosition(id, req.body);
    res.json(position);
  });

  app.delete("/api/portfolio/positions/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid position id" });
    }
    await storage.deletePosition(id);
    res.json({ ok: true });
  });

  app.post("/api/portfolio/positions/:id/close", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid position id" });
    }
    const existing = await storage.getPosition(id);
    if (!existing) {
      return res.status(404).json({ error: "Position not found" });
    }
    await storage.closePosition(id);
    res.json({ ok: true });
  });

  app.get("/api/portfolio/positions/:id/fills", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid position id" });
    }
    const fills = await storage.getPositionFills(id);
    res.json(fills);
  });

  app.post("/api/portfolio/positions/:id/fills", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid position id" });
    }
    const parsed = insertPositionFillSchema.safeParse({ ...req.body, positionId: id });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const fill = await storage.addPositionFill(parsed.data);
    res.json(fill);
  });


  // ─── Chat (AI Agent) ───────────────────────────────────────────────────────
  const NVIDIA_API_URL = process.env.NVIDIA_API_URL ?? "https://integrate.api.nvidia.com/v1/chat/completions";
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? "";
  const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "minimaxai/minimax-m3";

  // Tighter rate limit on chat: 10 requests per minute (each call hits the LLM API).
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Chat rate limit exceeded — wait a moment before sending another message." },
  });
  app.use("/api/chat", chatLimiter);

  app.get("/api/chat", async (_req, res) => {
    const msgs = await storage.getChatMessages();
    res.json(msgs);
  });

  app.post("/api/chat", async (req, res) => {
    if (!NVIDIA_API_KEY) {
      return res.status(503).json({ error: "AI agent not configured — set NVIDIA_API_KEY" });
    }

    const { message, skill, symbol, view, quote, technicals } = req.body as {
      message: string;
      skill?: string;
      symbol?: string;
      view?: string;
      quote?: { price: number; changePercent: number; volume: number };
      technicals?: { rsi14: number | null; macd: number | null; vwap: number | null; support: number | null; resistance: number | null };
    };
    if (!message?.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    await storage.addChatMessage({ role: "user", content: message });
    const history = await storage.getChatMessages();
    const chatMessages = history
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    // Build system prompt with runtime context
    const ctx: PromptContext = {};
    if (symbol) ctx.symbol = symbol;
    if (view) ctx.view = view;
    if (quote) ctx.quote = quote;
    if (technicals) ctx.technicals = technicals;
    const systemPrompt = buildSystemPrompt(skill, Object.keys(ctx).length > 0 ? ctx : undefined);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullContent = "";
    const MAX_TOOL_ROUNDS = 5;

    try {
      // Tool-calling loop: keep going until we get a text response
      const messages: Array<{ role: string; content?: string; tool_calls?: any[]; tool_call_id?: string; name?: string }> = [
        { role: "system", content: systemPrompt },
        ...chatMessages,
      ];
      const toolSchemas = getToolSchemas();

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await axios.post(NVIDIA_API_URL, {
          model: NVIDIA_MODEL,
          messages,
          tools: toolSchemas.length > 0 ? toolSchemas : undefined,
          max_tokens: 8192,
          temperature: 1.0,
          top_p: 0.95,
        }, {
          headers: {
            "Authorization": `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
          },
        });

        const choice = response.data?.choices?.[0];
        const assistantMsg = choice?.message;

        if (!assistantMsg) break;

        // Check if the model wants to call tools
        if (assistantMsg.tool_calls?.length > 0) {
          // Add the assistant message with tool calls to history
          messages.push({ role: "assistant", content: assistantMsg.content ?? undefined, tool_calls: assistantMsg.tool_calls });

          // Execute each tool call
          for (const tc of assistantMsg.tool_calls) {
            const toolName = tc.function?.name;
            const toolArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
            const tool = getToolByName(toolName);

            let toolResult: string;
            if (tool) {
              try {
                toolResult = await tool.execute(toolArgs);
              } catch (e) {
                toolResult = JSON.stringify({ error: `Tool ${toolName} failed: ${e}` });
              }
            } else {
              toolResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
            }

            // Send tool result back to the model
            messages.push({ role: "tool", content: toolResult, tool_call_id: tc.id, name: toolName });
          }

          // Continue the loop for the next model response
          continue;
        }

        // No tool calls — this is the final text response
        if (assistantMsg.content) {
          fullContent = assistantMsg.content;
          // Stream the final response to the client
          const words = fullContent.split(/(\s+)/);
          for (const word of words) {
            res.write(`data: ${JSON.stringify({ text: word })}\n\n`);
          }
        }
        break;
      }

      await storage.addChatMessage({ role: "assistant", content: fullContent });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      console.error("NVIDIA API error:", err);
      const msg = "AI agent temporarily unavailable. Please try again.";
      await storage.addChatMessage({ role: "assistant", content: msg });
      res.write(`data: ${JSON.stringify({ text: msg, done: true })}\n\n`);
      res.end();
    }
  });

  app.delete("/api/chat", async (_req, res) => {
    await storage.clearChatMessages();
    res.json({ ok: true });
  });

  // ─── Chat Skills (from prompts.json) ───────────────────────────────────
  app.get("/api/chat/skills", (_req, res) => {
    res.json(getAllSkills());
  });

  // ─── Agent Skills CRUD ────────────────────────────────────────────────────
  app.get("/api/chat/skills/all", async (_req, res) => {
    const skills = await storage.getAgentSkills();
    res.json(skills);
  });

  app.post("/api/chat/skills", async (req, res) => {
    const parsed = insertAgentSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const skill = await storage.addAgentSkill(parsed.data);
      // Refresh merged skills in promptConfig
      const allSkills = await storage.getAgentSkills();
      const dbMap: Record<string, { label: string; description: string; systemPrompt: string; defaultPrompts: string[] }> = {};
      for (const s of allSkills) {
        dbMap[s.skillId] = {
          label: s.label,
          description: s.description,
          systemPrompt: s.systemPrompt,
          defaultPrompts: JSON.parse(s.defaultPrompts || "[]"),
        };
      }
      setDbSkills(dbMap);
      res.json(skill);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to create skill";
      res.status(500).json({ error: detail });
    }
  });

  app.patch("/api/chat/skills/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid skill id" });
    }
    const parsed = insertAgentSkillSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const skill = await storage.updateAgentSkill(id, parsed.data);
      const allSkills = await storage.getAgentSkills();
      const dbMap: Record<string, { label: string; description: string; systemPrompt: string; defaultPrompts: string[] }> = {};
      for (const s of allSkills) {
        dbMap[s.skillId] = {
          label: s.label,
          description: s.description,
          systemPrompt: s.systemPrompt,
          defaultPrompts: JSON.parse(s.defaultPrompts || "[]"),
        };
      }
      setDbSkills(dbMap);
      res.json(skill);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to update skill";
      res.status(500).json({ error: detail });
    }
  });

  app.delete("/api/chat/skills/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid skill id" });
    }
    try {
      await storage.deleteAgentSkill(id);
      const allSkills = await storage.getAgentSkills();
      const dbMap: Record<string, { label: string; description: string; systemPrompt: string; defaultPrompts: string[] }> = {};
      for (const s of allSkills) {
        dbMap[s.skillId] = {
          label: s.label,
          description: s.description,
          systemPrompt: s.systemPrompt,
          defaultPrompts: JSON.parse(s.defaultPrompts || "[]"),
        };
      }
      setDbSkills(dbMap);
      res.json({ ok: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to delete skill";
      res.status(500).json({ error: detail });
    }
  });

  app.post("/api/config/test-nvidia", async (req, res) => {
    const { key } = req.body as { key?: string };
    if (!key) {
      return res.json({ ok: false, error: "No key provided" });
    }
    try {
      const response = await axios.post(
        NVIDIA_API_URL,
        {
          model: NVIDIA_MODEL,
          messages: [{ role: "user", content: "Say hi" }],
          max_tokens: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      res.json({ ok: true, model: response.data?.model });
    } catch (err: any) {
      const status = err.response?.status ?? 0;
      const msg = err.response?.data?.error?.message ?? err.message;
      res.json({ ok: false, status, error: msg });
    }
  });

  // ─── OAuth App Credentials ─────────────────────────────────────────────────

  app.get("/api/oauth/credentials", (_req, res) => {
    const providers = Object.keys(OAUTH_PROVIDERS);
    const result = providers.map(p => ({
      provider: p,
      configured: hasAppCredentials(p),
    }));
    res.json(result);
  });

  app.post("/api/oauth/credentials/:provider", (req, res) => {
    try {
      const { provider } = req.params;
      if (!OAUTH_PROVIDERS[provider]) {
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
      }
      const { clientId, clientSecret } = req.body;
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "clientId and clientSecret are required" });
      }
      setAppCredentials(provider, String(clientId), String(clientSecret));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── OAuth Social Account Routes ────────────────────────────────────────────

  app.get("/api/oauth/authorize", (req, res) => {
    try {
      const provider = String(req.query.provider || "");
      if (!OAUTH_PROVIDERS[provider]) {
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
      }
      const { authUrl } = generateOAuthState(provider);
      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/oauth/callback/:provider", async (req, res) => {
    const { provider } = req.params;
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`/#/settings?oauth_error=${provider}`);
      }

      if (!code || !state || !OAUTH_PROVIDERS[provider]) {
        return res.redirect(`/#/settings?oauth_error=invalid_request`);
      }

      const oauthState = validateOAuthState(String(state));
      if (!oauthState || oauthState.provider !== provider) {
        return res.redirect(`/#/settings?oauth_error=invalid_state`);
      }

      const tokens = await exchangeCodeForTokens(provider, String(code), oauthState.codeVerifier);
      const userInfo = await fetchUserInfo(provider, tokens.accessToken);

      await extendedStorage!.upsertOauthConnection({
        provider,
        providerUserId: userInfo.userId,
        displayName: userInfo.displayName,
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
      });

      res.redirect(`/#/settings?oauth_success=${provider}`);
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      res.redirect(`/#/settings?oauth_error=${provider}`);
    }
  });

  app.get("/api/oauth/connections", async (_req, res) => {
    try {
      const connections = await extendedStorage!.getAllOauthConnections();
      const safe = connections.map(c => ({
        provider: c.provider,
        displayName: c.displayName,
        scope: c.scope,
        tokenExpiresAt: c.tokenExpiresAt,
        createdAt: c.createdAt,
      }));
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/oauth/connections/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      if (!OAUTH_PROVIDERS[provider]) {
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
      }
      await extendedStorage!.deleteOauthConnection(provider);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/oauth/test/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const conn = await extendedStorage!.getOauthConnection(provider);
      if (!conn) {
        return res.status(404).json({ error: "Not connected" });
      }

      let accessToken = decryptToken(conn.accessToken);

      // Check if token needs refresh
      if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date()) {
        if (conn.refreshToken) {
          const tokens = await refreshAccessToken(provider, decryptToken(conn.refreshToken));
          accessToken = tokens.accessToken;
          await extendedStorage!.upsertOauthConnection({
            provider,
            providerUserId: conn.providerUserId,
            displayName: conn.displayName,
            accessToken: encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt ?? null,
            scope: tokens.scope ?? conn.scope,
          });
        } else {
          return res.status(401).json({ error: "Token expired and no refresh token" });
        }
      }

      // Test by fetching user info
      const userInfo = await fetchUserInfo(provider, accessToken);
      res.json({ ok: true, displayName: userInfo.displayName });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Discord Bot Routes ──────────────────────────────────────────────────────
  app.use(discordRouter);

  // ─── Realtime client WebSocket (live quote deltas) ─────────────────────────
  if (bus) {
    const wss = new WebSocketServer({ noServer: true });
    const clients = new Set<WebSocket>();
    const PING_INTERVAL_MS = 30_000;

    // Periodic ping to detect dead connections
    const pingInterval = setInterval(() => {
      for (const ws of Array.from(clients)) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch { /* ignore */ }
        }
      }
    }, PING_INTERVAL_MS);

    wss.on("connection", (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify({ type: "snapshot", quotes: bus.getAllQuotes() }));
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
    });

    // Only claim /api/ws upgrades. Leave all others (e.g. Vite HMR on
    // /vite-hmr) untouched so they reach their own handler.
    httpServer.on("upgrade", (req, socket, head) => {
      const pathname = req.url ? req.url.split("?")[0] : "";
      if (pathname !== "/api/ws") return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    bus.subscribe((update) => {
      const payload = JSON.stringify({
        type: "tick",
        symbol: update.symbol,
        price: update.price,
        ts: update.ts,
      });
      for (const client of Array.from(clients)) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    });

    // Clean up interval on server shutdown
    httpServer.on("close", () => clearInterval(pingInterval));
  }
}
