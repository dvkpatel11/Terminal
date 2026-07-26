import { extendedStorage } from './storage';
import { getOptionsFlowDefaults } from './symbolRegistry';
import { getOptionsChain } from './marketData';

const FETCH_TIMEOUT = 8000;

interface SummaryResponse {
  putCallRatio: number;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  date: string;
  stale: boolean;
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
  premium: number;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
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
        delta: item.delta ?? null,
        gamma: item.gamma ?? null,
        theta: item.theta ?? null,
        vega: item.vega ?? null,
        rho: item.rho ?? null,
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
      const resp = await resilientFetch(
        { name: "yahoo", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
        'https://cdn.cboe.com/api/global/us_options/market_statistics/open_interest.json',
      );
      if (resp.ok) {
        const data = (await resp.json()) as any;
        const stats = data?.data || data;
        const callVol = stats?.call_volume ?? stats?.callVolume ?? 0;
        const putVol = stats?.put_volume ?? stats?.putVolume ?? 0;
        const totalVol = callVol + putVol;
        const dateStr = stats?.date || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        return {
          putCallRatio: totalVol > 0 ? Math.round((putVol / totalVol) * 100) / 100 : 0.5,
          totalVolume: totalVol,
          callVolume: callVol,
          putVolume: putVol,
          date: dateStr,
          stale: dateStr !== today,
        };
      }
    } catch { /* fall through */ }

    return {
      putCallRatio: 0.5,
      totalVolume: 0,
      callVolume: 0,
      putVolume: 0,
      date: new Date().toISOString().slice(0, 10),
      stale: true,
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
  bid?: number;
  ask?: number;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
}

function getDefaultSymbols(): string[] {
  return getOptionsFlowDefaults();
}

async function fetchUnusualActivity(symbols: string[]): Promise<UnusualActivity[]> {
  const cacheKey = `unusual:${symbols.slice().sort().join(',')}`;
  return cached(cacheKey, async () => {
    const results = await Promise.allSettled(
      Array.from(new Set(symbols)).map(s => fetchOptionChain(s))
    );

    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount === results.length) {
      console.error(`[optionsFlow] All ${failedCount} symbol fetches failed`);
    }

    const activity: UnusualActivity[] = [];

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { calls, puts, underlyingPrice } = r.value;

      for (const opt of [...calls, ...puts]) {
        const v = opt.volume || 0;
        const oi = opt.openInterest || 0;
        if (v > 0 && oi > 0 && v / oi > 2) {
          const mid = (opt.bid ?? 0) + (opt.ask ?? 0) > 0
            ? ((opt.bid ?? 0) + (opt.ask ?? 0)) / 2
            : 0;
          const premium = Math.round(mid * v * 100) / 100;

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
            premium,
            delta: opt.delta,
            gamma: opt.gamma,
            theta: opt.theta,
            vega: opt.vega,
            rho: opt.rho,
          });
        }
      }
    }

    activity.sort((a, b) => b.vOiRatio - a.vOiRatio);
    return activity.slice(0, 30);
  });
}

