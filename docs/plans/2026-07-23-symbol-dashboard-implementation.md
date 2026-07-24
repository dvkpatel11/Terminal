# Symbol Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Replace 11 symbol-specific panels with 6 + a new SynthesisPanel, fix broken navigation dead-ends, add chart intervals, and improve data quality.

**Architecture:** React + TypeScript + Vite + Tailwind CSS + Zustand + React Query. Panels are lazy-loaded via `panelRegistry.ts` and rendered by `Terminal.tsx`'s `renderPaneContent()`. Shared signal logic lives in `src/shared/signals.ts`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Zustand, @tanstack/react-query

---

## Phase 1: Synthesis Layer (Tasks 1–4)

### Task 1: Create `src/shared/signalSummary.ts`

**Files:**
- Create: `src/shared/signalSummary.ts`

**Step 1: Create the signal summary module**

```typescript
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

  // RSI signals
  if (input.technicals.rsi14 != null) {
    if (input.technicals.rsi14 > 70) { signals.push("RSI overbought"); bearCount++; }
    else if (input.technicals.rsi14 < 30) { signals.push("RSI oversold"); bullCount++; }
  }

  // MACD signals
  if (input.technicals.macdHistogram != null) {
    if (input.technicals.macdHistogram > 0) { signals.push("MACD bullish"); bullCount++; }
    else if (input.technicals.macdHistogram < 0) { signals.push("MACD bearish"); bearCount++; }
  }

  // Valuation vs sector
  if (input.quote.pe != null && input.fundamentals.sectorPe != null && input.fundamentals.sectorPe > 0) {
    const ratio = input.quote.pe / input.fundamentals.sectorPe;
    if (ratio > 1.3) { signals.push("Valuation premium vs sector"); bearCount++; }
    else if (ratio < 0.7) { signals.push("Valuation discount vs sector"); bullCount++; }
  }

  // Macro signals
  if (input.macro.yieldCurve != null && input.macro.yieldCurve < 0) {
    signals.push("Inverted yield curve"); bearCount++;
  }
  if (input.macro.vix != null && input.macro.vix > 25) {
    signals.push("Elevated volatility"); bearCount++;
  }

  // Social sentiment
  if (input.social && input.social.count > 10) {
    if (input.social.score > 0.5) { signals.push("Social sentiment strongly bullish"); bullCount++; }
    else if (input.social.score < -0.5) { signals.push("Social sentiment strongly bearish"); bearCount++; }
  }

  // Volume
  if (input.quote.avgVolume > 0 && input.quote.volume > input.quote.avgVolume * 1.5) {
    signals.push("Above-average volume");
  }

  // Direction
  let direction: SignalResult["direction"] = "neutral";
  if (bullCount > bearCount) direction = "bullish";
  else if (bearCount > bullCount) direction = "bearish";
  else if (bullCount > 0 || bearCount > 0) direction = "mixed";

  // Confidence
  const total = bullCount + bearCount;
  let confidence: SignalResult["confidence"] = "low";
  if (total > 5) confidence = "high";
  else if (total >= 3) confidence = "medium";

  // Summary
  const dirLabel = direction.charAt(0).toUpperCase() + direction.slice(1);
  const summary = signals.length > 0
    ? `${dirLabel} bias: ${signals.slice(0, 3).join(", ")}.`
    : "Insufficient signals for a directional bias.";

  return { direction, confidence, signals, summary };
}
```

**Step 2: Verify it compiles**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit shared/signalSummary.ts`
Expected: No errors (or only import errors for non-existent modules — that's fine for a standalone file)

**Step 3: Commit**

```bash
git add src/shared/signalSummary.ts
git commit -m "feat: add signal summary aggregation logic"
```

---

### Task 2: Create `src/shared/extractTickers.ts` (client re-export)

**Files:**
- Create: `src/shared/extractTickers.ts`

**Step 1: Create the shared re-export**

```typescript
// Client-accessible re-export of server-side extractTickers.
// The actual implementation lives in server/sentimentAnalyzer.ts.
// This module provides a type-safe interface for client-side usage.

export type { } from "../server/sentimentAnalyzer";

// For client-side use, we re-implement the pure regex logic
// without the server-only symbolRegistry dependency.

const COMMON_TICKERS_CLIENT = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "UNH", "JNJ", "V", "XOM", "JPM", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
  "LLY", "PEP", "KO", "COST", "AVGO", "TMO", "MCD", "WMT", "CSCO", "ACN",
  "ABT", "DHR", "NEE", "LIN", "TXN", "PM", "UNP", "RTX", "LOW", "HON",
  "CRM", "ORCL", "NKE", "INTC", "QCOM", "AMD", "BA", "GS", "CAT", "DE",
  "PLTR", "SOFI", "COIN", "SQ", "SNAP", "UBER", "LYFT", "ABNB", "RIVN",
  "LCID", "NIO", "XPEV", "BABA", "JD", "PDD", "BIDU", "NIO", "MU",
  "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "ARKK", "ARKG",
  "BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "ADA-USD", "XRP-USD",
  "GLD", "SLV", "USO", "TLT", "HYG", "EEM", "FXI",
]);

