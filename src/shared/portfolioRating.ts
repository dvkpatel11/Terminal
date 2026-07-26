/**
 * Portfolio rating system: A+ to F.
 *
 * Rates a portfolio based on:
 * - Diversification (sector concentration)
 * - Risk metrics (volatility, drawdown)
 * - Return quality (alpha vs benchmark)
 * - Position sizing (concentration risk)
 */

export interface PositionForRating {
  symbol: string;
  sector?: string;
  weight: number;           // 0-1 (fraction of portfolio)
  pnlPercent: number;       // realized + unrealized return %
}

export interface PortfolioMetrics {
  beta: number;
  annualizedVolatilityPct: number;
  maxDrawdownPct: number;
  activeReturnPct: number;  // alpha vs benchmark
}

export interface RatingResult {
  grade: string;            // "A+" through "F"
  score: number;            // 0-100
  breakdown: {
    diversification: number; // 0-25
    risk: number;           // 0-25
    return: number;         // 0-25
    sizing: number;         // 0-25
  };
  flags: string[];          // warnings/recommendations
}

// ─── Sector Diversification Score (0-25) ────────────────────────────────────

function sectorDiversificationScore(positions: PositionForRating[]): number {
  if (positions.length === 0) return 0;

  // Calculate Herfindahl-Hirschman Index (HHI) for sectors
  const sectorWeights = new Map<string, number>();
  for (const pos of positions) {
    const sector = pos.sector ?? "Unknown";
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + pos.weight);
  }

  const hhi = Array.from(sectorWeights.values()).reduce((sum, w) => sum + w * w, 0);
  // HHI ranges from 1/n (perfect) to 1 (monopoly)
  // Invert: lower HHI = better diversification
  const n = sectorWeights.size;
  const perfectHHI = 1 / n;
  const score = Math.max(0, Math.min(25, 25 * (1 - (hhi - perfectHHI) / (1 - perfectHHI))));

  return Math.round(score);
}

// ─── Risk Score (0-25) ──────────────────────────────────────────────────────

function riskScore(metrics: PortfolioMetrics): number {
  let score = 25;

  // Penalize high volatility (>20% annualized)
  if (metrics.annualizedVolatilityPct > 20) {
    score -= Math.min(10, (metrics.annualizedVolatilityPct - 20) * 0.5);
  }

  // Penalize severe drawdowns (>15%)
  if (metrics.maxDrawdownPct < -15) {
    score -= Math.min(10, (Math.abs(metrics.maxDrawdownPct) - 15) * 0.5);
  }

  // Penalize high beta (>1.5)
  if (metrics.beta > 1.5) {
    score -= Math.min(5, (metrics.beta - 1.5) * 10);
  }

  // Bonus for low beta (<0.8)
  if (metrics.beta < 0.8) {
    score += Math.min(3, (0.8 - metrics.beta) * 10);
  }

  return Math.max(0, Math.min(25, Math.round(score)));
}

// ─── Return Quality Score (0-25) ────────────────────────────────────────────

function returnScore(metrics: PortfolioMetrics): number {
  let score = 12.5; // Start at neutral

  // Reward positive alpha
  if (metrics.activeReturnPct > 0) {
    score += Math.min(12.5, metrics.activeReturnPct * 2);
  } else {
    // Penalize negative alpha
    score += Math.max(-12.5, metrics.activeReturnPct * 2);
  }

  return Math.max(0, Math.min(25, Math.round(score)));
}

// ─── Position Sizing Score (0-25) ───────────────────────────────────────────

function sizingScore(positions: PositionForRating[]): number {
  if (positions.length === 0) return 0;
  if (positions.length === 1) return 5; // Very concentrated

  let score = 25;

  // Penalize single position >30% of portfolio
  const maxWeight = Math.max(...positions.map(p => p.weight));
  if (maxWeight > 0.3) {
    score -= Math.min(15, (maxWeight - 0.3) * 50);
  }

  // Penalize too few positions (<5)
  if (positions.length < 5) {
    score -= (5 - positions.length) * 3;
  }

  return Math.max(0, Math.min(25, Math.round(score)));
}

// ─── Grade Conversion ───────────────────────────────────────────────────────

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D+";
  if (score >= 45) return "D";
  if (score >= 40) return "D-";
  return "F";
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function ratePortfolio(
  positions: PositionForRating[],
  metrics: PortfolioMetrics,
): RatingResult {
  const flags: string[] = [];

  // Check for concentrated positions
  const maxWeight = Math.max(...positions.map(p => p.weight));
  if (maxWeight > 0.3) {
    const concentrated = positions.find(p => p.weight === maxWeight);
    flags.push(`${concentrated?.symbol} is ${Math.round(maxWeight * 100)}% of portfolio (target: <30%)`);
  }

  // Check for sector concentration
  const sectorWeights = new Map<string, number>();
  for (const pos of positions) {
    const sector = pos.sector ?? "Unknown";
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + pos.weight);
  }
  for (const [sector, weight] of Array.from(sectorWeights.entries())) {
    if (weight > 0.4) {
      flags.push(`${sector} sector is ${Math.round(weight * 100)}% of portfolio (target: <40%)`);
    }
  }

  // Check for high drawdown
  if (metrics.maxDrawdownPct < -20) {
    flags.push(`Max drawdown ${metrics.maxDrawdownPct.toFixed(1)}% exceeds -20% threshold`);
  }

  // Check for high volatility
  if (metrics.annualizedVolatilityPct > 25) {
    flags.push(`Volatility ${metrics.annualizedVolatilityPct.toFixed(1)}% exceeds 25% target`);
  }

  // Check for too few positions
  if (positions.length < 3) {
    flags.push(`Only ${positions.length} position(s) — consider diversifying`);
  }

  const breakdown = {
    diversification: sectorDiversificationScore(positions),
    risk: riskScore(metrics),
    return: returnScore(metrics),
    sizing: sizingScore(positions),
  };

  const score = breakdown.diversification + breakdown.risk + breakdown.return + breakdown.sizing;

  return {
    grade: scoreToGrade(score),
    score,
    breakdown,
    flags,
  };
}
