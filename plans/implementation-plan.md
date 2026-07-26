# BLMTRM — Master Implementation Plan

**Goal:** Close every BLOCKS/SLOWS gap from the Phase 1 critique, in the approved P0→P5 order, ending with a leaner terminal (~20 panels, down from 27) where every number carries provenance and every risk metric is enforced, not displayed.

**Verification protocol (applies to every workstream):**
1. `npm run check` (TypeScript) must pass after each workstream.
2. Re-run the Phase 1 critique lens on the changed surface — state concretely which decision is now served.
3. No workstream starts until the previous one's check passes.

**Design rules (from approved backlog):**
- No number without provenance (source + age or it doesn't ship).
- Detect, don't display (risk features must fire).
- Consolidate before adding (net-negative LOC target everywhere except P1).
- A dead control is a bug (render it working or delete it).

---

## P0 — Data trust layer + typography tokens 【~60% DONE】

### Broken (evidence)
| # | Defect | Location | Status |
|---|--------|----------|--------|
| 0.1 | FRED failure → hardcoded GDP 2.5 / CPI 3.1 / FF 5.33 served as live | `marketData.ts:1424-1437` | ✅ FIXED — `fallbackFields[]` now returned; status carries per-field fallback label + real `asOf` |
| 0.2 | Fallback tracking missed FX/gold/oil fields | `marketData.ts:1405-1419` | ✅ FIXED — all 13 fields tracked |
| 0.3 | 4h macro cache serves pre-release numbers on CPI morning | `economicsData.ts:11` | ✅ FIXED — TTL drops to 10min within ±2h of any high-importance calendar release (`isNearHighImportanceRelease()`, zero extra upstream calls) |
| 0.4 | No per-provider health visibility | `routes.ts:90` | ✅ FIXED — `/api/health` now exposes circuit-breaker states for yahoo/coingecko/fred/web |
| 0.5 | Econ cards render fallback values indistinguishably | `EconomicsPanel.tsx:129` | ✅ FIXED — `EconCard` shows amber FALLBACK badge + "UNVERIFIED — provider down" |
| 0.6 | StatusBar shows one global light only | `StatusBar.tsx:47-77` | ⬜ TODO |
| 0.7 | No freshness badge on MarketOverview index/credit data | `MarketOverview.tsx:96-101` | ⬜ TODO |
| 0.8 | 7 font sizes; 7-8px numerals on densest screens | panels/*, no tokens in `tailwind.config.ts` | ⬜ TODO (tokens only; migration is P4) |

### Remaining work
- **0.6 StatusBar provider chips** — add `useProviderHealth()` querying `/api/health` (15s refetch); render one chip per provider (green=closed, amber pulse=half-open, red pulse=open, hidden=null/never-called). Chips carry tooltips ("yahoo: DOWN — data from this provider is fallback or stale"). Edit was drafted; re-apply cleanly.
- **0.7 MarketOverview freshness** — indices header gets `DataStatusBadge` from the first index quote's `status` (already in the Quote payload — pure wiring); credit-spread section header gets `relative` badge showing age, amber when >2× the 300s poll interval.
- **0.8 Typography tokens** — add to `tailwind.config.ts` `theme.extend.fontSize`: `data: ["11px", "1.3"]`, `label: ["10px", "1.3"]`, `body: ["12px", "1.4"]`, `title: ["13px", "1.4"]`. No panel migration yet — tokens exist so P1–P3 new code uses them and P4 migrates old code.
- Run `npm run check`; re-critique surface #1 and #4.

### Acceptance
- Kill FRED key locally → Economics cards show FALLBACK badges; StatusBar fred chip goes red within 15s; no fabricated number renders unflagged.
- Fresh session → chips show only exercised providers.
- `text-data`/`text-label`/`text-body`/`text-title` classes compile.

---

## P1 — Active risk engine 【NOT STARTED】

### Broken (evidence)
| # | Defect | Location |
|---|--------|----------|
| 1.1 | No position sizing: play form has symbol/direction/entry/target/stop/thesis only | `PlaysPanel.tsx:34-39,136-207` |
| 1.2 | Zero price-vs-stop/target comparison — invalidation undetected; manual buttons only | `PlaysPanel.tsx:312,321,330` |
| 1.3 | No per-trade realized R; only aggregate avg R:R footer | `PlaysPanel.tsx:363-369` |
| 1.4 | Play→chart link exists but levels not drawn on chart | `PlaysPanel.tsx:261` |
| 1.5 | Alerts delivered via WS to open tabs only | `alertsEngine.ts` / WS push |
| 1.6 | No sector concentration or correlation view | `PortfolioPanel.tsx` |

### Fix design
- **1.1 Sizing calculator (client, `PlaysPanel.tsx`):** add optional `riskAmount` field to form + play schema (`shared/schema.ts`). Live-derive: `shares = floor(riskAmount / |entry − stop|)`, position \$ = shares × entry, R:R = |target−entry| / |entry−stop|. Render under the form as a compute strip (`text-data` tokens). Amber warning when R:R < 1.5. Stop becomes required when riskAmount present.
- **1.2 Server-side play monitor (`server/playsMonitor.ts`, new ~80 LOC):** on the existing alert evaluation tick (reuse the 15s cycle in `alertMonitor.ts` — do NOT create a second loop), fetch quotes for ACTIVE plays' symbols (already cached ≤60s, no extra upstream cost). Long: price ≤ stop → `stop_hit`; price ≥ target → `target_hit`; short inverted. Persist `triggeredState` + `triggeredAt` on the play; push through the existing alert WS event so AlertsPanel + toast fire. PlaysPanel rows render red `STOP HIT` / green `TARGET HIT` pill; row pinned to top.
- **1.3 Realized R:** on close, store `realizedR = direction × (exit − entry) / |entry − stop|` (null if no stop). Footer becomes expectancy strip: `WIN% · AVG WIN R · AVG LOSS R · EXPECTANCY/TRADE` computed from closed plays with R values.
- **1.4 Play levels on chart:** `workspaceStore` gets `chartOverlayLevels: {symbol, entry, stop, target} | null`. Play row click sets it + focuses chart tab. `ChartPanel` reads store; renders three `createPriceLine` entries (solid white entry, red dashed stop, green dashed target — reuses existing horizontal-line machinery at `ChartPanel.tsx:934-951`). Clear button in chart header.
- **1.5 Delivery beyond tab:** browser `Notification` API on alert/play-trigger WS events (permission requested once from AlertsPanel); if the Discord bridge (`discordBot.ts`) is configured, also post play triggers there. OS/mobile push out of scope.
- **1.6 Concentration guard (`PortfolioPanel.tsx`):** quotes already include `sector` — aggregate weights client-side; horizontal stacked bar; any sector >25% → amber row + warning line. Pairwise correlation matrix deferred to backlog (needs OHLCV joins; not blocking).

### Acceptance
- Create play with risk \$1,000, entry 100, stop 95 → shows 200 sh, \$20k, and R:R vs target.
- Force a quote below stop (mock/fallback) → play flips STOP HIT within one eval cycle without user input; notification fires.
- Close a play → realized R appears on the row; expectancy strip updates.
- Portfolio with 3 same-sector positions >25% → amber warning renders.

---

## P2 — Chart decision kit 【NOT STARTED】

### Broken (evidence)
| # | Defect | Location |
|---|--------|----------|
| 2.1 | ATR14 fetched, never rendered | `useFinance.ts:722,734` vs `ChartPanel.tsx` indicator keys |
| 2.2 | Comparison symbols: UI + fetch exist, series never passed to chart (dead control) | `ChartPanel.tsx:166,752` |
| 2.3 | No RS-vs-SPY line | absent |
| 2.4 | Server S/R levels fetched, never drawn | `useFinance.ts:725-726` |
| 2.5 | No saved indicator templates | absent |
| 2.6 | OBV fetched, never rendered | `useFinance.ts:723` |

### Fix design
- **2.1 ATR chip:** chart header stat `ATR14 {value} · {value/price %}` from the already-fetched `useTechnicalIndicators` data. When play overlay levels active (P1.4), append `STOP {|entry−stop|/atr14}×ATR`.
- **2.2 Fix comparisons:** normalize each comparison series to %-change from first visible bar; `addLineSeries` per symbol on a right price scale in %-mode; colored + labeled. If not fixable cheaply, DELETE the input — no dead controls.
- **2.3 RS line:** with SPY comparison data (same fetch path), render ratio `close/SPY.close` in a 60px sub-pane below MACD (reuse RSI/MACD pane pattern at `ChartPanel.tsx:460-553`). Toggle in indicator bar as `RS`.
- **2.4 S/R render:** dashed muted price lines from server values, toggleable as `S/R`.
- **2.5 Templates:** `chartTemplates` in localStorage: named `{indicators: string[], chartType, pivotPeriod}`. Save/apply dropdown in chart header; seed with "Breakout" (EMA20/50, VWAP, VOL, RS) and "Swing" (SMA50/200, RSI, MACD).
- **2.6 OBV:** cut — RSI/MACD/volume cover momentum confirmation; adding a fourth pane is clutter. Remove from the fetch to save payload.

### Acceptance
- Compare "QQQ" renders a visible normalized line (or the input no longer exists).
- RS pane toggles on and tracks symbol/SPY.
- Template save → switch symbol → template persists.
- ATR chip shows on all timeframes where backend returns it.

---

## P3 — Shell speed + cull 【NOT STARTED】

### Broken (evidence)
| # | Defect | Location |
|---|--------|----------|
| 3.1 | Symbol switch on focused pane = 4 steps | `TerminalCommandBar.tsx:47`, no inline switcher |
| 3.2 | LRU tab eviction is silent | `workspaceStore.ts:72` |
| 3.3 | `Ctrl+W` intercepted (browser muscle-memory hazard) | `Terminal.tsx:52` |
| 3.4 | `S` shortcut collision (Screener vs Sectors) | `panelRegistry.ts` |
| 3.5 | No named layout presets | `workspaceStore.ts` persists one layout only |
| 3.6 | Noise panels: HistoricalPrices, FxDashboard, Crypto, OnChain (keyless), Dividends, Financials | per Phase 1 verdicts |

### Fix design
- **3.1 Type-to-switch:** keydown on focused pane: bare `A–Z` (no modifier, not in input) opens 200px inline overlay in pane corner; type + Enter → `setTabSymbol(paneId, symbol)`. Esc cancels. Command bar unchanged for verbs.
- **3.2 Eviction honesty:** LRU eviction fires a toast ("Closed AAPL Chart — tab limit"); add `pinned` flag on tabs (pin icon in tab strip), pinned exempt from eviction.
- **3.3/3.4 Shortcut hygiene:** pane-close → `Alt+W`; Sectors → `Shift+S` (registry data change); help overlay updated.
- **3.5 Presets:** `layoutPresets: Record<string, WorkspaceSnapshot>` in the persisted store; save/restore via command bar (`LAYOUT SAVE macro` / `LAYOUT macro`) + `Ctrl+Shift+1..3` for first three.
- **3.6 Cull:** delete `HistoricalPricesPanel.tsx` + `FxDashboardPanel.tsx` (+ registry entries, routes stay); fold Crypto symbols into Watchlist defaults and delete `CryptoPanel.tsx`; `OnChainPanel` registry entry hidden when `/api/health` lacks the key flag; Dividends/Financials become tabs inside `SynthesisPanel` (move markup, delete panel files). Net LOC must be negative.

### Acceptance
- Focused pane: typing `NVDA↵` re-symbols it in ≤2s.
- Pin a tab → open 13 more → pinned tab survives; toast on each eviction.
- `S` opens exactly one panel; `Ctrl+W` reaches the browser.
- Registry lists ≤21 panels; deleted panels' files gone; typecheck passes.

---

## P4 — Design system migration 【NOT STARTED】

### Broken (evidence)
7 font sizes across panels (7px `MarketOverview.tsx:161`; 8px `PortfolioPanel.tsx:181`; 9px `ScreenerPanel.tsx:44`; 10px `FinancialsPanel.tsx:34`; 11px `ScreenerPanel.tsx:107`; 12px `WatchlistPanel.tsx:137`; xs/sm elsewhere). Same element type differs per panel (ticker 10 vs 12px; headers 8 vs 9px; rows py-1.5 vs py-2.5). Duplicated bespoke table markup in every panel.

### Fix design
- **Primitives (`components/terminal/primitives/`):**
  - `PanelHeader` — title, optional symbol, optional `DataStatusBadge`, actions slot; one height, one padding.
  - `DataTable<T>` — column defs, `text-label` headers, `text-data` cells, `py-1.5` rows, one hover/zebra treatment, optional row click.
  - `Ticker` (`text-data font-bold text-cyan`) and `Metric` (label+value+delta stack) atoms.
- **Sweep:** mechanical replacement `text-[7px]|text-[8px]|text-[9px]` → `text-label`, `text-[10px]|text-[11px]` → `text-data`, `text-[12px]` → `text-body` — except where an element is genuinely a title. Migrate high-traffic panels to primitives first (Watchlist, MarketOverview, Portfolio, Screener), long tail second. Delete replaced markup.
- 7px/8px cease to exist anywhere.

### Acceptance
- `grep -r "text-\[7px\]\|text-\[8px\]" client/src/components/panels` → zero hits.
- Ticker renders identically (size/weight/color) in Watchlist, MarketOverview, Screener.
- Net LOC negative for the four migrated panels.

---

## P5 — Feed intelligence 【NOT STARTED】

### Broken (evidence)
| # | Defect | Location |
|---|--------|----------|
| 5.1 | Feed scoring ignores holdings/plays/watchlist | `useFinance.ts:793` (`feedItemScore`) |
| 5.2 | Sentiment counts lack baseline context | `SentimentPanel.tsx:29` |
| 5.3 | No headline→chart path | `NewsPanel.tsx` |

### Fix design
- **5.1 Book-aware ranking:** `feedItemScore` gains multipliers — symbol in active plays ×2.5, holdings ×2.0, watchlist ×1.5 (sets read from existing queries, memoized). Row badges `PLAY`/`HOLDING`/`WATCH` (status-family colors).
- **5.2 Z-score:** server keeps rolling 30-day mention counts per symbol (extend `socialSentiment.ts` cache); returns `mentionZScore`. Panel headline: `+3.8σ vs 30d` with amber ≥2σ, red ≥3σ; raw counts demoted to caption.
- **5.3 Headline→chart:** symbol-tagged news rows get a chart icon → `setGlobalSymbol` + focus chart tab (existing plumbing from P1.4).

### Acceptance
- With an active NVDA play, an NVDA headline outranks equal-weight non-book headlines and shows `PLAY` badge.
- Sentiment shows σ context; z-score visible within one refresh.
- Headline click → chart open on that symbol in ≤2 interactions.

---

## Sequencing & effort

| Order | Workstream | Remaining effort | Dependencies |
|---|---|---|---|
| 1 | P0 finish (0.6, 0.7, 0.8 + check) | Small | none |
| 2 | P1 risk engine | Largest — the only net-additive stream | P0 tokens |
| 3 | P2 chart kit | Medium (mostly rendering fetched data) | P1.4 store field |
| 4 | P3 shell + cull | Medium, net-negative LOC | none (parallel-safe with P2) |
| 5 | P4 design system | Mechanical, net-negative LOC | after P3 cull (don't restyle deleted panels) |
| 6 | P5 feeds | Small | P1 plays/holdings data |

**Execution mode:** P0 by me directly (in flight). P1 and P2 delegated in parallel (disjoint files: P1 = Plays/Portfolio/server; P2 = ChartPanel/useFinance), diffs reviewed against acceptance criteria, then typecheck. P3→P4→P5 sequential. Phase-1-lens re-critique after each surface, reported to you before the next begins.

**Rollback safety:** each workstream is an independent commit; `git commit` after each passing check so any regression reverts one workstream, not the phase.
