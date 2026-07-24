# Symbol-Specific UX — Synthesis Panel & Navigation Fixes

> **Date:** 2026-07-23
> **Status:** Ready for implementation

---

## Executive Summary

Four audits of the terminal identified three categories of gaps:

1. **Structural redundancy** — 4 symbol-specific panels duplicate data already shown in IntelPanel
2. **Broken navigation** — tickers displayed in 10+ components but only clickable in 3
3. **Missing synthesis** — analyst sees 15 data sections but no "so what" interpretation

This plan consolidates 11 symbol panels into 6, adds a synthesis layer as the default symbol view, and fixes all critical navigation dead ends.

---

## Part 1: Panel Consolidation

### Current State (11 symbol-specific panels)

| Panel | ViewMode | Unique Data | Overlaps With |
|---|---|---|---|
| IntelPanel | `intel` | Signal aggregation, Intelligence Verdict | KeyRatios, Estimates, CompanyProfile, Dividends |
| ChartPanel | `chart` | Interactive charting | None (irreplaceable) |
| FinancialsPanel | `fa` | Income statement | None (unique) |
| KeyRatiosPanel | `key` | Valuation/growth/profitability grid | **100% duplicated by IntelPanel** |
| EstimatesPanel | `ee` | Analyst consensus, price targets | **100% duplicated by IntelPanel** |
| DividendsPanel | `dvd` | Payment history, annual totals | Partial overlap (yield/payout in IntelPanel) |
| OptionsPanel | `options` | Options chain | None (unique) |
| CompanyProfilePanel | `profile` | HQ, website, employees | **~80% duplicated by IntelPanel** |
| ThesisPanel | `thesis` | AI trade thesis | None (unique, but should be embedded) |
| SocialFeedPanel | `social` | Social posts, sentiment sidebar | None (unique) |
| OnChainPanel | `onchain` | Whale transactions | Partial overlap (5-txn preview in IntelPanel crypto) |

### Proposed State (6 panels + 1 new synthesis view)

| Panel | ViewMode | Role |
|---|---|---|
| **SynthesisPanel** (NEW) | `synthesis` | **Default symbol view.** Signal summary + key metrics + thesis + analyst consensus + social sentiment + drill-down nav |
| ChartPanel | `chart` | Interactive charting (unchanged) |
| FinancialsPanel | `fa` | Income statement (unchanged) |
| DividendsPanel | `dvd` | Payment history (unchanged) |
| OptionsPanel | `options` | Options chain (unchanged) |
| SocialFeedPanel | `social` | Social feed (ticker navigation fix) |
| OnChainPanel | `onchain` | Whale transactions (ticker navigation fix) |

### Panels to Delete

| Panel | Action | Why |
|---|---|---|
| `KeyRatiosPanel.tsx` | Delete | Merged into SynthesisPanel |
| `EstimatesPanel.tsx` | Delete | Merged into SynthesisPanel |
| `CompanyProfilePanel.tsx` | Delete | Merged into SynthesisPanel |
| `ThesisPanel.tsx` (standalone) | Delete | Embedded in SynthesisPanel |
| `IntelPanel.tsx` | Replace | Becomes SynthesisPanel |
| `hp` view mode | Delete | Was old IntelPanel alias |

---

## Part 2: SynthesisPanel Design

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  SYNTHESIS                                         AAPL · NASDAQ │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── SIGNAL SUMMARY ───────────────────────────────────────┐   │
│  │ Bearish bias: RSI overbought (72), valuation stretched   │   │
│  │ (P/E 28 vs sector 22), yield curve inverted.             │   │
│  │ Social sentiment bullish (+0.6, 23 mentions) — contrarian │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── PRICE ──────┐  ┌─── VALUATION ─────┐  ┌─── TECHNICALS ──┐ │
│  │ $187.44        │  │ P/E      28.2     │  │ RSI(14)  72.1   │ │
│  │ +$2.14 (+1.15%)│  │ Fwd P/E  24.1     │  │ MACD     +0.82  │ │
│  │ Vol: 52M (1.2x)│  │ EV/EBITDA 18.5    │  │ BB Upper  192   │ │
│  │ MCap: $2.9T    │  │ PEG      1.8      │  │ Support   178   │ │
│  │ Beta:  1.22    │  │ P/B      45.2     │  │ Resist    195   │ │
│  └────────────────┘  └───────────────────┘  └─────────────────┘ │
│                                                                  │
│  ┌─── AI THESIS ──────────────┐  ┌─── ANALYSTS ────────────────┐ │
│  │ [Long] Risk: Medium        │  │ Consensus: BUY (4.2/5)      │ │
│  │ Valuation stretched but    │  │ Target: $210 (+12%)         │ │
│  │ services growth intact.    │  │ Range: $180 ──●────── $240  │ │
│  │ Invalidation: $175         │  │ 14 analysts covering        │ │
│  │ [Generate] [View Full]     │  │                             │ │
│  └───────────────────────────┘  └─────────────────────────────┘ │
│                                                                  │
│  ┌─── SOCIAL ─────┐  ┌─── SIZE & SCALE ──────────────────────┐  │
│  │ Sentiment +0.6 │  │ MCap $2.9T │ Employees 164K          │  │
│  │ 23 mentions    │  │ Shares 15.5B │ Float 15.3B            │  │
│  │ Bullish (82%)  │  │ Sector: Technology │ Exchange: NASDAQ │  │
│  └────────────────┘  └───────────────────────────────────────┘  │
│                                                                  │
│  DRILL DOWN:                                                     │
│  [Chart GP] [Financials FA] [Options OMON] [News NEWS]          │
│  [Dividends DVD] [Social SCFL] [On-Chain ONCH]                  │
│                                                                  │
│  DATA STATUS: YAHOO FINANCE · REF · 15m delayed                 │
└──────────────────────────────────────────────────────────────────┘
```

### Signal Summary Logic

```typescript
// shared/signalSummary.ts

