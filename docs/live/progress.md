# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: The provider/freshness visibility tranche remains landed and verified, and a new Remotion-based 60-second product demo video now exists under `src/` without changing the live app runtime.

## Latest Completed Work

- Completed: Added a self-contained Remotion setup in `src/` with a scripted 1920x1080, 30fps, 60-second composition (`BLMTRMTerminalDemo`) covering intro, market overview, single-name analysis, research workflow, risk workflow, AI workflow, and closing CTA.
- Completed: Added Remotion CLI scripts to preview/list/render the composition and rendered the final MP4 to `src/out/blmtrm-demo.mp4`.
- Completed: Added shared terminal-video styling and reusable composition helpers so the demo stays deterministic and does not depend on localhost/browser capture at render time.
- Why it matters: We now have a polished product demo artifact for blmtrm that can be rendered locally on demand while keeping the actual terminal application untouched.

## In Progress

- Work item: No active implementation. The migration plan remains the next product-engineering step after this demo deliverable.

## Blockers

- Blocker: None for the Remotion demo or the landed freshness tranche.
- Strategic limitation: Yahoo Finance remains a public web-backed source, not a licensed exchange-grade market-data feed.
- Tooling note: Remotion warns that workspace `zod` is on 3.x while Remotion prefers 4.3.6, but composition listing, still rendering, and full video rendering all succeeded in the current setup.

## Next Recommended Action

- Next step: Execute Chunk 1 of `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md` to scaffold the FastAPI service and lock the initial health/router contract.
- Follow-on after that: Move screener/peers/economics/portfolio into Python before touching the higher-risk live-market and news route families.

## Touched Files

- `src/package.json`
- `src/package-lock.json`
- `src/remotion/index.ts`
- `src/remotion/Root.tsx`
- `src/remotion/DemoVideo.tsx`
- `src/remotion/terminal.css`
- `src/out/blmtrm-demo.mp4`
- `src/out/blmtrm-mid.png`
- `src/remotion-assets/market-overview.png`
- `docs/live/progress.md`

## Verification Status

- Check: `npm run video:compositions`
- Result: Pass. `BLMTRMTerminalDemo` listed at 30 fps, 1920x1080, 1800 frames (60.00 sec).
- Check: `npm run video:render`
- Result: Pass. Final video rendered to `src/out/blmtrm-demo.mp4` (16.1 MB).
- Check: `npm run check`
- Result: Pass. TypeScript completed cleanly after the Remotion additions.
- Check: `npx remotion still BLMTRMTerminalDemo out/blmtrm-mid.png --frame=900`
- Result: Pass. Midpoint still rendered successfully for visual verification.
- Check: Rendered still review
- Result: `src/out/blmtrm-mid.png` shows the research workflow scene with branded dark-terminal styling, news/screener/economics panels, and polished presentation.

## Hand-off Note

- Resume from: `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md` is still the next concrete engineering step; the video work is complete and self-contained under `src/remotion/`.
- Deliverable: Final demo video is at `src/out/blmtrm-demo.mp4`; rerender with `npm run video:render` from `src/` when the script or visuals change.
- Watch for: If future Remotion work starts failing around validation/types, resolve the `zod` 3.x vs 4.x warning before expanding the video toolchain.