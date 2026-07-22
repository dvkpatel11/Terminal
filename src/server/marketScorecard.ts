import { buildDataStatus, type DataStatus, type DataFreshness } from "./dataStatus";
import { extendedStorage } from "./storage";

// ─── Cache ───────────────────────────────────────────────────────────────────

const cache = new Map<string, { expiresAt: number; value: any }>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistSectorPerformanceToDb(sectors: SectorPerformance[]): Promise<void> {
  if (!extendedStorage || !sectors.length) return;
  try {
    for (const sector of sectors) {
      const instrument = await extendedStorage.getInstrumentBySymbol(sector.symbol);
      if (!instrument) continue;
      await extendedStorage.persistSectorPerformance({
        instrumentId: instrument.id,
        symbol: sector.symbol,
        label: sector.label,
        sector: sector.sector,
        price: sector.price,
        change: sector.change,
        changePercent: sector.changePercent,
        weekChange: sector.weekChange,
        monthChange: sector.monthChange,
        ytdChange: sector.ytdChange,
        relativeStrength: sector.relativeStrength,
      });
    }
  } catch (e) {
    console.error("Failed to persist sector performance:", e);
  }
}

async function persistMarketBreadthToDb(breadth: MarketBreadth): Promise<void> {
  if (!extendedStorage) return;
  try {
    await extendedStorage.persistMarketBreadth({
      advanceDecline: breadth.advanceDecline,
      advanceDeclineRatio: breadth.advanceDeclineRatio,
      percentAbove200dma: breadth.percentAbove200dma,
      percentAbove50dma: breadth.percentAbove50dma,
      newHighs: breadth.newHighs,
      newLows: breadth.newLows,
      newHighLowRatio: breadth.newHighLowRatio,
    });
  } catch (e) {
    console.error("Failed to persist market breadth:", e);
  }
}

async function persistCreditSpreadToDb(spread: CreditSpread): Promise<void> {
  if (!extendedStorage) return;
  try {
    await extendedStorage.persistCreditSpread({
      igOas: spread.igOas,
      igOasChange: spread.igOasChange,
      hyOas: spread.hyOas,
      hyOasChange: spread.hyOasChange,
      igOasPercentile: spread.igOasPercentile,
      hyOasPercentile: spread.hyOasPercentile,
      trend: spread.trend,
    });
  } catch (e) {
    console.error("Failed to persist credit spread:", e);
  }
}

async function persistVixTermStructureToDb(vix: VixTermStructure): Promise<void> {
  if (!extendedStorage) return;
  try {
    await extendedStorage.persistVixTermStructure({
      spot: vix.spot,
      vix2m: vix.vix2m,
      vix3m: vix.vix3m,
      curveShape: vix.curveShape,
      termSpread: vix.termSpread,
    });
  } catch (e) {
    console.error("Failed to persist VIX term structure:", e);
  }
}

