# Portfolio Command Center — Positions, Plays, Theses & Risk

> **Date:** 2026-07-23
> **Status:** Ready for implementation

---

## Executive Summary

The current portfolio system is three disconnected, ephemeral components:
- `PortfolioPanel.tsx` — local React state, lost on refresh
- `PlaysPanel.tsx` — local React state, lost on refresh
- `ThesisPanel.tsx` — standalone per-symbol, not linked to positions

This plan merges all three into a single persisted **Portfolio Command Center** that:
1. Persists all positions (stocks, options, ETFs, commodities, crypto) in the database
2. Integrates plays (planned/active) into positions — eliminates PlaysPanel
3. Auto-generates a thesis per position using a free model (NVIDIA API)
4. Updates theses daily with macro regime context
5. Provides portfolio-level rating, sector coverage, and risk summary
6. Records intent actions (trim/exit/hold/add) per position

---

## Part 1: Current State Audit

| Component | Location | Problem |
|---|---|---|
| PortfolioPanel | `PortfolioPanel.tsx` (223 lines) | `useState` — lost on refresh |
| PlaysPanel | `PlaysPanel.tsx` (414 lines) | `useState` — lost on refresh |
| ThesisPanel | `ThesisPanel.tsx` (271 lines) | Standalone, not linked to positions |
| thesisGenerator | `thesisGenerator.ts` (458 lines) | Uses Claude (costs money), no macro regime |
| portfolioAnalytics | `portfolioAnalytics.ts` | Works but only for mark-to-market |
| play-tracker-roadmap | `plans/play-tracker-roadmap.md` | 5-phase plan, Phase 0 (persistence) is this plan |

---

## Part 2: Schema — Extend Watchlist into Positions

### Current `watchlistItems` table

```typescript
// shared/schema.ts:37-44
watchlistItems = pgTable("watchlist_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});
```

### New `positions` table (replaces watchlist for portfolio tracking)

