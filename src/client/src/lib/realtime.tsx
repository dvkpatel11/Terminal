import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface LiveQuote {
  price: number;
  ts: number;
}

interface RealtimeState {
  quotes: Record<string, LiveQuote>;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ quotes: {}, connected: false });

/**
 * Opens a single WebSocket to /api/ws and keeps the latest live price for
 * every streamed symbol. Components read live prices via useRealtime().
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "snapshot") {
          const next: Record<string, LiveQuote> = {};
          for (const q of msg.quotes as { symbol: string; price: number }[]) {
            next[q.symbol.toUpperCase()] = { price: q.price, ts: Date.now() };
          }
          setQuotes((prev) => ({ ...prev, ...next }));
        } else if (msg.type === "tick") {
          const sym = String(msg.symbol).toUpperCase();
          setQuotes((prev) => ({
            ...prev,
            [sym]: { price: msg.price, ts: msg.ts ?? Date.now() },
          }));
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => ws.close();
  }, []);

  return (
    <RealtimeContext.Provider value={{ quotes, connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
