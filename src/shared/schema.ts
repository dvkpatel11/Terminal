import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Instruments (Central Registry) ──────────────────────────────────────────
export const instruments = pgTable("instruments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  sector: text("sector"),
  assetClass: text("asset_class").notNull(),
  marketCap: real("market_cap"),
  referencePrice: real("reference_price"),
  eps: real("eps"),
  coinGeckoId: text("coin_gecko_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInstrumentSchema = z.object({
  symbol: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1),
  exchange: z.string().trim().min(1),
  sector: z.string().trim().nullable().optional(),
  assetClass: z.enum(["equity", "etf", "index", "commodity", "crypto", "forex"]),
  marketCap: z.number().finite().nullable().optional(),
  referencePrice: z.number().finite().nullable().optional(),
  eps: z.number().finite().nullable().optional(),
  coinGeckoId: z.string().trim().nullable().optional(),
});

export type InsertInstrument = z.infer<typeof insertInstrumentSchema>;
export type Instrument = typeof instruments.$inferSelect;

// ─── Watchlist Items ─────────────────────────────────────────────────────────
export const watchlistItems = pgTable("watchlist_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertWatchlistItemSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  notes: z.string().trim().nullable().optional(),
});

export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type WatchlistItem = typeof watchlistItems.$inferSelect;

// ─── Alerts ──────────────────────────────────────────────────────────────────
export const alerts = pgTable("alerts", {
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

export const insertAlertSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  condition: z.enum(["above", "below"]),
  price: z.number().finite().positive(),
});

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

// ─── Chat Messages ───────────────────────────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// ─── Quotes (Historical Price Snapshots) ────────────────────────────────────
export const quotes = pgTable("quotes", {
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

export const insertQuoteSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  price: z.number().finite(),
  open: z.number().finite().nullable().optional(),
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  close: z.number().finite().nullable().optional(),
  volume: z.number().int().nullable().optional(),
  change: z.number().finite().nullable().optional(),
  changePercent: z.number().finite().nullable().optional(),
  marketCap: z.number().finite().nullable().optional(),
  pe: z.number().finite().nullable().optional(),
  eps: z.number().finite().nullable().optional(),
  high52: z.number().finite().nullable().optional(),
  low52: z.number().finite().nullable().optional(),
  quoteSource: z.string().trim().nullable().optional(),
  isLive: z.boolean().nullable().optional(),
});

export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type QuoteRecord = typeof quotes.$inferSelect;

// ─── OHLCV Bars (Historical Price Data) ─────────────────────────────────────
export const ohlcvBars = pgTable("ohlcv_bars", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  date: text("date").notNull(),
  interval: text("interval").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: integer("volume").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertOhlcvBarSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  interval: z.enum(["5m", "15m", "1h", "1d"]),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().int(),
});

export type InsertOhlcvBar = z.infer<typeof insertOhlcvBarSchema>;
export type OhlcvBarRecord = typeof ohlcvBars.$inferSelect;

// ─── News Items ──────────────────────────────────────────────────────────────
export const newsItems = pgTable("news_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url").notNull().unique(),
  source: text("source").notNull(),
  feedProvider: text("feed_provider"),
  publishedAt: timestamp("published_at").notNull(),
  sentiment: text("sentiment"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNewsItemSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().nullable().optional(),
  url: z.string().url(),
  source: z.string().trim().min(1),
  feedProvider: z.string().trim().nullable().optional(),
  publishedAt: z.string().datetime(),
  sentiment: z.enum(["positive", "negative", "neutral"]).nullable().optional(),
  image: z.string().url().nullable().optional(),
});

export type InsertNewsItem = z.infer<typeof insertNewsItemSchema>;
export type NewsItemRecord = typeof newsItems.$inferSelect;

// ─── News-Instruments (Many-to-Many) ────────────────────────────────────────
export const newsInstruments = pgTable("news_instruments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  newsId: integer("news_id").references(() => newsItems.id).notNull(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
});

export const insertNewsInstrumentSchema = z.object({
  newsId: z.number().int().positive(),
  instrumentId: z.number().int().positive(),
});

export type InsertNewsInstrument = z.infer<typeof insertNewsInstrumentSchema>;
export type NewsInstrument = typeof newsInstruments.$inferSelect;