```typescript
// shared/schema.ts

export const positions = pgTable("positions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),

  // Asset classification
  assetType: text("asset_type").notNull(),  // "stock" | "etf" | "option" | "commodity" | "crypto"
  sector: text("sector"),                    // from Yahoo profile: "Technology", "Energy", etc.
  industry: text("industry"),                // from Yahoo profile: "Semiconductors", etc.

  // Position details
  direction: text("direction").notNull(),    // "long" | "short"
  shares: real("shares").notNull(),          // shares, contracts, units, BTC, etc.
  avgCost: real("avg_cost").notNull(),       // average entry price
  currentPrice: real("current_price"),       // cached from last quote fetch
  currency: text("currency").default("USD"),

  // Option-specific fields (null for non-options)
  optionType: text("option_type"),           // "call" | "put"
  strikePrice: real("strike_price"),
  expirationDate: text("expiration_date"),   // ISO date

  // Play fields (merged from PlaysPanel)
  status: text("status").notNull(),          // "open" | "closed" | "planned"
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  entryDate: text("entry_date"),             // ISO date
  exitDate: text("exit_date"),               // ISO date
  exitPrice: real("exit_price"),
  outcome: text("outcome"),                  // "win" | "loss" | "breakeven"

  // Source tracking
  source: text("source").default("manual"), // "manual" | "broker" | "signal"

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Position history (fills and closes)

```typescript
export const positionFills = pgTable("position_fills", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  positionId: integer("position_id").references(() => positions.id).notNull(),
  action: text("action").notNull(),         // "buy" | "sell" | "open" | "close"
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  fees: real("fees").default(0),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  notes: text("notes"),
});
```

### Thesis table (linked to positions)

```typescript
export const positionTheses = pgTable("position_theses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  positionId: integer("position_id").references(() => positions.id).notNull(),
  symbol: text("symbol").notNull(),

  // Thesis content (structured)
  direction: text("direction").notNull(),    // "long" | "short"
  thesisSummary: text("thesis_summary").notNull(),
  bullCase: text("bull_case"),
  bearCase: text("bear_case"),
  invalidationLevel: real("invalidation_level"),
  riskStatus: text("risk_status"),           // "low" | "medium" | "high" | "critical"
  confidence: real("confidence"),            // 0-1
  timelineDays: integer("timeline_days"),    // estimated holding period

  // Key catalysts (JSON array)
  keyCatalysts: text("key_catalysts"),       // JSON stringified array

  // Macro regime context at generation time
  macroRegime: text("macro_regime"),         // "risk-on" | "risk-off" | "neutral"
  macroContext: text("macro_context"),       // JSON: { cpi, ffr, vix, yieldCurveShape }

  // Data quality
  dataFeedsUsed: text("data_feeds_used"),    // JSON: { fundamentals, technicals, macro, news, social, scorecard }
  model: text("model"),                      // model used for generation
  generatedAt: timestamp("generated_at").notNull(),

  // Daily update tracking
  lastUpdated: timestamp("last_updated").notNull(),
  updateCount: integer("update_count").default(1),
});
```

### Intent records (action buttons)

```typescript
export const positionIntents = pgTable("position_intents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  positionId: integer("position_id").references(() => positions.id).notNull(),
  action: text("action").notNull(),         // "trim" | "exit" | "hold" | "add"
  details: text("details"),                  // JSON: { shares, reason, stopLevel }
  status: text("status").notNull(),          // "pending" | "executed" | "cancelled"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  executedAt: timestamp("executed_at"),
});
```

### Migration: watchlistItems → positions

Existing `watchlistItems` data migrates to `positions` with defaults:
- `assetType`: "stock" (default)
- `direction`: "long" (default)
- `shares`: 0 (unknown — analyst fills in)
- `avgCost`: 0 (unknown)
- `status`: "open"

The `watchlistItems` table is **kept** for backward compatibility (other panels reference it). The calendar aggregator and social feed still use watchlist for symbol lists. Positions are the new source of truth for portfolio tracking.

---

## Part 3: Free Model for Thesis Generation

### Current state

- `claudeApi.ts` wraps Anthropic (costs money per token)
- `routes.ts:469-471` has NVIDIA API configured: `minimaxai/minimax-m3` (free tier)
- Chat endpoint already uses NVIDIA for the AI agent

### Decision: Use NVIDIA API (already configured, free)

The `minimaxai/minimax-m3` model on NVIDIA's API is:
- Free (NVIDIA AI Foundation free tier)
- 128K context window (enough for all data feeds)
- Capable of structured JSON output
- Already wired into the codebase

### New file: `src/server/nvidiaApi.ts`

Thin wrapper around NVIDIA chat completions API (similar to `claudeApi.ts`):

```typescript
// server/nvidiaApi.ts

