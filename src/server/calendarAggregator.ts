/**
 * Unified calendar aggregator.
 *
 * Merges economic events (FRED) and corporate events (earnings/dividends)
 * into a single timeline with risk classification and watchlist mapping.
 */

import { getEconomicCalendar, type EconomicCalendarEvent } from "./economicsData";
import { getEventsForSymbol, type CorporateEvent } from "./marketData";
import { extendedStorage } from "./storage";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UnifiedCalendarEvent {
  id: string;
  date: string;             // YYYY-MM-DD
  type: "economic" | "earnings" | "dividend" | "split" | "fed";
  title: string;
  symbol?: string;          // corporate events only
  importance: "high" | "medium" | "low";
  impact?: string;          // expected market impact
  previous?: string;
  consensus?: string;
  source: string;
}

export interface CalendarDay {
  date: string;
  dayLabel: string;
  events: UnifiedCalendarEvent[];
  riskLevel: "high" | "medium" | "low" | "none";
}

export interface UnifiedCalendar {
  days: CalendarDay[];
  highRiskDates: string[];
  watchlistEvents: Record<string, UnifiedCalendarEvent[]>;
  generatedAt: string;
}

// ─── Importance Mapping ─────────────────────────────────────────────────────

const ECONOMIC_IMPORTANCE: Record<string, "high" | "medium" | "low"> = {
  "CPI": "high",
  "Consumer Price Index": "high",
  "Employment Situation": "high",
  "Non-Farm Payrolls": "high",
  "Federal Funds Rate": "high",
  "FOMC": "high",
  "GDP": "high",
  "ISM Manufacturing": "medium",
  "ISM Services": "medium",
  "Retail Sales": "medium",
  "Industrial Production": "medium",
  "Housing Starts": "low",
  "Building Permits": "low",
  "Consumer Confidence": "medium",
  "Initial Jobless Claims": "low",
  "Trade Balance": "low",
  "Durable Goods": "medium",
  "JOLTS": "medium",
  "ADP Employment": "medium",
  "Michigan Consumer Sentiment": "medium",
};

function getEconomicImportance(title: string): "high" | "medium" | "low" {
  for (const [key, level] of Object.entries(ECONOMIC_IMPORTANCE)) {
    if (title.toLowerCase().includes(key.toLowerCase())) return level;
  }
  return "low";
}

function getFedImpact(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("fomc") || lower.includes("fed") || lower.includes("federal funds");
}

// ─── Day Labels ─────────────────────────────────────────────────────────────

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff <= 7) return `In ${diff} days`;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function riskFromEvents(events: UnifiedCalendarEvent[]): "high" | "medium" | "low" | "none" {
  if (events.some(e => e.importance === "high")) return "high";
  if (events.some(e => e.importance === "medium")) return "medium";
  if (events.length > 0) return "low";
  return "none";
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

export async function getUnifiedCalendar(
  watchlistSymbols: string[] = [],
  days = 14,
): Promise<UnifiedCalendar> {
  const now = new Date();
  const allEvents: UnifiedCalendarEvent[] = [];

  // Fetch economic calendar
  try {
    const econEvents = await getEconomicCalendar(now);
    for (const e of econEvents) {
      allEvents.push({
        id: `econ-${e.releaseId}-${e.date}`,
        date: e.date,
        type: getFedImpact(e.title) ? "fed" : "economic",
        title: e.title,
        importance: getEconomicImportance(e.title),
        source: "FRED",
      });
    }
  } catch {}

  // Fetch corporate events for watchlist symbols (top 10 to control cost)
  const symbolsToFetch = watchlistSymbols.slice(0, 10);
  const corporateResults = await Promise.allSettled(
    symbolsToFetch.map(sym => getEventsForSymbol(sym))
  );

  const watchlistEvents: Record<string, UnifiedCalendarEvent[]> = {};

  for (let i = 0; i < symbolsToFetch.length; i++) {
    const symbol = symbolsToFetch[i];
    const result = corporateResults[i];
    if (result.status !== "fulfilled" || !result.value) continue;

    const events: UnifiedCalendarEvent[] = [];
    for (const e of result.value) {
      const ue: UnifiedCalendarEvent = {
        id: `corp-${symbol}-${e.date}-${e.type}`,
        date: e.date,
        type: e.type as UnifiedCalendarEvent["type"],
        title: e.label,
        symbol,
        importance: e.type === "earnings" ? "high" : "low",
        source: "Yahoo",
      };
      allEvents.push(ue);
      events.push(ue);
    }
    if (events.length > 0) {
      watchlistEvents[symbol] = events;
    }
  }

  // Sort all events by date
  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  // Build day buckets
  const dayMap = new Map<string, UnifiedCalendarEvent[]>();
  for (const e of allEvents) {
    const existing = dayMap.get(e.date) ?? [];
    existing.push(e);
    dayMap.set(e.date, existing);
  }

  const highRiskDates: string[] = [];
  const days_out: CalendarDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const events = dayMap.get(dateStr) ?? [];
    const risk = riskFromEvents(events);

    if (risk === "high") highRiskDates.push(dateStr);

    days_out.push({
      date: dateStr,
      dayLabel: getDayLabel(dateStr),
      events,
      riskLevel: risk,
    });
  }

  return {
    days: days_out,
    highRiskDates,
    watchlistEvents,
    generatedAt: now.toISOString(),
  };
}
