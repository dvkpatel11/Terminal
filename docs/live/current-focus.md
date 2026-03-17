# Current Focus

Read after `AGENTS.md` when starting or resuming work. Keep this file limited to the current objective and the bounds for active work.

## Objective

- Objective: Make live stock-data credibility the next roadmap tranche.
- Why it matters now: Stock quotes and charts are the product's commercial core. If equities are delayed, daily-only, or not current enough for terminal expectations, that is a higher-priority problem than additional workflow depth.

## Scope

- In scope: Reprioritize the roadmap so the next tranche is a stock-data provider strategy and freshness upgrade for quotes, charts, and alerting.
- Expected outcome: The next implementation work should evaluate and integrate a more current stock-data backbone, with clear freshness metadata and honest UI language until that backbone is in place.

## Constraints

- Constraint: Commercial impact is the primary prioritization axis; development effort is the second axis.
- Constraint: The current public-source approach is acceptable only where it stays timely enough for the product claim. Daily-only or meaningfully delayed stock data is not sufficient for the core terminal experience.
- Constraint: The user provided two references to inform planning:
  - the Public APIs finance index as a source of candidate providers to evaluate,
  - FinanceDatabase as a security-universe/reference layer, not as a live market-data feed.
- Constraint: Do not describe a source as live unless it can actually support current intraday equity quotes/charts.

## Success Criteria

- Check: Roadmap ordering explicitly puts live stock-data remediation first.
- Check: The next recommended tranche targets the quote/chart/alert backbone before lower-impact workflow additions.
- Check: Planning notes distinguish between metadata/universe tools and actual live-data providers.
