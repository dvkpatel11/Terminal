# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Charting now supports comparison overlays and truthful interval behavior. Crypto charts can use intraday intervals from CoinGecko-backed data, while non-crypto charts stay daily-only with explicit messaging.

## Latest Completed Work

- Completed: Added interval-aware OHLCV support with crypto resampling, introduced chart-series normalization helpers and tests, upgraded `ChartPanel` with comparison overlays and interval controls, and fixed chart-pane symbol routing so chart symbol entry stays in chart mode.
- Why it matters: The terminal can now answer the next analytical question after opening a chart: how is this asset performing relative to another, and what does the move look like on a sub-daily timescale when the provider supports it.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Implement the next roadmap tranche: add benchmark/risk context to portfolio workflows.

## Touched Files

- `src/server/marketData.ts`
- `src/server/marketData.test.ts`
- `src/server/routes.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/lib/chartSeries.ts`
- `src/client/src/lib/chartSeries.test.ts`
- `src/client/src/components/panels/ChartPanel.tsx`
- `src/client/src/pages/Terminal.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (29 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: `BTC-USD GP` opened a chart pane with crypto intraday controls, adding `ETH-USD` created a comparison overlay chip, and switching the chart symbol to `AAPL` kept the chart pane active while surfacing the non-crypto intraday availability notice.

## Hand-off Note

- Resume from: Chart tranche is landed; next roadmap item should be portfolio benchmark/risk context.
- Watch for: Public-provider intraday truth is intentionally asymmetric—crypto only for now—until a reliable no-key equity intraday source is introduced.
