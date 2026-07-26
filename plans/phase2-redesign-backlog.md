# PHASE 2 — Redesign Backlog (pre-code)

Every BLOCKS/SLOWS item from Phase 1 mapped to a concrete redesign. Guiding principles, given the "bloated, duplicated, incomplete" diagnosis:

1. **No number without provenance** — every datum carries source + age or it doesn't ship.
2. **Detect, don't display** — risk features must fire, not decorate.
3. **Consolidate before adding** — new capability reuses shared primitives; duplicated per-panel markup gets deleted, not extended. Panel count goes DOWN (27 → ~20).
4. **A dead control is a bug** — anything rendered must work (comparison overlay) or be removed.

---

## P0 — Data trust layer ("no number without provenance")

**Fixes:** Phase 1 #1 (silent fallback quotes), #4 (fabricated FRED prints, release-day staleness), #7 (no per-panel freshness). Severity: BLOCKS ×2.

**What changes**
- **Server — response envelope.** Every finance/econ endpoint returns `{ data, meta: { source, asOf, isFallback } }`. The two lying paths — `buildReferenceFallbackQuote` (`marketData.ts:1011`) and the hardcoded FRED defaults (`economicsData.ts:1419-1432`) — keep working as last resort but set `isFallback: true` and their real `asOf`. No behavior hidden.
- **Client — one shared `<Freshness>` primitive** (single new component, used everywhere): tiny mono badge `YHOO · 4s`. Turns amber when age > 2× expected refresh, turns red with `FALLBACK` label when `isFallback`. Mounted in every panel header via the shared `<PanelHeader>` (see P4 — but the badge ships now, header consolidation later).
- **Release-aware cache busting.** Macro TTL drops from 4h to 10min inside a ±2h window around any high-risk event already known to `CalendarPanel`'s risk data. No new data source needed — the calendar already knows when CPI drops.
- **StatusBar upgrade:** per-provider health chips (Yahoo / Stooq / FRED / CoinGecko) replacing the single global light.

**Why it fixes the gap:** The Phase 1 failure mode was *unverifiable confidence* — fabricated Fed Funds and catalog prices indistinguishable from live data. This makes staleness and synthesis a visible input to every decision instead of a hidden landmine, at the exact moment (provider stress) it matters.

**Resulting flow:** CPI morning, 8:31 AM. FRED lags. EconomicsPanel shows `FRED · 3h · stale` in amber instead of a confident pre-release CPI print — I know to wait or check the tape. Later Yahoo's crumb breaks mid-session: watchlist rows flip to red `FALLBACK` badges. I stop trusting those prices *instantly*, with zero investigation, instead of discovering it after a bad fill.

---

## P1 — Active risk engine (Plays + alerts become detectors, not recorders)

**Fixes:** Phase 1 #6 entirely (no invalidation detection, no sizing, no per-trade R, plays not on chart, no concentration view, alerts die with tab). Severity: BLOCKS.

