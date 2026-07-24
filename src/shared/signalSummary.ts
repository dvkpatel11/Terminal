export interface SignalInput {
  quote: { price: number; pe: number | null; changePercent: number; volume: number; avgVolume: number };
  technicals: { rsi14: number | null; macd: number | null; macdHistogram: number | null; support: number | null; resistance: number | null };
  fundamentals: { sectorPe: number | null; revenueGrowth: number | null };
  macro: { yieldCurve: number | null; vix: number | null };
  social: { score: number; count: number } | null;
}

export interface SignalResult {
  direction: "bullish" | "bearish" | "neutral" | "mixed";
  confidence: "high" | "medium" | "low";
  signals: string[];
  summary: string;
}

export function computeSignalSummary(input: SignalInput): SignalResult {
  const signals: string[] = [];
  let bullCount = 0;
  let bearCount = 0;

  if (input.technicals.rsi14 != null) {
    if (input.technicals.rsi14 > 70) { signals.push("RSI overbought"); bearCount++; }
    else if (input.technicals.rsi14 < 30) { signals.push("RSI oversold"); bullCount++; }
  }

  if (input.technicals.macdHistogram != null) {
    if (input.technicals.macdHistogram > 0) { signals.push("MACD bullish"); bullCount++; }
    else if (input.technicals.macdHistogram < 0) { signals.push("MACD bearish"); bearCount++; }
  }

  if (input.quote.pe != null && input.fundamentals.sectorPe != null && input.fundamentals.sectorPe > 0) {
    const ratio = input.quote.pe / input.fundamentals.sectorPe;
    if (ratio > 1.3) { signals.push("Valuation premium vs sector"); bearCount++; }
    else if (ratio < 0.7) { signals.push("Valuation discount vs sector"); bullCount++; }
  }

  if (input.macro.yieldCurve != null && input.macro.yieldCurve < 0) {
    signals.push("Inverted yield curve"); bearCount++;
  }
  if (input.macro.vix != null && input.macro.vix > 25) {
    signals.push("Elevated volatility"); bearCount++;
  }

  if (input.social && input.social.count > 10) {
    if (input.social.score > 0.5) { signals.push("Social sentiment strongly bullish"); bullCount++; }
    else if (input.social.score < -0.5) { signals.push("Social sentiment strongly bearish"); bearCount++; }
  }

  if (input.quote.avgVolume > 0 && input.quote.volume > input.quote.avgVolume * 1.5) {
    signals.push("Above-average volume");
  }

  let direction: SignalResult["direction"] = "neutral";
  if (bullCount > bearCount) direction = "bullish";
  else if (bearCount > bullCount) direction = "bearish";
  else if (bullCount > 0 || bearCount > 0) direction = "mixed";

  const total = bullCount + bearCount;
  let confidence: SignalResult["confidence"] = "low";
  if (total > 5) confidence = "high";
  else if (total >= 3) confidence = "medium";

  const dirLabel = direction.charAt(0).toUpperCase() + direction.slice(1);
  const summary = signals.length > 0
    ? `${dirLabel} bias: ${signals.slice(0, 3).join(", ")}.`
    : "Insufficient signals for a directional bias.";

  return { direction, confidence, signals, summary };
}
