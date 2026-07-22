import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { storage } from "./storage";
import { insertWatchlistItemSchema, insertAlertSchema } from "@shared/schema";
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
} from "./marketData";
import { handleSocialSentimentRequest, getSentimentSourceStatuses, testSentimentSource } from "./socialSentiment";
import { getSocialFeed, parseSocialUrl, type SocialSourceConfig } from "./socialFeed";
import { handleOptionsFlowRequest } from "./optionsFlow";
import { handleOnChainRequest } from "./onchain";
import { getEconomicCalendar, getEconomicEventDetail } from "./economicsData";
import { calculatePortfolioAnalytics } from "./portfolioAnalytics";
import {
  getSectorPerformance,
  getMarketBreadth,
  getCreditSpreads,
  getVixTermStructure,
  getTechnicalIndicators,
  getScorecardData,
} from "./marketScorecard";

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
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includeTimestamps=true`;
      const response = await fetch(url, { headers: { "User-Agent": "blmtrm/1.0" } });
      if (!response.ok) return { events: [] };
      const data = await response.json();
      const timestamps: number[] = data?.chart?.result?.[0]?.timestamp ?? [];
      const events: Array<{ date: string; type: string; label: string }> = [];
      const calendarUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
      try {
        const calRes = await fetch(calendarUrl, { headers: { "User-Agent": "blmtrm/1.0" } });
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
      return { events };
    } catch {
      return { events: [] };
    }
  }));

  app.get("/api/finance/gainers", handleFinance(async () => getMarketMovers("gainers")));
  app.get("/api/finance/losers", handleFinance(async () => getMarketMovers("losers")));
  app.get("/api/finance/active", handleFinance(async () => getMarketMovers("active")));
  app.get("/api/finance/sentiment", handleFinance(async () => getMarketSentiment()));

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
    const sources: SocialSourceConfig[] = sourcesRaw
      ? sourcesRaw.split('|').map(s => parseSocialUrl(s)).filter((s): s is SocialSourceConfig => s !== null)
      : [
          { platform: 'reddit', identifier: 'wallstreetbets', displayName: 'r/wallstreetbets', url: 'https://reddit.com/r/wallstreetbets', enabled: true },
          { platform: 'reddit', identifier: 'stocks', displayName: 'r/stocks', url: 'https://reddit.com/r/stocks', enabled: true },
          { platform: 'reddit', identifier: 'CryptoCurrency', displayName: 'r/CryptoCurrency', url: 'https://reddit.com/r/CryptoCurrency', enabled: true },
        ];
    return getSocialFeed(sources);
  }));

  app.get("/api/finance/social/sources", handleFinance(async () => {
    return {
      reddit: { configured: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) },
      x: { configured: !!process.env.TWITTER_BEARER_TOKEN },
      truth: { configured: true },
    };
  }));

  app.get("/api/finance/options-flow", handleFinance(async (req) => {
    const query: Record<string, string> = {};
    if (typeof req.query.symbol === "string") query.symbol = req.query.symbol;
    return handleOptionsFlowRequest(query);
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

  app.get("/api/finance/peers", handleFinance(async (req) => {
    const symbol = String(req.query.symbol || "AAPL").toUpperCase();
    return getPeers(symbol);
  }));

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

  // ─── Chat (AI Agent) ───────────────────────────────────────────────────────
  const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
  const NVIDIA_API_KEY = "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";

  app.get("/api/chat", async (_req, res) => {
    const msgs = await storage.getChatMessages();
    res.json(msgs);
  });

  app.post("/api/chat", async (req, res) => {
    const { message, skill } = req.body as { message: string; skill?: string };
    if (!message?.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    await storage.addChatMessage({ role: "user", content: message });
    const history = await storage.getChatMessages();
    const chatMessages = history
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    // Build system prompt based on skill
    const systemPrompt = buildSystemPrompt(skill);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullContent = "";

    try {
      const response = await axios.post(NVIDIA_API_URL, {
        model: "minimaxai/minimax-m3",
        messages: [
          { role: "system", content: systemPrompt },
          ...chatMessages,
        ],
        max_tokens: 8192,
        temperature: 1.0,
        top_p: 0.95,
        stream: true,
      }, {
        headers: {
          "Authorization": `Bearer ${NVIDIA_API_KEY}`,
          "Accept": "text/event-stream",
          "Content-Type": "application/json",
        },
        responseType: "stream",
      });

      response.data.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                const text = data.choices[0].delta.content;
                fullContent += text;
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch {}
          }
        }
      });

      response.data.on("end", async () => {
        await storage.addChatMessage({ role: "assistant", content: fullContent });
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      });

      response.data.on("error", async (err: Error) => {
        console.error("NVIDIA API stream error:", err);
        const msg = "AI agent temporarily unavailable. Please try again.";
        await storage.addChatMessage({ role: "assistant", content: msg });
        res.write(`data: ${JSON.stringify({ text: msg, done: true })}\n\n`);
        res.end();
      });
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

  app.post("/api/config/test-nvidia", async (req, res) => {
    const { key } = req.body as { key?: string };
    if (!key) {
      return res.json({ ok: false, error: "No key provided" });
    }
    try {
      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: "minimaxai/minimax-m3",
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

  // ─── Realtime client WebSocket (live quote deltas) ─────────────────────────
  if (bus) {
    const wss = new WebSocketServer({ noServer: true });
    const clients = new Set<WebSocket>();

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
  }
}

function buildSystemPrompt(skill?: string): string {
  const basePrompt = `You are BLMTRM AI, an autonomous financial intelligence agent embedded in a hacker Bloomberg Terminal clone built in 2026. You have deep expertise in:
