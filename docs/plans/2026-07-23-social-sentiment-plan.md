# Social Sentiment Integration

> **Date:** 2026-07-23
> **Status:** Ready for implementation

---

## Executive Summary

The social sentiment pipeline has three structural problems:

1. **AI tagger exists but is never auto-invoked** — `sentimentTagger.ts` and its routes/hooks are on-demand only. The feed uses regex-based keyword matching which can't explain "why"
2. **Engagement amplifies noise** — feed ranking weights upvotes/likes, which surfaces viral takes over substantive analysis. Ticker sidebar ranks by raw mention count
3. **No transparency** — analyst sees a colored dot and a score with no rationale, no source quality signal, no confidence interval

This plan adds auto-tagging on fetch, replaces engagement-first ranking with signal-quality ranking, surfaces rationale, and adds divergence detection.

---

## Part 1: Current State Audit

### Data Flow (current)

```
Reddit/X/Truth/Discord fetch
  → extractTickers() (regex: cashtags, bare tickers, company names)
  → analyzeSentiment() (keyword regex: 27 positive words, 20 negative words)
  → classifyContent() (word count + keyword heuristics)
  → weightedScore() (log(upvotes) * authority * contentWeight)
  → sorted by engagementScore (server)
  → mergeFeed() re-ranks by recency + engagement + |sentiment| (client)
  → FeedItem renders with SentimentDot (colored circle)
  → SentimentSidebar shows per-ticker aggregate score
```

### Problems Found

| Problem | Location | Impact |
|---|---|---|
| AI tagger never auto-called | `socialFeed.ts` — no `tagPostsBatch` call | Feed uses regex only, no rationale |
| Ranking rewards engagement | `socialFeed.ts:436` — sort by `engagementScore` | Viral posts dominate |
| Sidebar ranks by raw count | `SocialFeedPanel.tsx:99` — `sort by count` | Meme mentions outrank analysis |
| No rationale shown | `SentimentDot` — 2px colored circle | Analyst can't see why |
| No source quality signal | `weightedScore` — `authority` config is `{}` | All sources weighted equally |
| No threshold before surfacing | `aggregateSentiment` — shows any ticker | Single-mention tickers shown |
| No divergence detection | No comparison of social vs price | Analyst must manually cross-reference |

---

## Part 2: Auto-Tag on Fetch

### What changes

When the social feed is fetched server-side, the top N posts per platform are automatically tagged via `tagPostsBatch` before being returned to the client. Results are cached.

### Server changes

**File:** `src/server/socialFeed.ts`

Add auto-tagging step after post fetch:

```typescript
// After line 435: const allPosts = [...allReddit, ...allX, ...allTruth, ...allDiscord]
// Add:
const postsToTag = allPosts
  .filter(p => p.tickers.length > 0)  // only tag posts that mention tickers
  .slice(0, 20);                       // cap to control cost

if (postsToTag.length > 0) {
  const tagResults = await tagPostsBatch(
    postsToTag.map(p => ({
      text: p.text,
      title: p.title,
      platform: p.platform,
      author: p.author,
      tickers: p.tickers,
    })),
    5,  // concurrency
  );

  // Merge AI tags back into posts
  for (let i = 0; i < postsToTag.length; i++) {
    const tag = tagResults[i]?.tag;
    if (tag) {
      postsToTag[i].aiSentiment = tag.sentiment;
      postsToTag[i].aiConfidence = tag.confidence;
      postsToTag[i].aiRationale = tag.rationale_short;
    }
  }
}
```

**Add to `SocialPost` interface:**
```typescript
aiSentiment?: "bullish" | "bearish" | "neutral";
aiConfidence?: number;
aiRationale?: string;
```

### Caching

Auto-tag results are cached per post ID (keyed by `post.id`). Cache TTL = 4 hours (same as `thesisGenerator.ts`). This means:
- First fetch: ~20 posts tagged, ~$0.02 cost (Haiku at ~500 tokens each)
- Subsequent fetches within 4h: no API call
- Post edited/deleted: stale but acceptable for social content