async function persistTechnicalIndicatorToDb(symbol: string, indicators: TechnicalIndicators): Promise<void> {
  if (!extendedStorage) return;
  try {
    const instrument = await extendedStorage.getInstrumentBySymbol(symbol);
    if (!instrument) return;
    await extendedStorage.persistTechnicalIndicator({
      instrumentId: instrument.id,
      symbol,
      rsi14: indicators.rsi14,
      macd: indicators.macd,
      macdSignal: indicators.macdSignal,
      macdHistogram: indicators.macdHistogram,
      bollingerUpper: indicators.bollingerUpper,
      bollingerMiddle: indicators.bollingerMiddle,
      bollingerLower: indicators.bollingerLower,
      atr14: indicators.atr14,
      obv: indicators.obv,
      vwap: indicators.vwap,
      support: indicators.support,
      resistance: indicators.resistance,
    });
  } catch (e) {
    console.error(`Failed to persist technical indicators for ${symbol}:`, e);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SectorPerformance {
  symbol: string;
  label: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  weekChange: number;
  monthChange: number;
  ytdChange: number;
  relativeStrength: number; // vs SPX
  status: DataStatus;
}

export interface MarketBreadth {
  advanceDecline: number;
  advanceDeclineRatio: number;
  percentAbove200dma: number;
  percentAbove50dma: number;
  newHighs: number;
  newLows: number;
  newHighLowRatio: number;
  status: DataStatus;
}

export interface CreditSpread {
  igOas: number;
  igOasChange: number;
  hyOas: number;
  hyOasChange: number;
  igOasPercentile: number; // 1Y percentile
  hyOasPercentile: number;
  trend: "widening" | "tightening" | "stable";
  status: DataStatus;
}

export interface VixTermStructure {
  spot: number;
  vix2m: number | null;
  vix3m: number | null;
  curveShape: "contango" | "backwardation" | "flat";
  termSpread: number | null; // spot - 3m
  status: DataStatus;
}

export interface TechnicalIndicators {
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  atr14: number | null;
  obv: number | null;
  vwap: number | null;
  support: number | null;
  resistance: number | null;
  status: DataStatus;
}

export interface ScorecardRow {
  symbol: string;
  label: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  weekChange: number;
  monthChange: number;
  ytdChange: number;
  high52: number;
  low52: number;
  high52Pct: number; // % from 52w high
  low52Pct: number; // % from 52w low
  keyLevel: string; // support/resistance
  status: DataStatus;
}

// ─── Yahoo Finance Helpers ───────────────────────────────────────────────────

async function fetchYahooQuote(symbol: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "blmtrm/1.0" },
  });
  if (!response.ok) throw new Error(`Yahoo fetch failed: ${response.status}`);
  return response.json();
}

async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 5) {
    chunks.push(symbols.slice(i, i + 5));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (sym) => {
      try {
        const data = await fetchYahooQuote(sym);
        results[sym] = data;
      } catch (e) {
        console.error(`Failed to fetch ${sym}:`, e);
      }
    });
    await Promise.all(promises);
  }
  
  return results;
}

// ─── Sector Performance ──────────────────────────────────────────────────────

