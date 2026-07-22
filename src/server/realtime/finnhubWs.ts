import WebSocket from "ws";
import type { QuoteBus } from "./quoteBus";

/** App symbol -> Finnhub WS symbol (crypto only; equities share the ticker). */
export type CryptoSymbolMap = Record<string, string>;

export interface FinnhubConfig {
  bus: QuoteBus;
  token: string;
  /** Equity/ETF/index tickers to stream (Finnhub symbol == app symbol). */
  equitySymbols: string[];
  /** App crypto symbol -> Finnhub crypto symbol, e.g. "BTC-USD" -> "BINANCE:BTCUSDT". */
  cryptoMap?: CryptoSymbolMap;
  url?: string;
  maxBackoffMs?: number;
}

interface FinnhubTrade {
  s?: string;
  p?: number;
}

interface FinnhubMessage {
  type?: string;
  data?: FinnhubTrade[];
}

/**
 * Parse a Finnhub WS frame into [{ symbol, price }].
 * Handles both `trade` (equities) and `crypto` channels.
 * Returns null for non-trade frames (heartbeats, errors, subscriptions).
 */
export function parseFinnhubMessage(raw: unknown): { symbol: string; price: number }[] | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as FinnhubMessage;
  if (msg.type !== "trade" && msg.type !== "crypto") return null;
  if (!Array.isArray(msg.data)) return null;

  const out: { symbol: string; price: number }[] = [];
  for (const d of msg.data) {
    if (typeof d.s === "string" && typeof d.p === "number" && Number.isFinite(d.p)) {
      out.push({ symbol: d.s, price: d.p });
    }
  }
  return out.length ? out : null;
}

/**
 * Apply parsed Finnhub ticks to the bus, mapping Finnhub crypto
 * symbols back to app symbols via the reverse map.
 */
export function applyFinnhubMessage(
  bus: QuoteBus,
  raw: unknown,
  reverseCrypto: Record<string, string>,
): void {
  const ticks = parseFinnhubMessage(raw);
  if (!ticks) return;
  for (const tick of ticks) {
    const symbol = reverseCrypto[tick.symbol] ?? tick.symbol;
    bus.updateQuote(symbol, tick.price);
  }
}

export interface FinnhubHandle {
  stop: () => void;
}

/** Build reverse map: Finnhub crypto symbol -> app symbol. */
function buildReverseCrypto(map?: CryptoSymbolMap): Record<string, string> {
  const reverse: Record<string, string> = {};
  if (map) {
    for (const [app, finn] of Object.entries(map)) {
      reverse[finn] = app;
    }
  }
  return reverse;
}

/**
 * Open a Finnhub WebSocket, subscribe to the configured symbols,
 * and stream ticks into the quote bus. Auto-reconnects with
 * exponential backoff. Returns a stop() to tear down.
 */
export function startFinnhub(config: FinnhubConfig): FinnhubHandle {
  const {
    bus,
    token,
    equitySymbols,
    cryptoMap,
    url = "wss://ws.finnhub.io?token=",
    maxBackoffMs = 30_000,
  } = config;

  const reverseCrypto = buildReverseCrypto(cryptoMap);
  const finnCrypto = cryptoMap ? Object.values(cryptoMap) : [];

  let socket: WebSocket | null = null;
  let stopped = false;
  let backoff = 3000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const subscribe = () => {
    if (equitySymbols.length) {
      socket?.send(JSON.stringify({ type: "subscribe", symbols: equitySymbols }));
    }
    if (finnCrypto.length) {
      socket?.send(JSON.stringify({ type: "subscribe", symbols: finnCrypto }));
    }
  };

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(`${url}${token}`);
    socket = ws;

    ws.on("open", () => {
      backoff = 3000;
      subscribe();
      console.log(`[finnhub] connected (${equitySymbols.length + finnCrypto.length} symbols)`);
    });

    ws.on("message", (data) => {
      try {
        applyFinnhubMessage(bus, JSON.parse(data.toString()), reverseCrypto);
      } catch (err) {
        console.error("[finnhub] message error:", err);
      }
    });

    ws.on("close", () => {
      socket = null;
      if (stopped) return;
      console.warn(`[finnhub] closed; reconnecting in ${backoff}ms`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    });

    ws.on("error", (err) => {
      console.error("[finnhub] error:", err);
      ws.close();
    });
  };

  connect();

  return {
    stop: () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  };
}
