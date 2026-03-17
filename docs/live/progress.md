# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Alerts are now live behavior, not static records. The backend evaluates thresholds against current quotes and the top bar surfaces triggered alerts in a notification center.

## Latest Completed Work

- Completed: Added a pure alert evaluation engine, extended alert state with trigger price/time, made `/api/alerts` evaluate pending alerts against live quotes, introduced a shared alert query hook, and upgraded the top bar and Alerts panel to surface triggered alerts clearly.
- Why it matters: The terminal now proactively tells the user when a monitored condition fired, which is a core workflow step rather than a decorative data screen.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Implement the next roadmap tranche: chart comparison overlays and intraday intervals.

## Touched Files

- `src/shared/schema.ts`
- `src/server/alertsEngine.ts`
- `src/server/alertsEngine.test.ts`
- `src/server/storage.ts`
- `src/server/routes.ts`
- `src/client/src/lib/useAlerts.ts`
- `src/client/src/components/terminal/TopBar.tsx`
- `src/client/src/components/panels/AlertsPanel.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (26 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Direct route checks against local dev server
- Result: Creating an `AAPL above 1` alert and then fetching `/api/alerts` returned `triggered: true`, `triggerPrice: 252.82`, and a populated `triggeredAt`.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: The top bar showed a triggered-alert badge, the notification center listed the triggered alert, and `VIEW ALL` opened the Alerts panel with trigger metadata visible.

## Hand-off Note

- Resume from: Alert workflow tranche is landed; next roadmap item should be chart comparison + intraday intervals.
- Watch for: `/api/alerts` currently evaluates on read, not in a background worker, so alerts trigger when clients poll/view alerts rather than via server push.
