# BLMTRM — Trader-Persona Product Review

**Reviewer lens:** Independent HNW trader / portfolio architect. Every screen is judged by one question: *does it make me faster, more accurate, or better risk-adjusted than I'd be without it?* If not, it's noise.

**Date:** 2026-07-24
**Scope:** All 27 panels, data layer, terminal shell, and the three plans in `plans/`.

---

## Executive verdict

BLMTRM has a genuinely strong risk-first skeleton — Beta/Vol/MaxDD as top-level portfolio metrics, a Plays journal with R:R math, a sector rotation signal, VIX curve shape, and hybrid technical/fundamental alerts. That's rarer than it should be.

But three things undermine trust and speed, in order of severity:

1. **Data integrity is the existential risk.** The system silently serves hardcoded fallback data as if it were live — Fed Funds @ 5.33% when FRED fails (`economicsData.ts:1419-1432`), catalog reference prices when all quote providers fail (`marketData.ts:1011`). A terminal that lies confidently during an outage is worse than one that goes dark. There is no per-panel "last updated" timestamp anywhere.
2. **Alerts die when the tab closes.** Server-side evaluation, WebSocket-only delivery. An alert system a trader can't trust away from the desk is not an alert system.
3. **Shell friction is high.** Shortcut collisions (`S` → Screener AND Sectors), no bare-ticker switching, no saved layouts, unbounded tab sprawl. The "market event → decision-ready screen" path is slower than it looks.

---

## Per-panel scoreboard

### Keep — these earn their pixels

| Panel | Why it earns its place | Evidence |
|---|---|---|
| **MarketOverview** | Rotation signal (DEFENSIVE/GROWTH), VIX contango/backwardation, credit OAS, breadth. Actual risk-on/off decision support. | `MarketOverview.tsx:87-91`, `:348` |
| **ScorecardPanel** | Best at-a-glance cross-asset regime view; multi-timeframe + % from 52w high. | `ScorecardPanel.tsx:144` |
| **PortfolioPanel** | Beta, annualized vol, max drawdown as first-class metrics — risk-first by design. | `PortfolioPanel.tsx:95-97` |
| **PlaysPanel** | Forces exit definition before entry; tracks R:R, win rate. The discipline layer. | `PlaysPanel.tsx:363` |
| **AlertsPanel + engine** | Price on-tick + PE/RSI/MACD/Volume triggers at 15s. Trigger variety is pro-grade. | `alertsEngine.ts:34-80`, `alertMonitor.ts:83,128` |
| **OptionsFlowPanel** | V/OI unusual-activity ratios = leading indicator of institutional positioning. | `OptionsFlowPanel.tsx:108` |
| **CalendarPanel** | Aggregated event-risk scoring per day — directly answers "is this a week to size down?" | `CalendarPanel.tsx:111` |
| **SectorPanel** | Automated rotation regime label + RS vs SPX. | `SectorPanel.tsx:36` |
| **News/SocialFeed** | Decay-weighted scoring actually filters noise instead of dumping a raw feed. | `useFinance.ts:793` |
| **SynthesisPanel** | Aggregated bias verdict from technicals + news + sentiment. Fast bias check. | `SynthesisPanel.tsx:84` |

### Fix — usable but gapped

| Panel | The gap that matters | Fix |
|---|---|---|
| **ChartPanel** | No RS line vs SPY/QQQ; drawing limited to horizontal lines (`ChartPanel.tsx:114`); no saved indicator templates; 60s staleTime too slow intraday. | Trendlines + RS overlay + layout templates. |
| **WatchlistPanel** | No relative volume (RVOL), no % distance to 52w high, no alert-proximity indicator. It's a list, not a setup scanner. | Add RVOL highlight + breakout distance column. |
| **OptionsPanel** | Raw IV without IV Rank/percentile is context-free; no Greeks. | IV Rank column + at least Delta/Theta. |
| **PortfolioDashboard** | Grade badge is good accountability; missing stress-test ("SPY −10% → ?") and sector concentration warning. | Add concentration cap alert at 25%/sector. |
| **SentimentPanel** | Mention counts without a baseline/z-score — can't tell spike from noise. | Z-score vs trailing average. |
| **AgentPanel** | AI sees only price/volume/technicals (`AgentPanel.tsx:190`) — blind to the macro/sentiment signals the terminal already computes. | Inject SynthesisPanel + portfolio context. |
| **Economics/YieldCurve** | 4-hour cache TTL (`economicsData.ts:11`) is fine between releases, catastrophic on release days. | Event-aware cache busting around calendar releases. |

### Kill or demote — noise

