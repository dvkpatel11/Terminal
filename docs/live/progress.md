# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: The provider/freshness visibility tranche is landed. Quotes, OHLCV, news, and economics payloads now carry explicit `status` metadata, and the terminal UI renders those truthfulness cues across core surfaces.

## Latest Completed Work

- Completed: Added shared `DataStatus`/`DataFreshness` modeling, threaded `status` through finance and economics responses, wrapped `/api/finance/ohlcv` in an `OHLCVSeries` response, and rendered badges/timestamps in quote, chart, market overview, news, and economics panels.
- Completed: Fixed a review-found bug in `client/src/lib/useFinance.ts` so optional `feedProvider` and `summary` fields are omitted from `/api/finance/news/read` query strings instead of being serialized as the literal string `undefined`, and added `client/src/lib/useFinance.test.ts` coverage.
- Completed: Wrote and reviewer-checked the staged FastAPI migration plan at `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md`. The plan keeps Node as the temporary shell, preserves `/api/finance/*`, stages low-risk route families first, and keeps `FinanceToolkit`/`FinanceDatabase` behind explicit adapter boundaries.
- Why it matters: Users can now tell the difference between current Yahoo-backed quotes, feed-based news, schedule/snapshot economics, and fallback/reference data without the UI overstating freshness. The next implementation step now has an explicit cutover order, rollback path, and provider boundary.

## In Progress

- Work item: No active implementation. The next step is to execute Chunk 1 of the FastAPI finance-service migration plan.

## Blockers

- Blocker: None for the landed tranche.
- Strategic limitation: Yahoo Finance remains a public web-backed source, not a licensed exchange-grade market-data feed.

## Next Recommended Action

- Next step: Execute Chunk 1 of `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md` to scaffold the FastAPI service and lock the initial health/router contract.
- Follow-on after that: Move screener/peers/economics/portfolio into Python before touching the higher-risk live-market and news route families.

## Touched Files

- `src/server/dataStatus.ts`
- `src/server/dataStatus.test.ts`
- `src/server/marketData.ts`
- `src/server/marketData.test.ts`
- `src/server/economicsData.ts`
- `src/server/economicsData.test.ts`
- `src/server/routes.ts`
- `src/client/src/lib/finance.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/lib/useFinance.test.ts`
- `src/client/src/lib/chartSeries.ts`
- `src/client/src/lib/chartSeries.test.ts`
- `src/client/src/components/data/DataStatusBadge.tsx`
- `src/client/src/components/panels/QuotePanel.tsx`
- `src/client/src/components/panels/ChartPanel.tsx`
- `src/client/src/components/panels/NewsPanel.tsx`
- `src/client/src/components/panels/EconomicsPanel.tsx`
- `src/client/src/components/panels/MarketOverview.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`
- `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md`

## Verification Status

- Check: `npm test`
- Result: Pass (48 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route smoke against local dev server
- Result: `/api/finance/quotes?symbols=AAPL`, `/api/finance/ohlcv?symbol=AAPL&range=1D&interval=5m`, `/api/finance/news?symbol=AAPL`, `/api/finance/economics`, and `/api/finance/economics/calendar` all returned truthful `status` metadata; OHLCV returned 21 bars in the verification run.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: Market overview, quote, chart, news, and economics views all displayed the expected provider/freshness badges and `AS OF` timestamps where applicable.
- Check: Reviewer pass
- Result: Initial reviewer found the `feedProvider=undefined` bug in `useFinance.ts`; after the fix and new test coverage, a second reviewer pass reported no substantive issues.

## Hand-off Note

- Resume from: `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md` is ready for execution; Chunk 1 is the next concrete step.
- Watch for: The first Python cut must preserve `/api/finance/*` contract parity and honest freshness semantics. `FinanceDatabase` remains reference/universe only, and live-market routes should stay on Node until the Python provider layer can match them truthfully.