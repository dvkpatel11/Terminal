# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: Portfolio workflows now include benchmark-relative and risk-aware context. The panel uses live historical data to show SPY comparison, beta, volatility, drawdown, and active return instead of a simulated portfolio chart.

## Latest Completed Work

- Completed: Added a pure portfolio analytics module/tests, exposed `/api/finance/portfolio-analytics`, and rewired `PortfolioPanel` to render benchmark/risk cards and a 30D portfolio-vs-SPY comparison chart from live analytics.
- Why it matters: The portfolio workflow now answers not just "am I up?" but also "versus what, and with what risk?" which is the next meaningful step toward a Bloomberg-like workflow.

## In Progress

- Work item: None.

## Blockers

- Blocker: None.

## Next Recommended Action

- Next step: Improve alert delivery from poll-on-read to push/background evaluation, or expand economics with calendar/event drill-down depending on which workflow should get proactive/event context first.

## Touched Files

- `src/server/portfolioAnalytics.ts`
- `src/server/portfolioAnalytics.test.ts`
- `src/server/routes.ts`
- `src/client/src/lib/finance.ts`
- `src/client/src/lib/useFinance.ts`
- `src/client/src/components/panels/PortfolioPanel.tsx`
- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: `npm test`
- Result: Pass (34 tests, 0 failures).
- Check: `npm run check`
- Result: Pass.
- Check: Route smoke tests via browser fetch against local dev server
- Result: `/api/finance/portfolio-analytics` returned `benchmarkSymbol: "SPY"`, populated risk metrics, and a 30-point comparison chart.
- Check: Browser smoke tests via Puppeteer against local dev server
- Result: Opening the Portfolio panel showed `SPY RETURN`, `BETA`, `VOLATILITY`, `MAX DRAWDOWN`, and `30D VS SPY` content.

## Hand-off Note

- Resume from: Portfolio benchmark/risk tranche is landed; next roadmap choice is proactive alert delivery or economics event workflows.
- Watch for: Portfolio analytics use daily data and current static holdings; there is no transaction ledger or cash-flow attribution yet.
