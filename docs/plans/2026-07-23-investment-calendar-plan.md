# Investment Calendar — Unified Macro + Corporate Events

> **Date:** 2026-07-23
> **Status:** Ready for implementation

---

## Executive Summary

The current `EconomicsPanel` is a reactive data dump: generic FRED releases, yield curve, FX/commodities, and a 30-day calendar buried at the bottom. It has no connection to the analyst's actual holdings.

This plan replaces it with a proactive **Investment Calendar** that merges macro releases + watchlist corporate events (earnings, dividends, splits) into a single unified view, filtered by portfolio relevance, with a visual risk calendar and event-based alerts.

**Key design decisions:**
1. **Watchlist is the canonical source of truth** for "symbols I care about"
2. **Portfolio positions auto-sync to watchlist** — adding a position adds it to the watchlist
3. **Calendar is the hero section** — not buried below indicators
4. **10-day default view**, expandable to 30 days
5. **Event-based alerts** extend the existing price-based alert system

---

## Part 1: Current State

### What exists

| Component | Location | Status |
|---|---|---|
| Macro calendar (FRED, 30 days) | `economicsData.ts:446-459` | Working |
| Corporate events (earnings/dividends per symbol) | `marketData.ts:1666-1705` | Working, per-symbol only |
| Watchlist (persisted in DB) | `watchlistItems` table, `GET /api/watchlist` | Working |
| Price alerts (above/below) | `alerts` table, `POST /api/alerts` | Working |
| Macro snapshot (FRED) | `economicsData.ts:61-177` | Working |
| Yield curve (OpenBB) | `marketData.ts:1635-1651` | Working |
| Portfolio positions (local React state) | `PortfolioPanel.tsx` | **Not persisted** |
| EconomicsPanel | `EconomicsPanel.tsx` (522 lines) | Working, will be kept as "ECST" |

### What's missing

1. No unified event endpoint (macro + corporate combined)
2. No connection between watchlist and macro calendar
3. No event-based alerts (only price-based)
4. No risk calendar visualization
5. No "events for all holdings" batch endpoint
6. Portfolio positions not synced to watchlist

---

## Part 2: Watchlist as Source of Truth

### Problem

Portfolio positions are stored in `useState` inside `PortfolioPanel.tsx` (line 33) — they're lost on page refresh. The watchlist IS persisted in the database (`watchlistItems` table). The calendar needs a persisted list of symbols to fetch events for.

### Solution: Auto-sync portfolio → watchlist

When a position is added to the portfolio, automatically add it to the watchlist (if not already present).

**File:** `src/client/src/components/panels/PortfolioPanel.tsx`

```typescript
// After adding a position (line ~addMut.onSuccess):
const addPosition = (symbol: string, shares: number, avgCost: number) => {
  // 1. Add to local portfolio state
  setPositions(prev => [...prev, { id: nextId, symbol, shares, avgCost }]);
  setNextId(n => n + 1);

  // 2. Auto-add to watchlist (fire and forget)
  fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, name: symbol, instrumentId: 1 }),
  }).catch(() => {}); // ignore errors — watchlist is best-effort
};
```

**Also:** On panel mount, check if all portfolio symbols are in the watchlist. If any are missing, add them.

```typescript
// In PortfolioPanel useEffect:
useEffect(() => {
  if (!watchlist.length || !positions.length) return;
  const watchlistSymbols = new Set(watchlist.map(w => w.symbol));
  for (const pos of positions) {
    if (!watchlistSymbols.has(pos.symbol)) {
      fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: pos.symbol, name: pos.symbol, instrumentId: 1 }),
      }).catch(() => {});
    }
  }
}, [watchlist, positions]);
```

### File changes

| File | Change |
|---|---|
| `src/client/src/components/panels/PortfolioPanel.tsx` | Auto-sync positions to watchlist on add |

---

## Part 3: Unified Calendar Endpoint

### New file: `src/server/calendarAggregator.ts`

Aggregates macro releases + corporate events into a single sorted list.

**Endpoint:** `GET /api/finance/calendar/unified?days=10`

