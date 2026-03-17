# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the next roadmap tranche after news depth: live alert triggering plus notification center behavior.
- Why it matters now: The app could store alerts, but they were not operational. A terminal should proactively surface actionable events, not just record them.

## Scope

- In scope: `src/shared/schema.ts`, `src/server/{alertsEngine.ts,alertsEngine.test.ts,storage.ts,routes.ts}`, `src/client/src/lib/useAlerts.ts`, `src/client/src/components/{panels/AlertsPanel.tsx,terminal/TopBar.tsx}`.
- Expected outcome: Alert thresholds evaluate against live quotes, triggered alerts persist trigger metadata, and users can see/enter triggered alerts from the top bar and Alerts panel.

## Constraints

- Constraint: Reuse the existing `/api/alerts` contract, extending alert payloads compatibly with trigger metadata.
- Constraint: Evaluate alerts truthfully from current quote data and persist the actual trigger price/time instead of synthetic notification text.

## Success Criteria

- Check: `npm test` passes with alert engine coverage.
- Check: `npm run check` passes.
- Check: Smoke tests confirm `/api/alerts` returns triggered metadata after a matching alert is created and the top-bar notification center surfaces that trigger.
