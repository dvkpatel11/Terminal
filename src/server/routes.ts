import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWatchlistItemSchema, insertAlertSchema } from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// ─── Finance API client helpers ────────────────────────────────────────────
// We call the finance connector REST endpoints directly from the backend
// so the API key never leaks to the browser.

const FINANCE_BASE = process.env.FINANCE_API_BASE || "https://api.perplexity.ai";
const FINANCE_KEY  = process.env.FINANCE_API_KEY  || process.env.PPLX_API_KEY || "";

// Build mock/fallback data when live API unavailable
function mockQuote(symbol: string, idx: number = 0) {
  const prices: Record<string, { p: number; n: string; s?: string }> = {
    "AAPL": { p: 213.50, n: "Apple Inc.", s: "Technology" },
    "MSFT": { p: 415.20, n: "Microsoft Corp.", s: "Technology" },
    "NVDA": { p: 875.40, n: "NVIDIA Corp.", s: "Technology" },
    "TSLA": { p: 248.60, n: "Tesla Inc.", s: "Consumer Cyclical" },
    "GOOGL": { p: 178.90, n: "Alphabet Inc.", s: "Communication Services" },
    "AMZN": { p: 198.75, n: "Amazon.com Inc.", s: "Consumer Cyclical" },
    "META": { p: 555.30, n: "Meta Platforms", s: "Communication Services" },
    "BRK-B": { p: 456.00, n: "Berkshire Hathaway", s: "Financial Services" },
    "JPM": { p: 234.15, n: "JPMorgan Chase", s: "Financial Services" },
    "BAC": { p: 44.20, n: "Bank of America", s: "Financial Services" },
    "GS": { p: 521.80, n: "Goldman Sachs", s: "Financial Services" },
    "V": { p: 298.40, n: "Visa Inc.", s: "Financial Services" },
    "XOM": { p: 118.90, n: "ExxonMobil", s: "Energy" },
    "SPY": { p: 581.20, n: "SPDR S&P 500 ETF", s: "ETF" },
    "QQQ": { p: 492.40, n: "Invesco QQQ Trust", s: "ETF" },
    "^GSPC": { p: 5780.50, n: "S&P 500", s: "Index" },
    "^DJI": { p: 43250.00, n: "Dow Jones", s: "Index" },
    "^IXIC": { p: 18450.00, n: "NASDAQ Composite", s: "Index" },
    "^RUT": { p: 2180.50, n: "Russell 2000", s: "Index" },
    "^VIX": { p: 17.45, n: "CBOE Volatility Index", s: "Index" },
    "GC=F": { p: 2985.50, n: "Gold Futures", s: "Commodity" },
    "CL=F": { p: 68.40, n: "Crude Oil WTI", s: "Commodity" },
    "BTC-USD": { p: 84500.00, n: "Bitcoin USD", s: "Crypto" },
    "ETH-USD": { p: 3250.00, n: "Ethereum USD", s: "Crypto" },
  };

  const info = prices[symbol] || { p: 100 + idx * 12.5, n: symbol, s: "Technology" };
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
  const changePct = ((seed % 20) - 10) * 0.15; // -1.5% to +1.5%
  const change = info.p * changePct / 100;
  const randomVolume = (seed % 100 + 50) * 1_000_000;
  const randomMcap = info.p * (seed % 5000 + 1000) * 1_000_000;

  return {
    symbol,
    name: info.n,
    price: info.p,
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePct.toFixed(2)),
    volume: randomVolume,
    marketCap: randomMcap,
    pe: symbol.startsWith("^") || symbol.endsWith("=F") || symbol.endsWith("-USD") ? null : parseFloat(((seed % 30) + 12).toFixed(1)),
    eps: symbol.startsWith("^") ? null : parseFloat(((info.p / 25)).toFixed(2)),
    high52: parseFloat((info.p * 1.25).toFixed(2)),
    low52: parseFloat((info.p * 0.72).toFixed(2)),
    open: parseFloat((info.p - change * 0.3).toFixed(2)),
    previousClose: parseFloat((info.p - change).toFixed(2)),
    dayHigh: parseFloat((info.p * 1.008).toFixed(2)),
    dayLow: parseFloat((info.p * 0.993).toFixed(2)),
    avgVolume: Math.floor(randomVolume * 1.1),
    exchange: symbol.startsWith("^") ? "INDEX" : "NASDAQ",
    sector: info.s,
  };
}