export async function getSectorPerformance(): Promise<SectorPerformance[]> {
  const cacheKey = "sector-performance";
  const cached = getCached<SectorPerformance[]>(cacheKey);
  if (cached) return cached;

  const SECTOR_ETFS = [
    { symbol: "XLK", label: "Technology", sector: "Technology" },
    { symbol: "XLV", label: "Health Care", sector: "Healthcare" },
    { symbol: "XLF", label: "Financials", sector: "Financial Services" },
    { symbol: "XLE", label: "Energy", sector: "Energy" },
    { symbol: "XLI", label: "Industrials", sector: "Industrials" },
    { symbol: "XLC", label: "Comm Services", sector: "Communication Services" },
    { symbol: "XLP", label: "Consumer Staples", sector: "Consumer Defensive" },
    { symbol: "XLU", label: "Utilities", sector: "Utilities" },
    { symbol: "XLRE", label: "Real Estate", sector: "Real Estate" },
    { symbol: "XLB", label: "Materials", sector: "Basic Materials" },
    { symbol: "XLY", label: "Consumer Disc.", sector: "Consumer Cyclical" },
  ];

  const symbols = [...SECTOR_ETFS.map(e => e.symbol), "^GSPC"];
  const quotes = await fetchYahooQuotes(symbols);

  const spxBars = quotes["^GSPC"]?.chart?.result?.[0]?.indicators?.quote?.[0];
  const spxClose = spxBars?.close?.filter((v: number | null) => v != null) ?? [];
  const spxPerf = (days: number) => {
    if (spxClose.length < days + 1) return 0;
    const curr = spxClose[spxClose.length - 1];
    const prev = spxClose[spxClose.length - 1 - days];
    return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  };

  const status = buildDataStatus({ provider: "yahoo", freshness: "delayed" });

  const sectors = SECTOR_ETFS.map((etf) => {
    const data = quotes[etf.symbol]?.chart?.result?.[0];
    const bars = data?.indicators?.quote?.[0];
    const closes = bars?.close?.filter((v: number | null) => v != null) ?? [];
    
    if (closes.length < 2) {
      return {
        symbol: etf.symbol,
        label: etf.label,
        sector: etf.sector,
        price: 0,
        change: 0,
        changePercent: 0,
        weekChange: 0,
        monthChange: 0,
        ytdChange: 0,
        relativeStrength: 0,
        status: { ...status, freshness: "reference" as DataFreshness },
      };
    }

    const price = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const weekChange = (() => {
      if (closes.length < 6) return 0;
      return ((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
    })();

    const monthChange = (() => {
      if (closes.length < 22) return 0;
      return ((price - closes[closes.length - 22]) / closes[closes.length - 22]) * 100;
    })();

    const ytdChange = (() => {
      if (closes.length < 2) return 0;
      const yearStart = closes[0];
      return yearStart > 0 ? ((price - yearStart) / yearStart) * 100 : 0;
    })();

    const relativeStrength = changePercent - spxPerf(1);

    return {
      symbol: etf.symbol,
      label: etf.label,
      sector: etf.sector,
      price,
      change,
      changePercent,
      weekChange,
      monthChange,
      ytdChange,
      relativeStrength,
      status,
    };
  });

  // Persist to database (fire and forget)
  persistSectorPerformanceToDb(sectors).catch(() => {});

  return setCached(cacheKey, sectors, 300_000); // 5 min cache
}

// ─── Market Breadth ──────────────────────────────────────────────────────────

export async function getMarketBreadth(): Promise<MarketBreadth> {
  const cacheKey = "market-breadth";
  const cached = getCached<MarketBreadth>(cacheKey);
  if (cached) return cached;

  const status = buildDataStatus({ provider: "yahoo", freshness: "delayed" });

  const SAMPLE_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
    "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "C", "AXP", "USB",
    "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
    "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HES",
    "PG", "KO", "PEP", "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "TGT",
  ];

  try {
    const quotes = await fetchYahooQuotes(SAMPLE_SYMBOLS);
    
    let advances = 0;
    let declines = 0;
    let above200dma = 0;
    let above50dma = 0;
    let newHighs = 0;
    let newLows = 0;

    for (const sym of Object.keys(quotes)) {
      const data = quotes[sym]?.chart?.result?.[0];
      const bars = data?.indicators?.quote?.[0];
      const closes = bars?.close?.filter((v: number | null) => v != null) ?? [];
      
      if (closes.length < 2) continue;

      const price = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      
      if (price > prev) advances++;
      else if (price < prev) declines++;

      if (closes.length >= 200) {
        const dma200 = closes.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200;
        if (price > dma200) above200dma++;
      }

      if (closes.length >= 50) {
        const dma50 = closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50;
        if (price > dma50) above50dma++;
      }

      const yearData = closes.slice(-252);
      const high52 = Math.max(...yearData);
      const low52 = Math.min(...yearData);
      if (price >= high52 * 0.99) newHighs++;
      if (price <= low52 * 1.01) newLows++;
    }

    const total = advances + declines;
    const result: MarketBreadth = {
      advanceDecline: advances - declines,
      advanceDeclineRatio: declines > 0 ? advances / declines : advances,
      percentAbove200dma: total > 0 ? (above200dma / total) * 100 : 50,
      percentAbove50dma: total > 0 ? (above50dma / total) * 100 : 50,
      newHighs,
      newLows,
      newHighLowRatio: newLows > 0 ? newHighs / newLows : newHighs,
      status,
    };

    // Persist to database (fire and forget)
    persistMarketBreadthToDb(result).catch(() => {});

    return setCached(cacheKey, result, 300_000);
  } catch (e) {
    console.error("Failed to fetch market breadth:", e);
    return {
      advanceDecline: 0,
      advanceDeclineRatio: 1,
      percentAbove200dma: 50,
      percentAbove50dma: 50,
      newHighs: 0,
      newLows: 0,
      newHighLowRatio: 1,
      status: { ...status, freshness: "reference", isFallback: true },
    };
  }
}

// ─── Credit Spreads (from FRED) ─────────────────────────────────────────────

export async function getCreditSpreads(): Promise<CreditSpread> {
  const cacheKey = "credit-spreads";
  const cached = getCached<CreditSpread>(cacheKey);
  if (cached) return cached;

  const status = buildDataStatus({ provider: "fred", freshness: "daily" });

  try {
    const [igText, hyText] = await Promise.all([
      fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLC0A0CM&cosd=2024-01-01", {
        headers: { "User-Agent": "blmtrm/1.0" },
      }).then(r => r.text()),
      fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2&cosd=2024-01-01", {
        headers: { "User-Agent": "blmtrm/1.0" },
      }).then(r => r.text()),
    ]);

    const parseFredCsv = (text: string): number[] => {
      const lines = text.trim().split("\n");
      const values: number[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 2 && parts[1] !== ".") {
          const val = parseFloat(parts[1]);
          if (!isNaN(val)) values.push(val);
        }
      }
      return values;
    };

    const igValues = parseFredCsv(igText);
    const hyValues = parseFredCsv(hyText);

    const igOas = igValues[igValues.length - 1] ?? 0;
    const hyOas = hyValues[hyValues.length - 1] ?? 0;
    const igOasPrev = igValues[igValues.length - 2] ?? igOas;
    const hyOasPrev = hyValues[hyValues.length - 2] ?? hyOas;

    const igSorted = [...igValues].sort((a: number, b: number) => a - b);
    const hySorted = [...hyValues].sort((a: number, b: number) => a - b);
    const percentile = (sorted: number[], val: number) => {
      const idx = sorted.findIndex((v: number) => v >= val);
      return idx >= 0 ? (idx / sorted.length) * 100 : 50;
    };

    const igPct = percentile(igSorted, igOas);
    const hyPct = percentile(hySorted, hyOas);

    const igChange = igOas - igOasPrev;
    const hyChange = hyOas - hyOasPrev;

    const trend = Math.abs(igChange) < 0.5 && Math.abs(hyChange) < 0.5
      ? "stable"
      : igChange > 0 || hyChange > 0
        ? "widening"
        : "tightening";

    const result: CreditSpread = {
      igOas,
      igOasChange: igChange,
      hyOas,
      hyOasChange: hyChange,
      igOasPercentile: igPct,
      hyOasPercentile: hyPct,
      trend,
      status,
    };

    // Persist to database (fire and forget)
    persistCreditSpreadToDb(result).catch(() => {});

    return setCached(cacheKey, result, 900_000); // 15 min cache
  } catch (e) {
    console.error("Failed to fetch credit spreads:", e);
    return {
      igOas: 0,
      igOasChange: 0,
      hyOas: 0,
      hyOasChange: 0,
      igOasPercentile: 50,
      hyOasPercentile: 50,
      trend: "stable",
      status: { ...status, freshness: "reference", isFallback: true },
    };
  }
}

