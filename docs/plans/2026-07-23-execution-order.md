# Execution Order — All 5 Plans

> **Date:** 2026-07-23
> **Plans:** Symbol Dashboard, Social Sentiment, Investment Calendar, Portfolio Command Center, Agent Upgrade

---

## Dependency Map

```
Plan 1 (Symbol Dashboard)     Plan 3 (Calendar)        Plan 5 (Agent)
     │                              │                       │
     │  ┌───────────────────────────┤                       │
     │  │                           │                       │
     ▼  ▼                           ▼                       │
Plan 2 (Social Sentiment)    Plan 4 (Portfolio)             │
     │                              │                       │
     │                              │                       │
     └──────────────┬───────────────┘                       │
                    │                                       │
                    ▼                                       ▼
              Final Integration ────────────────────────────┘
```

**Key dependencies:**
- Plan 2 → Plan 1: Divergence display needs SynthesisPanel social card
- Plan 4 → Plan 3: Portfolio dashboard shows upcoming calendar events
- Plan 5 → all plans: Agent tools should access the same data the panels show

---

## Execution Phases

### Phase A: Parallel Foundation (3 streams)

**Stream 1: Plan 1 — Symbol Dashboard cleanup**
SynthesisPanel already exists. Finish the migration:

| # | Task | Files | Effort |
|---|------|-------|--------|
| A1.1 | Update `panelRegistry.ts`: make `synthesis` the default symbol view, remove `key`/`ee`/`prof`/`thesis` entries | `panelRegistry.ts` | 15min |
| A1.2 | Update `Terminal.tsx`: default symbol view → `synthesis` | `Terminal.tsx` | 5min |
| A1.3 | Wire `onSymbol` in SentimentSidebar (SocialFeedPanel) | `SocialFeedPanel.tsx` | 15min |
| A1.4 | Wire `onSymbol` in OnChainPanel whale tx symbols | `OnChainPanel.tsx` | 10min |
| A1.5 | Add ticker extraction to NewsCard/NewsList | `NewsCard.tsx`, `NewsList.tsx`, create `shared/extractTickers.ts` | 30min |
| A1.6 | Delete dead panels: `KeyRatiosPanel.tsx`, `EstimatesPanel.tsx`, `CompanyProfilePanel.tsx`, `ThesisPanel.tsx` | 4 files | 5min |
| A1.7 | Add `DataStatusBadge` fallback tooltip | `DataStatusBadge.tsx` | 5min |

**Stream 2: Plan 3 — Investment Calendar**

| # | Task | Files | Effort |
|---|------|-------|--------|
| A3.1 | Create `server/calendarAggregator.ts` — unified endpoint | create file | 45min |
| A3.2 | Add `GET /api/finance/calendar/unified` route | `routes.ts` | 15min |
| A3.3 | Add `useUnifiedCalendar()` hook | `useFinance.ts` | 15min |
| A3.4 | Create `CalendarPanel.tsx` — risk bar, event list, detail | create file | 60min |
| A3.5 | Register `calendar` in `panelRegistry.ts`, add to `terminalTypes.ts` | `panelRegistry.ts`, `terminalTypes.ts` | 10min |

**Stream 3: Plan 5 — Agent context + tools (Phase 1-2)**

| # | Task | Files | Effort |
|---|------|-------|--------|
| A5.1 | Fix context gap: send `quote` + `technicals` from AgentPanel | `AgentPanel.tsx` | 15min |
| A5.2 | Create `server/agentTools.ts` — tool definitions | create file | 30min |
| A5.3 | Add tool execution logic | `agentTools.ts` | 45min |
| A5.4 | Add tool loop to chat endpoint | `routes.ts` | 30min |
| A5.5 | Update base prompt in `prompts.json` | `prompts.json` | 10min |

**Phase A total: ~5 hours parallel work**

---

### Phase B: Data Layer (3 streams)

**Stream 1: Plan 2 — Social Sentiment (server-side)**

| # | Task | Files | Effort |
|---|------|-------|--------|
| B2.1 | Create `shared/socialRanking.ts` — signal-quality scoring, source quality registry, thresholds, divergence | create file | 45min |
| B2.2 | Auto-tag on fetch in `socialFeed.ts` — call `tagPostsBatch` for top 20 posts | `socialFeed.ts` | 30min |
| B2.3 | Add `aiSentiment`/`aiConfidence`/`aiRationale` to `SocialPost` interface | `socialFeed.ts` | 10min |
| B2.4 | Sort by `signalQualityScore` instead of `engagementScore` | `socialFeed.ts` | 15min |
| B2.5 | Update `feedItemScore()` in `useFinance.ts` to use signal-quality components | `useFinance.ts` | 15min |

**Stream 2: Plan 4 — Portfolio schema + API**

| # | Task | Files | Effort |
|---|------|-------|--------|
| B4.1 | Add tables: `positions`, `positionFills`, `positionTheses`, `positionIntents` | `schema.ts` | 30min |
| B4.2 | Run DB migration | CLI | 5min |
| B4.3 | Add CRUD methods to `storage.ts` | `storage.ts` | 45min |
| B4.4 | Add API routes: positions, theses, intents | `routes.ts` | 30min |
| B4.5 | Create `server/nvidiaApi.ts` — thin wrapper (keep Claude for theses) | create file | 20min |
| B4.6 | Add `usePositions()`, `usePositionTheses()` hooks | `useFinance.ts` | 20min |

