import { evaluateAlerts, type MetricSnapshot } from "./alertsEngine";
import type { AlertCondition } from "@shared/schema";

interface AlertRecord {
  id: number;
  symbol: string;
  condition: AlertCondition;
  price: number;
  triggered: boolean;
}

interface AlertMonitorDependencies {
  loadAlerts: () => Promise<AlertRecord[]>;
  fetchQuotes: (symbols: string[]) => Promise<Array<{ symbol: string; price: number; volume?: number }>>;
  fetchMetrics?: (symbols: string[]) => Promise<MetricSnapshot[]>;
  triggerAlert: (id: number, details: { triggerPrice: number; triggerValue?: number | null; triggeredAt: Date }) => Promise<void>;
  now?: () => Date;
}

function needsExtraMetrics(condition: AlertCondition): boolean {
  return condition === "pe_above" || condition === "pe_below"
    || condition === "rsi_above" || condition === "rsi_below"
    || condition === "macd_above" || condition === "macd_below";
}

function buildSnapshotsFromQuotes(quotes: Array<{ symbol: string; price: number; volume?: number }>): MetricSnapshot[] {
  return quotes.map(q => ({
    symbol: q.symbol,
    price: q.price,
    volume: q.volume ?? null,
  }));
}

export async function runAlertEvaluationCycle(deps: AlertMonitorDependencies) {
  const alerts = await deps.loadAlerts();
  const pending = alerts.filter(alert => !alert.triggered);
  if (!pending.length) return 0;

  const symbols = Array.from(new Set(pending.map(a => a.symbol)));
  const quotes = await deps.fetchQuotes(symbols);

  // For non-price alerts, fetch PE/RSI/MACD if the dependency is available
  const hasNonPrice = pending.some(a => needsExtraMetrics(a.condition));
  let extraSnapshots: MetricSnapshot[] = [];
  if (hasNonPrice && deps.fetchMetrics) {
    try {
      extraSnapshots = await deps.fetchMetrics(symbols);
    } catch {
      // Fall back to quote-only snapshots for price alerts
    }
  }

  // Merge: extra snapshots override quote-only data
  const quoteSnapshots = buildSnapshotsFromQuotes(quotes);
  const snapMap = new Map<string, MetricSnapshot>();
  for (const s of quoteSnapshots) snapMap.set(s.symbol.toUpperCase(), s);
  for (const s of extraSnapshots) {
    const existing = snapMap.get(s.symbol.toUpperCase());
    snapMap.set(s.symbol.toUpperCase(), { ...existing, ...s });
  }
  const allSnapshots = Array.from(snapMap.values());

  const triggered = evaluateAlerts(pending, allSnapshots);
  if (!triggered.length) return 0;

  const now = deps.now?.() ?? new Date();
  await Promise.all(triggered.map(item =>
    deps.triggerAlert(item.id, {
      triggerPrice: item.triggerPrice,
      triggerValue: item.triggerValue,
      triggeredAt: now,
    })
  ));

  return triggered.length;
}

/**
 * Evaluate alerts for a single symbol against a just-received live price.
 * Used for responsive, on-tick alert firing instead of waiting for the
 * polling cycle. Returns the number of alerts triggered.
 */
export async function runSymbolCycle(
  deps: AlertMonitorDependencies,
  symbol: string,
  price: number,
): Promise<number> {
  if (!Number.isFinite(price)) return 0;
  const alerts = await deps.loadAlerts();
  const pending = alerts.filter(a => !a.triggered && a.symbol === symbol);
  if (!pending.length) return 0;

  // On-tick only fires price-based alerts (above/below) for responsiveness
  // Non-price alerts are handled by the polling cycle
  const priceAlerts = pending.filter(a => !needsExtraMetrics(a.condition));
  if (!priceAlerts.length) return 0;

  const triggered = evaluateAlerts(priceAlerts, [{ symbol, price }]);
  if (!triggered.length) return 0;

  const now = deps.now?.() ?? new Date();
  await Promise.all(
    triggered.map(item =>
      deps.triggerAlert(item.id, {
        triggerPrice: item.triggerPrice,
        triggerValue: item.triggerValue,
        triggeredAt: now,
      })
    ),
  );

  return triggered.length;
}

export function createAlertMonitor(startCycle: () => Promise<number>, intervalMs: number) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await startCycle();
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  void tick();

  return () => clearInterval(timer);
}