```typescript
// server/calendarAggregator.ts

import { getEconomicCalendar, type EconomicCalendarEvent } from "./economicsData";
import { getEventsForSymbol, type CorporateEvent } from "./marketData";

export type CalendarEventType = "macro" | "earnings" | "dividend" | "split";
export type EventImportance = "critical" | "high" | "medium" | "low";

export interface UnifiedCalendarEvent {
  id: string;
  date: string;                    // ISO date "2026-01-22"
  time: string | null;             // "8:30 AM CT" for macro, null for corporate
  type: CalendarEventType;
  title: string;
  importance: EventImportance;
  category: string;                // "inflation", "labor", "NVDA", etc.
  affectedSymbols: string[];       // watchlist symbols this event affects
  source: string;                  // "FRED", "Yahoo Finance"
  sourceUrl: string | null;
  macro?: {
    releaseId: number;
  };
  corporate?: {
    symbol: string;
    eventType: "earnings" | "dividend" | "split";
  };
}

export interface DayRiskScore {
  date: string;
  score: number;                   // 0-10
  level: "none" | "low" | "medium" | "high" | "critical";
  eventCount: number;
  highImpactCount: number;
}

export interface UnifiedCalendarResponse {
  events: UnifiedCalendarEvent[];
  riskScores: DayRiskScore[];
  watchlistSymbols: string[];
  source: string;
}
```

### Implementation

```typescript
// server/calendarAggregator.ts

export async function getUnifiedCalendar(
  watchlistSymbols: string[],
  days: number = 10,
): Promise<UnifiedCalendarResponse> {
  // 1. Fetch macro calendar
  const macroEvents = await getEconomicCalendar();

  // 2. Fetch corporate events for all watchlist symbols (batch, parallel)
  const corporateResults = await Promise.allSettled(
    watchlistSymbols.map(sym => getEventsForSymbol(sym))
  );

  // 3. Build unified event list
  const events: UnifiedCalendarEvent[] = [];
  const cutoffDate = addDays(new Date(), days).toISOString().slice(0, 10);

  // Macro events within window
  for (const me of macroEvents) {
    if (me.date > cutoffDate) continue;
    events.push({
      id: `macro-${me.id}`,
      date: me.date,
      time: me.timeCt,
      type: "macro",
      title: me.title,
      importance: me.importance === "high" ? "high" : "medium",
      category: me.category,
      affectedSymbols: watchlistSymbols, // high-impact macro affects all
      source: "FRED",
      sourceUrl: me.releaseUrl,
      macro: { releaseId: me.releaseId },
    });
  }

  // Corporate events within window
  for (let i = 0; i < watchlistSymbols.length; i++) {
    const sym = watchlistSymbols[i];
    const result = corporateResults[i];
    if (result.status !== "fulfilled") continue;

    for (const ce of result.value) {
      if (ce.date > cutoffDate) continue;
      events.push({
        id: `corp-${sym}-${ce.date}-${ce.type}`,
        date: ce.date,
        time: null,
        type: ce.type as CalendarEventType,
        title: `${sym} ${ce.label}`,
        importance: ce.type === "earnings" ? "high" : "medium",
        category: sym,
        affectedSymbols: [sym],
        source: "Yahoo Finance",
        sourceUrl: null,
        corporate: { symbol: sym, eventType: ce.type as "earnings" | "dividend" },
      });
    }
  }

  // 4. Sort by date, then importance
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const impOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return impOrder[a.importance] - impOrder[b.importance];
  });

  // 5. Compute risk scores
  const riskScores = computeDayRiskScores(events);

  return {
    events,
    riskScores,
    watchlistSymbols,
    source: "live",
  };
}

function computeDayRiskScores(events: UnifiedCalendarEvent[]): DayRiskScore[] {
  const byDate = new Map<string, UnifiedCalendarEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  return Array.from(byDate.entries()).map(([date, dayEvents]) => {
    const highImpact = dayEvents.filter(
      e => e.importance === "high" || e.importance === "critical"
    ).length;
    const total = dayEvents.length;
    const score = Math.min(10, highImpact * 3 + total);

    let level: DayRiskScore["level"];
    if (score >= 9) level = "critical";
    else if (score >= 6) level = "high";
    else if (score >= 3) level = "medium";
    else if (score >= 1) level = "low";
    else level = "none";

    return { date, score, level, eventCount: total, highImpactCount: highImpact };
  });
}
```

### Route

**File:** `src/server/routes.ts`

```typescript
app.get("/api/finance/calendar/unified", handleFinance(async (req) => {
  const days = Math.min(30, Math.max(1, parseInt(req.query.days as string) || 10));
  const watchlist = await storage.getWatchlist();
  const symbols = watchlist.map(w => w.symbol);
  return getUnifiedCalendar(symbols, days);
}));
```