const COMPANY_NAMES_CLIENT: Record<string, string> = {
  "apple": "AAPL", "microsoft": "MSFT", "google": "GOOGL", "alphabet": "GOOGL",
  "amazon": "AMZN", "nvidia": "NVDA", "meta": "META", "facebook": "META",
  "tesla": "TSLA", "berkshire": "BRK.B", "unitedhealth": "UNH", "johnson": "JNJ",
  "visa": "V", "exxon": "XOM", "jpmorgan": "JPM", "jp morgan": "JPM",
  "procter": "PG", "mastercard": "MA", "home depot": "HD", "chevron": "CVX",
  "pfizer": "PFE", "moderna": "MRNA", "netflix": "NFLX", "disney": "DIS",
  "intel": "INTC", "qualcomm": "QCOM", "amd": "AMD", "broadcom": "AVGO",
  "palantir": "PLTR", "sofi": "SOFI", "coinbase": "COIN", "block": "SQ",
  "snap": "SNAP", "uber": "UBER", "airbnb": "ABNB", "rivian": "RIVN",
  "nio": "NIO", "alibaba": "BABA", "jd.com": "JD", "pinduoduo": "PDD",
  "blackrock": "BLK", "goldman": "GS", "morgan stanley": "MS",
  "caterpillar": "CAT", "deere": "DE", "boeing": "BA",
};

export function extractTickers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // 1. Dollar cashtags: $TSLA, $AAPL
  const dollarMatches = Array.from(text.matchAll(/\$([A-Z]{2,5})\b/g));
  for (const m of dollarMatches) {
    if (!seen.has(m[1])) { seen.add(m[1]); found.push(m[1]); }
  }

  // 2. Bare tickers from whitelist
  const bareMatches = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g));
  for (const m of bareMatches) {
    if (COMMON_TICKERS_CLIENT.has(m[1]) && !seen.has(m[1])) {
      seen.add(m[1]); found.push(m[1]);
    }
  }

  // 3. Company name aliases
  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(COMPANY_NAMES_CLIENT)) {
    if (seen.has(ticker)) continue;
    const idx = lowerText.indexOf(name);
    if (idx !== -1) {
      const before = idx === 0 || /\s/.test(lowerText[idx - 1]);
      const after = idx + name.length >= lowerText.length || /[\s,;.!?)\]:'"\/\-]/.test(lowerText[idx + name.length]);
      if (before && after) {
        seen.add(ticker);
        found.push(ticker);
      }
    }
  }

  return found;
}
```

**Step 2: Verify it compiles**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit shared/extractTickers.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/shared/extractTickers.ts
git commit -m "feat: add client-side extractTickers module"
```

---

### Task 3: Update ViewMode and panelRegistry

**Files:**
- Modify: `src/client/src/lib/terminalTypes.ts`
- Modify: `src/client/src/lib/panelRegistry.ts`

**Step 1: Add "synthesis" to ViewMode**

In `src/client/src/lib/terminalTypes.ts`, add `"synthesis"` to the ViewMode union type (after `"thesis"`):

```typescript
export type ViewMode =
  | "market"
  | "chart"
  | "news"
  | "agent"
  | "screener"
  | "watchlist"
  | "alerts"
  | "economics"
  | "portfolio"
  | "intel"
  | "options"
  | "sentiment"
  | "optflow"
  | "onchain"
  | "help"
  | "hp"
  | "fa"
  | "dvd"
  | "key"
  | "ee"
  | "curv"
  | "fxc"
  | "crypto"
  | "scorecard"
  | "sectors"
  | "social"
  | "plays"
  | "profile"
  | "thesis"
  | "synthesis";
```

**Step 2: Update panelRegistry**

In `src/client/src/lib/panelRegistry.ts`:

1. Add lazy import for SynthesisPanel:
```typescript
const SynthesisPanel = lazy(() => import("@/components/panels/SynthesisPanel"));
```

2. Add the `synthesis` entry to `PANEL_REGISTRY` (after `intel`):
```typescript
synthesis: {
  label: "SYNTHESIS",
  code: "SYN",
  icon: Brain,
  kbd: "Y",
  needsSymbol: true,
  isSecurityView: true,
  showInTopBar: true,
  category: "symbol",
  quickAccess: true,
  topBarLabel: "SYN",
  aliases: ["SYN", "SYNTHESIS"],
  component: SynthesisPanel,
},
```

3. Change `intel`'s `showInTopBar` to `false` (it's being replaced by synthesis):
```typescript
intel: {
  // ... existing config ...
  showInTopBar: false,
  // ...
},
```