async function fetchOptionChain(symbol: string): Promise<{ calls: OptionData[]; puts: OptionData[]; underlyingPrice: number } | null> {
  try {
    const result = await getOptionsChain(symbol);
    if (!result || !result.contracts || result.contracts.length === 0) return null;

    const underlyingPrice = result.underlyingPrice ?? 0;
    const allCalls: OptionData[] = [];
    const allPuts: OptionData[] = [];

    // Deduplicate by strike+expiration (OpenBB can return duplicates)
    const seen = new Set<string>();
    for (const c of result.contracts) {
      const key = `${c.strike}:${c.expiration}:${c.optionType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const opt: OptionData = {
        symbol,
        optionType: c.optionType,
        strike: c.strike,
        expiration: c.expiration,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        bid: c.bid,
        ask: c.ask,
        delta: c.delta ?? null,
        gamma: c.gamma ?? null,
        theta: c.theta ?? null,
        vega: c.vega ?? null,
        rho: c.rho ?? null,
      };

      if (c.optionType === 'call') allCalls.push(opt);
      else allPuts.push(opt);
    }

    return { calls: allCalls, puts: allPuts, underlyingPrice };
  } catch {
    return null;
  }
}

export async function handleOptionsFlowRequest(query: Record<string, string>): Promise<OptionsFlowResponse> {
  const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;
  const symbols = symbol ? [symbol] : getDefaultSymbols();

  try {
    const [summary, activity] = await Promise.all([
      fetchPutCallRatio(),
      fetchUnusualActivity(symbols),
    ]);
    const source = summary.stale ? 'stale' : 'cboe';

    // Persist to database (fire and forget)
    persistOptionsToDb(summary, activity).catch(() => {});

    return { summary, activity, source };
  } catch (err: any) {
    console.error("[optionsFlow] Request failed:", err);
    return {
      summary: { putCallRatio: 0.5, totalVolume: 0, callVolume: 0, putVolume: 0, date: new Date().toISOString().slice(0, 10), stale: true },
      activity: [],
      source: 'unavailable',
    };
  }
}

// ─── Options-Derived Support / Resistance ──────────────────────────────────────
export interface OptionsSRLevel {
  price: number;
  type: 'support' | 'resistance';
  label: string;
  oi: number;
  volume: number;
}

export async function handleOptionsSRRequest(query: Record<string, string>): Promise<OptionsSRLevel[]> {
  const symbol = query.symbol?.toUpperCase();
  if (!symbol) return [];

  const cacheKey = `options-sr:${symbol}`;
  return cached(cacheKey, async () => {
    try {
      const chain = await fetchOptionChain(symbol);
      if (!chain) return [];

      const { calls, puts, underlyingPrice } = chain;
      if (!underlyingPrice || underlyingPrice === 0) return [];

      // Group by strike, aggregate OI and volume
      const strikeData = new Map<number, { callOI: number; putOI: number; callVol: number; putVol: number }>();

      for (const opt of calls) {
        const existing = strikeData.get(opt.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        existing.callOI += opt.openInterest;
        existing.callVol += opt.volume;
        strikeData.set(opt.strike, existing);
      }
      for (const opt of puts) {
        const existing = strikeData.get(opt.strike) ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        existing.putOI += opt.openInterest;
        existing.putVol += opt.volume;
        strikeData.set(opt.strike, existing);
      }

      // Build S/R levels from strikes with significant open interest
      const levels: OptionsSRLevel[] = [];

      for (const [strike, data] of Array.from(strikeData.entries())) {
        const totalOI = data.callOI + data.putOI;
        const totalVol = data.callVol + data.putVol;
        if (totalOI < 100 && totalVol < 50) continue; // skip insignificant strikes

        // Put-heavy strikes = support (put writers defending)
        // Call-heavy strikes = resistance (call writers defending)
        const putRatio = totalOI > 0 ? data.putOI / totalOI : 0.5;
        const callRatio = totalOI > 0 ? data.callOI / totalOI : 0.5;

        if (putRatio > 0.6) {
          levels.push({
            price: strike,
            type: 'support',
            label: `PUT OI ${totalOI.toLocaleString()}`,
            oi: totalOI,
            volume: totalVol,
          });
        } else if (callRatio > 0.6) {
          levels.push({
            price: strike,
            type: 'resistance',
            label: `CALL OI ${totalOI.toLocaleString()}`,
            oi: totalOI,
            volume: totalVol,
          });
        }
      }

      // Sort by OI descending, take top levels
      levels.sort((a, b) => b.oi - a.oi);

      // Keep only levels within 25% of current price to avoid noise
      const filtered = levels.filter(l => {
        const dist = Math.abs(l.price - underlyingPrice) / underlyingPrice;
        return dist <= 0.25;
      });

      return filtered.slice(0, 12);
    } catch (err) {
      console.error(`[optionsFlow] S/R request failed for ${symbol}:`, err);
      return [];
    }
  });
}