### File changes

| File | Change |
|---|---|
| **Create:** `src/server/calendarAggregator.ts` | Unified calendar logic |
| `src/server/routes.ts` | New `GET /api/finance/calendar/unified` route |

---

## Part 4: Client-Side Calendar Panel

### New file: `src/client/src/components/panels/CalendarPanel.tsx`

Replaces EconomicsPanel as the default macro view. EconomicsPanel kept as "ECST" for detailed drill-down.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  INVESTMENT CALENDAR                         [10D] [30D] [ECST] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── RISK CALENDAR BAR ──────────────────────────────────────┐ │
│  │ Mo 21  Tu 22  We 23  Th 24  Fr 25  Mo 28  Tu 29  We 30   │ │
│  │  ●     ●●    ●●●   ●     ○     ●●    ●●●   ●●●●         │ │
│  │  ──── THIS WEEK ────  │  ──── NEXT WEEK ────              │ │
│  │  ● = low   ●● = med  ●●● = high  ●●●● = critical         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── EVENTS FOR Jan 23 ──────┐  ┌─── EVENT DETAIL ──────────┐ │
│  │ YOUR POSITIONS · 2 EVENTS  │  │                            │ │
│  │                            │  │ FOMC RATE DECISION         │ │
│  │ 🔴 NVDA Earnings           │  │ Wed Jan 23 · 2:00 PM CT   │ │
│  │    After Close · HIGH      │  │                            │ │
│  │    Affects: NVDA, SMH      │  │ Previous: 5.25-5.50%       │ │
│  │                            │  │ Expected: 5.25-5.50%       │ │
│  │ MACRO · 1 EVENT            │  │ Category: POLICY           │ │
│  │                            │  │                            │ │
│  │ 🟡 Initial Jobless Claims  │  │ RELATED POSITIONS:          │ │
│  │    8:30 AM CT · MEDIUM     │  │  NVDA · SMH · TLT          │ │
│  │    Affects: labor sector   │  │                            │ │
│  └────────────────────────────┘  │ [SET ALERT] [VIEW FRED]   │ │
│                                  └────────────────────────────┘ │
│                                                                  │
│  ┌─── MACRO REGIME ──────┐  ┌─── YIELD CURVE ───────────────┐  │
│  │ CPI  3.4% ↑           │  │ [chart] 2s10s: +25bps NORMAL │  │
│  │ FFR  5.25% →          │  │                              │  │
│  │ 10Y  4.15% ↑          │  │                              │  │
│  └────────────────────────┘  └──────────────────────────────┘  │
│                                                                  │
│  DATA STATUS: FRED · Yahoo · 15m delayed                        │
└──────────────────────────────────────────────────────────────────┘
```

### Component structure

```typescript
// CalendarPanel.tsx