interface SignalInput {
  quote: { price: number; pe: number | null; changePercent: number; volume: number; avgVolume: number };
  technicals: { rsi14: number | null; macd: number | null; macdHistogram: number | null; support: number | null; resistance: number | null };
  fundamentals: { sectorPe: number | null; revenueGrowth: number | null };
  macro: { yieldCurve: number | null; vix: number | null };
  social: { score: number; count: number } | null;
}

interface SignalResult {
  direction: "bullish" | "bearish" | "neutral" | "mixed";
  confidence: "high" | "medium" | "low";
  signals: string[];
  summary: string; // 2-3 sentence natural language
}
```

Signals to detect:
- RSI > 70 → "RSI overbought"
- RSI < 30 → "RSI oversold"
- MACD histogram positive and increasing → "MACD bullish crossover"
- MACD histogram negative and decreasing → "MACD bearish crossover"
- Price > 200DMA → "above 200-day MA (uptrend)"
- Price < 200DMA → "below 200-day MA (downtrend)"
- P/E > sector avg * 1.3 → "valuation premium vs sector"
- P/E < sector avg * 0.7 → "valuation discount vs sector"
- Yield curve < 0 → "inverted yield curve (recession signal)"
- VIX > 25 → "elevated volatility"
- Social sentiment > 0.5 with > 10 mentions → "social sentiment strongly bullish"
- Social sentiment < -0.5 with > 10 mentions → "social sentiment strongly bearish"
- Volume > 1.5x average → "above-average volume"

Direction computed as: bull signals count vs bear signals count. Tie → "mixed".
Confidence: high if > 5 signals agree, medium if 3-4, low if 1-2.

---

## Part 3: Navigation Fixes

### Fix 1: SocialFeedPanel SentimentSidebar — tickers clickable

**File:** `src/client/src/components/panels/SocialFeedPanel.tsx`

**Change:** Pass `onSymbol` to `SentimentSidebar`. Change ticker `<span>` to `<button>` with `onClick={() => onSymbol?.(ticker)}`.

**Current code (line 109-125):**
```tsx
// SentimentSidebar renders:
<span className="font-mono font-bold text-foreground">{ticker}</span>
```

**New code:**
```tsx
<button
  onClick={() => onSymbol?.(ticker)}
  className="font-mono font-bold text-foreground hover:text-primary cursor-pointer"
>
  {ticker}
</button>
```

Also pass `onSymbol` from `SocialFeedPanel` to `SentimentSidebar` component.

### Fix 2: OnChainPanel — wire onSymbol

**File:** `src/client/src/components/panels/OnChainPanel.tsx`

**Change:** Destructure `onSymbol` from props (currently only `symbol` is destructured). Make whale transaction symbols clickable.

**Current code (line ~137):**
```tsx
<span className="font-terminal text-[10px] font-bold text-foreground">{tx.symbol}</span>
```

**New code:**
```tsx
<button
  onClick={() => onSymbol?.(tx.symbol)}
  className="font-terminal text-[10px] font-bold text-foreground hover:text-primary"
>
  {tx.symbol}
