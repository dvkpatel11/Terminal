# Data Schema Redesign Plan

## Overview

Redesign the Terminal data schema to properly link all data sources with foreign key relationships, persist historical data, and replace hardcoded instrument profiles with a database-driven approach.

## Current State

**Existing Tables** (3 tables, no relationships):
- `watchlist_items` - Basic watchlist
- `alerts` - Price alerts  
- `chat_messages` - AI chat history

**Issues**:
- All market data fetched live, cached in memory (lost on restart)
- Hardcoded `PROFILE_CATALOG` in `marketData.ts` (~80 instruments)
- No foreign key relationships
- Historical data not captured

## Proposed Schema

### Core Tables

#### 1. `instruments` (NEW - replaces PROFILE_CATALOG)
Central registry for all tradeable instruments.

```typescript
instruments = pgTable("instruments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  sector: text("sector"),
  assetClass: text("asset_class").notNull(), // equity, etf, index, commodity, crypto, forex
  marketCap: real("market_cap"),
  referencePrice: real("reference_price"),
  eps: real("eps"),
  coinGeckoId: text("coin_gecko_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### 2. `watchlist_items` (MODIFIED)
Add user context and instrument reference.

```typescript
watchlistItems = pgTable("watchlist_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(), // Denormalized for quick access
  name: text("name").notNull(),
  notes: text("notes"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});