### Cost estimate

- 20 posts × ~500 tokens input + ~100 tokens output = ~12K tokens total
- Haiku: ~$0.002 per 1K input, ~$0.01 per 1K output
- **~$0.004 per feed refresh** (every 60s = ~$0.004/min = ~$0.24/hour)
- At 8 hours/day active use: **~$2/day**

---

## Part 3: Signal-Quality Ranking

### What changes

Replace engagement-first ranking with a composite signal-quality score.

### New ranking formula

```typescript
// shared/socialRanking.ts

interface PostSignals {
  recency: number;        // 0-1, decays over 24h
  sourceQuality: number;  // 0-1, from credibility registry
  contentType: number;    // 0-1, analysis=1.0, news=0.7, sentiment=0.4, meme=0.1
  aiConfidence: number;   // 0-1, from AI tagger (0 if not tagged)
  engagement: number;     // 0-1, log-normalized upvotes (capped)
  tickerRelevance: number;// 0-1, 1 if post is primarily about one ticker, 0.5 if mentions many
}

function signalQualityScore(signals: PostSignals): number {
  const weights = {
    recency: 0.25,
    sourceQuality: 0.20,
    contentType: 0.20,
    aiConfidence: 0.15,
    engagement: 0.10,      // engagement is DOWNweighted — it was 0.3 before
    tickerRelevance: 0.10,
  };

  return Object.entries(weights).reduce((sum, [key, w]) => {
    return sum + (signals[key as keyof typeof weights] ?? 0) * w;
  }, 0);
}
```

### Source quality registry

```typescript
// shared/socialRanking.ts

const SOURCE_QUALITY: Record<string, number> = {
  // Subreddits — curated by analyst in config
  // Default scores (analyst can override via SourceConfigModal)
  "reddit:wallstreetbets": 0.3,   // high noise, meme-heavy
  "reddit:stocks": 0.5,
  "reddit:investing": 0.6,
  "reddit:securityanalysis": 0.8, // high signal
  "reddit:options": 0.5,

  // Discord — weighted by role if available
  "discord:default": 0.5,

  // Twitter/X — not yet implemented, placeholder
  "x:default": 0.4,

  // Truth Social — not yet implemented, placeholder
  "truth:default": 0.3,
};

export function getSourceQuality(platform: string, identifier: string): number {
  const key = `${platform}:${identifier}`;
  return SOURCE_QUALITY[key] ?? 0.5; // default to 0.5 for unknown sources
}
```

### Content type weight (replaces current `contentWeights`)

| Type | Weight | Rationale |
|---|---|---|
| `analysis` | 1.0 | DD, technical analysis, earnings reviews — highest signal |
| `news` | 0.7 | Breaking news, factual reporting |
| `sentiment` | 0.4 | Opinion without analysis |
| `meme` | 0.1 | Jokes, emojis, low information |

### File changes

| File | Change |
|---|---|
| Create `src/shared/socialRanking.ts` | Signal-quality scoring, source quality registry |
| `src/server/socialFeed.ts` | Sort by `signalQualityScore` instead of `engagementScore` |
| `src/client/src/lib/useFinance.ts` | `feedItemScore()` uses `signalQualityScore` components instead of raw `engagementScore` |

---

## Part 4: SentimentSidebar Rework

### What changes

The sidebar currently shows raw mention count and a single score. Replace with:

1. **Ranked by signal-weighted mentions** (not raw count)
2. **Show source distribution** (how many Reddit vs Discord vs X)
3. **Show AI rationale** when available (expandable per ticker)
4. **Filter out low-quality signals** (< 3 sources or < 5 mentions)

### New SentimentSidebar layout

