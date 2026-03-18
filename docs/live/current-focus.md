# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Define and execute a staged migration of the finance backend to FastAPI without breaking the existing terminal client contract.
- Why it matters now: Python gives us a stronger ecosystem for analytics, universe data, and future research workflows, but a big-bang backend rewrite would add risk without matching commercial value.

## Scope

- In scope: Preserve the existing `/api/finance/*` surface, stand up a Python finance service first, and decide where `FinanceToolkit` and `FinanceDatabase` actually fit.
- Expected outcome: The migration plan should keep the current web shell stable, use FastAPI for finance-domain services, and avoid pretending reference or fallback sources are live market feeds.

## Constraints

- Constraint: Commercial impact remains the primary prioritization axis; development effort is second.
- Constraint: `FinanceDatabase` is a symbol/universe enrichment source, not a live market-data provider.
- Constraint: `FinanceToolkit` is useful for analytics/fundamentals/historical workflows, but it is not by itself a terminal-grade live-feed replacement.
- Constraint: Preserve the current `/api/finance/*` contract during cutover where reasonable; prefer Node→Python proxying over simultaneous frontend and backend contract churn.

## Success Criteria

- Check: The just-landed freshness metadata tranche remains verified and honest across quotes, charts, news, and economics.
- Check: A staged FastAPI migration plan is explicit about which routes move first, which ones stay in Node temporarily, and which data providers remain separate from Python library adapters.
- Check: The next implementation step can begin without ambiguity about provider roles, cutover order, or rollback strategy.