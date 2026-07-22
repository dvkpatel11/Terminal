# BLMTRM V1 → V2 Play Tracker Roadmap

Objective: turn the V1 market-data terminal into a real **personal financial play tracker**
(recording plays, P&L, R-multiple, win rate, expectancy) with validated, risk-anchored
signals and accurate portfolio analytics.

Status: V1 has solid real-data plumbing (Yahoo/Stooq/CoinGecko + caching + fallbacks) and a
working alert engine, but does **not** persist or track plays, computes only unrealized
mark-to-market on a hardcoded book, and emits LLM-generated signals with no risk math.

---

## Phase 0 — Play Ledger (persistence)
**Milestone: you can record a play and it survives a restart.**

- [ ] Add `plays` table to `shared/schema.ts`:
  `id, symbol, side(buy/sell), entryPrice, size(shares/contracts), entryDate,
  stopPrice, targetPrice, thesis(text), status(open/closed), exitPrice, exitDate,
  source(signal/manual)`.
- [ ] Drizzle migration (`npm run db:push`) + extend `server/storage.ts` with CRUD
  (in-memory + PostgreSQL).
- [ ] API routes in `server/routes.ts`:
  `GET/POST /api/plays`, `PATCH /api/plays/:id/close`, `DELETE /api/plays/:id`.

## Phase 1 — P&L & Risk Engine (the core gap)
**Milestone: realized + unrealized P&L, R-multiple, win rate, expectancy.**

- [ ] `server/pnlEngine.ts`: per-play realized P&L on close; unrealized mark-to-market
  on open (using live quote).
- [ ] Compute **R-multiple** = (exit − entry) / |entry − stop|, signed, per play.
- [ ] Aggregate metrics: **win rate, avg win R, avg loss R, expectancy (ΣR / #trades),
  profit factor**.
- [ ] Per-play max adverse/favorable excursion hooks (stub now, fill later).
- [ ] Unit tests with known trades asserting R and expectancy.

## Phase 2 — Signals Hardening & Risk Overlay
**Milestone: signals are validated, risk-anchored, never silent.**

- [ ] Replace naive `JSON.parse` in `trading/signals.ts:129` with a **Zod schema**;
  reject malformed input (uppercase action, `confidence` outside [0,1], missing stop).
- [ ] **Computed stops/targets**: derive stop from ATR/support; compute **position size**
  from a risk-per-trade $ input and stop distance; verify **R:R ≥ threshold** before emit.
- [ ] Surface parse/validation failures as errors, not a fake `hold`
  (remove `signals.ts:153-163` silent fallback).
- [ ] Fix model routing: make the client explicit (Bedrock vs OpenAI-compatible), fail
  loud on missing key (no `"dummy"` default in `openai/client.ts:7`).

## Phase 3 — Portfolio Analytics Fixes
**Milestone: accurate, benchmarkable, annualized analytics.**

- [ ] Fix `buildPortfolioValueSeries` all-or-nothing drop (`portfolioAnalytics.ts:137`) —
  return a partial series with explicit gaps instead of null-everything.
- [ ] **Annualize** return (CAGR over actual window days).
- [ ] Make **benchmark configurable** (kill hardcoded `"SPY"` at 155/181); accept a
  passed-in benchmark symbol.
- [ ] Use **sample** (n−1) std-dev/covariance; label clearly.
- [ ] Optional: dividends/cash-flow handling + time-weighted return for mid-period adds.

## Phase 4 — Play Tracker UI
**Milestone: a trader can actually use it to track plays.**

- [ ] `PlayEntryModal` (symbol, side, entry, size, stop, target, thesis, risk$).
- [ ] Open/Closed plays list with live unrealized P&L + R badge.
- [ ] Analytics panel: win rate, expectancy, profit factor, equity curve.
- [ ] Link a generated signal → "open play from signal" action.

## Phase 5 — Macro / Risk Overlay (your edge)
**Milestone: see the portfolio through a macro lens.**

- [ ] Tag plays with regime (risk-on/off) using the existing YieldCurve/Economics panels.
- [ ] Exposure vs rates/FX/commodities; flag concentration.

---

## Suggested execution order
0 → 1 → 4 (get tracking working), then 2 → 3 (harden math), then 5.

## Known V1 reference points (for fixes)
- `src/shared/schema.ts` — only watchlist_items, alerts, chat_messages today.
- `src/client/src/components/panels/PortfolioPanel.tsx:17-24` — hardcoded demo positions.
- `src/server/portfolioAnalytics.ts:112-149` — brittle series builder; 155/181 hardcoded SPY.
- `src/trading/signals.ts:129-165` — unvalidated parse + silent hold fallback.
- `src/openai/client.ts:7` — `apiKey` defaults to `"dummy"`.
- `src/server/alertsEngine.ts` — correct, keep as-is.