export default function CalendarPanel({ onSymbol, onNav }: Props) {
  const [windowDays, setWindowDays] = useState<10 | 30>(10);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: calendar, isLoading } = useUnifiedCalendar(windowDays);
  const { data: watchlist = [] } = useWatchlist();
  const watchlistSymbols = watchlist.map(w => w.symbol);

  // Auto-select today if it has events, otherwise first event date
  useEffect(() => {
    if (!calendar?.events.length) return;
    const today = todayISO();
    const todayEvents = calendar.events.filter(e => e.date === today);
    if (todayEvents.length > 0) {
      setSelectedDate(today);
    } else {
      setSelectedDate(calendar.events[0].date);
    }
  }, [calendar]);

  const dayEvents = calendar?.events.filter(e => e.date === selectedDate) ?? [];
  const selectedEvent = calendar?.events.find(e => e.id === selectedEventId) ?? null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with window toggle */}
      <CalendarHeader
        windowDays={windowDays}
        onWindowChange={setWindowDays}
        onNav={onNav}
      />

      {/* Risk calendar bar */}
      <RiskCalendarBar
        riskScores={calendar?.riskScores ?? []}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
      />

      {/* Main content: event list + detail */}
      <div className="flex flex-1 min-h-0">
        <EventList
          events={dayEvents}
          watchlistSymbols={watchlistSymbols}
          selectedEventId={selectedEventId}
          onSelect={setSelectedEventId}
          isLoading={isLoading}
        />
        <EventDetail
          event={selectedEvent}
          watchlistSymbols={watchlistSymbols}
          onSymbol={onSymbol}
        />
      </div>

      {/* Bottom: macro regime + yield curve */}
      <MacroRegimeBar />
    </div>
  );
}
```

### Component: `RiskCalendarBar`

Horizontal bar showing next 10 days with color-coded risk dots.

```tsx
function RiskCalendarBar({ riskScores, selectedDate, onSelect }: {
  riskScores: DayRiskScore[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const RISK_COLORS: Record<string, string> = {
    none: "bg-muted-foreground/20",
    low: "bg-green-500/60",
    medium: "bg-yellow-500/60",
    high: "bg-orange-500/60",
    critical: "bg-red-500/80",
  };

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 border-b border-border bg-[#070707]">
      <div className="flex items-center gap-1">
        {riskScores.map(day => (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors ${
              day.date === selectedDate ? "bg-white/10" : "hover:bg-white/5"
            }`}
          >
            <span className="text-[8px] text-muted-foreground font-terminal">
              {formatDayLabel(day.date)}
            </span>
            <div className={`w-2 h-2 rounded-full ${RISK_COLORS[day.level]}`} />
            {day.highImpactCount > 0 && (
              <span className="text-[7px] text-muted-foreground/60 font-terminal">
                {day.eventCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Component: `EventList`

Left panel: events for selected day, grouped by relevance.

```tsx
function EventList({ events, watchlistSymbols, selectedEventId, onSelect, isLoading }: {
  events: UnifiedCalendarEvent[];
  watchlistSymbols: string[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}) {
  // Group: watchlist-relevant first, then generic macro
  const relevant = events.filter(e =>
    e.affectedSymbols.some(s => watchlistSymbols.includes(s))
  );
  const generic = events.filter(e =>
    !e.affectedSymbols.some(s => watchlistSymbols.includes(s))
  );

  if (isLoading) return <Skeleton className="h-full" />;

  return (
    <div className="w-[40%] min-w-[280px] border-r border-border overflow-y-auto scrollbar-thin">
      {relevant.length > 0 && (
        <div className="px-3 py-1.5 text-[8px] text-muted-foreground tracking-widest font-terminal">
          YOUR POSITIONS · {relevant.length}
        </div>
      )}
      {relevant.map(e => (
        <EventRow
          key={e.id}
          event={e}
          isActive={e.id === selectedEventId}
          onSelect={onSelect}
        />
      ))}

      {generic.length > 0 && (
        <div className="px-3 py-1.5 text-[8px] text-muted-foreground tracking-widest font-terminal">
          MACRO · {generic.length}
        </div>
      )}
      {generic.map(e => (
        <EventRow
          key={e.id}
          event={e}
          isActive={e.id === selectedEventId}
          onSelect={onSelect}
        />
      ))}

      {events.length === 0 && (
        <div className="p-4 text-xs text-muted-foreground text-center">
          No events this day
        </div>
      )}
    </div>
  );
}
```

### Component: `EventRow`

Single event row with importance indicator and affected symbols.

```tsx
const IMPORTANCE_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

const TYPE_ICONS: Record<string, string> = {
  macro: "📊",
  earnings: "📈",
  dividend: "💰",
  split: "🔀",
};

function EventRow({ event, isActive, onSelect }: {
  event: UnifiedCalendarEvent;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(event.id)}
      className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${
        isActive ? "bg-[hsl(186,45%,50%)/8%]" : "hover:bg-white/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">{TYPE_ICONS[event.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="font-terminal text-sm text-foreground leading-snug truncate">
            {event.title}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {event.time && (
              <span className="text-[9px] text-muted-foreground font-terminal">
                {event.time}
              </span>
            )}
            <span className={`text-[8px] font-terminal ${IMPORTANCE_COLORS[event.importance]}`}>
              {event.importance.toUpperCase()}
            </span>
          </div>
          {event.affectedSymbols.length > 0 && event.affectedSymbols.length <= 5 && (
            <div className="flex gap-1 mt-1">
              {event.affectedSymbols.map(s => (
                <span key={s} className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
```

### Component: `EventDetail`

Right panel: detailed info about selected event.

```tsx
function EventDetail({ event, watchlistSymbols, onSymbol }: {
  event: UnifiedCalendarEvent | null;
  watchlistSymbols: string[];
  onSymbol: (sym: string) => void;
}) {
  if (!event) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        Select an event to view details
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-5">
      <div className="panel-label mb-2">EVENT DETAIL</div>
      <h2 className="font-terminal text-lg text-foreground leading-tight">
        {event.title}
      </h2>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <span className={`text-[9px] font-terminal ${IMPORTANCE_COLORS[event.importance]}`}>
          {event.importance.toUpperCase()} IMPACT
        </span>
        <span className="text-[9px] text-muted-foreground font-terminal">
          {formatEventDate(event.date)} {event.time ? `· ${event.time}` : ""}
        </span>
        <span className="text-[9px] text-muted-foreground font-terminal">
          Source: {event.source}
        </span>
      </div>

      {/* Affected positions */}
      {event.affectedSymbols.length > 0 && (
        <div className="mt-4">
          <div className="text-[8px] text-muted-foreground tracking-widest font-terminal mb-2">
            AFFECTED POSITIONS
          </div>
          <div className="flex gap-2">
            {event.affectedSymbols.map(s => (
              <button
                key={s}
                onClick={() => onSymbol(s)}
                className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <button className="px-3 py-1.5 border border-border hover:border-primary/40 text-[9px] font-terminal tracking-widest text-muted-foreground hover:text-primary transition-colors">
          SET ALERT
        </button>
        {event.sourceUrl && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 border border-border hover:border-primary/40 text-[9px] font-terminal tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <ExternalLink size={10} />
            VIEW SOURCE
          </a>
        )}
      </div>

      {/* Future: show historical context, consensus, previous values */}
    </div>
  );
}
```

### File changes

| File | Change |
|---|---|
| **Create:** `src/client/src/components/panels/CalendarPanel.tsx` | New calendar panel |
| `src/client/src/lib/terminalTypes.ts` | Add `"calendar"` to ViewMode union |
| `src/client/src/lib/panelRegistry.ts` | Register CalendarPanel as `calendar` view |
| `src/client/src/lib/useFinance.ts` | Add `useUnifiedCalendar()` hook |
| `src/client/src/pages/Terminal.tsx` | Default macro view → calendar |

---

## Part 5: Client Hook

**File:** `src/client/src/lib/useFinance.ts`

```typescript
export interface UnifiedCalendarEvent {
  id: string;
  date: string;
  time: string | null;
  type: "macro" | "earnings" | "dividend" | "split";
  title: string;
  importance: "critical" | "high" | "medium" | "low";
  category: string;
  affectedSymbols: string[];
  source: string;
  sourceUrl: string | null;
  macro?: { releaseId: number };
  corporate?: { symbol: string; eventType: string };
}

export interface DayRiskScore {
  date: string;
  score: number;
  level: "none" | "low" | "medium" | "high" | "critical";
  eventCount: number;
  highImpactCount: number;
}

export interface UnifiedCalendarResponse {
  events: UnifiedCalendarEvent[];
  riskScores: DayRiskScore[];
  watchlistSymbols: string[];
  source: string;
}

export function useUnifiedCalendar(days: number = 10) {
  return useQuery<UnifiedCalendarResponse>({
    queryKey: ["/api/finance/calendar/unified", days],
    queryFn: async () => {
      const res = await fetch(`/api/finance/calendar/unified?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch unified calendar");
      return res.json();
    },
    refetchInterval: 15 * 60_000,  // refresh every 15 min
    staleTime: 14 * 60_000,
  });
}
```

---

## Part 6: Event-Based Alerts

### Schema extension

**File:** `src/shared/schema.ts`

Add new columns to `alerts` table:

```typescript
export const alerts = pgTable("alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id),
  symbol: text("symbol").notNull(),
  condition: text("condition").notNull(),
  // Existing: "above", "below"
  // New: "event_before", "event_after"
  price: real("price"),                          // null for event-based alerts
  eventId: text("event_id"),                     // NEW: links to calendar event
  eventLeadTimeHours: integer("event_lead_time_hours"), // NEW: e.g., 24 = "alert 24h before"
  triggered: boolean("triggered").default(false).notNull(),
  triggerPrice: real("trigger_price"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  triggeredAt: timestamp("triggered_at"),
});
```

Update insert schema:

```typescript
export const insertAlertSchema = z.object({
  instrumentId: z.number().int().positive().optional(),  // optional for event-based
  symbol: z.string().trim().min(1),
  condition: z.enum(["above", "below", "event_before", "event_after"]),
  price: z.number().finite().positive().optional(),       // optional for event-based
  eventId: z.string().optional(),                         // NEW
  eventLeadTimeHours: z.number().int().min(1).max(168).optional(), // NEW: max 7 days
});
```

### Alert checker

**File:** `src/server/storage.ts`

Add method to check event-based alerts:

```typescript
async function checkEventAlerts(): Promise<void> {
  const now = new Date();
  const alerts = await storage.getAlerts();

  for (const alert of alerts) {
    if (alert.triggered) continue;
    if (alert.condition !== "event_before" && alert.condition !== "event_after") continue;
    if (!alert.eventId || !alert.eventLeadTimeHours) continue;

    // Parse event date from eventId (format: "macro-123:2026-01-22:8:30 AM CT" or "corp-NVDA-2026-01-22-earnings")
    const eventDate = extractDateFromEventId(alert.eventId);
    if (!eventDate) continue;

    const eventTime = new Date(eventDate).getTime();
    const leadTimeMs = alert.eventLeadTimeHours * 60 * 60 * 1000;
    const triggerWindow = eventTime - leadTimeMs;

    if (now.getTime() >= triggerWindow && now.getTime() <= eventTime) {
      await storage.updateAlertTriggered(alert.id);
      console.log(`[alert] Event alert triggered: ${alert.symbol} - ${alert.eventId}`);
    }
  }
}

function extractDateFromEventId(eventId: string): string | null {
  // "macro-123:2026-01-22:8:30 AM CT" → "2026-01-22"
  // "corp-NVDA-2026-01-22-earnings" → "2026-01-22"
  const macroMatch = eventId.match(/macro-\d+:(\d{4}-\d{2}-\d{2}):/);
  if (macroMatch) return macroMatch[1];
  const corpMatch = eventId.match(/corp-\w+-(\d{4}-\d{2}-\d{2})-/);
  if (corpMatch) return corpMatch[1];
  return null;
}
```

### Route for creating event alerts

**File:** `src/server/routes.ts`

```typescript
app.post("/api/alerts/event", async (req, res) => {
  const { symbol, eventId, leadTimeHours } = req.body;
  if (!symbol || !eventId || !leadTimeHours) {
    return res.status(400).json({ error: "symbol, eventId, and leadTimeHours required" });
  }
  const alert = await storage.addAlert({
    symbol,
    condition: "event_before",
    eventId,
    eventLeadTimeHours: leadTimeHours,
    instrumentId: 1, // default
    price: 0, // not used for event alerts
  });
  res.json(alert);
});
```

### File changes

| File | Change |
|---|---|
| `src/shared/schema.ts` | Add `eventId`, `eventLeadTimeHours` to alerts table |
| `src/server/storage.ts` | Add `checkEventAlerts()`, update `insertAlertSchema` |
| `src/server/routes.ts` | New `POST /api/alerts/event` route |

---

## Part 7: Macro Regime Bar

Compact indicator at the bottom of CalendarPanel showing macro trend direction.

```tsx
function MacroRegimeBar() {
  const { data: econ } = useEconomics();

  if (!econ) return null;

  const indicators = [
    {
      label: "CPI",
      value: econ.cpi.value,
      prev: econ.cpi.prev,
      format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: "FFR",
      value: econ.fedFunds.value,
      prev: econ.fedFunds.prev,
      format: (v: number) => `${v.toFixed(2)}%`,
    },
    {
      label: "10Y",
      value: econ.t10y.value,
      prev: econ.t10y.prev,
      format: (v: number) => `${v.toFixed(2)}%`,
    },
    {
      label: "UNEMP",
      value: econ.unemployment.value,
      prev: econ.unemployment.prev,
      format: (v: number) => `${v.toFixed(1)}%`,
    },
  ];

  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-border bg-[#070707]">
      <span className="text-[8px] text-muted-foreground tracking-widest font-terminal">REGIME</span>
      {indicators.map(ind => (
        <div key={ind.label} className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground font-terminal">{ind.label}</span>
          <span className="text-[10px] text-foreground font-terminal font-bold">
            {ind.format(ind.value)}
          </span>
          <TrendArrow current={ind.value} previous={ind.prev} />
        </div>
      ))}
    </div>
  );
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return <span className="text-muted-foreground/40">→</span>;
  if (diff > 0) return <span className="text-red-400">↑</span>;
  return <span className="text-green-400">↓</span>;
}
```

---

## Part 8: Panel Registration

**File:** `src/client/src/lib/panelRegistry.ts`

```typescript
calendar: {
  label: "INVESTMENT CALENDAR",
  code: "CAL",
  icon: Calendar,
  kbd: "C",
  needsSymbol: false,
  isSecurityView: false,
  showInTopBar: false,
  category: "market",
  aliases: ["CAL", "CALENDAR", "EVENTS"],
  component: CalendarPanel,
},
```

**File:** `src/client/src/lib/terminalTypes.ts`

Add `"calendar"` to ViewMode union.

---

## Part 9: Implementation Order

| Phase | Tasks | Effort | Depends On |
|---|---|---|---|
| **Phase 1: Unified endpoint** | `calendarAggregator.ts`, batch `getEventsForSymbol`, merge logic, route | Medium | Nothing |
| **Phase 2: Watchlist sync** | Portfolio → watchlist auto-sync in `PortfolioPanel.tsx` | Small | Nothing |
| **Phase 3: Client hooks** | `useUnifiedCalendar()` in `useFinance.ts` | Small | Phase 1 |
| **Phase 4: CalendarPanel** | `CalendarPanel.tsx`, `RiskCalendarBar`, `EventList`, `EventDetail` | Large | Phase 3 |
| **Phase 5: Panel registration** | `panelRegistry.ts`, `terminalTypes.ts`, `Terminal.tsx` default | Small | Phase 4 |
| **Phase 6: Alert extension** | Schema migration, `checkEventAlerts()`, `POST /api/alerts/event` | Medium | Phase 1 |
| **Phase 7: Macro regime** | `MacroRegimeBar` component | Small | Nothing |
| **Phase 8: Polish** | 10D/30D toggle, countdown timers, collapse old EconomicsPanel sections | Small | Phase 5 |

Phases 1, 2, 7 can run in parallel. Phase 4 depends on Phase 3. Phase 6 depends on Phase 1. Phase 8 depends on Phase 5.

---

## Part 10: Files Changed Summary

### New Files
| File | Purpose |
|---|---|
| `src/server/calendarAggregator.ts` | Unified calendar endpoint, risk scoring, day aggregation |
| `src/client/src/components/panels/CalendarPanel.tsx` | New calendar panel with risk bar, event list, detail, regime |

### Modified Files
| File | Change |
|---|---|
| `src/server/routes.ts` | New `GET /api/finance/calendar/unified` and `POST /api/alerts/event` routes |
| `src/shared/schema.ts` | Add `eventId`, `eventLeadTimeHours` to alerts table |
| `src/server/storage.ts` | Add `checkEventAlerts()` method |
| `src/client/src/lib/terminalTypes.ts` | Add `"calendar"` to ViewMode |
| `src/client/src/lib/panelRegistry.ts` | Register CalendarPanel |
| `src/client/src/lib/useFinance.ts` | Add `useUnifiedCalendar()` hook |
| `src/client/src/pages/Terminal.tsx` | Default macro view → calendar |
| `src/client/src/components/panels/PortfolioPanel.tsx` | Auto-sync positions to watchlist |

### Unchanged Files (kept as-is)
| File | Reason |
|---|---|
| `src/server/economicsData.ts` | Reused by calendarAggregator |
| `src/client/src/components/panels/EconomicsPanel.tsx` | Kept as "ECST" for detailed macro drill-down |
| `src/server/marketData.ts` | `getEventsForSymbol()` reused as-is |

---

## Part 11: Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Batch `getEventsForSymbol` for many watchlist symbols is slow | Cache TTL is 1 hour. First load may take 2-3s for 10+ symbols. Subsequent loads are cached. |
| Yahoo Finance earnings dates are estimates, not confirmed | Show "Est." label next to earnings dates. FRED calendar is authoritative for macro. |
| Event-based alerts may fire at odd hours (weekends) | Only trigger during market hours (check if date is a trading day). Or fire anytime — analyst may want weekend prep. |
| Portfolio positions lost on refresh (local state) | This is a separate issue. The watchlist sync ensures calendar events are fetched regardless. Portfolio persistence is a future enhancement. |
| `instrumentId: 1` default in watchlist auto-sync is a hack | When adding a position, look up or create the instrument first. For now, default works for single-user mode. |
| 30-day window may be slow if watchlist has 20+ symbols | Parallel fetch + caching makes this manageable. Can add progressive loading (show first 10 days immediately, load rest in background). |