- Equity markets, fixed income, commodities, FX, crypto  
- Technical analysis: RSI, MACD, Bollinger Bands, moving averages, support/resistance levels
- Fundamental analysis: P/E, EV/EBITDA, DCF valuation, earnings quality, margin analysis
- Macro economics: Fed policy, yield curves, inflation dynamics, GDP, labor markets
- Market microstructure, order flow, liquidity, options flows

AVAILABLE DATA IN THE TERMINAL:
- Market Scorecard: Unified snapshot of S&P 500, Nasdaq 100, Russell 2000, FTSE, DAX, Nikkei, DXY, Gold, WTI, Silver, Copper, Bitcoin, VIX, 10Y/30Y yields
- Sector Performance: GICS sector ETFs (XLK, XLV, XLF, XLE, XLI, XLC, XLP, XLU, XLRE, XLB, XLY) with 1D/WOW/MOM/YTD changes and relative strength vs SPX
- Market Breadth: Advance/decline ratio, % stocks above 200dma and 50dma, new highs/lows
- Credit Spreads: IG OAS, HY OAS with percentile levels and trend (widening/tightening/stable)
- VIX Term Structure: VIX spot, 2M, 3M with curve shape (contango/backwardation)
- Technical Indicators: RSI, MACD, Bollinger Bands, ATR, OBV, VWAP, support/resistance
- Yield Curve: Full 11-tenor curve with 2s10s, 3M10Y spreads
- Economic Calendar: Upcoming CPI, NFP, PMI, GDP releases

Respond like a seasoned Goldman/Citadel analyst — precise, direct, data-oriented. Use terminal-style formatting with tables and bullets. Format numbers properly: $1.2B, 4.5%, 120bps. Be concise and actionable. Reference specific panels and data points when making recommendations.`;

  const skillPrompts: Record<string, string> = {
    analyst: `
EQUITY ANALYST MODE:
- Always include: P/E, EV/EBITDA, DCF fair value estimate
- Bull/bear case with probability weights
- Key risks and catalysts
- Technical levels: RSI, MACD, Bollinger Bands, support/resistance
- Use IntelPanel signals (50d/200d MA, 52-week range position)
- Reference Sector Performance for sector context
- Format comparisons as tables`,

    macro: `
MACRO STRATEGIST MODE:
- Fed policy implications and rate path
- Yield curve signals: 2s10s spread, 3M10Y spread, curve shape
- Sector rotation recommendations using Sector Performance panel
- Global macro themes (China, Europe, EM)
- Cross-asset correlations
- Reference Credit Spreads (IG/HY OAS, percentile, trend)
- Reference VIX Term Structure (spot, curve shape)
- Use Market Scorecard for multi-asset overview`,

    quant: `
QUANT RESEARCHER MODE:
- Statistical analysis and backtesting results
- Factor exposure and attribution
- Risk metrics: VaR, Sharpe, Sortino, max drawdown
- Volatility analysis: VIX spot vs term structure
- Options strategies based on implied vol
- Market breadth: A/D ratio, % above DMA, new highs/lows
- Use precise numbers and confidence intervals
- Format data as tables`,

    crypto: `
CRYPTO ANALYST MODE:
- On-chain metrics: exchange flows, whale activity, NVT ratio
- Technical levels for BTC, ETH, and top alts
- DeFi yields and liquidity analysis
- Regulatory developments and market impact
- Network fundamentals (hash rate, active addresses)
- Cross-asset correlation with traditional markets
- Reference Scorecard for BTC vs equity indices`,
  };

  const skillSuffix = skill && skillPrompts[skill] ? skillPrompts[skill] : "";
  return basePrompt + skillSuffix;
}
