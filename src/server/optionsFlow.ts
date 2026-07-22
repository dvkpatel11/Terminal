import { extendedStorage } from './storage';

const FETCH_TIMEOUT = 8000;

interface SummaryResponse {
  putCallRatio: number;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  date: string;
}

interface UnusualActivity {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  volume: number;
  openInterest: number;
  vOiRatio: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  underlyingPrice: number;
}

export interface OptionsFlowResponse {
  summary: SummaryResponse;
  activity: UnusualActivity[];
  source: string;
}

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 3 * 60_000;

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistOptionsToDb(summary: SummaryResponse, activity: UnusualActivity[]): Promise<void> {
  if (!extendedStorage) return;
  try {
    for (const item of activity.slice(0, 20)) {
      const instrument = await extendedStorage.getInstrumentBySymbol(item.symbol);
      if (!instrument) continue;

      await extendedStorage.persistOptionsActivity({
        instrumentId: instrument.id,
        symbol: item.symbol,
        optionType: item.optionType,
        strike: item.strike,
        expiration: item.expiration,
        volume: item.volume,
        openInterest: item.openInterest,
        vOiRatio: item.vOiRatio,
        sentiment: item.sentiment,
        underlyingPrice: item.underlyingPrice,
      });
    }
  } catch (e) {
    console.error("Failed to persist options data:", e);
  }
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

async function fetchPutCallRatio(): Promise<SummaryResponse> {
  return cached('options-summary', async () => {
    try {
      const resp = await fetch('https://cdn.cboe.com/api/global/us_options/market_statistics/open_interest.json', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        const stats = data?.data || data;
        const callVol = stats?.call_volume ?? stats?.callVolume ?? 0;
        const putVol = stats?.put_volume ?? stats?.putVolume ?? 0;
        const totalVol = callVol + putVol;
        return {
          putCallRatio: totalVol > 0 ? Math.round((putVol / totalVol) * 100) / 100 : 0.5,
          totalVolume: totalVol,
          callVolume: callVol,
          putVolume: putVol,
          date: stats?.date || new Date().toISOString().slice(0, 10),
        };
      }
    } catch { /* fall through */ }

    return {
      putCallRatio: 0.5,
      totalVolume: 0,
      callVolume: 0,
      putVolume: 0,
      date: new Date().toISOString().slice(0, 10),
    };
  });
}

interface OptionData {
  symbol: string;
  optionType: string;
  strike: number;
  expiration: string;
  volume: number;
  openInterest: number;
}

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ'];

async function fetchUnusualActivity(symbols: string[]): Promise<UnusualActivity[]> {
  const cacheKey = `unusual:${symbols.slice().sort().join(',')}`;
  return cached(cacheKey, async () => {
    try {
      const results = await Promise.all(Array.from(new Set(symbols)).map(s => fetchOptionChain(s)));
      const activity: UnusualActivity[] = [];

      for (const r of results) {
        if (!r) continue;
        const { calls, puts, underlyingPrice } = r;

        for (const opt of [...calls, ...puts]) {
          const v = opt.volume || 0;
          const oi = opt.openInterest || 0;
          if (v > 0 && oi > 0 && v / oi > 2) {
            activity.push({
              symbol: opt.symbol,
              optionType: opt.optionType as 'call' | 'put',
              strike: opt.strike,
              expiration: opt.expiration,
              volume: v,
              openInterest: oi,
              vOiRatio: Math.round((v / oi) * 100) / 100,
              sentiment: opt.optionType === 'call' ? 'bullish' : 'bearish',
              underlyingPrice,
            });
          }
        }
      }

      activity.sort((a, b) => b.vOiRatio - a.vOiRatio);
      return activity.slice(0, 30);
    } catch {
      return [];
    }
  });
}

async function fetchOptionChain(symbol: string): Promise<{ calls: OptionData[]; puts: OptionData[]; underlyingPrice: number } | null> {
  try {
    const resp = await fetch(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const quote = result.quote || {};
    const underlyingPrice = quote.regularMarketPrice || quote.ask || 0;
    const option = result.options?.[0];
    if (!option) return null;

    const mapOpt = (o: any, type: string): OptionData => ({
      symbol,
      optionType: type,
      strike: o.strike || 0,
      expiration: new Date((o.expiration || 0) * 1000).toISOString().slice(0, 10),
      volume: o.volume || 0,
      openInterest: o.openInterest || 0,
    });

    return {
      calls: (option.calls || []).map((o: any) => mapOpt(o, 'call')),
      puts: (option.puts || []).map((o: any) => mapOpt(o, 'put')),
      underlyingPrice,
    };
  } catch {
    return null;
  }
}

export async function handleOptionsFlowRequest(query: Record<string, string>): Promise<OptionsFlowResponse> {
  const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;
  const symbols = symbol ? [symbol] : DEFAULT_SYMBOLS;

  try {
    const [summary, activity] = await Promise.all([
      fetchPutCallRatio(),
      fetchUnusualActivity(symbols),
    ]);
    const source = summary.date === new Date().toISOString().slice(0, 10) ? 'cboe' : 'fallback';
    
    // Persist to database (fire and forget)
    persistOptionsToDb(summary, activity).catch(() => {});
    
    return { summary, activity, source };
  } catch (err: any) {
    return {
      summary: { putCallRatio: 0.5, totalVolume: 0, callVolume: 0, putVolume: 0, date: new Date().toISOString().slice(0, 10) },
      activity: [],
      source: 'unavailable',
    };
  }
}
