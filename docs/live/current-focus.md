# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Replace the mocked finance/news backend with live public-provider integrations and keep the existing terminal routes working.
- Why it matters now: The product comparison identified mocked quotes/news as a core gap, and the user explicitly requested live feeds.

## Scope

- In scope: `src/server/marketData.ts`, `src/server/routes.ts`, `src/shared/schema.ts`, `src/server/storage.ts`, `src/client/src/lib/finance.ts`, `src/client/src/lib/useFinance.ts`, `src/client/src/components/panels/{MarketOverview,NewsPanel,QuotePanel,ChartPanel}.tsx`, `src/client/src/App.tsx`.
- Expected outcome: Quotes/ohlcv/news endpoints return live provider-backed data with truthful fallbacks, and the client renders those results without fake tick simulation.

## Constraints

- Constraint: Keep the existing `/api/finance/*` route surface so current panels continue to work.
- Constraint: Use public/no-key providers by default and degrade to explicit reference fallback data instead of inventing live values.

## Success Criteria

- Check: `npm test` passes with provider parsing coverage.
- Check: `npm run check` passes.
- Check: Live smoke tests show `/api/finance/quotes` and `/api/finance/news` returning provider-backed data for `AAPL`.