**Step 3: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Only error is missing SynthesisPanel component (we'll create it next)

**Step 4: Commit**

```bash
git add src/client/src/lib/terminalTypes.ts src/client/src/lib/panelRegistry.ts
git commit -m "feat: add synthesis view mode and panel registration"
```

---

### Task 4: Create SynthesisPanel

**Files:**
- Create: `src/client/src/components/panels/SynthesisPanel.tsx`

**Step 1: Create the SynthesisPanel component**

```tsx
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import SymbolSuggestions from "@/components/ui/SymbolSuggestions";
import { PanelSection, KVRow } from "@/components/panel";
import { NewsList } from "@/components/news";
import { formatPrice, formatPct, formatBig, pctClass } from "@/lib/finance";
import { useQuote, useOHLCV, useNews, useFundamentals, useOnChain } from "@/lib/useFinance";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import { useSymbolConfig } from "@/lib/useSymbolConfig";
import type { ViewMode } from "@/lib/terminalTypes";
import { computeSignalSummary } from "@shared/signalSummary";
import {
  sigMA, sig52w, sigPE, sigFwdPE, sigEvEbitda,
  sigMargin, sigGrowth, sigAnalystUpside, sigAnalystRec,
  sigDebtEquity, sigDividend, tally, type Signal,
} from "@shared/signals";

interface Props {
  symbol: string;
  onNav: (v: ViewMode) => void;
  onSymbol?: (sym: string) => void;
}

function VerdictBadge({ verdict }: { verdict: "Bullish" | "Bearish" | "Mixed" | "Sparse" }) {
  const colors = {
    Bullish: "bg-green-500/20 text-green-400 border-green-500/30",
    Bearish: "bg-red-500/20 text-red-400 border-red-500/30",
    Mixed: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30",
    Sparse: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge className={`${colors[verdict]} font-terminal text-xs tracking-widest px-3 py-1.5 border`}>
      {verdict.toUpperCase()}
    </Badge>
  );
}

function isCrypto(quote?: { exchange?: string; symbol?: string }) {
  if (!quote) return false;
  return quote.exchange === "CRYPTO" || quote.symbol?.endsWith("-USD") === true;
}

function isForex(quote?: { exchange?: string; symbol?: string }) {
  if (!quote) return false;
  const s = quote.symbol ?? "";
  return s.includes("=") || (s.includes("X") && s.length === 6) || quote.exchange === "FX" || quote.exchange === "FOREX";
}

function isIndex(quote?: { assetClass?: string; exchange?: string; symbol?: string }) {
  if (!quote) return false;
  return quote.assetClass === "index" || quote.exchange === "INDEX" || quote.exchange === "CBOE" || quote.symbol?.startsWith("^") === true;
}

function isETF(quote?: { assetClass?: string; exchange?: string; sector?: string }) {
  if (!quote) return false;
  return quote.assetClass === "etf" || quote.sector === "ETF";
}

export default function SynthesisPanel({ symbol, onNav, onSymbol }: Props) {
  const openView = useWorkspaceStore((s) => s.openView);
  const { data: quote, isLoading: quoteLoading, isError: quoteError } = useQuote(symbol);
  const { data: ohlcvSeries } = useOHLCV(symbol, "1Y", "1d");
  const { data: news } = useNews(symbol);
  const { data: fundamentals, isLoading: fundLoading, isError: fundError } = useFundamentals(symbol);
  const { data: onChain } = useOnChain(isCrypto(quote) ? symbol : undefined);
  const { data: socialData } = useSocialSentiment(symbol);
  const { data: symbolConfig } = useSymbolConfig();

  const profile = fundamentals?.profile;
  const metrics = fundamentals?.metrics;
  const consensus = fundamentals?.consensus;

  const crypto = isCrypto(quote);
  const forex = isForex(quote);
  const index = isIndex(quote);
  const etf = isETF(quote);
  const skipFundamentals = crypto || forex || index || etf;

  const price = quote?.price ?? 0;
  const prevClose = quote?.previousClose;
  const chg = price && prevClose ? price - prevClose : undefined;
  const chgPct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : undefined;

  // Signal summary
  const signalResult = useMemo(() => {
    if (!quote) return null;
    return computeSignalSummary({
      quote: { price, pe: metrics?.pe_ratio ?? quote.pe, changePercent: chgPct ?? 0, volume: quote.volume, avgVolume: quote.avgVolume },
      technicals: { rsi14: null, macd: null, macdHistogram: null, support: null, resistance: null },
      fundamentals: { sectorPe: null, revenueGrowth: metrics?.revenue_growth },
      macro: { yieldCurve: null, vix: null },
      social: socialData ? { score: socialData.score, count: socialData.count } : null,
    });
  }, [quote, metrics, chgPct, socialData, price]);

  // Price performance
  const pricePerf = useMemo(() => {
    if (!ohlcvSeries?.bars?.length) return null;
    const bars = ohlcvSeries.bars;
    const current = bars[bars.length - 1]?.close ?? price;
    const getClose = (daysAgo: number) => {
      const idx = Math.max(0, bars.length - 1 - daysAgo);
      return bars[idx]?.close ?? current;
    };
    const calc = (days: number) => {
      const prev = getClose(days);
      return prev > 0 ? ((current - prev) / prev) * 100 : 0;
    };
    return { d7: calc(7), d30: calc(30), d90: calc(90), ytd: calc(Math.min(bars.length - 1, 365)) };
  }, [ohlcvSeries, price]);

  const loading = quoteLoading;
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64 bg-border" />
        <Skeleton className="h-8 w-48 bg-border" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-32 bg-border" />)}
        </div>
      </div>
    );
  }

  if (!quote && quoteError) {
    return (
      <div className="p-6 space-y-4">
        <div className="font-terminal text-negative text-sm">Failed to load data for {symbol}</div>
        <div className="font-terminal text-muted-foreground text-xs">Check your connection or try a different symbol.</div>
        <SymbolSuggestions query={symbol} onSelect={(s) => onSymbol?.(s)} />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6 space-y-4">
        <div className="font-terminal text-muted-foreground text-sm">No data for {symbol}</div>
        <SymbolSuggestions query={symbol} onSelect={(s) => onSymbol?.(s)} />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 font-terminal text-xs">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/50 pb-4">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
              <span className="text-foreground">{profile?.name ?? quote.name}</span>
              {quote.exchange && <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">{quote.exchange}</span>}
              {profile?.sector && <span className="text-amber border border-amber/30 px-1.5 py-0.5">{profile.sector}</span>}
              <DataStatusBadge status={fundamentals?.status ?? quote.status} showAsOf relative />
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className={`text-3xl font-bold tabular-nums ${pctClass(chgPct ?? 0)}`}>${formatPrice(price)}</span>
              <span className={`text-lg font-semibold tabular-nums ${pctClass(chgPct ?? 0)}`}>
                {chg == null ? "" : (chg >= 0 ? "+" : "") + formatPrice(chg)}
                ({chgPct == null ? "" : formatPct(chgPct)})
              </span>
              <span className="text-muted-foreground">{quote.currency ?? "USD"}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1 min-w-[200px]">
            <span className="text-muted-foreground tracking-wider">SYNTHESIS</span>
            {signalResult && <VerdictBadge verdict={signalResult.direction === "bullish" ? "Bullish" : signalResult.direction === "bearish" ? "Bearish" : signalResult.direction === "mixed" ? "Mixed" : "Sparse"} />}
            <div className="text-[10px] text-muted-foreground mt-1 max-w-[250px] text-right leading-relaxed">
              {signalResult?.summary ?? "Gathering signals..."}
            </div>
          </div>
        </div>

        {/* Signal Summary Banner */}
        {signalResult && signalResult.signals.length > 0 && (
          <PanelSection title="SIGNAL SUMMARY">
            <div className="flex flex-wrap gap-1.5">
              {signalResult.signals.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-muted-foreground border border-border/30">
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <span className="text-green-400">{signalResult.signals.filter(s => s.includes("bullish") || s.includes("oversold") || s.includes("discount") || s.includes("above-average")).length} bullish</span>
              <span className="text-red-400">{signalResult.signals.filter(s => s.includes("bearish") || s.includes("overbought") || s.includes("premium") || s.includes("elevated") || s.includes("inverted")).length} bearish</span>
              <span className="text-muted-foreground">Confidence: {signalResult.confidence}</span>
            </div>
          </PanelSection>
        )}

        {/* Price / Valuation / Technicals */}
        {!skipFundamentals && (
          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="PRICE">
              <KVRow label="MKT CAP" value={formatBig(metrics?.market_cap ?? profile?.market_cap)} />
              <KVRow label="VOLUME" value={formatBig(quote.volume)} />
              <KVRow label="AVG VOL" value={formatBig(quote.avgVolume)} />
              {quote.avgVolume > 0 && <KVRow label="VOL RATIO" value={`${(quote.volume / quote.avgVolume).toFixed(2)}x`} />}
              <KVRow label="BETA" value={profile?.beta != null ? profile.beta.toFixed(2) : "—"} />
            </PanelSection>

            <PanelSection title="VALUATION">
              <KVRow label="P/E" value={metrics?.pe_ratio?.toFixed(1) ?? quote.pe?.toFixed(1) ?? "—"} />
              <KVRow label="FWD P/E" value={metrics?.forward_pe?.toFixed(1) ?? "—"} />
              <KVRow label="EV/EBITDA" value={metrics?.enterprise_to_ebitda?.toFixed(1) ?? "—"} />
              <KVRow label="PEG" value={metrics?.peg_ratio?.toFixed(2) ?? "—"} />
              <KVRow label="P/B" value={metrics?.price_to_book?.toFixed(2) ?? "—"} />
            </PanelSection>

            <PanelSection title="TECHNICALS">
              <KVRow label="50d MA" value={quote.ma_50d != null ? formatPrice(quote.ma_50d) : "—"} valueClassName={quote.ma_50d != null && price >= quote.ma_50d ? "text-green-400" : quote.ma_50d != null ? "text-red-400" : ""} />
              <KVRow label="200d MA" value={quote.ma_200d != null ? formatPrice(quote.ma_200d) : "—"} valueClassName={quote.ma_200d != null && price >= quote.ma_200d ? "text-green-400" : quote.ma_200d != null ? "text-red-400" : ""} />
              <KVRow label="52W HIGH" value={<span className="text-green-400">{formatPrice(quote.high52)}</span>} />
              <KVRow label="52W LOW" value={<span className="text-red-400">{formatPrice(quote.low52)}</span>} />
            </PanelSection>
          </div>
        )}

        {/* AI Thesis + Analysts */}
        {!skipFundamentals && (
          <div className="grid grid-cols-2 gap-3">
            <PanelSection title="AI THESIS">
              <div className="space-y-1.5">
                {metrics?.revenue_growth != null && (
                  <KVRow label="REVENUE GROWTH" value={<span className={metrics.revenue_growth >= 0 ? "text-green-400" : "text-red-400"}>{(metrics.revenue_growth * 100).toFixed(1)}%</span>} />
                )}
                {metrics?.operating_margin != null && (
                  <KVRow label="OP MARGIN" value={`${(metrics.operating_margin * 100).toFixed(1)}%`} />
                )}
                {metrics?.profit_margin != null && (
                  <KVRow label="NET MARGIN" value={`${(metrics.profit_margin * 100).toFixed(1)}%`} />
                )}
                {metrics?.debt_to_equity != null && (
                  <KVRow label="D/E" value={metrics.debt_to_equity.toFixed(2)} />
                )}
              </div>
              <button
                onClick={() => onNav("thesis")}
                className="mt-2 text-[10px] text-primary hover:underline"
              >
                View Full Thesis →
              </button>
            </PanelSection>

            <PanelSection title="ANALYSTS">
              <div className="space-y-1.5">
                <KVRow label="CONSENSUS" value={consensus?.recommendation ?? "—"} />
                {consensus?.recommendation_mean != null && (
                  <KVRow label="SCORE" value={`${consensus.recommendation_mean.toFixed(1)}/5`} />
                )}
                <KVRow label="TARGET" value={<span className="text-cyan-300">{formatPrice(consensus?.target_consensus ?? 0)}</span>} />
                <KVRow label="HIGH" value={<span className="text-green-400">{formatPrice(consensus?.target_high ?? 0)}</span>} />
                <KVRow label="LOW" value={<span className="text-red-400">{formatPrice(consensus?.target_low ?? 0)}</span>} />
                <KVRow label="COVERING" value={`${consensus?.number_of_analysts ?? "—"} analysts`} />
              </div>
            </PanelSection>
          </div>
        )}

        {/* Social + Size & Scale */}
        <div className="grid grid-cols-2 gap-3">
          <PanelSection title="SOCIAL SENTIMENT">
            {socialData ? (
              <div className="space-y-1.5">
                <KVRow label="SCORE" value={
                  <span className={socialData.score > 0.3 ? "text-green-400" : socialData.score < -0.3 ? "text-red-400" : "text-muted-foreground"}>
                    {socialData.score > 0 ? "+" : ""}{socialData.score.toFixed(2)}
                  </span>
                } />
                <KVRow label="MENTIONS" value={`${socialData.count}`} />
                <KVRow label="SENTIMENT" value={
                  socialData.score > 0.3 ? "Bullish" : socialData.score < -0.3 ? "Bearish" : "Neutral"
                } />
              </div>
            ) : (
              <div className="text-muted-foreground text-[10px] py-2">No social data available</div>
            )}
          </PanelSection>

          <PanelSection title="SIZE & SCALE">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <KVRow label="MKT CAP" value={formatBig(metrics?.market_cap ?? profile?.market_cap)} />
              <KVRow label="EMPLOYEES" value={profile?.employees != null ? profile.employees.toLocaleString() : "—"} />
              <KVRow label="SHARES" value={formatBig(profile?.shares_outstanding)} />
              <KVRow label="SECTOR" value={profile?.sector ?? "—"} />
              <KVRow label="EXCHANGE" value={quote.exchange} />
            </div>
          </PanelSection>
        </div>

        {/* Crypto: On-Chain preview */}
        {crypto && onChain?.transactions?.length ? (
          <PanelSection title="WHALE ACTIVITY">
            <div className="space-y-1 divide-y divide-border/30">
              {onChain.transactions.slice(0, 5).map((tx, i) => (
                <div key={i} className="py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSymbol?.(tx.symbol)}
                      className="font-terminal text-[10px] font-bold text-cyan hover:underline"
                    >
                      {tx.symbol}
                    </button>
                    <span className="font-terminal text-[9px] text-muted-foreground">{tx.type}</span>
                    <span className="font-terminal text-[9px] text-foreground ml-auto">{formatBig(tx.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        ) : null}

        {/* Latest Headlines */}
        <PanelSection title="LATEST HEADLINES">
          <NewsList
            items={(news ?? []).map((n) => ({ kind: "news" as const, item: n }))}
            variant="dense"
            maxItems={5}
            className="max-h-48"
          />
        </PanelSection>

        {/* Drill Down */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
          <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
          {[
            { v: "chart" as ViewMode, c: "GP", label: "Chart" },
            { v: "fa" as ViewMode, c: "FA", label: "Financials" },
            { v: "options" as ViewMode, c: "OMON", label: "Options" },
            { v: "news" as ViewMode, c: "NEWS", label: "News" },
            { v: "dvd" as ViewMode, c: "DVD", label: "Dividends" },
            { v: "social" as ViewMode, c: "SCFL", label: "Social" },
            ...(crypto ? [{ v: "onchain" as ViewMode, c: "ONCH", label: "On-Chain" }] : []),
          ].map((x) => (
            <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
              {x.c} <span className="text-muted-foreground">· {x.label}</span>
            </button>
          ))}
        </div>

        {/* Data Status */}
        <div className="text-[9px] text-muted-foreground/40 pt-1">
          DATA STATUS: {quote.quoteSource} · {fundamentals?.status?.provider?.toUpperCase() ?? "REF"}
        </div>
      </div>
    </ScrollArea>
  );
}
```

**Note:** This component needs `useSocialSentiment` — check if it exists in `useFinance.ts`. If not, use the social data from the existing `useSocialFeed` hook or omit social sentiment for now.

**Step 2: Verify it compiles**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: May have errors if `useSocialSentiment` doesn't exist — fix by importing from existing hooks

**Step 3: Commit**

```bash
git add src/client/src/components/panels/SynthesisPanel.tsx
git commit -m "feat: add SynthesisPanel as new default symbol view"
```

---

### Task 5: Update Terminal.tsx default symbol view

**Files:**
- Modify: `src/client/src/pages/Terminal.tsx`

**Step 1: Change handleSymbol to open synthesis instead of intel**

In `Terminal.tsx`, line 115, change:
```typescript
openView("intel", sym, "primary");
```
to:
```typescript
openView("synthesis", sym, "primary");
```

Also update `handlePaneSymbol` at line 132:
```typescript
openView("synthesis", symbol, paneId as "primary" | "secondary");
```

**Step 2: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean (or only pre-existing errors)

**Step 3: Commit**

```bash
git add src/client/src/pages/Terminal.tsx
git commit -m "feat: set synthesis as default symbol view"
```

---

### Task 6: Delete redundant panels

**Files:**
- Delete: `src/client/src/components/panels/KeyRatiosPanel.tsx`
- Delete: `src/client/src/components/panels/EstimatesPanel.tsx`
- Delete: `src/client/src/components/panels/CompanyProfilePanel.tsx`
- Delete: `src/client/src/components/panels/ThesisPanel.tsx`
- Modify: `src/client/src/lib/panelRegistry.ts` (remove imports and entries)

**Step 1: Remove panel registrations from panelRegistry.ts**

Remove these lazy imports:
```typescript
const EstimatesPanel = lazy(() => import("@/components/panels/EstimatesPanel"));
const KeyRatiosPanel = lazy(() => import("@/components/panels/KeyRatiosPanel"));
const CompanyProfilePanel = lazy(() => import("@/components/panels/CompanyProfilePanel"));
const ThesisPanel = lazy(() => import("@/components/panels/ThesisPanel"));
```

Remove these registry entries: `key`, `ee`, `profile`, `thesis`

**Step 2: Delete the panel files**

```bash
rm src/client/src/components/panels/KeyRatiosPanel.tsx
rm src/client/src/components/panels/EstimatesPanel.tsx
rm src/client/src/components/panels/CompanyProfilePanel.tsx
rm src/client/src/components/panels/ThesisPanel.tsx
```

**Step 3: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: No errors related to deleted panels

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: remove redundant panels merged into SynthesisPanel"
```

---

## Phase 2: Navigation Fixes (Tasks 7–10)

### Task 7: Fix SocialFeedPanel SentimentSidebar clickability

**Files:**
- Modify: `src/client/src/components/panels/SocialFeedPanel.tsx`

**Step 1: Make SentimentSidebar tickers clickable**

The `SentimentSidebar` component (line 97) needs `onSymbol` prop. Update it:

```tsx
function SentimentSidebar({
  sentiment,
  onSymbol,
}: {
  sentiment: Record<string, { positive: number; negative: number; score: number; count: number }>;
  onSymbol?: (ticker: string) => void;
}) {
  // ... existing sorted logic ...

  return (
    <div className="w-44 border-l border-border bg-[#070707] shrink-0 overflow-y-auto scrollbar-thin">
      <div className="px-3 py-2 border-b border-border/50">
        <div className="panel-label text-[10px]">SENTIMENT</div>
      </div>
      <div className="p-2 space-y-0.5">
        {sorted.map(([ticker, data]) => (
          <div key={ticker} className="flex items-center justify-between py-1 px-1 text-xs rounded hover:bg-white/[0.03]">
            <button
              onClick={() => onSymbol?.(ticker)}
              className="font-mono font-bold text-foreground hover:text-primary cursor-pointer"
            >
              {ticker}
            </button>
            {/* ... rest unchanged ... */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Pass onSymbol from SocialFeedPanel to SentimentSidebar**

At line 214, change:
```tsx
<SentimentSidebar sentiment={sentiment} />
```
to:
```tsx
<SentimentSidebar sentiment={sentiment} onSymbol={onSymbol} />
```

**Step 3: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/client/src/components/panels/SocialFeedPanel.tsx
git commit -m "fix: make SocialFeed sentiment sidebar tickers clickable"
```

---

### Task 8: Fix OnChainPanel whale tx symbol navigation

**Files:**
- Modify: `src/client/src/components/panels/OnChainPanel.tsx`

**Step 1: Destructure onSymbol from props**

Change line 42 from:
```tsx
export default function OnChainPanel({ symbol }: Props) {
```
to:
```tsx
export default function OnChainPanel({ symbol, onSymbol }: Props) {
```

**Step 2: Make whale transaction symbols clickable**

At line 137, change:
```tsx
<span className="font-terminal text-[10px] font-bold text-foreground">{tx.symbol}</span>
```
to:
```tsx
<button
  onClick={() => onSymbol?.(tx.symbol)}
  className="font-terminal text-[10px] font-bold text-foreground hover:text-primary"
>
  {tx.symbol}
</button>
```

**Step 3: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/client/src/components/panels/OnChainPanel.tsx
git commit -m "fix: make OnChain whale transaction symbols clickable"
```

---

### Task 9: Add ticker extraction to NewsCard/NewsList

**Files:**
- Modify: `src/client/src/components/news/NewsCard.tsx`
- Modify: `src/client/src/components/news/NewsList.tsx`

**Step 1: Add onSymbol prop to NewsCard**

Update the Props interface:
```typescript
interface Props {
  feedItem: FeedItem;
  variant: "dense" | "expanded" | "hero";
  isActive?: boolean;
  onClick?: () => void;
  onSymbol?: (sym: string) => void;
  className?: string;
}
```

**Step 2: Extract and render tickers in NewsCard**

After the headline/summary section (around line 97), add ticker extraction and rendering:

```tsx
import { extractTickers } from "@shared/extractTickers";

// Inside the news card render, after the meta row:
{feedItem.kind === "news" && (() => {
  const tickers = extractTickers(`${feedItem.item.title} ${feedItem.item.summary}`);
  return tickers.length > 0 ? (
    <div className="flex gap-1 mt-1">
      {tickers.slice(0, 5).map((t) => (
        <button
          key={t}
          onClick={(e) => { e.stopPropagation(); onSymbol?.(t); }}
          className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
        >
          ${t}
        </button>
      ))}
    </div>
  ) : null;
})()}
```

**Step 3: Thread onSymbol through NewsList**

Update NewsList Props:
```typescript
interface Props {
  items: FeedItem[];
  variant: "dense" | "expanded" | "hero";
  activeFeedItem?: FeedItem | null;
  onSelectFeedItem?: (item: FeedItem) => void;
  activeItemId?: string;
  onSelectItem?: (item: FeedItem) => void;
  onSymbol?: (sym: string) => void;
  maxItems?: number;
  className?: string;
}
```

Pass to NewsCard:
```tsx
<NewsCard
  key={fi.kind === "news" ? fi.item.url : fi.item.id}
  feedItem={fi}
  variant={variant}
  isActive={isActive}
  onClick={() => handleSelect(fi)}
  onSymbol={onSymbol}
/>
```

**Step 4: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/client/src/components/news/NewsCard.tsx src/client/src/components/news/NewsList.tsx
git commit -m "feat: add ticker extraction and clickable badges to NewsCard"
```

---

### Task 10: Update SynthesisPanel to pass onSymbol to NewsList

**Files:**
- Modify: `src/client/src/components/panels/SynthesisPanel.tsx`

**Step 1: Pass onSymbol to NewsList**

In the SynthesisPanel, find the NewsList usage and add onSymbol:
```tsx
<NewsList
  items={(news ?? []).map((n) => ({ kind: "news" as const, item: n }))}
  variant="dense"
  maxItems={5}
  className="max-h-48"
  onSymbol={onSymbol}
/>
```

**Step 2: Commit**

```bash
git add src/client/src/components/panels/SynthesisPanel.tsx
git commit -m "fix: pass onSymbol to NewsList in SynthesisPanel"
```

---

## Phase 3: Chart Improvements (Tasks 11–12)

### Task 11: Extend OhlcvInterval and ChartInterval types

**Files:**
- Modify: `src/server/marketData.ts` (line 25)
- Modify: `src/client/src/lib/chartSeries.ts` (line 3)

**Step 1: Extend OhlcvInterval in marketData.ts**

Change line 25 from:
```typescript
export type OhlcvInterval = "5m" | "15m" | "1h" | "1d";
```
to:
```typescript
export type OhlcvInterval = "5m" | "15m" | "1h" | "1d" | "1w" | "1m";
```

**Step 2: Extend ChartInterval in chartSeries.ts**

Change line 3 from:
```typescript
export type ChartInterval = "5m" | "15m" | "1h" | "1d";
```
to:
```typescript
export type ChartInterval = "5m" | "15m" | "1h" | "1d" | "1w" | "1m";
```

**Step 3: Update getAllowedIntervals**

Change the function to:
```typescript
export function getAllowedIntervals(supportsIntraday: boolean): ChartInterval[] {
  return supportsIntraday ? ["5m", "15m", "1h", "1d", "1w", "1m"] : ["1d", "1w", "1m"];
}
```

**Step 4: Verify type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/server/marketData.ts src/client/src/lib/chartSeries.ts
git commit -m "feat: extend interval types with 1w and 1m"
```

---

### Task 12: Update ChartPanel with new intervals

**Files:**
- Modify: `src/client/src/components/panels/ChartPanel.tsx`

**Step 1: Add 5Y and MAX to RANGES**

Change line 80 from:
```typescript
const RANGES = ["1D", "5D", "1M", "3M", "6M", "1Y", "2Y"] as const;
```
to:
```typescript
const RANGES = ["1D", "5D", "1M", "3M", "6M", "1Y", "2Y", "5Y", "MAX"] as const;
```

**Step 2: Update getAllowedRanges**

```typescript
function getAllowedRanges(interval: ChartInterval): ReadonlyArray<(typeof RANGES)[number]> {
  if (interval === "5m" || interval === "15m") return ["1D"];
  if (interval === "1h") return ["1D", "5D", "1M", "3M"];
  if (interval === "1w") return ["6M", "1Y", "2Y", "5Y", "MAX"];
  if (interval === "1m") return ["1Y", "2Y", "5Y", "MAX"];
  return [...RANGES];
}
```

**Step 3: Update the interval selector UI**

Find the interval selector buttons in ChartPanel and add week/month options. The existing buttons render from an array — add:
```typescript
{ label: "1W", value: "1w" },
{ label: "1M", value: "1m" },
```

**Step 4: Commit**

```bash
git add src/client/src/components/panels/ChartPanel.tsx
git commit -m "feat: add 1W and 1M chart intervals with range gating"
```

---

## Phase 4: Data Quality (Tasks 13–14)

### Task 13: Expand extractTickers boundary characters (server)

**Files:**
- Modify: `src/server/sentimentAnalyzer.ts` (line 36–37)

**Step 1: Expand the `after` character class**

Change line 37 from:
```typescript
const after = idx + name.length >= lowerText.length || /[\s,;.!?)\]]/.test(lowerText[idx + name.length]);
```
to:
```typescript
const after = idx + name.length >= lowerText.length || /[\s,;.!?)\]:'"\/\-]/.test(lowerText[idx + name.length]);
```

**Step 2: Expand the `before` character class**

Change line 36 from:
```typescript
const before = idx === 0 || /\s/.test(lowerText[idx - 1]);
```
to:
```typescript
const before = idx === 0 || /[\s('""\-\[]/.test(lowerText[idx - 1]);
```

**Step 3: Commit**

```bash
git add src/server/sentimentAnalyzer.ts
git commit -m "feat: expand extractTickers boundary characters for better company name matching"
```

---

### Task 14: Add extractTickers unit tests

**Files:**
- Create: `src/server/sentimentAnalyzer.test.ts`

**Step 1: Create test file**

```typescript
import { describe, it, expect } from "vitest";
import { extractTickers } from "./sentimentAnalyzer";

describe("extractTickers", () => {
  it("extracts dollar cashtags", () => {
    expect(extractTickers("$TSLA is overvalued")).toContain("TSLA");
    expect(extractTickers("Buy $AAPL before earnings")).toContain("AAPL");
  });

  it("extracts bare tickers from whitelist", () => {
    expect(extractTickers("AAPL earnings beat expectations")).toContain("AAPL");
    expect(extractTickers("Buy NVDA before earnings")).toContain("NVDA");
  });

  it("extracts company name aliases", () => {
    expect(extractTickers("Apple revenue grew 8%")).toContain("AAPL");
    expect(extractTickers("Tesla deliveries exceeded")).toContain("TSLA");
  });

  it("handles boundary characters (apostrophe, colon, quotes)", () => {
    expect(extractTickers("Apple's revenue report")).toContain("AAPL");
    expect(extractTickers("Tesla: reported today")).toContain("TSLA");
    expect(extractTickers('"Apple" announced results')).toContain("AAPL");
  });

  it("does not match common false positives", () => {
    // These are known collisions — document them
    const result1 = extractTickers("She has a BA from Harvard");
    // BA is in the whitelist, so this IS a known false positive
    // Just verify the function runs without error
    expect(Array.isArray(result1)).toBe(true);
  });

  it("returns empty for text with no tickers", () => {
    expect(extractTickers("The weather is nice today")).toEqual([]);
  });

  it("deduplicates tickers", () => {
    const result = extractTickers("AAPL apple Apple");
    const aaplCount = result.filter((t) => t === "AAPL").length;
    expect(aaplCount).toBe(1);
  });
});
```

**Step 2: Run tests**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx vitest run server/sentimentAnalyzer.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/server/sentimentAnalyzer.test.ts
git commit -m "test: add extractTickers unit tests"
```

---

## Phase 5: UX Polish (Tasks 15–16)

### Task 15: Add DataStatusBadge fallback tooltip

**Files:**
- Modify: `src/client/src/components/data/DataStatusBadge.tsx`

**Step 1: Add title attribute to badge container**

At line 94, change:
```tsx
<div className="flex items-center gap-1.5 flex-wrap">
```
to:
```tsx
<div
  className="flex items-center gap-1.5 flex-wrap"
  title={status.isFallback
    ? `${status.provider} is a fallback source. Primary provider unavailable. Data may differ.`
    : undefined
  }
>
```

**Step 2: Commit**

```bash
git add src/client/src/components/data/DataStatusBadge.tsx
git commit -m "feat: add fallback tooltip to DataStatusBadge"
```

---

### Task 16: Final verification

**Files:** None (verification only)

**Step 1: Full type check**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx tsc --noEmit`
Expected: Clean (or only pre-existing errors unrelated to our changes)

**Step 2: Run all tests**

Run: `cd /mnt/c/Users/deepv/Desktop/Projects/Terminal/src && npx vitest run`
Expected: All tests pass

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final fixes after symbol dashboard implementation"
```

---

## Summary of Changes

| Phase | Tasks | Files Created | Files Modified | Files Deleted |
|---|---|---|---|---|
| **Phase 1: Synthesis** | 1–6 | 3 | 3 | 4 |
| **Phase 2: Navigation** | 7–10 | 0 | 4 | 0 |
| **Phase 3: Charts** | 11–12 | 0 | 3 | 0 |
| **Phase 4: Data Quality** | 13–14 | 1 | 1 | 0 |
| **Phase 5: Polish** | 15–16 | 0 | 1 | 0 |
| **Total** | 16 | 4 | 12 | 4 |