```
┌─── SENTIMENT ───────────────────────────────┐
│ SENTIMENT                                    │
│                                              │
│ AAPL  +0.6  ████████░░  23 mentions         │
│   └ Bullish: services growth, iPhone demand  │
│   └ Sources: 14 Reddit, 6 Discord, 3 X      │
│                                              │
│ NVDA  +0.8  ██████████  18 mentions         │
│   └ Bullish: AI capex cycle, data center     │
│   └ Sources: 12 Reddit, 5 Discord, 1 X      │
│                                              │
│ TSLA  -0.3  ████░░░░░░  8 mentions          │
│   └ Bearish: delivery miss, margin pressure  │
│   └ Sources: 6 Reddit, 2 Discord            │
│                                              │
│ (tickers with < 3 sources hidden)            │
└──────────────────────────────────────────────┘
```

### Implementation

```typescript
// In SocialFeedPanel.tsx — SentimentSidebar component

function SentimentSidebar({
  sentiment,
  posts,       // NEW: full post list for source breakdown
  onSymbol,
}: {
  sentiment: Record<string, { positive: number; negative: number; score: number; count: number }>;
  posts: SocialPost[];
  onSymbol?: (s: string) => void;
}) {
  // Compute source distribution per ticker
  const tickerSources = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const post of posts) {
      for (const t of post.tickers) {
        if (!map[t]) map[t] = {};
        map[t][post.platform] = (map[t][post.platform] || 0) + 1;
      }
    }
    return map;
  }, [posts]);

  // Get AI rationale per ticker (from most recent post mentioning it)
  const tickerRationale = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const post of posts) {
      for (const t of post.tickers) {
        if (!map[t] && post.aiRationale) {
          map[t] = post.aiRationale;
        }
      }
    }
    return map;
  }, [posts]);

  // Filter: require ≥ 3 unique sources
  const sorted = useMemo(() => {
    return Object.entries(sentiment)
      .filter(([ticker]) => {
        const sources = Object.keys(tickerSources[ticker] || {});
        return sources.length >= 3;
      })
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
  }, [sentiment, tickerSources]);

  // ... render with source breakdown and rationale
}
```

---

## Part 5: Rationale Display in Feed

### What changes

Every post in the feed shows the AI rationale when available. Rationale is collapsed by default, expandable on hover/click.

### FeedItem update

**File:** `src/client/src/components/panels/SocialFeedPanel.tsx`

```tsx
function FeedItem({ post, onSymbol }: { post: SocialPost; onSymbol?: (s: string) => void }) {
  const [showRationale, setShowRationale] = useState(false);

  return (
    <div className="flex gap-3 px-3 py-2.5 border-b border-border/40 hover:bg-white/[0.02]">
      {/* ... existing header, title, text ... */}

      {/* NEW: AI rationale (when available) */}
      {post.aiRationale && (
        <button
          onClick={() => setShowRationale(!showRationale)}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-1 flex items-center gap-1"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            post.aiSentiment === "bullish" ? "bg-green-500" :
            post.aiSentiment === "bearish" ? "bg-red-500" : "bg-gray-500"
          }`} />
          {showRationale ? post.aiRationale : `AI: ${post.aiSentiment} (${Math.round((post.aiConfidence ?? 0) * 100)}%)`}
        </button>
      )}

      {/* ... existing ticker badges, engagement, sentiment dot ... */}
    </div>
  );
}
```

### Visual spec

- Rationale shown as a small clickable line below the post text
- Default state: `"AI: bullish (85%)"` with a colored dot matching the AI sentiment
- Expanded state: shows the full `rationale_short` text
- If no AI tag: show nothing (graceful degradation)

---

## Part 6: Thresholds Before Surfacing

### What changes

Don't show social sentiment in the SynthesisPanel or SentimentSidebar unless it meets minimum quality thresholds.

### Thresholds

| Threshold | Value | Rationale |
|---|---|---|
| Minimum mentions | 5 | Below this, sample is too small for statistical meaning |
| Minimum unique sources | 3 | Single-source sentiment is likely noise or manipulation |
| Maximum age | 24 hours | Stale sentiment is worse than no sentiment |
| Minimum AI confidence (for rationale) | 0.5 | Don't show rationale when model is uncertain |

### Implementation

```typescript
// shared/socialRanking.ts

