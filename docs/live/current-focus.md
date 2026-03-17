# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the economics roadmap tranche: add a truthful economic calendar and in-terminal event drill-through.
- Why it matters now: The economics view had macro cards but no usable event workflow, and much of its surrounding panel content was still effectively static. The terminal now needs an actual macro calendar path, not just snapshot tiles.

## Scope

- In scope: `src/server/{economicsData.ts,economicsData.test.ts,providerUtils.ts,routes.ts,marketData.ts}` and `src/client/src/{lib/finance.ts,lib/useFinance.ts,components/panels/EconomicsPanel.tsx}`.
- Expected outcome: The economics panel keeps the macro snapshot, shows upcoming tracked macro events from a truthful public source, and lets the user drill into event metadata and official links without leaving the terminal workflow.

## Constraints

- Constraint: Use public, no-key sources only. Runtime fetches to BLS schedule/feed endpoints 403 in this environment, so FRED release calendar and release pages are the primary provider.
- Constraint: Do not invent consensus, surprise, or commentary data that the provider does not expose.
- Constraint: Preserve `/api/finance/economics` while adding new routes for calendar and event detail.

## Success Criteria

- Check: `npm test` passes with economics parser coverage.
- Check: `npm run check` passes.
- Check: Direct route smoke confirms `/api/finance/economics/calendar` returns tracked events and `/api/finance/economics/events/:releaseId` returns detail metadata with upcoming dates.
- Check: Browser smoke confirms the economics panel shows upcoming events and selecting an event changes the right-side drill-through detail.
