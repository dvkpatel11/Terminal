# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the next roadmap tranche after alerts: chart comparison overlays plus truthful intraday interval support.
- Why it matters now: Workflow and alerts are in place; the next gap is deeper comparative analysis directly inside the chart workspace.

## Scope

- In scope: `src/server/marketData.ts`, `src/server/marketData.test.ts`, `src/server/routes.ts`, `src/client/src/lib/{useFinance,chartSeries}.ts`, `src/client/src/lib/chartSeries.test.ts`, `src/client/src/components/panels/ChartPanel.tsx`, `src/client/src/pages/Terminal.tsx`.
- Expected outcome: Users can overlay comparison symbols on charts, switch among supported intervals, and see clear messaging when intraday data is unavailable for the current provider/symbol.

## Constraints

- Constraint: Keep interval support truthful to provider capabilities; current public equity feed stays daily-only while crypto can use CoinGecko intraday granularity.
- Constraint: Preserve chart-pane routing so symbol entry within a chart stays in chart mode instead of falling back to quote mode.

## Success Criteria

- Check: `npm test` passes with added chart interval/normalization coverage.
- Check: `npm run check` passes.
- Check: Browser smoke tests confirm crypto chart overlays and interval switching plus explicit non-crypto intraday availability messaging.