interface SentimentThresholds {
  minMentions: number;
  minSources: number;
  maxAgeHours: number;
  minAiConfidence: number;
}

const DEFAULT_THRESHOLDS: SentimentThresholds = {
  minMentions: 5,
  minSources: 3,
  maxAgeHours: 24,
  minAiConfidence: 0.5,
};

export function meetsSentimentThresholds(
  ticker: string,
  posts: SocialPost[],
  thresholds: SentimentThresholds = DEFAULT_THRESHOLDS,
): boolean {
  const relevant = posts.filter(p =>
    p.tickers.includes(ticker) &&
    (Date.now() - new Date(p.createdAt).getTime()) < thresholds.maxAgeHours * 3_600_000
  );

  if (relevant.length < thresholds.minMentions) return false;

  const uniqueSources = new Set(relevant.map(p => `${p.platform}:${p.author}`));
  if (uniqueSources.size < thresholds.minSources) return false;

  return true;
}
```

### UI behavior

- **SynthesisPanel social card:** Only shows if `meetsSentimentThresholds()` returns true. Otherwise shows "Insufficient social data for {symbol}"
- **SentimentSidebar:** Only shows tickers that pass the threshold. Ticketers below threshold are hidden (not shown as grayed out — just hidden to avoid noise)

---

## Part 7: Divergence Detection

### What changes

When social sentiment direction diverges from price direction, explicitly flag it.

### Detection logic

```typescript
// shared/socialRanking.ts

interface DivergenceResult {
  hasDivergence: boolean;
  type: "social-bullish-price-bearish" | "social-bearish-price-bullish" | null;
  description: string;
}

