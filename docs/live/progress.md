# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Alert triggering no longer depends on reading `/api/alerts`. The server now evaluates pending alerts on a background timer and existing notification UI simply reflects already-triggered state.

## Latest Completed Work

- Completed: Added a background alert monitor with overlap protection, removed trigger-side effects from the `/api/alerts` read route, and wired the monitor into server startup while keeping the current top-bar/alerts UI intact.
- Why it matters: Alerts are now proactive system behavior instead of a side effect of someone opening the alerts screen, which is the right foundation for later push-style delivery.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Expand economics with calendar and event drill-down, or add transcript / filing summarization to the research workflow.

## Touched Files

- `src/server/alertMonitor.ts`
- `src/server/alertMonitor.test.ts`
- `src/server/index.ts`
- `src/server/routes.ts`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (36 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route smoke against local dev server
- Result: Creating an `AAPL above 1` alert, waiting 17 seconds, and then reading `/api/alerts` returned the alert as already triggered with trigger metadata populated.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: The top bar showed a triggered-alert badge and the notification center listed the triggered alert without needing the alerts page to be opened first.
- Check: Reviewer pass
- Result: Background alert delivery implementation reviewed with no substantive issues found.

## Hand-off Note

- Resume from: Background alert delivery tranche is landed; next roadmap choice is economics event workflows or research summarization.
- Watch for: The monitor is still timer-based polling, not server push; later SSE/websocket delivery can build on this without reintroducing read-time triggering.
