import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { getServerListenOptions } from "./listenConfig";
import { createAlertMonitor, runAlertEvaluationCycle, runSymbolCycle } from "./alertMonitor";
import { storage } from "./storage";
import { getQuotes } from "./marketData";
import { startOpenBBServer } from "./openbbProvider";
import { createQuoteBus, type QuoteBus } from "./realtime/quoteBus";
import { startFinnhub, type CryptoSymbolMap } from "./realtime/finnhubWs";
import { startBinance, type BinanceSymbolMap } from "./realtime/binanceWs";
import { getFinnhubEquities, getBinanceSymbolMap } from "./symbolRegistry";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ── Rate limiting ──────────────────────────────────────────────────────────
// Global limiter: 300 requests per 15 minutes per IP on all /api routes.
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});
app.use("/api", globalApiLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Data source startup logging ──
  log("starting data sources...", "startup");

  // OpenBB: Python API server for fundamentals, options, yield curve
  log("[openbb] starting API server on port 6901...", "startup");
  startOpenBBServer();

  // ── Realtime quote bus + Finnhub WebSocket ──
  // The bus is the single source of truth for live prices. Finnhub
  // streams ticks into it; the alert engine reads from it (no poll), and
  // the client WS (attached in registerRoutes) broadcasts deltas.
  const bus = createQuoteBus();
  let finnhubStop: (() => void) | null = null;

  // Finnhub free tier caps the stream at ~25 symbols. Crypto is covered by
  // the keyless Binance WS, so we only stream a curated equity set here.
  const FINNHUB_EQUITIES = getFinnhubEquities();

  const FINNHUB_CRYPTO: CryptoSymbolMap = {};

  if (process.env.FINNHUB_API_KEY) {
    log(`[finnhub] connecting with ${FINNHUB_EQUITIES.length} equity symbols...`, "startup");
    finnhubStop = startFinnhub({
      bus,
      token: process.env.FINNHUB_API_KEY,
      equitySymbols: FINNHUB_EQUITIES,
      cryptoMap: FINNHUB_CRYPTO,
    }).stop;
  } else {
    console.warn("[finnhub] FINNHUB_API_KEY not set — alerts fall back to 15s poll");
  }

  // Binance public WS: genuinely realtime crypto with NO API key. Always on.
  const BINANCE_CRYPTO: BinanceSymbolMap = getBinanceSymbolMap() as BinanceSymbolMap;
  const binanceSymbols = Object.keys(BINANCE_CRYPTO);
  log(`[binance] connecting for ${binanceSymbols.length} crypto streams (${binanceSymbols.join(", ")})...`, "startup");
  const binanceStop = startBinance({ bus, symbolMap: BINANCE_CRYPTO }).stop;

  // Alerts: evaluate against live bus prices when available, else the
  // existing polling provider. On a live tick, fire responsively.
  const alertDeps = {
    loadAlerts: async () => {
      const alerts = await storage.getAlerts();
      return alerts.map((alert) => ({
        id: alert.id,
        symbol: alert.symbol,
        condition: alert.condition as "above" | "below",
        price: alert.price,
        triggered: alert.triggered,
      }));
    },
    fetchQuotes: async (symbols: string[]) => {
      const fromBus = bus.getQuotes(symbols);
      const busSet = new Set(fromBus.map((q) => q.symbol));
      const missing = symbols.filter((s) => !busSet.has(s.toUpperCase()));
      const fromNet = missing.length
        ? (await getQuotes(missing)).map((q) => ({ symbol: q.symbol, price: q.price }))
        : [];
      return [...fromBus, ...fromNet];
    },
    triggerAlert: (id: number, details: { triggerPrice: number; triggeredAt: Date }) =>
      storage.triggerAlert(id, details),
  };

  const lastSymbolCycle = new Map<string, number>();
  const busUnsub = bus.subscribe((update) => {
    const now = Date.now();
    const last = lastSymbolCycle.get(update.symbol) ?? 0;
    if (now - last < 1000) return; // throttle: max 1 eval/sec/symbol
    lastSymbolCycle.set(update.symbol, now);
    void runSymbolCycle(alertDeps, update.symbol, update.price);
  });

  await registerRoutes(httpServer, app, bus);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(getServerListenOptions(port), () => {
    log(`serving on port ${port}`);

    createAlertMonitor(async () => runAlertEvaluationCycle(alertDeps), 15_000);
  });

  const shutdown = () => {
    finnhubStop?.();
    binanceStop();
    busUnsub();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
