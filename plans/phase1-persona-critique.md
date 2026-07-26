# PHASE 1 — In-Character Critique (HNW trader / portfolio architect)

**Method:** Walked each surface attempting three real jobs: (a) react to a market-moving event as early as possible, (b) build/maintain a risk-managed HNW portfolio, (c) make and track a TA-grounded trade decision (breakout confirmation, trend strength, volatility sizing, thesis invalidation). Every claim cites code.

**Severity scale:** BLOCKS a real decision / SLOWS a real decision / COSMETIC.

---

## 1. Market Overview

**1. What I'm deciding:** "Is today risk-on or risk-off, and which side of the book do I lean into?"

**2. What it does well:** Genuinely good. Rotation signal DEFENSIVE/GROWTH (`MarketOverview.tsx:87-91`), VIX contango/backwardation (`:348`), credit IG/HY OAS, breadth (% above 50/200 DMA). This is the one screen that already answers a positioning question.

**3. What's missing/misleading:**
- Credit spreads poll at 300s (`useFinance.ts:683`). In a fast credit-led selloff — exactly when I need them — they're up to 5 minutes stale with **no staleness indicator**. I cannot tell a fresh 340bp HY OAS from a 5-minute-old one.
- Quote fallback chain ends in `buildReferenceFallbackQuote` (`marketData.ts:1011`) serving hardcoded catalog prices with no visual flag. During a provider outage this screen shows confident, fabricated prices. That is worse than a blank screen.
- No volume-weighted breadth (TRIN/Arms); A/D ratio alone can't distinguish conviction from drift.
- Fonts: 7px sparkline labels (`MarketOverview.tsx:161,193`), 8px sector headers (`:236`). On the highest-density screen, the numbers I most need are the smallest in the app.

**4. Severity: BLOCKS** (silent fallback data + invisible staleness — on a decision surface, unverifiable data is disqualifying). Panel logic itself: strong.

---

## 2. Symbol Deep Dive (Chart + Synthesis)

**1. What I'm deciding:** "Is this breakout real, how strong is the trend, where's my stop, and how big is the position?"

**2. What it does well:** Chart core is respectable: SMA 20/50/200, EMA 20/50, BB, VWAP, volume histogram (`ChartPanel.tsx:381-391`), RSI/MACD panes, auto-Fib, D/W/M pivots, earnings/dividend markers, a good measurement tool (Shift+drag → % change, bar count; `:626-689`). SynthesisPanel merges quote, news, AI thesis, analyst consensus, sentiment (`SynthesisPanel.tsx:142-383`).

**3. What's missing/misleading:**
- **Breakout confirmation — cannot complete.** No relative-strength line vs SPY/QQQ. Worse: the UI accepts comparison symbols and fetches their OHLCV (`ChartPanel.tsx:166,752`) **but never renders them** — a dead control that looks functional. That's not a gap, it's a trap.
- **Volatility sizing — cannot complete.** ATR14 is fetched by the backend (`useFinance.ts:722,734`) and then thrown away — no rendering, no selection key. The single number I need for stop distance and vol-based sizing is in the payload and invisible.
- Server-computed support/resistance also fetched and never drawn (`useFinance.ts:725-726`). OBV same (`:723`).
- Drawing = horizontal lines only (`ChartPanel.tsx:598`). No trendlines, no channels. I cannot mark the structure I'm trading.
- No saved indicator templates — I rebuild my chart setup per symbol, per session.
- No single deep-dive view: SynthesisPanel has **no chart** (MAs shown as text, `SynthesisPanel.tsx:222-235`). Full picture = 3 panels (Chart + Synthesis + Plays), self-assembled, every time.

**4. Severity: BLOCKS** — (c) is not executable end-to-end: no RS confirmation, no ATR on screen, dead comparison feature, no structural drawing.

---

## 3. Social / News Feed

**1. What I'm deciding:** "Did something just happen that changes a position I hold or a setup I'm stalking?"

**2. What it does well:** Decay-weighted feed scoring with breaking-news boost (`useFinance.ts:793`) is real signal filtering, not a raw dump. Source attribution present.

**3. What's missing/misleading:**
- **No portfolio/watchlist awareness.** A headline on my largest holding ranks the same as one on a stock I'll never touch. The one join that would make this screen decision-grade doesn't exist.
- Sentiment mentions have no baseline/z-score (`SentimentPanel.tsx:29`) — I can't tell "5,000 mentions" is a 4-sigma spike or a Tuesday. Raw counts at 5-min refresh (`useFinance.ts:683`) answer no question.
- No "event → chart" path: no one-click from headline to the symbol's chart at the news timestamp.

**4. Severity: SLOWS** — decent early-warning raw material, but I do the triage that software should do.

---

