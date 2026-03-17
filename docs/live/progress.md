# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: The terminal now has a fuller news workflow: searchable feeds plus an in-terminal read-through pane backed by a server-side article extraction/fallback API.

## Latest Completed Work

- Completed: Extended the finance news backend with query filtering and article read-through extraction/caching, added `/api/finance/news/read`, and rebuilt `NewsPanel` into a searchable headline list plus article reader.
- Why it matters: The product now supports the next step after seeing a headline: reading and filtering news inside the terminal instead of bouncing out to source sites immediately.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Implement the next roadmap tranche: live alert triggering plus an in-app notification center workflow.

## Touched Files

- `src/server/marketData.ts`
- `src/server/marketData.test.ts`
- `src/server/routes.ts`
- `src/client/src/lib/finance.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/components/panels/NewsPanel.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (23 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route checks against local dev server
- Result: `/api/finance/news?symbol=AAPL&query=motionvfx` returned 3 matching stories and `/api/finance/news/read` returned a read-through payload for a selected CNBC story.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: Opening the News panel showed search, selectable headlines, and an in-terminal read-through pane with an `OPEN SOURCE` link for the selected story.

## Hand-off Note

- Resume from: News workflow tranche is landed; next roadmap item should be alert triggering/notification behavior.
- Watch for: Article extraction quality varies by publisher; some sites will fall back to the known summary when the HTML is hostile or thin.