// ─── VIX Term Structure ──────────────────────────────────────────────────────

export async function getVixTermStructure(): Promise<VixTermStructure> {
  const cacheKey = "vix-term";
  const cached = getCached<VixTermStructure>(cacheKey);
  if (cached) return cached;

  const status = buildDataStatus({ provider: "cboe", freshness: "daily" });

  try {
    const symbols = ["^VIX", "^VIX2", "^VIX3M"];
    const quotes = await fetchYahooQuotes(symbols);

    const spot = quotes["^VIX"]?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.slice(-1)[0] ?? 0;
    const vix2m = quotes["^VIX2"]?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.slice(-1)[0] ?? null;
    const vix3m = quotes["^VIX3M"]?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.slice(-1)[0] ?? null;

    const termSpread = vix3m != null ? spot - vix3m : null;
    
    let curveShape: "contango" | "backwardation" | "flat" = "flat";
    if (termSpread != null) {
      if (termSpread < -1) curveShape = "contango";
      else if (termSpread > 1) curveShape = "backwardation";
    }

    const result: VixTermStructure = {
      spot,
      vix2m,
      vix3m,
      curveShape,
      termSpread,
      status,
    };

    // Persist to database (fire and forget)
    persistVixTermStructureToDb(result).catch(() => {});

    return setCached(cacheKey, result, 300_000);
  } catch (e) {
    console.error("Failed to fetch VIX term structure:", e);
    return {
      spot: 0,
      vix2m: null,
      vix3m: null,
      curveShape: "flat",
      termSpread: null,
      status: { ...status, freshness: "reference", isFallback: true },
    };
  }
}

