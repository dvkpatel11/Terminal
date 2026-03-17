# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Live quote, OHLCV, screener, mover, economics snapshot, and news routes now use public providers instead of mocked payloads. The client renders provider-backed quotes/news and no longer simulates fake index ticks.

## Latest Completed Work

- Completed: Added `server/marketData.ts` with Stooq/CoinGecko/RSS integrations, rewired `/api/finance/*` routes, tightened client quote/news handling, and fixed the repo's pre-existing typecheck blockers.
- Why it matters: The terminal now surfaces live market/news data through the existing UX instead of synthetic placeholders, and the workspace is back to a clean test/typecheck baseline.

## In Progress

- Work item: None.

## Blockers

- Blocker: Public providers remain rate-limit sensitive compared with paid feeds; monitor usage before scaling traffic.

## Next Recommended Action

- Next step: Open the terminal in a browser and spot-check a few symbols/panels (quote, news, screener, economics) to validate UX against live responses.

## Touched Files

- `src/server/marketData.ts`
- `src/server/routes.ts`
- `src/shared/schema.ts`
- `src/server/storage.ts`
- `src/client/src/lib/finance.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/components/panels/MarketOverview.tsx`
- `src/client/src/components/panels/NewsPanel.tsx`
- `src/client/src/components/panels/QuotePanel.tsx`
- `src/client/src/components/panels/ChartPanel.tsx`
- `src/client/src/App.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (8 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Live provider smoke tests via `node --import tsx`
- Result: `getQuotes(['AAPL'])`, `getNews('AAPL')`, and `getOHLCV('AAPL','1M')` returned live Stooq/RSS data; local `/api/finance/quotes` and `/api/finance/news` also returned live data when exercised through `server/index.ts`.

## Hand-off Note

- Resume from: Browser-level acceptance checks and any follow-up polish on provider limits/caching if usage grows.
- Watch for: Public feed schema/rate-limit drift, especially CoinGecko and Google News RSS changes.