</button>
```

### Fix 3: NewsCard / NewsList — add ticker extraction and navigation

**Files:** `src/client/src/components/news/NewsCard.tsx`, `src/client/src/components/news/NewsList.tsx`

**Changes:**
1. Add `onSymbol?: (sym: string) => void` to both Props interfaces
2. In NewsCard, extract tickers from headline+summary using `extractTickers` (shared module)
3. Render extracted tickers as clickable badges below the headline
4. Thread `onSymbol` through NewsList → NewsCard

**NewsCard new rendering:**
```tsx
{/* After headline/summary text */}
{tickers.length > 0 && (
  <div className="flex gap-1 mt-1">
    {tickers.slice(0, 5).map(t => (
      <button
        key={t}
        onClick={(e) => { e.stopPropagation(); onSymbol?.(t); }}
        className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
      >
        ${t}
      </button>
    ))}
  </div>
)}
```

**Also need:** Create `shared/extractTickers.ts` that re-exports the server's `extractTickers` for client-side use. Currently `extractTickers` only exists server-side in `sentimentAnalyzer.ts`.

### Fix 4: IntelPanel → SynthesisPanel — pass onSymbol

**File:** `src/client/src/components/panels/SynthesisPanel.tsx` (new)

The new SynthesisPanel replaces IntelPanel. It receives `symbol`, `onSymbol`, and `onNav` props. All drill-down buttons use `onSymbol` for symbol navigation and `onNav` for view switching.

---

## Part 4: Chart Improvements

### Task 4.1: Add 1W and 1M intervals

**Files:**
- `src/server/marketData.ts` — add `"1w" | "1m"` to `OhlcvInterval` type
- `src/client/src/lib/chartSeries.ts` — add `"1w" | "1m"` to `ChartInterval` type
- `src/client/src/components/panels/ChartPanel.tsx` — add week/month buttons, update interval→range mapping

**Changes:**
1. Extend `OhlcvInterval` type: `"5m" | "15m" | "1h" | "1d" | "1w" | "1m"`
2. In `ChartPanel.tsx`, add to `RANGES` array: `{ label: "1Y", value: "1Y" }` already exists, add `{ label: "5Y", value: "5Y" }` and `{ label: "MAX", value: "MAX" }`
3. Map new intervals in `getAllowedIntervals()`:
   - `1w` → available for ranges `6M`, `1Y`, `2Y`, `5Y`
   - `1m` → available for ranges `1Y`, `2Y`, `5Y`
4. Yahoo API already supports `1w` and `1m` intervals — no backend changes needed beyond type extension

### Task 4.2: Expose 1-minute bars

**File:** `src/client/src/components/panels/ChartPanel.tsx`

The `YahooChartInterval` type already includes `"1m"` internally. Just add it to the UI:
1. Add `"1m"` to `OhlcvInterval` and `ChartInterval`
2. Map in `getAllowedIntervals()`: `1m` → only `1D` range
3. Intraday restriction: only available when quote freshness is `"current"` (already handled)

---

## Part 5: Data Quality

### Task 5.1: extractTickers unit tests

**File:** Create `src/server/sentimentAnalyzer.test.ts` (or add to existing test file)

**Test cases:**
```typescript
// False positive tests (should NOT match)
extractTickers("I ate an apple for lunch")        // no match (apple not in whitelist)
extractTickers("The CEO announced GDP growth")     // no match (CEO, GDP not in whitelist)
extractTickers("1.5 tesla MRI machine")            // "tesla" → TSLA (known false positive)
extractTickers("She has a BA from Harvard")        // "BA" → BA (known collision)
extractTickers("This is HD quality video")         // "HD" → HD (known collision)
extractTickers("Before Common Era, BCE dynasty")   // "BCE" → BCE (known collision)

// True positive tests (should match)
extractTickers("AAPL earnings beat expectations")  // AAPL
extractTickers("$TSLA is overvalued")              // TSLA
extractTickers("Buy NVDA before earnings")         // NVDA
extractTickers("Apple revenue grew 8%")            // AAPL (company name)
extractTickers("Tesla deliveries exceeded")        // TSLA (company name)

// Boundary tests
extractTickers("Apple's revenue report")           // AAPL (apostrophe — currently missed)
extractTickers("Tesla: reported today")            // TSLA (colon — currently missed)
extractTickers('"Apple" announced results')        // AAPL (quotes — currently missed)
```

### Task 5.2: Expand company name boundary characters

**File:** `src/server/sentimentAnalyzer.ts` — `extractTickers()` function, line 37

**Current `after` character class:**
```typescript
/[\s,;.!?)\]]/
```

**New `after` character class:**
```typescript
/[\s,;.!?)\]:'"\/\-]/
```

This adds: `'` (apostrophe), `:` (colon), `"` (quote), `/` (slash), `-` (hyphen).

**Current `before` character class:**
```typescript
/\s/
```

**New `before` character class:**
```typescript
/[\s('""\-\[]/
```

This adds: `(` (open paren), `'` (quote), `"` (quote), `-` (hyphen), `[` (bracket).

---

## Part 6: UX Polish

### Task 6.1: DataStatusBadge fallback tooltip

