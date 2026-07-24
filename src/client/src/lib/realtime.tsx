import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface LiveQuote {
  price: number;
  ts: number;
}

interface RealtimeState {
  quotes: Record<string, LiveQuote>;
  connected: boolean;
  /** True when WS is connected but no tick received in >15s — prices may be stale. */
  stale: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ quotes: {}, connected: false, stale: false });

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_BACKOFF_DELAY = 16000;
/** After initial backoff exhaustion, retry every 30s until reconnected. */
const PERIODIC_RETRY_MS = 30_000;
/** If no tick received within this window, mark prices as stale. */
const STALENESS_THRESHOLD_MS = 15_000;

/**
 * Opens a single WebSocket to /api/ws with auto-reconnect and
 * keeps the latest live price for every streamed symbol.
 * Components read live prices via useRealtime().
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickRef = useRef(0);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStale(false);
      attemptsRef.current = 0;
      lastTickRef.current = Date.now();
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff, then periodic retry
      const attempt = attemptsRef.current;
      const delay = attempt < RECONNECT_DELAYS.length
        ? RECONNECT_DELAYS[attempt]
        : PERIODIC_RETRY_MS;
      reconnectTimerRef.current = setTimeout(() => {
        attemptsRef.current++;
        connect();
      }, delay);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "snapshot") {
          const next: Record<string, LiveQuote> = {};
          for (const q of msg.quotes as { symbol: string; price: number }[]) {
            next[q.symbol.toUpperCase()] = { price: q.price, ts: Date.now() };
          }
          setQuotes((prev) => ({ ...prev, ...next }));
          lastTickRef.current = Date.now();
          setStale(false);
        } else if (msg.type === "tick") {
          const sym = String(msg.symbol).toUpperCase();
          setQuotes((prev) => ({
            ...prev,
            [sym]: { price: msg.price, ts: msg.ts ?? Date.now() },
          }));
          lastTickRef.current = Date.now();
          setStale(false);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnect
      ws.close();
    };
  }, []);

  // Staleness checker — runs every 5s, marks stale if no tick in threshold
  useEffect(() => {
    staleCheckRef.current = setInterval(() => {
      if (connected && lastTickRef.current > 0) {
        const age = Date.now() - lastTickRef.current;
        setStale(age > STALENESS_THRESHOLD_MS);
      }
    }, 5000);
    return () => {
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
    };
  }, [connected]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <RealtimeContext.Provider value={{ quotes, connected, stale }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
