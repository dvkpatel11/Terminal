# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: The economics panel now combines a live macro snapshot with a truthful upcoming-event workflow. Users can browse tracked macro releases, select one, and drill into source metadata, release tables, and upcoming schedule dates from inside the terminal.

## Latest Completed Work

- Completed: Added `server/economicsData.ts` for FRED-backed calendar/detail parsing, extracted shared provider fetch/cache helpers, added `/api/finance/economics/calendar` and `/api/finance/economics/events/:releaseId`, and rebuilt `EconomicsPanel.tsx` into a list + detail workflow while removing the worst static-panel fiction around FX/commodities/yield curve.
- Why it matters: Macro workflow now has depth and drill-through instead of stopping at a few tiles, and the data shown in the panel is materially more truthful.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Add transcript / filing summarization to the research workflow, or improve alert delivery further with SSE/websocket push on top of the background evaluator.

## Touched Files

- `src/server/economicsData.ts`
- `src/server/economicsData.test.ts`
- `src/server/providerUtils.ts`
- `src/server/marketData.ts`
- `src/server/routes.ts`
- `src/client/src/lib/finance.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/components/panels/EconomicsPanel.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (40 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route smoke against local dev server
- Result: `/api/finance/economics/calendar` returned tracked events; `/api/finance/economics/events/:releaseId` returned source metadata, release tables, and future upcoming dates.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: Opening `ECON` showed upcoming events; selecting a different event updated the right-side drill-through panel and external links.
- Check: Reviewer pass
- Result: Economics calendar implementation reviewed with no substantive issues found.

## Hand-off Note

- Resume from: Economics calendar and event drill-through tranche is landed.
- Watch for: The calendar intentionally tracks a curated set of major U.S. macro releases from FRED. If broader global/event coverage is added later, keep the same truthfulness standard and avoid falling back to synthetic consensus data.
