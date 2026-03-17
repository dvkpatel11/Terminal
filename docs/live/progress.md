# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Non-crypto quotes and charts now prefer a more current Yahoo Finance chart-backed path instead of the older Stooq-first daily path. Crypto remains on CoinGecko. Stooq/CBOE/reference paths remain as truthful fallbacks when stronger data is unavailable.

## Latest Completed Work

- Completed: Upgraded `server/marketData.ts` so equities/ETFs/indices/commodities use Yahoo Finance for quotes and OHLCV, added Yahoo chart parsing tests including duplicate-daily-session handling, and updated chart UI logic so equities can use intraday intervals when the provider supports them.
- Why it matters: This materially improves the commercial core of the product without waiting for a full licensed-feed procurement step.

## In Progress

- Work item: None.

## Blockers

- Blocker: None for the shipped tranche. Strategic limitation remains: Yahoo Finance is materially fresher than the old path, but it is still a public web-backed source rather than a licensed exchange-grade feed.

## Next Recommended Action

- Next step: Add explicit provider/freshness/delay metadata across core routes and UI surfaces so users can distinguish Yahoo current data, CoinGecko crypto data, and delayed/reference fallbacks at a glance.
- Follow-on after that: Evaluate and integrate a stronger licensed/commercial equity feed if the product needs stricter timeliness, reliability, or redistribution certainty.

## Touched Files

- `src/server/marketData.ts`
- `src/server/marketData.test.ts`
- `src/client/src/lib/chartSeries.ts`
- `src/client/src/lib/chartSeries.test.ts`
- `src/client/src/components/panels/ChartPanel.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (43 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route smoke against local dev server
- Result: `/api/finance/quotes?symbols=AAPL,SPY` returned `Yahoo Finance` with `isLive: true`; `/api/finance/ohlcv?symbol=AAPL&range=1D&interval=5m` returned 79 intraday bars.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: The quote view contained `YAHOO FINANCE`, and the AAPL chart view exposed `5M`, `15M`, `1H`, and `1D` interval controls.
- Check: Reviewer pass
- Result: Reviewer reported no substantive issues.

## Hand-off Note

- Resume from: Live stock-data tranche is landed.
- Watch for: `Yahoo Finance` improves freshness meaningfully, but the next honesty gap is visibility. Users still need clearer provider/freshness cues across all surfaces, and the long-term provider strategy may still need a stronger licensed source.
