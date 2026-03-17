# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Deliver the first terminal-workflow tranche from the roadmap: split workspace panes plus Bloomberg-style command/drill-through navigation.
- Why it matters now: Live data exists; the next product gap is workflow density, not another isolated data widget.

## Scope

- In scope: `src/client/src/pages/Terminal.tsx`, `src/client/src/components/terminal/{WorkspacePane,CommandBar,TopBar,Sidebar,FunctionBar}.tsx`, `src/client/src/lib/{terminalTypes,terminalCommands,terminalWorkspace,terminalChrome}.ts`, related tests under `src/client/src/lib/*.test.ts`, and any panel type imports affected by the shared terminal types.
- Expected outcome: Users can keep a broad market view open while opening quote/chart/news work in a secondary pane, and can navigate with commands like `AAPL GP` and `MRKT`.

## Constraints

- Constraint: Preserve existing panel contracts so live-data panels do not need behavioral rewrites.
- Constraint: Keep broad context in the primary pane when opening security-specific work from market/screener/watchlist flows.

## Success Criteria

- Check: `npm test` passes with new terminal helper tests.
- Check: `npm run check` passes.
- Check: Browser smoke tests confirm split-pane open/close behavior and command alias execution (`MSFT GP`).
