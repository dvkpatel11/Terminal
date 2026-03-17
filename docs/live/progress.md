# Progress

Read after `docs/live/current-focus.md` to recover the latest state, continuity, and hand-off details. Keep each section concise so the next session can resume quickly.

## Current State

- State: The economics calendar tranche is landed, but the product-level priority has changed. The key issue raised by the user is strategic, not cosmetic: some surfaces are still truthful-but-delayed or schedule-based rather than genuinely current, which weakens commercial value.

## Latest Completed Work

- Completed: Reassessed roadmap priority after user feedback. Root cause captured: the economics calendar uses FRED HTML schedule/detail pages with cache TTLs and curated filtering; it is useful workflow data, but it is not a live feed.
- Why it matters: Roadmap sequencing must now favor data credibility and timeliness over additional breadth. Commercial impact comes first.

## In Progress

- Work item: None.

## Blockers

- Blocker: No product blocker, but true real-time market-data improvements may require a provider strategy stronger than the current public-source stack.

## Next Recommended Action

- Next step: Do a focused freshness/truthfulness tranche on core market-data surfaces:
  1. expose provider/timestamp/delay metadata in quote/chart/news/economics responses,
  2. show stale/delayed status clearly in the UI,
  3. audit where the product still says or implies "live" without support.
- Follow-on after that: upgrade the highest-commercial-impact quote/alert/chart backbone to a more current provider strategy before resuming lower-impact workflow features.

## Touched Files

- `docs/live/current-focus.md`
- `docs/live/progress.md`
- `docs/live/todo.md`

## Verification Status

- Check: Codebase investigation
- Result: Confirmed that the economics workflow is schedule scraping plus caching, not a low-latency live feed.
- Check: Roadmap reprioritization
- Result: Next actions now place freshness and trustworthiness ahead of transcript summarization, push UX, and economics breadth.

## Hand-off Note

- Resume from: Strategic priority shift is recorded. The next tranche should improve freshness visibility and truthfulness on the highest-value data surfaces rather than adding more breadth.
- Watch for: Do not let UI language outrun provider reality. If a surface is delayed, cached, or schedule-only, the product should say so clearly until a better provider is integrated.