import { resilientFetch } from "./providerUtils";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export interface NvidiaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NvidiaResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function nvidiaChat(
  system: string,
  messages: NvidiaMessage[],
  maxTokens: number = 4096,
): Promise<NvidiaResponse> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const model = process.env.NVIDIA_MODEL ?? "minimaxai/minimax-m3";
  const start = Date.now();

  const res = await resilientFetch(
    {
      name: "nvidia",
      retry: { maxAttempts: 2, baseDelayMs: 1500 },
      circuitBreaker: { threshold: 5, cooldownMs: 120_000 },
    },
    `${NVIDIA_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(`NVIDIA API ${res.status}: ${body?.error?.message || res.statusText}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - start;

  return {
    content,
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

export function parseNvidiaJson<T>(content: string): T {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return JSON.parse(cleaned) as T;
}
```

### Modified: `src/server/thesisGenerator.ts`

Replace `claudeMessages` with `nvidiaChat`:

```typescript
// thesisGenerator.ts — change import
import { nvidiaChat, parseNvidiaJson } from "./nvidiaApi";

// In generateTradeThesis():
const result = await nvidiaChat(
  THESIS_SYSTEM_PROMPT,
  [{ role: "user", content: userMessage }],
  4096,
);
const thesis = parseNvidiaJson<TradeThesis>(result.content);
```

### Macro regime context injection

The thesis system prompt includes macro regime at generation time:

```typescript
function buildMacroContext(macro: LiveMacroSnapshot): string {
  const vix = macro.t10y && macro.t2y ? (macro.t10y - macro.t2y) * 100 : null;
  const yieldCurveShape = vix !== null
    ? vix < -20 ? "inverted" : vix < 20 ? "flat" : "steep"
    : "unknown";

  let regime: "risk-on" | "risk-off" | "neutral";
  if (yieldCurveShape === "inverted" && (macro.cpi ?? 0) > 3) regime = "risk-off";
  else if (yieldCurveShape === "steep" && (macro.unemployment ?? 0) < 4) regime = "risk-on";
  else regime = "neutral";

  return JSON.stringify({
    regime,
    yieldCurveShape,
    cpi: macro.cpi,
    fedFunds: macro.fedFunds,
    unemployment: macro.unemployment,
    gdpGrowth: macro.gdp,
    t10y: macro.t10y,
  });
}
```

### Enhanced thesis prompt with timelines

```typescript
const THESIS_SYSTEM = `You are a portfolio analyst generating a trade thesis. Return ONLY a JSON object with this schema:

{
  "thesis_summary": "2-3 sentence core thesis",
  "bull_case": "what drives the upside",
  "bear_case": "what drives the downside",
  "key_catalysts": ["catalyst 1", "catalyst 2"],
  "invalidation_level": <price that invalidates the thesis>,
  "risk_status": "low" | "medium" | "high" | "critical",
  "upside_status": "favorable" | "neutral" | "unfavorable",
  "downside_status": "limited" | "moderate" | "severe",
  "confidence": <0-1>,
  "timeline_days": <estimated days to thesis outcome>,
  "timeline_reasoning": "why this timeframe"
}

Rules:
- Include macro regime context in your analysis
- timeline_days should reflect the expected holding period based on catalysts and technical setup
- Key catalysts should include specific dates when possible (earnings, FDA, FOMC)
- Invalidation level should be based on technical support/resistance and fundamental thresholds
- Consider position size relative to portfolio concentration risk
- Confidence should reflect data quality: low if data feeds were incomplete`;
```

---

## Part 4: Daily Thesis Updates

### Scheduler

A daily job runs at market close (4:00 PM ET) that:
1. Fetches all open positions
2. For each position, checks if thesis is stale (>24h or material price move)
3. Regenerates thesis with fresh macro context
4. Updates the `positionTheses` table

### Implementation

```typescript
// server/dailyThesisUpdate.ts

import { getUnifiedCalendar } from "./calendarAggregator";

export async function runDailyThesisUpdate(): Promise<void> {
  const positions = await storage.getPositions();
  const openPositions = positions.filter(p => p.status === "open" || p.status === "planned");

  console.log(`[thesis-daily] Updating ${openPositions.length} position theses...`);

  for (const position of openPositions) {
    try {
      const existingThesis = await storage.getThesisForPosition(position.id);

      // Skip if thesis is fresh (< 24h) and no material price move
      if (existingThesis && !isThesisStale(existingThesis, position)) {
        continue;
      }

      // Generate new thesis
      const result = await generateTradeThesis({
        symbol: position.symbol,
        direction: position.direction as "long" | "short",
        entryPrice: position.avgCost,
        size: position.shares * position.avgCost,
        thesis: existingThesis?.thesisSummary ?? undefined,
      });

      // Persist
      await storage.upsertThesis({
        positionId: position.id,
        symbol: position.symbol,
        direction: position.direction,
        thesisSummary: result.thesis.thesis_summary,
        bullCase: result.thesis.bull_case,
        bearCase: result.thesis.bear_case,
        invalidationLevel: result.thesis.invalidation_level,
        riskStatus: result.thesis.risk_status,
        confidence: result.thesis.confidence,
        timelineDays: result.thesis.timeline_days,
        keyCatalysts: JSON.stringify(result.thesis.key_catalysts),
        macroRegime: extractMacroRegime(result.auditLog.macroSnapshot),
        macroContext: buildMacroContext(result.auditLog.macroSnapshot),
        dataFeedsUsed: JSON.stringify(result.dataFeeds),
        model: result.model,
        generatedAt: new Date(),
        lastUpdated: new Date(),
        updateCount: (existingThesis?.updateCount ?? 0) + 1,
      });

      console.log(`[thesis-daily] Updated ${position.symbol}: ${result.thesis.risk_status} risk, ${Math.round(result.thesis.confidence * 100)}% confidence`);
    } catch (error) {
      console.error(`[thesis-daily] Failed to update ${position.symbol}:`, error);
    }
  }
}

function isThesisStale(thesis: any, position: any): boolean {
  const age = Date.now() - new Date(thesis.lastUpdated).getTime();
  if (age > 24 * 60 * 60 * 1000) return true; // > 24h

  // Material price move (> 5% from thesis generation price)
  if (position.currentPrice && thesis.invalidationLevel) {
    const genPrice = thesis.entryPrice ?? position.avgCost;
    const movePct = Math.abs((position.currentPrice - genPrice) / genPrice * 100);
    if (movePct > 5) return true;
  }

  return false;
}
```

### Cron schedule

```typescript
// In server/index.ts — daily at 4:15 PM ET (after market close)
import cron from "node-cron";

cron.schedule("15 16 * * 1-5", () => {
  runDailyThesisUpdate().catch(err => {
    console.error("[cron] Daily thesis update failed:", err);
  });
}, { timezone: "America/New_York" });
```

---

## Part 5: Portfolio Dashboard Layout

### New file: `src/client/src/components/panels/PortfolioDashboard.tsx`

Replaces PortfolioPanel + PlaysPanel as the main portfolio view.

```
┌──────────────────────────────────────────────────────────────────┐
│  PORTFOLIO                              Rating: A- (78/100)     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── SUMMARY ─────────────────────────────────────────────────┐ │
│  │ Value: $124,500  │ P&L: +$8,200 (+7.1%)  │ Beta: 1.15     │ │
│  │ Today: +$340     │ Win Rate: 67%          │ Positions: 8    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── RISK ALERTS ─────────────────────────────────────────────┐ │
│  │ ⚠ NVDA within 5% of invalidation ($175) — thesis HIGH risk  │ │
│  │ ⚠ TSLA earnings in 3 days — thesis may be stale             │ │
│  │ ⚠ Portfolio 42% concentrated in Technology sector           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── POSITIONS ───────────────────────────────────────────────┐ │
│  │ SYM  TYPE  DIR  QTY  ENTRY   NOW     P&L     THESIS  ACT   │ │
│  │ NVDA stock long 50   $450    $520    +$3.5K  HIGH ⚠  [···] │ │
│  │ AAPL stock long 100  $170    $187    +$1.7K  MED   [···]   │ │
│  │ BTC  crypto long 0.5 $42K    $48K    +$3K    LOW   [···]   │ │
│  │ CL   comm  long 2    $72     $78     +$1.2K  MED   [···]   │ │
│  │ TLT  ETF   long 200  $95     $88     -$1.4K  HIGH ⚠  [···] │ │
│  │ ...                                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── SECTOR COVERAGE ─────────────────────────────────────────┐ │
│  │ Technology 42% ████████████████████  NVDA, AAPL, MSFT      │ │
│  │ Energy     18% ████████              XOM, CL                │ │
│  │ Crypto     15% ██████                BTC, ETH               │ │
│  │ Fixed Inc  12% █████                 TLT, AGG               │ │
│  │ Healthcare  8% ███                   JNJ                    │ │
│  │ Other       5% ██                    —                      │ │
│  │                                                              │ │
│  │ RISKS: Heavy tech concentration. No international exposure. │ │
│  │        Rate-sensitive (TLT). Commodity exposure minimal.     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── UPCOMING ────────────────────────────────────────────────┐ │
│  │ Wed Jan 22: FOMC Rate Decision (all positions affected)     │ │
│  │ Thu Jan 23: NVDA Earnings (NVDA, SMH)                       │ │
│  │ Fri Jan 24: Initial Jobless Claims (labor-sensitive)        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [ADD POSITION] [VIEW THESIS] [INTENT LOG] [HISTORY]            │
└──────────────────────────────────────────────────────────────────┘
```

### Component breakdown

```typescript
// PortfolioDashboard.tsx

export default function PortfolioDashboard({ onSymbol, onNav }: Props) {
  const { data: positions = [] } = usePositions();
  const { data: theses = [] } = usePositionTheses();
  const { data: calendar } = useUnifiedCalendar(7);
  const { data: quotes = [] } = useQuotes(positions.filter(p => p.status === "open").map(p => p.symbol));

  const openPositions = positions.filter(p => p.status === "open");
  const plannedPositions = positions.filter(p => p.status === "planned");
  const closedPositions = positions.filter(p => p.status === "closed");

  // Compute portfolio metrics
  const metrics = useMemo(() => computePortfolioMetrics(openPositions, quotes, theses), [openPositions, quotes, theses]);
  const sectorSummary = useMemo(() => computeSectorSummary(openPositions, theses), [openPositions, theses]);
  const riskAlerts = useMemo(() => computeRiskAlerts(openPositions, theses, calendar), [openPositions, theses, calendar]);
  const portfolioRating = useMemo(() => computePortfolioRating(metrics, sectorSummary, riskAlerts), [metrics, sectorSummary, riskAlerts]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {/* Summary cards */}
      <SummaryStrip metrics={metrics} portfolioRating={portfolioRating} />

      {/* Risk alerts */}
      {riskAlerts.length > 0 && <RiskAlertBar alerts={riskAlerts} onSymbol={onSymbol} />}

      {/* Positions table */}
      <PositionsTable
        positions={openPositions}
        theses={theses}
        quotes={quotes}
        onSymbol={onSymbol}
        onAction={handleAction}
      />

      {/* Sector coverage */}
      <SectorCoverage summary={sectorSummary} />

      {/* Upcoming events */}
      {calendar && <UpcomingEvents events={calendar.events.slice(0, 5)} onSymbol={onSymbol} />}

      {/* Action bar */}
      <ActionBar onAddPosition={handleAddPosition} onNav={onNav} />
    </div>
  );
}
```

---

## Part 6: Position Types

### Asset type handling

| Type | `shares` meaning | `avgCost` meaning | Extra fields |
|---|---|---|---|
| `stock` | Number of shares | Average cost per share | — |
| `etf` | Number of shares | Average cost per share | — |
| `option` | Number of contracts × 100 | Premium per contract | `optionType`, `strikePrice`, `expirationDate` |
| `commodity` | Number of contracts or units | Average cost per unit | — |
| `crypto` | Quantity (e.g., 0.5 BTC) | Average cost per unit | — |

### Add position form

```typescript
function AddPositionForm({ onAdd }: { onAdd: (pos: NewPosition) => void }) {
  const [assetType, setAssetType] = useState<"stock" | "etf" | "option" | "commodity" | "crypto">("stock");

  return (
    <form className="grid grid-cols-2 gap-3 p-3 border border-border bg-[#080808]">
      {/* Row 1: Asset type + Symbol + Direction */}
      <select value={assetType} onChange={...}>
        <option value="stock">STOCK</option>
        <option value="etf">ETF</option>
        <option value="option">OPTION</option>
        <option value="commodity">COMMODITY</option>
        <option value="crypto">CRYPTO</option>
      </select>
      <input placeholder="SYMBOL" ... />
      <select value={direction} ...>
        <option value="long">LONG</option>
        <option value="short">SHORT</option>
      </select>

      {/* Row 2: Shares + Avg Cost + Date */}
      <input type="number" placeholder={assetType === "option" ? "CONTRACTS" : "QTY"} ... />
      <input type="number" placeholder="AVG COST" step="0.01" ... />
      <input type="date" placeholder="ENTRY DATE" ... />

      {/* Row 3: Option-specific (conditional) */}
      {assetType === "option" && (
        <>
          <select value={optionType} ...>
            <option value="call">CALL</option>
            <option value="put">PUT</option>
          </select>
          <input type="number" placeholder="STRIKE" ... />
          <input type="date" placeholder="EXPIRATION" ... />
        </>
      )}

      {/* Row 4: Play fields (optional) */}
      <input type="number" placeholder="TARGET PRICE" ... />
      <input type="number" placeholder="STOP LOSS" ... />

      <button type="submit">ADD POSITION</button>
    </form>
  );
}
```

---

## Part 7: Portfolio Rating

### Algorithm

```typescript
// shared/portfolioRating.ts

interface PortfolioRatingInput {
  diversification: number;   // 0-100: sector spread, # positions
  riskLevel: number;         // 0-100: avg thesis risk, concentration
  thesisHealth: number;      // 0-100: avg confidence, staleness
  performance: number;       // 0-100: P&L, win rate, R:R
}

function computePortfolioRating(input: PortfolioRatingInput): {
  score: number;      // 0-100
  grade: string;      // A+, A, A-, B+, B, B-, C+, C, C-, D, F
  breakdown: Record<string, number>;
} {
  const weights = {
    diversification: 0.25,
    riskLevel: 0.25,
    thesisHealth: 0.25,
    performance: 0.25,
  };

  const score = Math.round(
    input.diversification * weights.diversification +
    (100 - input.riskLevel) * weights.riskLevel +  // invert: lower risk = higher score
    input.thesisHealth * weights.thesisHealth +
    input.performance * weights.performance
  );

  const grade =
    score >= 95 ? "A+" : score >= 90 ? "A" : score >= 85 ? "A-" :
    score >= 80 ? "B+" : score >= 75 ? "B" : score >= 70 ? "B-" :
    score >= 65 ? "C+" : score >= 60 ? "C" : score >= 55 ? "C-" :
    score >= 50 ? "D" : "F";

  return { score, grade, breakdown: input };
}
```

### Score components

**Diversification (0-100):**
- +10 per unique sector (max 50)
- +5 per position (max 20)
- +30 if no sector > 30% of portfolio
- -20 if any sector > 50% of portfolio

**Risk Level (0-100, inverted for rating):**
- Average of thesis risk_status (low=20, medium=50, high=80, critical=100)
- Concentration penalty: +10 per position > 20% of portfolio
- -10 if all positions have stop losses set

**Thesis Health (0-100):**
- Average of thesis confidence × 100
- -20 per thesis > 24h stale
- -10 per thesis with < 4/6 data feeds

**Performance (0-100):**
- Win rate × 100 (if any closed positions)
- +20 if avg R:R > 2
- -10 if max drawdown > 20%

---

## Part 8: Sector Coverage & Risk Summary

### Sector mapping

Use Yahoo profile data (already fetched for fundamentals) to map each position to a sector:

```typescript
// shared/sectorSummary.ts

const SECTOR_REVENUE_STREAMS: Record<string, string[]> = {
  "Technology": ["hardware", "software", "cloud", "AI", "semiconductors"],
  "Energy": ["oil & gas", "renewables", "midstream"],
  "Healthcare": ["pharma", "biotech", "devices", "insurance"],
  "Financial Services": ["banking", "insurance", "fintech", "asset management"],
  "Consumer Cyclical": ["retail", "auto", "travel", "media"],
  "Consumer Defensive": ["food", "beverage", "household", "tobacco"],
  "Industrials": ["aerospace", "defense", "transport", "machinery"],
  "Real Estate": ["REITs", "residential", "commercial"],
  "Basic Materials": ["mining", "chemicals", "packaging"],
  "Utilities": ["electric", "gas", "water", "renewable"],
  "Communication Services": ["telecom", "entertainment", "social"],
};

interface SectorSummary {
  sectors: Array<{
    name: string;
    weight: number;          // % of portfolio
    positions: string[];     // symbols
    revenueStreams: string[]; // sub-categories
  }>;
  risks: string[];           // computed risk flags
}

function computeSectorSummary(
  positions: Position[],
  theses: Thesis[],
): SectorSummary {
  const sectorMap = new Map<string, { value: number; symbols: string[] }>();
  let totalValue = 0;

  for (const pos of positions) {
    const value = pos.shares * (pos.currentPrice ?? pos.avgCost);
    totalValue += value;
    const sector = pos.sector ?? "Other";
    if (!sectorMap.has(sector)) sectorMap.set(sector, { value: 0, symbols: [] });
    sectorMap.get(sector)!.value += value;
    sectorMap.get(sector)!.symbols.push(pos.symbol);
  }

  const sectors = Array.from(sectorMap.entries())
    .map(([name, data]) => ({
      name,
      weight: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      positions: data.symbols,
      revenueStreams: SECTOR_REVENUE_STREAMS[name] ?? [],
    }))
    .sort((a, b) => b.weight - a.weight);

  // Compute risks
  const risks: string[] = [];
  const maxSector = sectors[0];
  if (maxSector && maxSector.weight > 40) {
    risks.push(`Heavy ${maxSector.name} concentration (${maxSector.weight.toFixed(0)}%)`);
  }
  if (sectors.length < 3) {
    risks.push(`Low diversification — only ${sectors.length} sectors`);
  }
  const rateSensitive = positions.filter(p => ["TLT", "AGG", "BND"].includes(p.symbol));
  if (rateSensitive.length > 0) {
    risks.push("Rate-sensitive fixed income exposure");
  }

  return { sectors, risks };
}
```

---

## Part 9: Plays Integration

### Merging PlaysPanel into PortfolioDashboard

The existing `PlaysPanel.tsx` tracks planned/active plays. These become positions with `status: "planned"` or `status: "open"` in the new positions table.

**What changes:**
- `PlaysPanel.tsx` is **deleted**
- All play fields (`targetPrice`, `stopLoss`, `status`, `outcome`) are columns in the `positions` table
- The PositionsTable component shows planned plays in a separate section
- The "planned → active" workflow becomes "planned → open" (status change)

### PositionsTable layout

```
┌─── OPEN POSITIONS (8) ─────────────────────────────────────────┐
│ SYM  TYPE  DIR  QTY  ENTRY   NOW     P&L     THESIS  ACTIONS  │
│ NVDA stock long 50   $450    $520    +$3.5K  HIGH ⚠  [···]   │
│ AAPL stock long 100  $170    $187    +$1.7K  MED   [···]     │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘

┌─── PLANNED (2) ────────────────────────────────────────────────┐
│ SYM  TYPE  DIR  TARGET  STOP    THESIS         ACTIONS         │
│ AMD  stock long $180    $140    "AI cycle..."  [ACTIVATE] [···]│
│ ETH  crypto long $5000  $3500   "Merge..."     [ACTIVATE] [···]│
└─────────────────────────────────────────────────────────────────┘

┌─── CLOSED (5) ─────────────────────────────────────────────────┐
│ SYM  DIR  ENTRY  EXIT   P&L     OUTCOME  DATE                  │
│ META long $320   $380   +$600   WIN      Jan 15                │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 10: Intent Records (Action Buttons)

### How it works

When the analyst clicks TRIM/EXIT/HOLD/ADD on a position, it creates an intent record:

```typescript
interface PositionIntent {
  id: number;
  positionId: number;
  action: "trim" | "exit" | "hold" | "add";
  details: {
    shares?: number;       // how many to trim/add
    reason?: string;       // why
    stopLevel?: number;    // for HOLD + stop update
  };
  status: "pending" | "executed" | "cancelled";
  createdAt: Date;
  executedAt?: Date;
}
```

### Action buttons per position

```tsx
function PositionActions({ position, thesis, onAction }: {
  position: Position;
  thesis: PositionThesis | null;
  onAction: (action: string, details: any) => void;
}) {
  if (position.status !== "open") return null;

  return (
    <div className="flex gap-1">
      <button
        onClick={() => onAction("trim", { shares: Math.ceil(position.shares * 0.25) })}
        className="px-2 py-1 text-[8px] border border-border hover:border-amber-500/40 text-muted-foreground hover:text-amber-400"
        title="Trim 25%"
      >
        TRIM
      </button>
      <button
        onClick={() => onAction("exit", { shares: position.shares })}
        className="px-2 py-1 text-[8px] border border-border hover:border-red-500/40 text-muted-foreground hover:text-red-400"
        title="Exit full position"
      >
        EXIT
      </button>
      <button
        onClick={() => onAction("hold", { stopLevel: thesis?.invalidationLevel })}
        className="px-2 py-1 text-[8px] border border-border hover:border-green-500/40 text-muted-foreground hover:text-green-400"
        title="Hold — update stop to invalidation level"
      >
        HOLD
      </button>
      <button
        onClick={() => onAction("add", { shares: Math.ceil(position.shares * 0.5) })}
        className="px-2 py-1 text-[8px] border border-border hover:border-cyan-500/40 text-muted-foreground hover:text-cyan-400"
        title="Add 50%"
      >
        ADD
      </button>
    </div>
  );
}
```

---

## Part 11: Implementation Order

| Phase | Tasks | Effort | Depends On |
|---|---|---|---|
| **Phase 1: Schema** | `positions`, `positionFills`, `positionTheses`, `positionIntents` tables + migration | Medium | Nothing |
| **Phase 2: Storage + API** | CRUD for positions, theses, intents in `storage.ts` + routes | Medium | Phase 1 |
| **Phase 3: NVIDIA API** | `nvidiaApi.ts` wrapper, modify `thesisGenerator.ts` to use it | Small | Nothing |
| **Phase 4: Thesis generation** | Enhanced prompt with macro regime, timelines, daily update scheduler | Medium | Phase 2, 3 |
| **Phase 5: PortfolioDashboard** | Main panel: summary, positions table, sector coverage, risk alerts | Large | Phase 2 |
| **Phase 6: Position form** | Add/edit form with all asset types (stock, option, ETF, commodity, crypto) | Medium | Phase 2 |
| **Phase 7: Actions + intents** | TRIM/EXIT/HOLD/ADD buttons, intent records | Small | Phase 2 |
| **Phase 8: Portfolio rating** | `portfolioRating.ts`, rating display in header | Small | Phase 5 |
| **Phase 9: Sector summary** | `sectorSummary.ts`, sector coverage + risk flags | Small | Phase 5 |
| **Phase 10: Calendar integration** | Show upcoming events per position from unified calendar | Small | Phase 5, calendar plan |
| **Phase 11: Delete PlaysPanel** | Remove PlaysPanel, update panelRegistry | Small | Phase 5 |
| **Phase 12: Polish** | Closed positions history, intent log, position fill history | Small | All |

---

## Part 12: Files Changed Summary

### New Files
| File | Purpose |
|---|---|
| `src/server/nvidiaApi.ts` | Free NVIDIA API wrapper for thesis generation |
| `src/server/dailyThesisUpdate.ts` | Daily scheduler for thesis refresh |
| `src/client/src/components/panels/PortfolioDashboard.tsx` | Main portfolio panel |
| `src/client/src/components/panels/components/PositionsTable.tsx` | Positions table with actions |
| `src/client/src/components/panels/components/AddPositionForm.tsx` | Multi-asset add form |
| `src/client/src/components/panels/components/SectorCoverage.tsx` | Sector breakdown + risks |
| `src/client/src/components/panels/components/RiskAlertBar.tsx` | Risk alerts strip |
| `src/shared/portfolioRating.ts` | Portfolio rating algorithm |
| `src/shared/sectorSummary.ts` | Sector mapping + risk computation |

### Modified Files
| File | Change |
|---|---|
| `src/shared/schema.ts` | New tables: `positions`, `positionFills`, `positionTheses`, `positionIntents` |
| `src/server/storage.ts` | CRUD for new tables |
| `src/server/routes.ts` | New API routes for positions, theses, intents |
| `src/server/thesisGenerator.ts` | Switch from Claude to NVIDIA, add macro regime context |
| `src/client/src/lib/useFinance.ts` | `usePositions()`, `usePositionTheses()`, `usePositionIntents()` hooks |
| `src/client/src/lib/panelRegistry.ts` | Register PortfolioDashboard, remove PlaysPanel |
| `src/client/src/lib/terminalTypes.ts` | Update ViewMode |
| `src/client/src/pages/Terminal.tsx` | Default portfolio view → PortfolioDashboard |
| `package.json` | Add `node-cron` dependency for daily scheduler |

### Deleted Files
| File | Reason |
|---|---|
| `src/client/src/components/panels/PlaysPanel.tsx` | Merged into PortfolioDashboard |
| `src/client/src/components/panels/PortfolioPanel.tsx` | Replaced by PortfolioDashboard |

---

## Part 13: Risks & Open Questions

| Risk | Mitigation |
|---|---|
| NVIDIA free tier may have rate limits | Daily thesis updates for 10 positions = ~10 API calls/day. Well within free tier. |
| `node-cron` adds a dependency | Lightweight, no native bindings. Alternative: `setInterval` check (less precise). |
| Positions table has many columns (20+) | Group into sections in the form. Options fields only show when assetType="option". |
| Migrating watchlistItems data | One-time migration script. Existing watchlist stays as-is for calendar/social. |
| Thesis quality from free model vs Claude | Monitor confidence scores. If consistently low, add fallback to Claude for critical positions. |
| Position types complexity (options have strikes, expirations) | Conditional form fields. Options are the most complex — handle last. |