// ─── Social Mentions ─────────────────────────────────────────────────────────
export const socialMentions = pgTable("social_mentions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  platform: text("platform").notNull(),
  count: integer("count").notNull(),
  positiveCount: integer("positive_count").notNull(),
  negativeCount: integer("negative_count").notNull(),
  sentiment: real("sentiment").notNull(),
  source: text("source"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertSocialMentionSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  count: z.number().int(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  sentiment: z.number().min(-1).max(1),
  source: z.string().trim().nullable().optional(),
});

export type InsertSocialMention = z.infer<typeof insertSocialMentionSchema>;
export type SocialMention = typeof socialMentions.$inferSelect;

// ─── Social Posts ────────────────────────────────────────────────────────────
export const socialPosts = pgTable("social_posts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mentionId: integer("mention_id").references(() => socialMentions.id).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  score: integer("score"),
  platform: text("platform").notNull(),
  thumbnail: text("thumbnail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSocialPostSchema = z.object({
  mentionId: z.number().int().positive(),
  title: z.string().trim().min(1),
  url: z.string().url(),
  score: z.number().int().nullable().optional(),
  platform: z.string().trim().min(1),
  thumbnail: z.string().url().nullable().optional(),
});

export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;

// ─── Options Flow ────────────────────────────────────────────────────────────
export const optionsFlow = pgTable("options_flow", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  putCallRatio: real("put_call_ratio"),
  totalVolume: integer("total_volume"),
  callVolume: integer("call_volume"),
  putVolume: integer("put_volume"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertOptionsFlowSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  putCallRatio: z.number().finite().nullable().optional(),
  totalVolume: z.number().int().nullable().optional(),
  callVolume: z.number().int().nullable().optional(),
  putVolume: z.number().int().nullable().optional(),
});

export type InsertOptionsFlow = z.infer<typeof insertOptionsFlowSchema>;
export type OptionsFlowRecord = typeof optionsFlow.$inferSelect;

// ─── Options Activity ────────────────────────────────────────────────────────
export const optionsActivity = pgTable("options_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  instrumentId: integer("instrument_id").references(() => instruments.id).notNull(),
  symbol: text("symbol").notNull(),
  optionType: text("option_type").notNull(),
  strike: real("strike").notNull(),
  expiration: text("expiration").notNull(),
  volume: integer("volume").notNull(),
  openInterest: integer("open_interest").notNull(),
  vOiRatio: real("v_oi_ratio").notNull(),
  sentiment: text("sentiment"),
  underlyingPrice: real("underlying_price"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertOptionsActivitySchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  optionType: z.enum(["call", "put"]),
  strike: z.number().finite().positive(),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volume: z.number().int(),
  openInterest: z.number().int(),
  vOiRatio: z.number().finite(),
  sentiment: z.enum(["bullish", "bearish", "neutral"]).nullable().optional(),
  underlyingPrice: z.number().finite().nullable().optional(),
});

export type InsertOptionsActivity = z.infer<typeof insertOptionsActivitySchema>;
export type OptionsActivityRecord = typeof optionsActivity.$inferSelect;

// ─── Whale Transactions ──────────────────────────────────────────────────────
export const whaleTransactions = pgTable("whale_transactions", {
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
  type: text("type"),
  txHash: text("tx_hash"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertWhaleTransactionSchema = z.object({
  instrumentId: z.number().int().positive().nullable().optional(),
  symbol: z.string().trim().min(1),
  blockchain: z.string().trim().min(1),
  amount: z.number().finite(),
  usdAmount: z.number().finite().nullable().optional(),
  fromAddress: z.string().trim().nullable().optional(),
  fromLabel: z.string().trim().nullable().optional(),
  toAddress: z.string().trim().nullable().optional(),
  toLabel: z.string().trim().nullable().optional(),
  type: z.enum(["transfer", "exchange_in", "exchange_out", "unknown"]).nullable().optional(),
  txHash: z.string().trim().nullable().optional(),
});

export type InsertWhaleTransaction = z.infer<typeof insertWhaleTransactionSchema>;
export type WhaleTransactionRecord = typeof whaleTransactions.$inferSelect;

// ─── Economic Events ─────────────────────────────────────────────────────────
export const economicEvents = pgTable("economic_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  releaseId: integer("release_id"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  importance: text("importance").notNull(),
  date: text("date").notNull(),
  timeCt: text("time_ct"),
  releaseUrl: text("release_url"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertEconomicEventSchema = z.object({
  releaseId: z.number().int().nullable().optional(),
  title: z.string().trim().min(1),
  category: z.enum(["inflation", "labor", "growth", "policy", "consumption", "activity", "housing"]),
  importance: z.enum(["high", "medium"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeCt: z.string().trim().nullable().optional(),
  releaseUrl: z.string().url().nullable().optional(),
});

export type InsertEconomicEvent = z.infer<typeof insertEconomicEventSchema>;
export type EconomicEventRecord = typeof economicEvents.$inferSelect;

// ─── Sector Performance ──────────────────────────────────────────────────────
export const sectorPerformance = pgTable("sector_performance", {
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

export const insertSectorPerformanceSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  label: z.string().trim().min(1),
  sector: z.string().trim().min(1),
  price: z.number().finite(),
  change: z.number().finite().nullable().optional(),
  changePercent: z.number().finite().nullable().optional(),
  weekChange: z.number().finite().nullable().optional(),
  monthChange: z.number().finite().nullable().optional(),
  ytdChange: z.number().finite().nullable().optional(),
  relativeStrength: z.number().finite().nullable().optional(),
});

export type InsertSectorPerformance = z.infer<typeof insertSectorPerformanceSchema>;
export type SectorPerformanceRecord = typeof sectorPerformance.$inferSelect;

// ─── Market Breadth ──────────────────────────────────────────────────────────
export const marketBreadth = pgTable("market_breadth", {
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

export const insertMarketBreadthSchema = z.object({
  advanceDecline: z.number().int().nullable().optional(),
  advanceDeclineRatio: z.number().finite().nullable().optional(),
  percentAbove200dma: z.number().finite().nullable().optional(),
  percentAbove50dma: z.number().finite().nullable().optional(),
  newHighs: z.number().int().nullable().optional(),
  newLows: z.number().int().nullable().optional(),
  newHighLowRatio: z.number().finite().nullable().optional(),
});

export type InsertMarketBreadth = z.infer<typeof insertMarketBreadthSchema>;
export type MarketBreadthRecord = typeof marketBreadth.$inferSelect;

// ─── Credit Spreads ──────────────────────────────────────────────────────────
export const creditSpreads = pgTable("credit_spreads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  igOas: real("ig_oas").notNull(),
  igOasChange: real("ig_oas_change"),
  hyOas: real("hy_oas").notNull(),
  hyOasChange: real("hy_oas_change"),
  igOasPercentile: real("ig_oas_percentile"),
  hyOasPercentile: real("hy_oas_percentile"),
  trend: text("trend"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertCreditSpreadSchema = z.object({
  igOas: z.number().finite(),
  igOasChange: z.number().finite().nullable().optional(),
  hyOas: z.number().finite(),
  hyOasChange: z.number().finite().nullable().optional(),
  igOasPercentile: z.number().finite().nullable().optional(),
  hyOasPercentile: z.number().finite().nullable().optional(),
  trend: z.enum(["widening", "tightening", "stable"]).nullable().optional(),
});

export type InsertCreditSpread = z.infer<typeof insertCreditSpreadSchema>;
export type CreditSpreadRecord = typeof creditSpreads.$inferSelect;

// ─── VIX Term Structure ──────────────────────────────────────────────────────
export const vixTermStructure = pgTable("vix_term_structure", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  spot: real("spot").notNull(),
  vix2m: real("vix2m"),
  vix3m: real("vix3m"),
  curveShape: text("curve_shape"),
  termSpread: real("term_spread"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertVixTermStructureSchema = z.object({
  spot: z.number().finite(),
  vix2m: z.number().finite().nullable().optional(),
  vix3m: z.number().finite().nullable().optional(),
  curveShape: z.enum(["contango", "backwardation", "flat"]).nullable().optional(),
  termSpread: z.number().finite().nullable().optional(),
});

export type InsertVixTermStructure = z.infer<typeof insertVixTermStructureSchema>;
export type VixTermStructureRecord = typeof vixTermStructure.$inferSelect;

// ─── Technical Indicators ────────────────────────────────────────────────────
export const technicalIndicators = pgTable("technical_indicators", {
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

export const insertTechnicalIndicatorSchema = z.object({
  instrumentId: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  rsi14: z.number().finite().nullable().optional(),
  macd: z.number().finite().nullable().optional(),
  macdSignal: z.number().finite().nullable().optional(),
  macdHistogram: z.number().finite().nullable().optional(),
  bollingerUpper: z.number().finite().nullable().optional(),
  bollingerMiddle: z.number().finite().nullable().optional(),
  bollingerLower: z.number().finite().nullable().optional(),
  atr14: z.number().finite().nullable().optional(),
  obv: z.number().finite().nullable().optional(),
  vwap: z.number().finite().nullable().optional(),
  support: z.number().finite().nullable().optional(),
  resistance: z.number().finite().nullable().optional(),
});

export type InsertTechnicalIndicator = z.infer<typeof insertTechnicalIndicatorSchema>;
export type TechnicalIndicatorRecord = typeof technicalIndicators.$inferSelect;