| Panel | Why | Disposition |
|---|---|---|
| **ScreenerPanel** | Sector + P/E only. No RSI, RVOL, distance-from-MA, momentum, or RS filters. Cannot surface a trade idea. | Rebuild or remove — half a screener is worse than none. |
| **HistoricalPricesPanel** | OHLCV table duplicating what the chart shows. Zero decisions enabled. | Fold into ChartPanel as an export/sub-pane. |
| **FxDashboardPanel** | 15-min delayed Stooq data (`FxDashboardPanel.tsx:101`) labeled as a dashboard. A liability, not an asset. | Kill until a low-latency feed exists. |
| **CryptoPanel** | A ticker grid. No funding rates, flows, or macro correlation — no edge. | Merge into Watchlist. |
| **OnChainPanel** | Hard-gated on `WHALE_ALERT_API_KEY` (`OnChainPanel.tsx:56`) — dead screen without it. | Hide when unconfigured. |
| **DividendsPanel / FinancialsPanel** | Too sparse to inform any decision (no payout safety, no balance sheet depth). | Demote to quote-detail tabs. |

---

## Data integrity — the trust layer (highest priority)

| # | Risk | Evidence | Why it costs money |
|---|---|---|---|
| 1 | **Hardcoded macro fallbacks served silently** (GDP 2.5%, CPI 3.1%, FF 5.33%) | `economicsData.ts:1419-1432` | Positioning off stale macro during a vol event is the exact scenario the terminal exists to prevent. |
| 2 | **Fallback catalog quotes when all providers fail** | `marketData.ts:1011` | Prices that look live but aren't. |
| 3 | **No per-panel freshness timestamps**; ticker tape animation resets mask staleness | `TickerTape.tsx:55` | The UI signals "LIVE" while serving 60s-cached Yahoo or 15-min-delayed Stooq (`marketData.ts:1070`). |
| 4 | **Yahoo crumb-scrape fragility** as primary equity source | `marketData.ts:1463` | Single UI change at Yahoo silently degrades the whole terminal to fallbacks (see #1, #2). |
| 5 | **Unbounded quote caches** (TTL only, no size cap) | `marketData.ts` cache Maps | Memory blowup risk exactly during high-vol, many-symbol sessions. |

**Rule to adopt:** every number on screen must carry (a) its source and (b) its age. Stale > 2× expected interval → visibly amber. Fallback data → visibly flagged, never silent. This is cheaper than any new feature and buys more trust than all of them.

---

## Shell friction — HIGH

- **No bare-ticker switching**: typing `NVDA` should switch the focused panel's symbol. Currently requires command-bar verb syntax (`ui-ux-audit.md:44`).
- **Shortcut collision**: `S` mapped to both Screener and Sectors (`panelRegistry.ts` per ui-ux-audit).
- **No saved layouts**: split view exists (`WorkspacePane.tsx`) but the desk must be rebuilt every session. A "Macro desk" / "Execution desk" preset toggle is a direct time-to-decision win.
- **Tab sprawl**: no cap; reload restores every tab ever opened (`workspaceStore.ts:58`).
- **Alerts require an open tab**: WebSocket-only delivery; Discord bridge optional. Push/OS notification is table stakes.

---

## Plans review (`plans/`)

| Plan item | Trader value | Call |
|---|---|---|
| Play-tracker: realized P&L + R-multiple ledger (`play-tracker-roadmap.md:25`) | **Highest.** Turns the journal into a feedback loop — the only way to know if your edge is real. | Do first |
| Data-schema redesign: Postgres instruments table | **High.** Persistence enables expectancy stats, backtests, and survives restarts. | Do second |
| Play-tracker: Zod signal validation (`play-tracker-roadmap.md:39`) | **High.** Prevents the AI from acting on malformed data. | Bundle with above |
| UI/UX: single source of truth for nav/shortcuts | **Medium-high.** Fixes real friction (collisions). | Quick win |
| UI/UX: 10px base font | Health, not edge. | Batch with nav work |
| Mobile searchability | Monitoring nicety, not execution. | Defer |

The plans are honest about what's broken and correctly ordered on substance — the ledger and schema work are the right bets. What's missing from all three plans is the **data-integrity layer** above; none of them address silent fallbacks or freshness visibility, and that should jump the queue.

---

## Prioritized action list

1. **Freshness & fallback honesty** — source + age on every datum; amber staleness; explicit fallback badges. Kills risks #1–#3.
2. **Out-of-app alert delivery** — push/Discord/OS notification so alerts survive a closed tab.
3. **Play ledger with position sizing** — add "Risk \$" input → auto-compute `shares = risk / (entry − stop)`; realized P&L + R-multiple history (per roadmap Phase 1).
4. **Screener rebuild** — RSI, RVOL, distance-from-20/50/200DMA, RS-vs-SPY filters, or delete the panel.
5. **Chart: RS line + trendlines + saved templates.**
6. **Shell: bare-ticker switching, fix shortcut collisions, saved layout presets, tab cap.**
7. **Portfolio: sector concentration warning (>25%) + simple stress-test.**
8. **Cull noise panels** — HistoricalPrices, FxDashboard (until real feed), CryptoPanel, standalone Dividends/Financials. Fewer, sharper screens.

---

## Bottom line

The bones are those of a risk-manager's terminal, not a toy — keep the rotation signals, the R:R journal, the risk-first portfolio metrics. But right now the product would lose my trust the first time a provider hiccuped and it showed me a confident, fabricated Fed Funds rate. Fix the trust layer first, the alert delivery second, and the ledger third. Everything else is polish on top of a foundation worth polishing.
