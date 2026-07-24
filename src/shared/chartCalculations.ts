export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TimeValue {
  time: number;
  value: number;
}

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface BollingerBands {
  upper: TimeValue[];
  middle: TimeValue[];
  lower: TimeValue[];
}

export interface MACDResult {
  macd: TimeValue[];
  signal: TimeValue[];
  histogram: TimeValue[];
}

// ─── SMA ────────────────────────────────────────────────────────────────────

export function computeSMA(data: OHLCVBar[], period: number): TimeValue[] {
  const result: TimeValue[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

// ─── EMA ────────────────────────────────────────────────────────────────────

export function computeEMA(data: OHLCVBar[], period: number): TimeValue[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: TimeValue[] = [];
  let ema = data[0].close;
  for (let i = 0; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    if (i >= period - 1) {
      result.push({ time: data[i].time, value: ema });
    }
  }
  return result;
}

// ─── RSI ────────────────────────────────────────────────────────────────────

export function computeRSI(data: OHLCVBar[], period = 14): TimeValue[] {
  if (data.length < period + 1) return [];

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const d = data[i].close - data[i - 1].close;
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  const result: TimeValue[] = [];
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: data[period].time, value: 100 - 100 / (1 + rs) });

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: data[i + 1].time, value: 100 - 100 / (1 + rs2) });
  }
  return result;
}

// ─── MACD ───────────────────────────────────────────────────────────────────

export function computeMACD(data: OHLCVBar[]): MACDResult {
  const ema = (vals: number[], p: number) => {
    const k = 2 / (p + 1);
    const r = [vals[0]];
    for (let i = 1; i < vals.length; i++) r.push(vals[i] * k + r[i - 1] * (1 - k));
    return r;
  };

  const closes = data.map((d) => d.close);
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);

  const signalRaw = ema(macdLine.slice(26), 9);
  const signalPadded: (number | null)[] = new Array(26).fill(null).concat(signalRaw);

  const macd: TimeValue[] = [];
  const signal: TimeValue[] = [];
  const histogram: TimeValue[] = [];

  for (let i = 0; i < data.length; i++) {
    macd.push({ time: data[i].time, value: macdLine[i] });
    if (signalPadded[i] != null) {
      signal.push({ time: data[i].time, value: signalPadded[i]! });
      histogram.push({
        time: data[i].time,
        value: macdLine[i] - signalPadded[i]!,
      });
    }
  }

  return { macd, signal, histogram };
}

// ─── Bollinger Bands ────────────────────────────────────────────────────────

export function computeBollingerBands(
  data: OHLCVBar[],
  period = 20,
  stdDev = 2
): BollingerBands {
  const middle = computeSMA(data, period);
  const upper: TimeValue[] = [];
  const lower: TimeValue[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const mean = middle.find((m) => m.time === data[i].time)?.value;
    if (mean == null) continue;
    const slice = data.slice(i - period + 1, i + 1);
    const variance = slice.reduce((s, p) => s + Math.pow(p.close - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push({ time: data[i].time, value: mean + stdDev * std });
    lower.push({ time: data[i].time, value: mean - stdDev * std });
  }

  return { upper, middle, lower };
}

// ─── VWAP ───────────────────────────────────────────────────────────────────

export function computeVWAP(data: OHLCVBar[]): TimeValue[] {
  let cumTPV = 0;
  let cumVol = 0;
  return data.map((d) => {
    const tp = (d.high + d.low + d.close) / 3;
    cumTPV += tp * d.volume;
    cumVol += d.volume;
    return { time: d.time, value: cumVol > 0 ? cumTPV / cumVol : d.close };
  });
}

// ─── Pivots ─────────────────────────────────────────────────────────────────

export function computePivots(high: number, low: number, close: number): PivotLevels {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

// ─── Swing Points ───────────────────────────────────────────────────────────

export function findSwingPoints(data: OHLCVBar[], lookback = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < data.length - lookback; i++) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= lookback; j++) {
      if (data[i].high <= data[i - j].high || data[i].high <= data[i + j].high) isH = false;
      if (data[i].low >= data[i - j].low || data[i].low >= data[i + j].low) isL = false;
    }
    if (isH) swings.push({ index: i, price: data[i].high, type: "high" });
    if (isL) swings.push({ index: i, price: data[i].low, type: "low" });
  }
  return swings;
}

// ─── Color Constants ────────────────────────────────────────────────────────

export const CHART_COLORS = {
  candleUp: "hsl(142,71%,38%)",
  candleDown: "hsl(0,80%,45%)",
  wickUp: "hsl(142,71%,45%)",
  wickDown: "hsl(0,80%,55%)",
  volumeUp: "rgba(34,197,94,0.3)",
  volumeDown: "rgba(239,68,68,0.3)",
  sma20: "hsl(186,45%,55%)",
  sma50: "hsl(265,70%,65%)",
  sma200: "hsl(50,80%,55%)",
  ema20: "hsl(30,80%,55%)",
  ema50: "hsl(320,60%,60%)",
  bb: "hsl(38,30%,55%)",
  vwap: "rgba(255,255,255,0.5)",
  rsi: "hsl(38,30%,55%)",
  macdLine: "hsl(186,45%,55%)",
  macdSignal: "hsl(0,80%,55%)",
  macdHistogramUp: "hsl(142,71%,45%)",
  macdHistogramDown: "hsl(0,80%,45%)",
  grid: "rgba(255,255,255,0.04)",
  crosshair: "rgba(255,255,255,0.3)",
  text: "#a0a0a0",
  currentPrice: "hsl(0,0%,30%)",
  fib: "hsl(0,0%,50%)",
  fibMid: "hsl(0,0%,60%)",
  pivotR: "hsl(0,80%,50%)",
  pivotS: "hsl(142,71%,45%)",
  pivotPP: "hsl(0,0%,55%)",
  measureLine: "hsl(186,45%,55%)",
  measureFill: "hsl(186,45%,50%)",
} as const;