## 4. Macro Dashboard (Economics / Yield Curve / Calendar / FX)

**1. What I'm deciding:** "What's the event risk this week, and has the macro regime shifted under my book?"

**2. What it does well:** CalendarPanel is the standout: unified econ/Fed/earnings with per-day risk scoring (`CalendarPanel.tsx:109-111`) — directly answers "size down this week?" Yield curve from FRED is trustworthy between releases.

**3. What's missing/misleading:**
- **Hardcoded macro fallbacks served as live data**: FRED fails → GDP 2.5%, CPI 3.1%, Fed Funds 5.33% (`economicsData.ts:1419-1432`), unflagged. A fabricated Fed Funds print during a vol event is the most dangerous pixel in this app.
- 4-hour macro cache (`economicsData.ts:11`) with no release-aware busting. On CPI morning — the only time this screen matters intraday — it can show pre-release numbers for hours while the market has repriced.
- FX panel is 15-min delayed Stooq (`FxDashboardPanel.tsx:101`), presented in a "terminal." At that latency it should not exist on this desk.
- `^RUT` silently proxied by IWM via delayed feed (`marketData.ts:1067`) — small-cap breadth reads are quietly wrong.

**4. Severity: BLOCKS** (silent fallbacks + release-day staleness). Calendar alone: strong.

---

## 5. On-Chain / Whale View (+ Crypto)

**1. What I'm deciding:** "Is institutional/whale flow confirming or contradicting my crypto exposure?"

**2. What it does well:** Nothing usable in default state.

**3. What's missing/misleading:**
- Hard-gated on `WHALE_ALERT_API_KEY` (`OnChainPanel.tsx:56`) — without it, a dead screen occupying a nav slot.
- CryptoPanel is a quote grid (`CryptoPanel.tsx:21`): no funding rates, no exchange flows, no BTC-vs-equity correlation. It decides nothing a watchlist row doesn't.

**4. Severity: On-chain BLOCKS (dead-end); Crypto is NOISE** — well-rendered, changes no decision. Polish is not the bar.

---

## 6. Portfolio & Trade Thesis Tracker (Portfolio / Plays / Alerts)

**1. What I'm deciding:** "Am I sized right, concentrated anywhere, and is any active thesis invalidated?"

**2. What it does well:** Beta, annualized vol, max drawdown as first-class metrics (`PortfolioPanel.tsx:95-97`); grade badge accountability (`PortfolioDashboard.tsx:137`); Plays forces entry/stop/target/thesis before entry (`PlaysPanel.tsx:34-39`); alert engine evaluates price on-tick, PE/RSI/MACD/volume at 15s (`alertMonitor.ts:83,128`).

**3. What's missing/misleading:**
- **Thesis invalidation is not detected.** No code compares live price to a play's stop or target — status changes are manual button clicks ("Activate" `:312`, "Close as Win" `:321`). Price can gap through my stop and the play sits green until I notice. For a thesis *tracker*, this is the core function, absent.
- **No position sizing.** No risk-$ field, no `shares = risk / (entry − stop)` (`PlaysPanel.tsx:136-207`). The panel records discipline but doesn't enforce it where sizing errors actually happen.
- No per-trade realized R-multiple — only an aggregate avg R:R footer (`:363-369`). Without an R distribution I cannot compute expectancy, so the journal can't tell me if my edge is real.
- Play → chart link exists (`:261`) but **entry/stop/target are not drawn on the chart**. The two halves of one decision never meet on screen.
- Portfolio: no sector concentration or correlation view. Beta-neutral while 80% correlated to one theme is exactly the HNW failure mode this screen should catch, and can't.
- Alerts delivered via WebSocket to open tabs only — closed laptop = no alert. Discipline that requires me to be watching isn't discipline.

**4. Severity: BLOCKS** — (b) and (c) both fail at the risk-management step: no sizing, no invalidation detection, no concentration view, no away-from-desk alerting.

---

## 7. Navigation / Session Flow

**1. What I'm deciding:** Nothing — this layer's only job is to make every decision above faster.

**2. What it does well:** Better than expected: `globalSymbol` syncs unlocked panels (`workspaceStore.ts:24`, `Terminal.tsx:144`); `SYMBOL VERB` command syntax; layout persists via localStorage (`workspaceStore.ts:150`); tab cap of 12 with LRU eviction (`workspaceStore.ts:72`); split view with `ensureSecondary()` (`:137`).

