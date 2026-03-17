# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Land the commercially critical live-stock-data upgrade for the quote/chart/alert backbone.
- Why it matters now: Equities are the product's commercial core. Stale or daily-only stock data undermines trust faster than missing secondary workflows.

## Scope

- In scope: Replace the old non-crypto Stooq-first stock path with a more current intraday-capable provider strategy, while keeping truthful fallbacks when stronger data is unavailable.
- Expected outcome: Equities/ETFs/indices/commodities should prefer current Yahoo Finance chart-backed quotes and OHLCV, crypto should remain on CoinGecko, and fallback paths should no longer imply live behavior when they are only delayed/reference data.

## Constraints

- Constraint: Commercial impact is the primary prioritization axis; development effort is the second axis.
- Constraint: The immediate implementation may use a stronger public source, but the product must stay honest about fallback quality.
- Constraint: FinanceDatabase is a symbol/universe tool only, not a live-feed solution.
- Constraint: This tranche improves freshness materially, but it is not the final exchange-licensed market-data answer.

## Success Criteria

- Check: Quotes for core equities surface `Yahoo Finance` as the current source.
- Check: Equity intraday OHLCV works through the existing `/api/finance/ohlcv` route.
- Check: Reference or delayed fallbacks remain visibly non-live.
- Check: Tests, typecheck, route smoke, and browser smoke all pass.
