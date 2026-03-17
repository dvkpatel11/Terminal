# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the next roadmap tranche after chart overlays: benchmark and risk context for portfolio workflows.
- Why it matters now: The portfolio screen already showed positions and P&L, but it did not answer whether performance was good relative to a benchmark or what risk profile produced it.

## Scope

- In scope: `src/server/{portfolioAnalytics.ts,portfolioAnalytics.test.ts,marketData.ts,routes.ts}`, `src/client/src/lib/{finance,useFinance}.ts`, `src/client/src/components/panels/PortfolioPanel.tsx`.
- Expected outcome: The portfolio screen shows benchmark-relative performance, beta, volatility, drawdown, and a benchmark comparison chart based on live historical data rather than simulated series.

## Constraints

- Constraint: Keep positions client-owned/editable and compute analytics from those positions without introducing persistence or fake history.
- Constraint: Use daily historical data only, with explicit benchmark/risk context derived from the current public provider stack.

## Success Criteria

- Check: `npm test` passes with portfolio analytics coverage.
- Check: `npm run check` passes.
- Check: Browser and route smoke tests confirm `/api/finance/portfolio-analytics` returns benchmark/risk metrics and the portfolio panel renders benchmark/risk cards plus a 30D comparison chart.
