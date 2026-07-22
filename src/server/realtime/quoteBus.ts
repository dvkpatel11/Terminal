export interface LiveQuote {
  symbol: string;
  price: number;
  ts: number;
}

export type QuoteBusListener = (update: LiveQuote) => void;

export interface QuoteBus {
  /** Write the latest price for a symbol and notify subscribers. */
  updateQuote(symbol: string, price: number): void;
  /** Latest quote for a symbol, or undefined if never seen. */
  getQuote(symbol: string): LiveQuote | undefined;
  /** Only symbols present in the bus (unknown symbols are omitted, never NaN). */
  getQuotes(symbols: string[]): { symbol: string; price: number }[];
  /** All known quotes (used for client WS snapshot on connect). */
  getAllQuotes(): { symbol: string; price: number }[];
  /** Subscribe to every quote update. Returns an unsubscribe function. */
  subscribe(listener: QuoteBusListener): () => void;
  getSymbolCount(): number;
}

export function createQuoteBus(): QuoteBus {
  const quotes = new Map<string, LiveQuote>();
  const listeners = new Set<QuoteBusListener>();

  return {
    updateQuote(symbol, price) {
      const upper = symbol.toUpperCase();
      const ts = Date.now();
      quotes.set(upper, { symbol: upper, price, ts });
      for (const listener of Array.from(listeners)) {
        try {
          listener({ symbol: upper, price, ts });
        } catch (err) {
          console.error("[quoteBus] listener error:", err);
        }
      }
    },

    getQuote(symbol) {
      return quotes.get(symbol.toUpperCase());
    },

    getQuotes(symbols) {
      const out: { symbol: string; price: number }[] = [];
      for (const raw of symbols) {
        const quote = quotes.get(raw.toUpperCase());
        if (quote) out.push({ symbol: quote.symbol, price: quote.price });
      }
      return out;
    },

    getAllQuotes() {
      const out: { symbol: string; price: number }[] = [];
      for (const quote of Array.from(quotes.values())) {
        out.push({ symbol: quote.symbol, price: quote.price });
      }
      return out;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSymbolCount() {
      return quotes.size;
    },
  };
}
