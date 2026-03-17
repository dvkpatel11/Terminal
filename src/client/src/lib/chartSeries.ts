export type ChartInterval = "5m" | "15m" | "1h" | "1d";

interface SeriesPoint {
  date: string;
  close: number;
}

interface SeriesInput {
  symbol: string;
  points: SeriesPoint[];
}

export function getAllowedIntervals(isCrypto: boolean): ChartInterval[] {
  return isCrypto ? ["5m", "15m", "1h", "1d"] : ["1d"];
}

export function normalizeComparisonSeries(series: SeriesInput[]) {
  const dateMap = new Map<string, Record<string, number | string>>();

  for (const entry of series) {
    const base = entry.points[0]?.close;
    if (!base) continue;

    for (const point of entry.points) {
      const row = dateMap.get(point.date) ?? { date: point.date };
      row[entry.symbol] = Number(((point.close / base) * 100).toFixed(2));
      dateMap.set(point.date, row);
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