**Stream 3: Plan 5 — Agent tools UI + skills**

| # | Task | Files | Effort |
|---|------|-------|--------|
| B5.1 | Tool call badges in AgentPanel messages | `AgentPanel.tsx` | 20min |
| B5.2 | Add `agentSkills` table to schema | `schema.ts` | 10min |
| B5.3 | Add skill CRUD to `storage.ts` | `storage.ts` | 20min |
| B5.4 | Add skill API routes | `routes.ts` | 15min |
| B5.5 | Update `promptConfig.ts` to merge DB skills with builtin | `promptConfig.ts` | 15min |
| B5.6 | Skill editor modal in AgentPanel | `AgentPanel.tsx` | 45min |

**Phase B total: ~6 hours parallel work**

---

### Phase C: Integration (sequential)

**Stream 1: Plan 2 — Social Sentiment (client-side)**

| # | Task | Files | Effort | Depends |
|---|------|-------|--------|---------|
| C2.1 | Rework SentimentSidebar: source breakdown, threshold filter, rationale | `SocialFeedPanel.tsx` | 45min | B2.1 |
| C2.2 | Add AI rationale display to FeedItem | `SocialFeedPanel.tsx` | 20min | B2.2 |
| C2.3 | Add divergence detection to SynthesisPanel social card | `SynthesisPanel.tsx` | 20min | B2.1, A1 |
| C2.4 | Threshold gating: hide low-quality sentiment | `SynthesisPanel.tsx`, `SocialFeedPanel.tsx` | 15min | B2.1 |

**Stream 2: Plan 4 — Portfolio Dashboard**

| # | Task | Files | Effort | Depends |
|---|------|-------|--------|---------|
| C4.1 | Create `PortfolioDashboard.tsx` — summary, positions table, sector coverage, risk alerts | create file | 90min | B4.3 |
| C4.2 | Create `shared/portfolioRating.ts` — rating algorithm | create file | 30min | — |
| C4.3 | Create `shared/sectorSummary.ts` — sector mapping + risk | create file | 30min | — |
| C4.4 | Add position form (multi-asset: stock, option, ETF, commodity, crypto) | `PortfolioDashboard.tsx` or separate | 45min | B4.3 |
| C4.5 | Add TRIM/EXIT/HOLD/ADD action buttons + intent records | `PortfolioDashboard.tsx` | 30min | B4.3 |
| C4.6 | Register PortfolioDashboard, delete PlaysPanel + old PortfolioPanel | `panelRegistry.ts` | 10min | C4.1 |
| C4.7 | Auto-sync positions → watchlist | `PortfolioDashboard.tsx` | 15min | C4.1 |

**Phase C total: ~5.5 hours sequential**

---

### Phase D: Polish + Schedulers (parallel)

| # | Task | Plan | Files | Effort |
|---|------|------|-------|--------|
| D1 | Chart 1W/1M intervals + 1-minute bars | 1 | `marketData.ts`, `chartSeries.ts`, `ChartPanel.tsx` | 30min |
| D2 | Expand `extractTickers` boundary chars + tests | 1 | `sentimentAnalyzer.ts`, create test file | 20min |
| D3 | Daily thesis update scheduler | 4 | create `server/dailyThesisUpdate.ts`, `server/index.ts` | 30min |
| D4 | Event-based alerts (schema + checker) | 3 | `schema.ts`, `storage.ts`, `routes.ts` | 45min |
| D5 | Macro regime bar in CalendarPanel | 3 | `CalendarPanel.tsx` | 20min |
| D6 | Portfolio rating display in dashboard header | 4 | `PortfolioDashboard.tsx` | 10min |
| D7 | Agent custom skills testing + prompt tuning | 5 | `prompts.json`, `agentTools.ts` | 20min |

**Phase D total: ~3 hours parallel**

---

## Summary Timeline

| Phase | Duration | What ships |
|-------|----------|------------|
| **A** | ~5h (parallel) | SynthesisPanel as default, Calendar endpoint + panel, Agent context + tools |
| **B** | ~6h (parallel) | Auto-tagged social feed, Portfolio schema + API, Agent skills + tool UI |
| **C** | ~5.5h (sequential) | Social divergence display, PortfolioDashboard, plays merge |
| **D** | ~3h (parallel) | Chart intervals, daily scheduler, event alerts, polish |
| **Total** | ~19.5h | All 5 plans complete |

---

## What to build first

**Start with Phase A — all 3 streams in parallel.** The foundation work is independent and sets up everything else.

Within Phase A, the highest-value tasks are:
1. **A5.1** (fix agent context) — 15min, immediate UX improvement
2. **A1.1-A1.2** (make SynthesisPanel default) — 20min, biggest panel consolidation
3. **A3.1-A3.4** (build CalendarPanel) — biggest new feature in Phase A
