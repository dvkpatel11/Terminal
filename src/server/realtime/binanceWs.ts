import WebSocket from "ws";
import type { QuoteBus } from "./quoteBus";

/** App crypto symbol -> Binance stream symbol (lowercase, no slash). */
export type BinanceSymbolMap = Record<string, string>;

export interface BinanceConfig {
  bus: QuoteBus;
  /** App crypto symbol -> Binance symbol, e.g. "BTC-USD" -> "btcusdt". */
  symbolMap: BinanceSymbolMap;
  url?: string;
  maxBackoffMs?: number;
}

interface BinanceTradeMsg {
  stream?: string;
  data?: { e?: string; s?: string; p?: string | number };
}

/**
 * Parse a Binance combined-stream frame into { symbol, price } using the
 * reverse map (Binance symbol -> app symbol). Returns null for non-trade frames.
 */
export function parseBinanceMessage(
  raw: unknown,
  reverse: Record<string, string>,
): { symbol: string; price: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as BinanceTradeMsg;
  const data = msg.data;
  if (!data || data.e !== "trade" || typeof data.s !== "string") return null;
  const price = typeof data.p === "number" ? data.p : data.p ? parseFloat(data.p) : NaN;
  if (!Number.isFinite(price)) return null;
  const symbol = reverse[data.s.toLowerCase()];
  if (!symbol) return null;
  return { symbol, price };
}

export function applyBinanceMessage(
  bus: QuoteBus,
  raw: unknown,
  reverse: Record<string, string>,
): void {
  const tick = parseBinanceMessage(raw, reverse);
  if (tick) bus.updateQuote(tick.symbol, tick.price);
}

export interface BinanceHandle {
  stop: () => void;
}

/** Build reverse map: Binance symbol -> app symbol. */
function buildReverse(map: BinanceSymbolMap): Record<string, string> {
  const reverse: Record<string, string> = {};
  for (const [app, bin] of Object.entries(map)) reverse[bin.toLowerCase()] = app;
  return reverse;
}

/**
 * Stream live crypto trades from Binance's public WebSocket (no API key
 * required) into the quote bus. Auto-reconnects with exponential backoff.
 */
export function startBinance(config: BinanceConfig): BinanceHandle {
  const {
    bus,
    symbolMap,
    url = "wss://stream.binance.com:9443/stream",
    maxBackoffMs = 30_000,
  } = config;

  const reverse = buildReverse(symbolMap);
  const streams = Object.values(symbolMap)
    .map((s) => `${s.toLowerCase()}@trade`)
    .join("/");

  let socket: WebSocket | null = null;
  let stopped = false;
  let backoff = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped || !streams) return;
    const ws = new WebSocket(`${url}?streams=${streams}`);
    socket = ws;

    ws.on("open", () => {
      backoff = 1000;
      console.log(`[binance] connected (${Object.keys(symbolMap).length} crypto streams)`);
    });

    ws.on("message", (data) => {
      try {
        applyBinanceMessage(bus, JSON.parse(data.toString()), reverse);
      } catch (err) {
        console.error("[binance] message error:", err);
      }
    });

    ws.on("close", () => {
      socket = null;
      if (stopped) return;
      console.warn(`[binance] closed; reconnecting in ${backoff}ms`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    });

    ws.on("error", (err) => {
      console.error("[binance] error:", err);
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