export function detectSentimentDivergence(
  sentimentScore: number,    // -1 to +1
  priceChangePercent: number, // e.g., -3.2 for -3.2%
  mentionCount: number,
): DivergenceResult {
  const SENTIMENT_THRESHOLD = 0.3;
  const PRICE_THRESHOLD = 1.5;  // 1.5% move
  const MIN_MENTIONS = 10;      // need enough data to be meaningful

  if (mentionCount < MIN_MENTIONS) {
    return { hasDivergence: false, type: null, description: "" };
  }

  const socialBullish = sentimentScore > SENTIMENT_THRESHOLD;
  const socialBearish = sentimentScore < -SENTIMENT_THRESHOLD;
  const priceDown = priceChangePercent < -PRICE_THRESHOLD;
  const priceUp = priceChangePercent > PRICE_THRESHOLD;

  if (socialBullish && priceDown) {
    return {
      hasDivergence: true,
      type: "social-bullish-price-bearish",
      description: `Social sentiment bullish but price down ${Math.abs(priceChangePercent).toFixed(1)}% — possible contrarian signal or lagging narrative`,
    };
  }

  if (socialBearish && priceUp) {
    return {
      hasDivergence: true,
      type: "social-bearish-price-bullish",
      description: `Social sentiment bearish but price up ${priceChangePercent.toFixed(1)}% — crowd may be wrong, or negative narrative hasn't priced in yet`,
    };
  }

  return { hasDivergence: false, type: null, description: "" };
}
```

### SynthesisPanel integration

```tsx
{/* In SynthesisPanel social card */}
{divergence.hasDivergence && (
  <div className="flex items-start gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 mt-1">
    <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
    <span className="text-[10px] text-amber-300/80 leading-tight">
      {divergence.description}
    </span>
  </div>
)}
```

### Visual spec

- Divergence badge: amber background, `AlertTriangle` icon, descriptive text
- Only shows when sentiment and price diverge by meaningful amounts AND mention count is sufficient
- Doesn't show for single-source or low-mention tickers (would be noise)

---

## Part 8: Implementation Order

| Phase | Tasks | Effort | Depends On |
|---|---|---|---|
| **Phase 1: Auto-tag** | Tasks 1.1 (server auto-tag), 1.2 (SocialPost interface), 1.3 (cache) | Medium | Nothing |
| **Phase 2: Ranking** | Tasks 2.1 (socialRanking.ts), 2.2 (server sort), 2.3 (client feedItemScore) | Medium | Phase 1 (AI tags available) |
| **Phase 3: Sidebar** | Tasks 3.1 (SentimentSidebar rework), 3.2 (source breakdown), 3.3 (threshold filter) | Small | Phase 1 |
| **Phase 4: Rationale** | Tasks 4.1 (FeedItem rationale display) | Small | Phase 1 |
| **Phase 5: Divergence** | Tasks 5.1 (detection logic), 5.2 (SynthesisPanel integration) | Small | Phase 2 (needs sentiment + price) |
| **Phase 6: Polish** | Tasks 6.1 (threshold tuning), 6.2 (cost monitoring) | Small | All |

Phase 3 and 4 can run in parallel. Phase 5 depends on Phase 2 (needs the new ranking to be in place).

---

## Part 9: Files Changed Summary

### New Files
| File | Purpose |
|---|---|
| `src/shared/socialRanking.ts` | Signal-quality scoring, source quality registry, thresholds, divergence detection |

### Modified Files
| File | Change |
|---|---|
| `src/server/socialFeed.ts` | Auto-tag posts via `tagPostsBatch`, add `aiSentiment`/`aiConfidence`/`aiRationale` to `SocialPost`, sort by signal quality |
| `src/client/src/components/panels/SocialFeedPanel.tsx` | `FeedItem` shows AI rationale, `SentimentSidebar` reworked with source breakdown + threshold filter + onSymbol |
| `src/client/src/lib/useFinance.ts` | `feedItemScore()` uses signal-quality components |
| `src/client/src/components/panels/SynthesisPanel.tsx` | Social card with divergence detection, threshold-gated display |

### No new dependencies

- `tagPostsBatch` already exists in `sentimentTagger.ts`
- `claudeMessages` already wraps Anthropic API
- No new npm packages needed

---

## Part 10: Cost Monitoring

### Per-refresh cost breakdown

| Step | Tokens | Cost (Haiku) |
|---|---|---|
| 20 posts tagged | ~12K input + ~2K output | ~$0.005 |
| Cache hit (subsequent fetches) | 0 | $0.00 |
| **Per hour (60s refresh, 80% cache hit)** | | **~$0.01** |
| **Per day (8h active)** | | **~$0.08** |

### Safeguards

1. **Post cap:** Max 20 posts auto-tagged per refresh (configurable)
2. **Cache TTL:** 4 hours per post ID — repeated fetches don't re-tag
3. **Budget alert:** Log warning if daily tagging cost exceeds $0.50 (should never happen with 20-post cap)
4. **Graceful degradation:** If `tagPostsBatch` fails, posts still appear with regex sentiment only — no crash, no data loss

---

## Part 11: Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Auto-tagging adds latency to feed refresh | `tagPostsBatch` runs in parallel (concurrency=5), posts already fetched. Adds ~2-3s to first fetch only. |
| AI tagger hallucinates sentiment | Confidence threshold (0.5) filters low-quality tags. Regex fallback always available. |
| Source quality registry becomes stale | Analyst can update via `SourceConfigModal`. Default scores are conservative. |
| Divergence detection has false positives | High thresholds (0.3 sentiment, 1.5% price, 10 mentions) minimize false positives. |
| Cost exceeds estimate | Post cap + cache TTL bound the cost. Can reduce to 10 posts if needed. |