**3. What's missing/misleading:**
- Symbol switch on a focused pane = 4 steps (Ctrl+1 → `/` → type → Enter). Direct type-to-switch would halve time-to-chart for every event reaction, all day.
- LRU eviction closes tabs **silently** — the Plays panel I rely on for stop levels can be evicted while I work, with no notification.
- `Ctrl+W` intercepted to close the secondary pane (`Terminal.tsx:52`), shadowing browser close-tab — muscle-memory hazard that will eat a pane mid-session.
- No named layout presets: no "macro desk" / "execution desk" one-key switch; the desk is rebuilt manually per context change.
- No per-panel data timestamps anywhere; only global API health in the status bar. Every latency issue in surfaces 1–6 is invisible because this chrome layer hides it.

**4. Severity: SLOWS** — every decision, every day, compounding.

---

## 8. Cross-cutting: typography & layout consistency

Seven distinct font sizes in active use: 7px (`MarketOverview.tsx:161`), 8px headers (`PortfolioPanel.tsx:181`, `DividendsPanel.tsx:49`), 9px headers (`ScreenerPanel.tsx:44`, `WatchlistPanel.tsx:113`), 10px (`FinancialsPanel.tsx:34`), 11px (`ScreenerPanel.tsx:107`), 12px (`WatchlistPanel.tsx:137-139`), plus Tailwind xs/sm. The **same element class — a ticker symbol — renders 10px in one panel and 12px in another**; table headers are 8px or 9px depending on panel; row padding ranges py-1.5 → py-2.5. Tab-switching produces a visible "different app" shimmer, and 7–8px numerals on data-dense screens are a real misread risk at speed, not just an aesthetic one.

**Severity: SLOWS** (misread-risk on dense numerics edges toward worse) — this is what makes the whole product feel untrustworthy even where the data is fine.

---

## Summary table

| # | Surface | Decision it serves today | What's missing / misleading (concrete) | Severity |
|---|---------|--------------------------|----------------------------------------|----------|
| 1 | Market overview | Risk-on/off + rotation lean — genuinely served | Silent hardcoded fallback quotes (`marketData.ts:1011`); 300s credit polling w/ no staleness flag; no TRIN; 7-8px numerals | **BLOCKS** (trust), logic strong |
| 2 | Symbol deep dive | Basic TA read; NOT breakout confirmation or vol sizing | No RS line; comparison overlay fetched but never rendered (`ChartPanel.tsx:166,752`); ATR fetched, never shown (`useFinance.ts:722`); horizontal-lines-only drawing; no saved templates; no single view (3 panels, chart absent from Synthesis) | **BLOCKS** |
| 3 | Social/news feed | Raw early-warning, well-scored | No portfolio/watchlist weighting; sentiment counts lack z-score baseline; no headline→chart path | **SLOWS** |
| 4 | Macro dashboard | Event-risk calendar (strong); regime read (untrustworthy) | Hardcoded FRED fallbacks served silently (`economicsData.ts:1419-1432`); 4h cache with no release-day busting; 15-min delayed FX; RUT=IWM proxy | **BLOCKS** |
| 5 | On-chain / whale (+crypto) | Nothing, in default state | Dead screen without API key (`OnChainPanel.tsx:56`); crypto grid has no funding/flows/correlation — decides nothing | **BLOCKS** (dead-end) / crypto NOISE |
| 6 | Portfolio & thesis tracker | Risk metrics + journaling intent — half-served | No stop/target auto-flagging (thesis invalidation undetected — zero price-vs-stop comparison in `PlaysPanel.tsx`); no position sizing from risk; no per-trade R history; no concentration/correlation view; plays not drawn on chart; alerts die with the tab | **BLOCKS** |
| 7 | Navigation / session flow | Speed layer — partially delivers | 4-step symbol switch; silent LRU tab eviction (`workspaceStore.ts:72`); Ctrl+W shadowing (`Terminal.tsx:52`); no layout presets; no per-panel freshness anywhere | **SLOWS** |
| 8 | Typography/layout (cross-cutting) | — | 7 font sizes; ticker = 10px or 12px by panel; headers 8px vs 9px; row heights vary py-1.5→py-2.5; 7px numerals on densest screens | **SLOWS** |

---

## The blunt version

- **Two features look functional and are not**: the chart comparison input (fetches, never renders) and the Plays tracker's implied monitoring (records stops, never checks them). Dead controls on a trading surface are worse than missing ones — they earn false confidence.
- **The app fabricates data under failure** — macro prints and quotes — with no flag. Until every number carries source + age, no screen here can be fully trusted at the moment it matters most, which is precisely during provider stress.
- **The risk-management story is a façade at the critical step**: metrics are displayed (beta, vol, DD, R:R) but nothing is *enforced or detected* — no sizing math, no invalidation trigger, no concentration cap, no off-desk alert. It measures discipline; it doesn't provide any.
- Well-built noise confirmed as noise: Crypto grid, Historical Prices table, delayed FX, sparse Dividends/Financials. Competently rendered; decide nothing; cut or demote.

*Awaiting review. Phase 2 will not begin until explicitly instructed.*
