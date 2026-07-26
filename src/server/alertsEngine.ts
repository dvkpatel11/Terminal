import type { AlertCondition } from "@shared/schema";

interface AlertCheck {
  condition: AlertCondition;
  price: number; // threshold value
}

export interface MetricSnapshot {
  symbol: string;
  price: number;
  pe?: number | null;
  volume?: number | null;
  rsi14?: number | null;
  macd?: number | null;
}

interface StoredAlert extends AlertCheck {
  id: number;
  symbol: string;
  triggered: boolean;
}

function isPriceCondition(condition: AlertCondition): boolean {
  return condition === "above" || condition === "below";
}

function evaluateMetric(
  condition: AlertCondition,
  threshold: number,
  snapshot: MetricSnapshot,
): { triggered: boolean; triggerValue: number | null } {
  let currentValue: number | null = null;

  switch (condition) {
    case "above":
      currentValue = snapshot.price;
      return { triggered: snapshot.price >= threshold, triggerValue: snapshot.price };
    case "below":
      currentValue = snapshot.price;
      return { triggered: snapshot.price <= threshold, triggerValue: snapshot.price };
    case "pe_above":
      currentValue = snapshot.pe ?? null;
      return currentValue != null
        ? { triggered: currentValue >= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "pe_below":
      currentValue = snapshot.pe ?? null;
      return currentValue != null
        ? { triggered: currentValue <= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "volume_above":
      currentValue = snapshot.volume ?? null;
      return currentValue != null
        ? { triggered: currentValue >= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "volume_below":
      currentValue = snapshot.volume ?? null;
      return currentValue != null
        ? { triggered: currentValue <= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "rsi_above":
      currentValue = snapshot.rsi14 ?? null;
      return currentValue != null
        ? { triggered: currentValue >= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "rsi_below":
      currentValue = snapshot.rsi14 ?? null;
      return currentValue != null
        ? { triggered: currentValue <= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "macd_above":
      currentValue = snapshot.macd ?? null;
      return currentValue != null
        ? { triggered: currentValue >= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    case "macd_below":
      currentValue = snapshot.macd ?? null;
      return currentValue != null
        ? { triggered: currentValue <= threshold, triggerValue: currentValue }
        : { triggered: false, triggerValue: null };
    default:
      return { triggered: false, triggerValue: null };
  }
}

export function evaluateAlertTrigger(alert: AlertCheck, snapshot: MetricSnapshot) {
  return evaluateMetric(alert.condition, alert.price, snapshot);
}

export function evaluateAlerts(alerts: StoredAlert[], snapshots: MetricSnapshot[]) {
  const snapBySymbol = new Map(snapshots.map(s => [s.symbol.toUpperCase(), s]));

  return alerts.flatMap(alert => {
    if (alert.triggered) return [];
    const snapshot = snapBySymbol.get(alert.symbol.toUpperCase());
    if (!snapshot) return [];

    const result = evaluateMetric(alert.condition, alert.price, snapshot);
    if (!result.triggered || result.triggerValue === null) return [];

    return [{
      id: alert.id,
      symbol: alert.symbol,
      triggerPrice: isPriceCondition(alert.condition) ? result.triggerValue : snapshot.price,
      triggerValue: result.triggerValue,
    }];
  });
}