```

#### 3. `alerts` (MODIFIED)
Link to instruments, add alert history.

```typescript
alerts = pgTable("alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  condition: text("condition").notNull(),
  price: real("price").notNull(),
  triggered: boolean("triggered").default(false).notNull(),
  triggerPrice: real("trigger_price"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  triggeredAt: timestamp("triggered_at"),
});
```

#### 4. `chat_messages` (UNCHANGED)
```typescript
chatMessages = pgTable("chat_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Market Data Tables

#### 5. `quotes` (NEW - historical quote storage)
Store daily snapshots for analysis.

```typescript
quotes = pgTable("quotes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  price: real("price").notNull(),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  close: real("close"),
  volume: integer("volume"),
  change: real("change"),
  changePercent: real("change_percent"),
  marketCap: real("market_cap"),
  pe: real("pe"),
  eps: real("eps"),
  high52: real("high52"),
  low52: real("low52"),
  quoteSource: text("quote_source"),
  isLive: boolean("is_live"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 6. `ohlcv_bars` (NEW - historical price data)
Store OHLCV for technical analysis.

```typescript
ohlcvBars = pgTable("ohlcv_bars", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  interval: text("interval").notNull(), // 5m, 15m, 1h, 1d
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: integer("volume").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

### News & Sentiment Tables

#### 7. `news_items` (NEW)
Persist news for historical analysis.

```typescript
newsItems = pgTable("news_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url").notNull().unique(),
  source: text("source").notNull(),
  feedProvider: text("feed_provider"),
  publishedAt: timestamp("published_at").notNull(),
  sentiment: text("sentiment"), // positive, negative, neutral
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### 8. `news_instruments` (NEW - many-to-many)
Link news to relevant instruments.

```typescript
newsInstruments = pgTable("news_instruments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  newsId: integer("news_id").references(() => newsItems.id).notNull(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
});
```

#### 9. `social_mentions` (NEW)
Store social sentiment data.

```typescript
socialMentions = pgTable("social_mentions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  platform: text("platform").notNull(), // reddit, twitter, truth
  count: integer("count").notNull(),
  positiveCount: integer("positive_count").notNull(),
  negativeCount: integer("negative_count").notNull(),
  sentiment: real("sentiment").notNull(), // -1 to 1
  source: text("source"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 10. `social_posts` (NEW)
Individual posts for reference.

```typescript
socialPosts = pgTable("social_posts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mentionId: integer("mention_id").references(() => socialMentions.id).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  score: integer("score"),
  platform: text("platform").notNull(),
  thumbnail: text("thumbnail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Options & On-Chain Tables

#### 11. `options_flow` (NEW)
Store options activity.

```typescript
optionsFlow = pgTable("options_flow", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  putCallRatio: real("put_call_ratio"),
  totalVolume: integer("total_volume"),
  callVolume: integer("call_volume"),
  putVolume: integer("put_volume"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 12. `options_activity` (NEW)
Unusual options activity.

```typescript
optionsActivity = pgTable("options_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  optionType: text("option_type").notNull(), // call, put
  strike: real("strike").notNull(),
  expiration: text("expiration").notNull(),
  volume: integer("volume").notNull(),
  openInterest: integer("open_interest").notNull(),
  vOiRatio: real("v_oi_ratio").notNull(),
  sentiment: text("sentiment"), // bullish, bearish, neutral
  underlyingPrice: real("underlying_price"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 13. `whale_transactions` (NEW)
On-chain whale activity.

```typescript
whaleTransactions = pgTable("whale_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id),
  symbol: text("symbol").notNull(),
  blockchain: text("blockchain").notNull(),
  amount: real("amount").notNull(),
  usdAmount: real("usd_amount"),
  fromAddress: text("from_address"),
  fromLabel: text("from_label"),
  toAddress: text("to_address"),
  toLabel: text("to_label"),
  type: text("type"), // transfer, exchange_in, exchange_out
  txHash: text("tx_hash"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

### Economics Tables

#### 14. `economic_events` (NEW)
Economic calendar persistence.

```typescript
economicEvents = pgTable("economic_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  releaseId: integer("release_id"),
  title: text("title").notNull(),
  category: text("category").notNull(), // inflation, labor, growth, policy, etc.
  importance: text("importance").notNull(), // high, medium
  date: text("date").notNull(),
  timeCt: text("time_ct"),
  releaseUrl: text("release_url"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

### Market Scorecard Tables

#### 15. `sector_performance` (NEW)
Daily sector snapshots.

```typescript
sectorPerformance = pgTable("sector_performance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  label: text("label").notNull(),
  sector: text("sector").notNull(),
  price: real("price").notNull(),
  change: real("change"),
  changePercent: real("change_percent"),
  weekChange: real("week_change"),
  monthChange: real("month_change"),
  ytdChange: real("ytd_change"),
  relativeStrength: real("relative_strength"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 16. `market_breadth` (NEW)
Daily market breadth snapshot.

```typescript
marketBreadth = pgTable("market_breadth", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  advanceDecline: integer("advance_decline"),
  advanceDeclineRatio: real("advance_decline_ratio"),
  percentAbove200dma: real("percent_above_200dma"),
  percentAbove50dma: real("percent_above_50dma"),
  newHighs: integer("new_highs"),
  newLows: integer("new_lows"),
  newHighLowRatio: real("new_high_low_ratio"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 17. `credit_spreads` (NEW)
Daily credit spread data.

```typescript
creditSpreads = pgTable("credit_spreads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  igOas: real("ig_oas").notNull(),
  igOasChange: real("ig_oas_change"),
  hyOas: real("hy_oas").notNull(),
  hyOasChange: real("hy_oas_change"),
  igOasPercentile: real("ig_oas_percentile"),
  hyOasPercentile: real("hy_oas_percentile"),
  trend: text("trend"), // widening, tightening, stable
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 18. `vix_term_structure` (NEW)
VIX term structure snapshots.

```typescript
vixTermStructure = pgTable("vix_term_structure", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  spot: real("spot").notNull(),
  vix2m: real("vix2m"),
  vix3m: real("vix3m"),
  curveShape: text("curve_shape"), // contango, backwardation, flat
  termSpread: real("term_spread"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

#### 19. `technical_indicators` (NEW)
Per-symbol technical analysis.

```typescript
technicalIndicators = pgTable("technical_indicators", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  rsi14: real("rsi14"),
  macd: real("macd"),
  macdSignal: real("macd_signal"),
  macdHistogram: real("macd_histogram"),
  bollingerUpper: real("bollinger_upper"),
  bollingerMiddle: real("bollinger_middle"),
  bollingerLower: real("bollinger_lower"),
  atr14: real("atr14"),
  obv: real("obv"),
  vwap: real("vwap"),
  support: real("support"),
  resistance: real("resistance"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
```

## Entity Relationship Diagram

```
┌─────────────────┐
│   instruments   │
│─────────────────│
│ id (PK)         │
│ symbol (UNIQUE) │
│ name            │
│ exchange        │
│ sector          │
│ asset_class     │
│ market_cap      │
│ reference_price │
│ eps             │
│ coin_gecko_id   │
│ is_active       │
└────────┬────────┘
         │
         ├─── watchlist_items.instrument_id
         ├─── alerts.instrument_id
         ├─── quotes.instrument_id
         ├─── ohlcv_bars.instrument_id
         ├─── news_instruments.instrument_id
         ├─── social_mentions.instrument_id
         ├─── options_flow.instrument_id
         ├─── options_activity.instrument_id
         ├─── whale_transactions.instrument_id
         ├─── sector_performance.instrument_id
         └─── technical_indicators.instrument_id

┌─────────────────┐     ┌─────────────────┐
│   news_items    │────<│ news_instruments │
│─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │
│ title           │     │ news_id (FK)    │
│ url (UNIQUE)    │     │ instrument_id   │
│ source          │     └─────────────────┘
│ sentiment       │
│ published_at    │
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│ social_mentions │────<│  social_posts   │
│─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │
│ instrument_id   │     │ mention_id (FK) │
│ platform        │     │ title           │
│ count           │     │ url             │
│ sentiment       │     │ score           │
│ recorded_at     │     └─────────────────┘
└─────────────────┘
```

## Implementation Steps

### Phase 1: Core Tables
1. Update `schema.ts` with new instrument table
2. Migrate hardcoded `PROFILE_CATALOG` to database
3. Add foreign key references to `watchlist_items` and `alerts`
4. Create database migration

### Phase 2: Market Data
1. Add `quotes` and `ohlcv_bars` tables
2. Update `marketData.ts` to persist data
3. Create data retention policy (e.g., keep 1 year of daily bars)

### Phase 3: News & Sentiment
1. Add `news_items`, `news_instruments`, `social_mentions`, `social_posts`
2. Update `socialSentiment.ts` to store mentions
3. Link news to instruments via `news_instruments`

### Phase 4: Options & On-Chain
1. Add `options_flow`, `options_activity`, `whale_transactions`
2. Update `optionsFlow.ts` and `onchain.ts` to persist

### Phase 5: Economics & Scorecard
1. Add `economic_events`, `sector_performance`, `market_breadth`
2. Add `credit_spreads`, `vix_term_structure`, `technical_indicators`
3. Update respective server files to persist

### Phase 6: Storage Layer
1. Create `DatabaseStorage` class implementing `IStorage`
2. Add data retention/cleanup jobs
3. Update `storage.ts` to use database

## Data Retention Policy

| Table | Retention | Rationale |
|-------|-----------|-----------|
| instruments | Permanent | Reference data |
| watchlist_items | Permanent | User data |
| alerts | 90 days after triggered | Historical |
| chat_messages | 30 days | Session data |
| quotes | 1 year daily | Analysis |
| ohlcv_bars | 2 years daily | Backtesting |
| news_items | 90 days | Reference |
| social_mentions | 30 days | Trend analysis |
| options_flow | 30 days | Activity tracking |
| whale_transactions | 30 days | On-chain tracking |
| economic_events | 1 year | Calendar reference |
| sector_performance | 1 year | Sector analysis |
| market_breadth | 1 year | Market health |
| credit_spreads | 1 year | Credit analysis |
| vix_term_structure | 1 year | Volatility analysis |
| technical_indicators | 90 days | Technical analysis |

## Migration Strategy

1. **Backup existing data** from `watchlist_items`, `alerts`, `chat_messages`
2. **Create new tables** with foreign key constraints
3. **Seed `instruments` table** from `PROFILE_CATALOG`
4. **Migrate existing data** with instrument references
5. **Update server code** to use new schema
6. **Add data persistence** to all data providers
7. **Create cleanup cron jobs** for data retention

## Files to Modify

- `src/shared/schema.ts` - Add all new tables
- `src/server/storage.ts` - Create `DatabaseStorage` class
- `src/server/marketData.ts` - Persist quotes and OHLCV
- `src/server/socialSentiment.ts` - Persist mentions
- `src/server/optionsFlow.ts` - Persist options data
- `src/server/onchain.ts` - Persist whale transactions
- `src/server/economicsData.ts` - Persist economic events
- `src/server/marketScorecard.ts` - Persist scorecard data
- `src/server/routes.ts` - Update to use database
- `src/drizzle.config.ts` - Already configured correctly