function generateOHLCV(symbol: string, range: string = "1Y") {
  const days = range === "1D" ? 1 : range === "5D" ? 5 : range === "1M" ? 30 : range === "3M" ? 90 : range === "6M" ? 180 : range === "2Y" ? 730 : 365;
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const basePrice = (seed % 400) + 80;
  const bars: any[] = [];
  let price = basePrice;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends

    const change = (Math.random() - 0.48) * price * 0.025;
    price = Math.max(price + change, 10);

    const open = parseFloat((price - change * 0.3).toFixed(2));
    const close = parseFloat(price.toFixed(2));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.01)).toFixed(2));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.01)).toFixed(2));
    const volume = Math.floor((seed % 50 + 30) * 1_000_000 * (0.7 + Math.random() * 0.6));

    bars.push({ date: date.toISOString().split("T")[0], open, high, low, close, volume });
  }
  return bars;
}

// ─── Route Registration ─────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {

  // ─── Finance proxy routes ─────────────────────────────────────────────────

  // Index sparklines — intraday data for the 5 major indices
  app.get("/api/finance/sparklines", async (_req, res) => {
    const indexSymbols = ["^GSPC", "^DJI", "^IXIC", "^RUT", "^VIX"];
    const result: Record<string, number[]> = {};
    for (const sym of indexSymbols) {
      const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const base = mockQuote(sym).price;
      const points: number[] = [];
      let v = base * 0.985; // start a bit below current
      for (let i = 0; i < 78; i++) { // ~5 min intervals from 9:30 to 4:00
        v = Math.max(v + (Math.random() - 0.48) * base * 0.002, base * 0.92);
        points.push(parseFloat(v.toFixed(2)));
      }
      // Ensure last point matches current price
      points[points.length - 1] = base;
      result[sym] = points;
    }
    res.json(result);
  });

  // Live tick — simulates real-time price updates (small random walks)
  app.get("/api/finance/tick", async (req, res) => {
    const symbols = String(req.query.symbols || "").split(",").filter(Boolean);
    if (!symbols.length) return res.json([]);
    const data = symbols.map(sym => {
      const base = mockQuote(sym);
      // Apply a tiny random walk to simulate live price
      const tickPct = (Math.random() - 0.5) * 0.002; // ±0.1%
      const newPrice = parseFloat((base.price * (1 + tickPct)).toFixed(2));
      const totalChange = parseFloat((newPrice - base.previousClose).toFixed(2));
      const totalPct = parseFloat(((totalChange / base.previousClose) * 100).toFixed(2));
      return { symbol: sym, price: newPrice, change: totalChange, changePercent: totalPct };
    });
    res.json(data);
  });

  app.get("/api/finance/quotes", async (req, res) => {
    const symbols = String(req.query.symbols || "").split(",").filter(Boolean);
    if (!symbols.length) return res.json([]);
    const data = symbols.map((s, i) => mockQuote(s.trim(), i));
    res.json(data);
  });

  app.get("/api/finance/ohlcv", async (req, res) => {
    const symbol = String(req.query.symbol || "AAPL");
    const range = String(req.query.range || "1Y");
    res.json(generateOHLCV(symbol, range));
  });

  app.get("/api/finance/gainers", async (_req, res) => {
    const syms = ["NVDA","META","AMZN","MSFT","TSLA","AMD","NFLX","UBER","SHOP","SNOW"];
    res.json(syms.map((s, i) => {
      const q = mockQuote(s, i);
      q.changePercent = parseFloat((Math.random() * 4 + 1.5).toFixed(2));
      q.change = parseFloat((q.price * q.changePercent / 100).toFixed(2));
      return q;
    }));
  });

  app.get("/api/finance/losers", async (_req, res) => {
    const syms = ["PYPL","INTC","BIDU","DIS","BA","NIO","LCID","RIVN","PARA","WBD"];
    res.json(syms.map((s, i) => {
      const q = mockQuote(s, i);
      q.changePercent = parseFloat((-Math.random() * 5 - 1.2).toFixed(2));
      q.change = parseFloat((q.price * q.changePercent / 100).toFixed(2));
      return q;
    }));
  });

  app.get("/api/finance/active", async (_req, res) => {
    const syms = ["AAPL","TSLA","NVDA","SPY","QQQ","AMZN","MSFT","AMD","GOOGL","META"];
    res.json(syms.map((s, i) => {
      const q = mockQuote(s, i);
      q.volume = Math.floor(q.volume * (2 + Math.random() * 3));
      return q;
    }));
  });

  app.get("/api/finance/sentiment", async (_req, res) => {
    const sentiments = ["Bullish","Neutral","Bearish"];
    const pick = sentiments[Math.floor(Math.random() * 3)];
    res.json({
      sentiment: pick,
      score: Math.random() * 100,
      bullish: Math.floor(Math.random() * 40 + 30),
      bearish: Math.floor(Math.random() * 30 + 20),
    });
  });

  app.get("/api/finance/news", async (req, res) => {
    const symbol = req.query.symbol as string | undefined;
    const headlines = symbol ? [
      { title: `${symbol} Reports Strong Q4 Earnings, Beats Estimates`, summary: "The company reported earnings per share above analyst consensus, driven by robust demand in cloud and AI segments.", url: "#", source: "Bloomberg", publishedAt: new Date(Date.now() - 3600000).toISOString(), sentiment: "positive" },
      { title: `${symbol} Announces Strategic Partnership with Major Tech Player`, summary: "The deal is expected to accelerate expansion into enterprise market verticals, adding significant ARR.", url: "#", source: "Reuters", publishedAt: new Date(Date.now() - 7200000).toISOString(), sentiment: "positive" },
      { title: `Analyst Upgrades ${symbol} to Buy, Raises Price Target`, summary: "Following the earnings beat and improving macro environment, the firm raised their 12-month price target to reflect stronger growth outlook.", url: "#", source: "CNBC", publishedAt: new Date(Date.now() - 14400000).toISOString(), sentiment: "positive" },
      { title: `${symbol} Faces Regulatory Scrutiny in EU Markets`, summary: "European regulators have opened a preliminary investigation into the company's market practices, adding uncertainty.", url: "#", source: "FT", publishedAt: new Date(Date.now() - 28800000).toISOString(), sentiment: "negative" },
      { title: `${symbol} Insider Selling Raises Questions Among Investors`, summary: "Several C-suite executives exercised stock options and sold shares worth $45M over the past two weeks.", url: "#", source: "WSJ", publishedAt: new Date(Date.now() - 43200000).toISOString(), sentiment: "neutral" },
    ] : [
      { title: "Fed Holds Rates Steady, Powell Signals Cautious Approach to Cuts", summary: "The Federal Reserve kept interest rates unchanged at 5.25-5.50%, with Chair Powell indicating the committee needs more confidence before reducing borrowing costs.", url: "#", source: "Bloomberg", publishedAt: new Date(Date.now() - 1800000).toISOString(), sentiment: "neutral" },
      { title: "S&P 500 Hits New All-Time High on Tech Rally", summary: "Major indices closed at record levels as artificial intelligence optimism drove gains across semiconductor and software sectors.", url: "#", source: "Reuters", publishedAt: new Date(Date.now() - 3600000).toISOString(), sentiment: "positive" },
      { title: "Treasury Yields Rise on Stronger-Than-Expected Jobs Data", summary: "The 10-year Treasury yield climbed 8bps to 4.52% after the January payrolls report showed 353K jobs added, far above the 185K consensus estimate.", url: "#", source: "CNBC", publishedAt: new Date(Date.now() - 5400000).toISOString(), sentiment: "negative" },
      { title: "Oil Falls 2% as OPEC+ Production Concerns Mount", summary: "Crude prices declined after reports suggested some OPEC+ members may be considering easing production cuts amid softer global demand forecasts.", url: "#", source: "FT", publishedAt: new Date(Date.now() - 7200000).toISOString(), sentiment: "negative" },
      { title: "Nvidia's AI Dominance Faces New Challengers in 2026", summary: "Custom silicon from Amazon, Google, and Microsoft poses growing competitive threat to Nvidia's data center GPU monopoly, analysts warn.", url: "#", source: "WSJ", publishedAt: new Date(Date.now() - 10800000).toISOString(), sentiment: "negative" },
      { title: "Bitcoin Surges Past $84K as ETF Inflows Accelerate", summary: "Digital assets rallied with Bitcoin reaching new monthly highs as spot ETF products saw $2.1B in weekly inflows, the largest since their launch.", url: "#", source: "CoinDesk", publishedAt: new Date(Date.now() - 14400000).toISOString(), sentiment: "positive" },
    ];
    res.json(headlines);
  });

  app.get("/api/finance/economics", async (_req, res) => {
    res.json({
      gdp: { value: 2.5, prev: 3.1, label: "US GDP Growth (QoQ)", unit: "%" },
      cpi: { value: 3.1, prev: 3.4, label: "CPI Inflation (YoY)", unit: "%" },
      unemployment: { value: 3.7, prev: 3.9, label: "Unemployment Rate", unit: "%" },
      fedFunds: { value: 5.33, prev: 5.50, label: "Fed Funds Rate", unit: "%" },
      t10y: { value: 4.52, prev: 4.44, label: "10Y Treasury Yield", unit: "%" },
      t2y: { value: 4.89, prev: 4.91, label: "2Y Treasury Yield", unit: "%" },
      t30y: { value: 4.72, prev: 4.68, label: "30Y Treasury Yield", unit: "%" },
      dolllarIndex: { value: 104.5, prev: 102.8, label: "USD Index (DXY)", unit: "" },
      eurUsd: { value: 1.0820, prev: 1.0950, label: "EUR/USD", unit: "" },
      gbpUsd: { value: 1.2650, prev: 1.2780, label: "GBP/USD", unit: "" },
      usdJpy: { value: 149.80, prev: 148.20, label: "USD/JPY", unit: "" },
      gold: { value: 2985.50, prev: 2950.00, label: "Gold ($/oz)", unit: "" },
      oil: { value: 68.40, prev: 71.20, label: "WTI Crude ($/bbl)", unit: "" },
    });
  });

  app.get("/api/finance/peers", async (req, res) => {
    const symbol = String(req.query.symbol || "AAPL");
    const peerMap: Record<string, string[]> = {
      "AAPL": ["MSFT","GOOGL","META","AMZN","NVDA"],
      "MSFT": ["AAPL","GOOGL","AMZN","CRM","ORCL"],
      "NVDA": ["AMD","INTC","QCOM","MRVL","AVGO"],
      "TSLA": ["RIVN","LCID","NIO","GM","F"],
      "META": ["SNAP","PINS","GOOGL","TWTR","RDDT"],
      "GOOGL": ["META","MSFT","AAPL","AMZN","BIDU"],
      "AMZN": ["MSFT","GOOGL","ALIBABA","WMT","TGT"],
      "JPM": ["BAC","GS","MS","WFC","C"],
      "XOM": ["CVX","COP","SLB","BP","SHEL"],
    };
    const peers = (peerMap[symbol] || ["AAPL","MSFT","GOOGL","AMZN","META"]).map((s, i) => mockQuote(s, i));
    res.json(peers);
  });

  app.get("/api/finance/screener", async (req, res) => {
    const sector = req.query.sector as string | undefined;
    const allSymbols = [
      "AAPL","MSFT","NVDA","TSLA","GOOGL","AMZN","META","BRK-B",
      "JPM","BAC","GS","V","MA","XOM","CVX","UNH","JNJ","PFE",
      "KO","PEP","WMT","HD","DIS","NFLX","CRM","ADBE","PYPL",
      "AMD","INTC","QCOM","TXN","AVGO","MU","AMAT","ASML",
    ];
    let results = allSymbols.map((s, i) => mockQuote(s, i));
    if (sector && sector !== "All") {
      results = results.filter(q => q.sector === sector);
    }
    const minPe = req.query.minPe ? parseFloat(String(req.query.minPe)) : null;
    const maxPe = req.query.maxPe ? parseFloat(String(req.query.maxPe)) : null;
    if (minPe !== null) results = results.filter(q => q.pe !== null && q.pe >= minPe);
    if (maxPe !== null) results = results.filter(q => q.pe !== null && q.pe <= maxPe);
    res.json(results);
  });

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
  app.get("/api/chat", async (_req, res) => {
    const msgs = await storage.getChatMessages();
    res.json(msgs);
  });

  app.post("/api/chat", async (req, res) => {
    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    await storage.addChatMessage({ role: "user", content: message });
    const history = await storage.getChatMessages();
    const claudeMessages = history
      .slice(-20)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullContent = "";

    try {
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are BLMTRM AI, an autonomous financial intelligence agent embedded in a hacker Bloomberg Terminal clone built in 2026. You have deep expertise in:
- Equity markets, fixed income, commodities, FX, crypto  
- Technical analysis: RSI, MACD, Bollinger Bands, moving averages, support/resistance levels
- Fundamental analysis: P/E, EV/EBITDA, DCF valuation, earnings quality, margin analysis
- Macro economics: Fed policy, yield curves, inflation dynamics, GDP, labor markets
- Market microstructure, order flow, liquidity, options flows

Respond like a seasoned Goldman/Citadel analyst — precise, direct, data-oriented. Use terminal-style formatting with tables and bullets. Format numbers properly: $1.2B, 4.5%, 120bps. Be concise and actionable. Current date: March 2026.`,
        messages: claudeMessages,
      });

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullContent += chunk.delta.text;
          res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
        }
      }

      await storage.addChatMessage({ role: "assistant", content: fullContent });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (err) {
      const msg = "AI agent temporarily unavailable. Please try again.";
      await storage.addChatMessage({ role: "assistant", content: msg });
      res.write(`data: ${JSON.stringify({ text: msg, done: true })}\n\n`);
    }

    res.end();
  });

  app.delete("/api/chat", async (_req, res) => {
    await storage.clearChatMessages();
    res.json({ ok: true });
  });
}