// ─── Technical Indicators ────────────────────────────────────────────────────

function computeRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  
  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };
  
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v: number, i: number) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(26), 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  
  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

function computeBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  
  const recent = closes.slice(-period);
  const middle = recent.reduce((a: number, b: number) => a + b, 0) / period;
  const variance = recent.reduce((sum: number, val: number) => sum + Math.pow(val - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: middle + stdDev * std,
    middle,
    lower: middle - stdDev * std,
  };
}

function computeATR(highs: number[], lows: number[], closes: number[], period: number = 14): number | null {
  if (highs.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.reduce((a: number, b: number) => a + b, 0) / period;
}

function computeOBV(closes: number[], volumes: number[]): number | null {
  if (closes.length < 2) return null;
  
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  
  return obv;
}

function computeVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number | null {
  if (closes.length === 0) return null;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativeTPV += tp * volumes[i];
    cumulativeVolume += volumes[i];
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

function findSupportResistance(closes: number[]): { support: number | null; resistance: number | null } {
  if (closes.length < 20) return { support: null, resistance: null };
  
  const recent = closes.slice(-60);
  const price = recent[recent.length - 1];
  
  const pivots: number[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) pivots.push(recent[i]);
    if (recent[i] < recent[i - 1] && recent[i] < recent[i + 1]) pivots.push(recent[i]);
  }
  
  const supports = pivots.filter((p: number) => p < price).sort((a: number, b: number) => b - a);
  const resistances = pivots.filter((p: number) => p > price).sort((a: number, b: number) => a - b);
  
  return {
    support: supports[0] ?? null,
    resistance: resistances[0] ?? null,
  };
}

export async function getTechnicalIndicators(symbol: string): Promise<TechnicalIndicators> {
  const cacheKey = `technical-${symbol}`;
  const cached = getCached<TechnicalIndicators>(cacheKey);
  if (cached) return cached;

  const status = buildDataStatus({ provider: "yahoo", freshness: "delayed" });

  try {
    const data = await fetchYahooQuote(symbol);
    const bars = data?.chart?.result?.[0]?.indicators?.quote?.[0];
    
    if (!bars) {
      return {
        rsi14: null,
        macd: null,
        macdSignal: null,
        macdHistogram: null,
        bollingerUpper: null,
        bollingerMiddle: null,
        bollingerLower: null,
        atr14: null,
        obv: null,
        vwap: null,
        support: null,
        resistance: null,
        status: { ...status, freshness: "reference" },
      };
    }

    const closes = bars.close.filter((v: number | null) => v != null);
    const highs = bars.high.filter((v: number | null) => v != null);
    const lows = bars.low.filter((v: number | null) => v != null);
    const volumes = bars.volume.filter((v: number | null) => v != null);

    const rsi14 = computeRSI(closes);
    const macdData = computeMACD(closes);
    const bollinger = computeBollingerBands(closes);
    const atr14 = computeATR(highs, lows, closes);
    const obv = computeOBV(closes, volumes);
    const vwap = computeVWAP(highs, lows, closes, volumes);
    const { support, resistance } = findSupportResistance(closes);

    const result: TechnicalIndicators = {
      rsi14,
      macd: macdData?.macd ?? null,
      macdSignal: macdData?.signal ?? null,
      macdHistogram: macdData?.histogram ?? null,
      bollingerUpper: bollinger?.upper ?? null,
      bollingerMiddle: bollinger?.middle ?? null,
      bollingerLower: bollinger?.lower ?? null,
      atr14,
      obv,
      vwap,
      support,
      resistance,
      status,
    };

    // Persist to database (fire and forget)
    persistTechnicalIndicatorToDb(symbol, result).catch(() => {});

    return setCached(cacheKey, result, 300_000);
  } catch (e) {
    console.error(`Failed to fetch technical indicators for ${symbol}:`, e);
    return {
      rsi14: null,
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
      atr14: null,
      obv: null,
      vwap: null,
      support: null,
      resistance: null,
      status: { ...status, freshness: "reference", isFallback: true },
    };
  }
}

// ─── Scorecard ───────────────────────────────────────────────────────────────

export async function getScorecardData(): Promise<ScorecardRow[]> {
  const cacheKey = "scorecard";
  const cached = getCached<ScorecardRow[]>(cacheKey);
  if (cached) return cached;

  const SCORECARD_ASSETS = [
    { symbol: "^GSPC", label: "S&P 500", category: "equity" },
    { symbol: "^IXIC", label: "Nasdaq 100", category: "equity" },
    { symbol: "^RUT", label: "Russell 2000", category: "equity" },
    { symbol: "^FTSE", label: "FTSE 100", category: "equity" },
    { symbol: "^GDAXI", label: "DAX", category: "equity" },
    { symbol: "^N225", label: "Nikkei 225", category: "equity" },
    { symbol: "DX-Y.NYB", label: "DXY (Dollar)", category: "fx" },
    { symbol: "GC=F", label: "Gold", category: "commodity" },
    { symbol: "CL=F", label: "WTI Crude", category: "commodity" },
    { symbol: "SI=F", label: "Silver", category: "commodity" },
    { symbol: "HG=F", label: "Copper", category: "commodity" },
    { symbol: "BTC-USD", label: "Bitcoin", category: "crypto" },
    { symbol: "^VIX", label: "VIX", category: "volatility" },
    { symbol: "^TNX", label: "US 10Y Yield", category: "rates" },
    { symbol: "^TYX", label: "US 30Y Yield", category: "rates" },
  ];

  const symbols = SCORECARD_ASSETS.map(a => a.symbol);
  const quotes = await fetchYahooQuotes(symbols);
  const status = buildDataStatus({ provider: "yahoo", freshness: "delayed" });

  const rows: ScorecardRow[] = SCORECARD_ASSETS.map(asset => {
    const data = quotes[asset.symbol]?.chart?.result?.[0];
    const bars = data?.indicators?.quote?.[0];
    const closes = bars?.close?.filter((v: number | null) => v != null) ?? [];
    
    if (closes.length < 2) {
      return {
        ...asset,
        price: 0,
        change: 0,
        changePercent: 0,
        weekChange: 0,
        monthChange: 0,
        ytdChange: 0,
        high52: 0,
        low52: 0,
        high52Pct: 0,
        low52Pct: 0,
        keyLevel: "—",
        status: { ...status, freshness: "reference" },
      };
    }

    const price = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const weekChange = closes.length >= 6
      ? ((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
      : 0;

    const monthChange = closes.length >= 22
      ? ((price - closes[closes.length - 22]) / closes[closes.length - 22]) * 100
      : 0;

    const ytdChange = closes.length >= 2
      ? ((price - closes[0]) / closes[0]) * 100
      : 0;

    const yearData = closes.slice(-252);
    const high52 = Math.max(...yearData);
    const low52 = Math.min(...yearData);
    const high52Pct = high52 > 0 ? ((price - high52) / high52) * 100 : 0;
    const low52Pct = low52 > 0 ? ((price - low52) / low52) * 100 : 0;

    const { support, resistance } = findSupportResistance(closes);
    let keyLevel = "—";
    if (support != null && resistance != null) {
      keyLevel = `S:${support.toFixed(0)} R:${resistance.toFixed(0)}`;
    } else if (resistance != null) {
      keyLevel = `R:${resistance.toFixed(0)}`;
    } else if (support != null) {
      keyLevel = `S:${support.toFixed(0)}`;
    }

    return {
      ...asset,
      price,
      change,
      changePercent,
      weekChange,
      monthChange,
      ytdChange,
      high52,
      low52,
      high52Pct,
      low52Pct,
      keyLevel,
      status,
    };
  });

  return setCached(cacheKey, rows, 300_000);
}