**What changes**
- **Position sizing in the play form.** New `Risk $` field → live-computed `shares = risk / |entry − stop|`, position \$ value, and % of portfolio. Warn (not block) when position > 10% of book or R:R < 1.5. Stop becomes a required field.
- **Server-side play monitor.** New evaluation hooked into the existing alert tick loop (`alertMonitor.ts` already polls prices): when live price crosses an ACTIVE play's stop or target → play auto-flags `STOP HIT` / `TARGET HIT` (visual state + row turns red/green) and fires through the existing alert pipeline. Thesis invalidation becomes an event, not a discovery.
- **Per-trade realized R** stored on close (`(exit − entry) / (entry − stop)`, direction-adjusted). Footer grows from "avg R:R" to an expectancy line: win rate, avg win R, avg loss R, expectancy per trade. Now the journal can answer "is my edge real?"
- **Play ↔ chart integration.** Clicking a play opens ChartPanel with entry/stop/target rendered as labeled price lines (levels passed via workspaceStore; ChartPanel already draws horizontal price lines — reuse, don't duplicate).
- **Alert delivery beyond the tab.** Browser Notification API for background tabs + wire the existing Discord bridge (`discordBot.ts`) as a first-class delivery target for triggered alerts and play events. (Full mobile push = out of scope.)
- **Concentration guard in PortfolioPanel.** Sector weight bar with amber warning > 25% in one sector, plus a small pairwise correlation matrix of holdings computed from OHLCV already being fetched. Catches "beta-neutral but 80% one theme".

**Why it fixes the gap:** Phase 1's core finding — risk management is a façade that measures discipline without providing any. Every item here converts a displayed metric into an enforced check or a fired event.

**Resulting flow:** NVDA breakout play: entry 172, stop 164, risk \$10k → form instantly shows *1,250 sh ≈ \$215k · 4.3% of book · 2.9R to target*. Activate. Two days later price gaps to 163.40 pre-market → play flips red `STOP HIT −1.0R`, Discord pings my phone, one click opens the chart with all three levels drawn. I close it; the journal logs −1.0R and my expectancy updates. Total attention required from me: zero until the ping.

---

## P2 — Chart decision kit (make breakout confirmation & vol sizing executable)

**Fixes:** Phase 1 #2 (no RS line, dead comparison overlay, ATR fetched-not-shown, S/R fetched-not-shown, no templates). Severity: BLOCKS.

**What changes**
- **ATR surfaced** (data already at `useFinance.ts:722`): stat chip in the chart header (`ATR14 4.21 · 2.4%`) + a "stop helper" readout when a play level is active (distance in ATRs).
- **RS line vs SPY**: ratio series (symbol/SPY) in a compact sub-pane — the missing breakout confirmation signal. Reuses the comparison-fetch machinery that already exists.
- **Fix the dead comparison overlay**: normalized %-change comparison lines actually rendered (data already fetched at `ChartPanel.tsx:166,752` — this is finishing, not adding).
- **Render server S/R levels** as dashed lines (already fetched at `useFinance.ts:725-726`).
- **Saved indicator templates**: named sets in localStorage ("Breakout", "Swing", "Macro"), applied in one click. Kills per-symbol re-setup.
- **Trendline drawing** (two-click): flagged as the heaviest item here — proposed last within P2, cuttable if effort blows out.
- **Deep-dive without a mega-component:** no new panel. A "Focus" layout preset (built in P3) assembles Chart + Synthesis + Plays for the global symbol — solving Phase 1's "3 self-assembled panels" without adding bloat.

**Why it fixes the gap:** Workflow (c) becomes executable end-to-end: RS confirms leadership, volume is already on the chart, ATR gives stop distance, comparisons stop being a trap. Three of five items are *rendering data already paid for* — anti-bloat by definition.

**Resulting flow:** Screener/watchlist flags a candidate → one key applies my "Breakout" template (EMA20/50, VWAP, volume, RS-SPY pane). RS at a 3-month high while price tests the pivot = confirmed leadership. ATR chip reads 4.2 → stop goes 1.5 ATR under the pivot. "Send to Play" pre-fills entry/stop → P1 sizing does the rest. Start to sized, monitored position: under a minute.

---

## P3 — Shell speed + bloat cull

**Fixes:** Phase 1 #7 (4-step symbol switch, silent eviction, Ctrl+W shadow, no presets) + the bloat items from #5 and the noise panels. Severity: SLOWS (every decision, daily) + BLOCKS (on-chain dead-end).

**What changes**
- **Type-to-switch:** with a pane focused, typing `A–Z` opens an inline symbol box in that pane; Enter re-symbols it. 4 steps → 2. The single biggest daily time saver.
- **Named layout presets:** save/restore desks ("Macro", "Execution", "Focus") on `Ctrl+Shift+1..3`. workspaceStore already persists layout — this adds named snapshots, mostly plumbing.
- **Eviction made honest:** toast on LRU eviction + pinnable tabs exempt from eviction (`workspaceStore.ts:72`).
- **Shortcut hygiene:** pane-close moves off `Ctrl+W` (→ `Alt+W`); resolve the `S` Screener/Sectors collision in `panelRegistry.ts`.
- **The cull** (bloat/duplication removal): delete `HistoricalPricesPanel` (chart shows it) and `FxDashboardPanel` (15-min delayed = liability); merge `CryptoPanel` into Watchlist (it's a quote grid); hide `OnChainPanel` from nav when `WHALE_ALERT_API_KEY` absent; demote `DividendsPanel`/`FinancialsPanel` to tabs inside Synthesis. **27 panels → ~20**, registry and shortcut space decongested.

**Why it fixes the gap:** Attacks time-to-decision on every single interaction, and is the direct answer to "bloated and duplicated" — fewer, sharper screens plus muscle-memory safety.

**Resulting flow:** Fed headline hits. Glance at Market Overview (already trusted, per P0). `Ctrl+Shift+2` flips to my Execution desk. Type `QQQ` Enter on the focused pane. Chart with my template, sized alert levels visible: **~3 seconds** from headline to decision-ready, versus 10+ today.

---

## P4 — Design system unification

**Fixes:** Phase 1 #8 (7 font sizes, ticker 10px vs 12px, headers 8/9px, row-height drift). Severity: SLOWS + misread risk.

**What changes**
- **Typography tokens** in `tailwind.config.ts`: exactly four sizes — `data` 11px (all numerics/tickers), `label` 10px (headers/captions), `body` 12px, `title` 13px. 7px/8px eliminated; densest numerals get *bigger*, not smaller.
- **Shared primitives replacing duplicated markup:** `<PanelHeader>` (title + symbol + Freshness badge), `<DataTable>` (one header style, one row height `py-1.5`, one hover/zebra), `<Ticker>`, `<Metric>`. Panels migrate to them and their bespoke table code is **deleted** — this is the de-duplication pass, measured in net-negative lines.
- Migration order: highest-traffic first (Watchlist, MarketOverview, Portfolio, Screener), long tail after.

**Why it fixes the gap:** Kills the tab-switch "different app" shimmer and the 7px misread risk at speed; consolidation means future panels inherit consistency for free instead of re-implementing tables.

**Resulting flow:** Ticker symbols are the same size on every screen; my eye finds price/change columns in the same position at the same weight everywhere; scanning 40 rows at 11px under time pressure stops being an OCR exercise.

---

## P5 — Feed intelligence (news/sentiment that knows my book)

**Fixes:** Phase 1 #3 (no portfolio weighting, no z-score baseline, no headline→chart). Severity: SLOWS.

**What changes**
- **Book-aware ranking:** feed score (`useFinance.ts:793`) gets a multiplier when the symbol is in holdings / active plays / watchlist, with a `HOLDING` / `PLAY` / `WATCH` badge on the row.
- **Sentiment z-score:** mentions vs trailing 30-day baseline; the panel headline becomes "+3.8σ spike" instead of a raw count.
- **Headline → chart:** one click opens the symbol's chart (via existing globalSymbol plumbing).

**Why it fixes the gap:** The triage I currently do manually — "does this headline touch MY book?" — becomes the sort order. Sentiment becomes an extremes detector instead of trivia.

**Resulting flow:** A downgrade hits my 3rd-largest holding → it's the top row with a red `HOLDING` badge before I've read anything else; one click to the chart; my play's stop level (P1) is already drawn there.

---

## Priority order & rationale

| # | Workstream | Severity addressed | Why this rank |
|---|-----------|--------------------|---------------|
| **P0** | Data trust layer | BLOCKS ×2 | Foundation — every later feature renders through the envelope + badge. Nothing else is trustworthy until this lands. |
| **P1** | Active risk engine | BLOCKS | Highest decision-impact: capital preservation, invalidation, sizing. The persona's raison d'être. |
| **P2** | Chart decision kit | BLOCKS | Makes the core TA workflow executable; mostly renders already-fetched data. |
| **P3** | Shell speed + cull | SLOWS (daily) + bloat | Cheap, compounding daily wins + the de-bloat pass. |
| **P4** | Design system | SLOWS + misread risk | Big mechanical migration; done after cull so we don't restyle panels we're deleting. |
| **P5** | Feed intelligence | SLOWS | Real value, but depends on P1's plays/holdings data to rank against. |

**Deliberate trade-off to flag:** you emphasized usability/font inconsistency, which argues for P4 earlier. I've kept it at #4 because (a) restyling before the P3 cull wastes work on panels being deleted, and (b) BLOCKS-severity trust/risk gaps cost more per day than the shimmer. But the typography *tokens* (not the full migration) could cheaply ride along with P0 if you want visible polish early.

**Per-surface protocol once confirmed:** implement → report what changed & why → re-run the Phase 1 lens against the new version (does it now serve the decision, concretely?) → only then advance.