**File:** `src/client/src/components/data/DataStatusBadge.tsx`

Add a `title` attribute to the badge container explaining the fallback:

```tsx
<div
  className="flex items-center gap-1.5 flex-wrap"
  title={status.isFallback
    ? `${status.provider} is a fallback source. Primary provider unavailable. Data may differ.`
    : undefined
  }
>
```

### Task 6.2: Context-aware input placeholder

**File:** Already implemented in `AgentPanel.tsx` — shows "ASK ABOUT {symbol}..." when symbol is active.

**Verify:** The placeholder updates when symbol changes. Current implementation handles this via the `symbol` prop.

---

## Part 7: Implementation Order

| Phase | Tasks | Effort | Depends On |
|---|---|---|---|
| **Phase 1: Synthesis** | Tasks 1.1 (signalSummary), 1.2 (SynthesisPanel), 1.3 (panelRegistry update), 1.4 (delete dead panels) | Large | Nothing |
| **Phase 2: Navigation** | Tasks 2.1 (SocialFeedSidebar), 2.2 (OnChainPanel), 2.3 (NewsCard/NewsList ticker extraction) | Medium | Phase 1 (SynthesisPanel replaces IntelPanel) |
| **Phase 3: Charts** | Tasks 3.1 (1W/1M intervals), 3.2 (1-minute bars) | Small | Nothing |
| **Phase 4: Data Quality** | Tasks 4.1 (extractTickers tests), 4.2 (boundary chars) | Small | Nothing |
| **Phase 5: Polish** | Tasks 5.1 (fallback tooltip), 5.2 (verify context placeholder) | Small | Nothing |

Phases 3, 4, 5 are independent and can run in parallel with Phase 1.

---

## Part 8: Files Changed Summary

### New Files
| File | Purpose |
|---|---|
| `src/shared/signalSummary.ts` | Rule-based signal aggregation logic |
| `src/client/src/components/panels/SynthesisPanel.tsx` | New default symbol view |
| `src/shared/extractTickers.ts` | Client-accessible ticker extraction (re-exports server) |

### Modified Files
| File | Change |
|---|---|
| `src/client/src/components/panels/SocialFeedPanel.tsx` | Wire onSymbol to SentimentSidebar |
| `src/client/src/components/panels/OnChainPanel.tsx` | Wire onSymbol to whale tx symbols |
| `src/client/src/components/news/NewsCard.tsx` | Add onSymbol prop, extract tickers, render ticker badges |
| `src/client/src/components/news/NewsList.tsx` | Thread onSymbol through to NewsCard |
| `src/client/src/lib/panelRegistry.ts` | Add synthesis view, remove hp/key/ee/prof |
| `src/client/src/lib/terminalTypes.ts` | Add "synthesis" to ViewMode |
| `src/client/src/pages/Terminal.tsx` | Default symbol view → synthesis |
| `src/server/marketData.ts` | Extend OhlcvInterval with 1w/1m |
| `src/client/src/lib/chartSeries.ts` | Extend ChartInterval with 1w/1m |
| `src/client/src/components/panels/ChartPanel.tsx` | Add week/month buttons |
| `src/server/sentimentAnalyzer.ts` | Expand boundary character classes |
| `src/client/src/components/data/DataStatusBadge.tsx` | Add fallback tooltip |

### Deleted Files
| File | Reason |
|---|---|
| `src/client/src/components/panels/KeyRatiosPanel.tsx` | Merged into SynthesisPanel |
| `src/client/src/components/panels/EstimatesPanel.tsx` | Merged into SynthesisPanel |
| `src/client/src/components/panels/CompanyProfilePanel.tsx` | Merged into SynthesisPanel |
| `src/client/src/components/panels/ThesisPanel.tsx` | Embedded in SynthesisPanel |
| `src/client/src/components/panels/IntelPanel.tsx` | Replaced by SynthesisPanel |

---

## Part 9: Risks & Open Questions

| Risk | Mitigation |
|---|---|
| SynthesisPanel becomes the new kitchen sink | Strict scope: synthesis page shows summary cards, not full data tables. Deep data stays in dedicated panels. |
| extractTickers changes introduce new false positives | Add unit tests FIRST (Phase 4), then expand boundary chars. Run tests before deploying. |
| Deleting panels breaks keyboard shortcuts / command aliases | Update `panelRegistry.ts` aliases. Test `KEY`, `EE`, `PROF`, `HP` commands still work (should 404 or redirect to synthesis). |
| NewsCard ticker extraction adds latency | extractTickers is pure regex, <1ms per article. No performance concern. |
| 1W/1M intervals have insufficient data for short lookback ranges | Map intervals to minimum ranges: 1w requires ≥6M, 1m requires ≥1Y. Show disabled state for invalid combos. |
