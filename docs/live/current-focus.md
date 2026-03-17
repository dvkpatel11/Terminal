# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the next roadmap tranche after portfolio analytics: move alerts from poll-on-read triggering to background evaluation.
- Why it matters now: The terminal already had alert storage and notification UI, but triggers still depended on someone reading `/api/alerts`, which is not truthful or proactive behavior.

## Scope

- In scope: `src/server/{alertMonitor.ts,alertMonitor.test.ts,index.ts,routes.ts}` plus any minimal alert-consumer adjustments needed to keep delivery truthful.
- Expected outcome: Alerts trigger in the background on a timer, `/api/alerts` becomes a pure read endpoint again, and existing notification UI reflects already-triggered alerts without causing the trigger itself.

## Constraints

- Constraint: Preserve current alert payload shape and UI semantics; delivery changes should improve trigger timing, not redesign the alert product.
- Constraint: Keep overlap-safe background evaluation so slow provider fetches do not spawn duplicate cycles.

## Success Criteria

- Check: `npm test` passes with background-monitor coverage.
- Check: `npm run check` passes.
- Check: Smoke tests confirm an alert can trigger after waiting, before any `/api/alerts` read, and that the top-bar notification center surfaces the triggered result.
