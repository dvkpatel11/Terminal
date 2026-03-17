# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the next roadmap tranche after workflow density: full news workflow with keyword search and article read-through.
- Why it matters now: Live headlines existed, but the terminal still lacked the deeper research loop users expect after finding a story.

## Scope

- In scope: `src/server/marketData.ts`, `src/server/routes.ts`, `src/server/marketData.test.ts`, `src/client/src/lib/{finance,useFinance}.ts`, `src/client/src/components/panels/NewsPanel.tsx`.
- Expected outcome: Users can search the active news feed, select a story, and read a server-fetched article summary/body inside the terminal without leaving the app.

## Constraints

- Constraint: Keep the existing `/api/finance/news` route surface, extending it compatibly with optional query support.
- Constraint: When article extraction fails, degrade truthfully to the known summary instead of inventing body text.

## Success Criteria

- Check: `npm test` passes with added news search/read-through tests.
- Check: `npm run check` passes.
- Check: Smoke tests confirm `/api/finance/news?query=...` filters results and `/api/finance/news/read` returns read-through content for a selected story.
