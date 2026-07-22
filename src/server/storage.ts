import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  instruments,
  watchlistItems,
  alerts,
  chatMessages,
  quotes,
  ohlcvBars,
  newsItems,
  newsInstruments,
  socialMentions,
  socialPosts,
  optionsFlow,
  optionsActivity,
  whaleTransactions,
  economicEvents,
  sectorPerformance,
  marketBreadth,
  creditSpreads,
  vixTermStructure,
  technicalIndicators,
  type Instrument,
  type InsertInstrument,
  type WatchlistItem,
  type InsertWatchlistItem,
  type Alert,
  type InsertAlert,
  type ChatMessage,
  type InsertChatMessage,
  type QuoteRecord,
  type InsertQuote,
  type OhlcvBarRecord,
  type InsertOhlcvBar,
  type NewsItemRecord,
  type InsertNewsItem,
  type NewsInstrument,
  type InsertNewsInstrument,
  type SocialMention,
  type InsertSocialMention,
  type SocialPost,
  type InsertSocialPost,
  type OptionsFlowRecord,
  type InsertOptionsFlow,
  type OptionsActivityRecord,
  type InsertOptionsActivity,
  type WhaleTransactionRecord,
  type InsertWhaleTransaction,
  type EconomicEventRecord,
  type InsertEconomicEvent,
  type SectorPerformanceRecord,
  type InsertSectorPerformance,
  type MarketBreadthRecord,
  type InsertMarketBreadth,
  type CreditSpreadRecord,
  type InsertCreditSpread,
  type VixTermStructureRecord,
  type InsertVixTermStructure,
  type TechnicalIndicatorRecord,
  type InsertTechnicalIndicator,
} from "@shared/schema";

// ─── IStorage Interface (Backward Compatible) ───────────────────────────────
export interface IStorage {
  // Watchlist
  getWatchlist(): Promise<WatchlistItem[]>;
  addWatchlistItem(item: InsertWatchlistItem): Promise<WatchlistItem>;
  removeWatchlistItem(id: number): Promise<void>;

  // Alerts
  getAlerts(): Promise<Alert[]>;
  addAlert(alert: InsertAlert): Promise<Alert>;
  deleteAlert(id: number): Promise<void>;
  triggerAlert(id: number, details: { triggerPrice: number; triggeredAt: Date }): Promise<void>;

  // Chat
  getChatMessages(): Promise<ChatMessage[]>;
  addChatMessage(msg: InsertChatMessage): Promise<ChatMessage>;
  clearChatMessages(): Promise<void>;
}

// ─── Extended Storage Interface ──────────────────────────────────────────────
export interface IExtendedStorage extends IStorage {
  // Instruments
  getInstruments(): Promise<Instrument[]>;
  getInstrumentBySymbol(symbol: string): Promise<Instrument | undefined>;
  addInstrument(instrument: InsertInstrument): Promise<Instrument>;
  upsertInstrument(instrument: InsertInstrument): Promise<Instrument>;

  // Quotes
  persistQuote(quote: InsertQuote): Promise<QuoteRecord>;
  getLatestQuote(instrumentId: number): Promise<QuoteRecord | undefined>;
  getQuoteHistory(instrumentId: number, limit?: number): Promise<QuoteRecord[]>;

  // OHLCV
  persistOhlcvBar(bar: InsertOhlcvBar): Promise<OhlcvBarRecord>;
  persistOhlcvBars(bars: InsertOhlcvBar[]): Promise<OhlcvBarRecord[]>;
  getOhlcvHistory(instrumentId: number, interval: string, limit?: number): Promise<OhlcvBarRecord[]>;

  // News
  persistNewsItem(item: InsertNewsItem): Promise<NewsItemRecord>;
  linkNewsToInstrument(newsId: number, instrumentId: number): Promise<NewsInstrument>;
  getNewsByInstrument(instrumentId: number, limit?: number): Promise<NewsItemRecord[]>;
  getRecentNews(limit?: number): Promise<NewsItemRecord[]>;

  // Social Mentions
  persistSocialMention(mention: InsertSocialMention): Promise<SocialMention>;
  persistSocialPost(post: InsertSocialPost): Promise<SocialPost>;
  getLatestMention(instrumentId: number): Promise<SocialMention | undefined>;
  getMentionHistory(instrumentId: number, limit?: number): Promise<SocialMention[]>;

  // Options Flow
  persistOptionsFlow(flow: InsertOptionsFlow): Promise<OptionsFlowRecord>;
  persistOptionsActivity(activity: InsertOptionsActivity): Promise<OptionsActivityRecord>;
  getLatestOptionsFlow(instrumentId: number): Promise<OptionsFlowRecord | undefined>;
  getOptionsActivityHistory(instrumentId: number, limit?: number): Promise<OptionsActivityRecord[]>;

  // Whale Transactions
  persistWhaleTransaction(tx: InsertWhaleTransaction): Promise<WhaleTransactionRecord>;
  getRecentWhaleTransactions(symbol?: string, limit?: number): Promise<WhaleTransactionRecord[]>;

  // Economic Events
  persistEconomicEvent(event: InsertEconomicEvent): Promise<EconomicEventRecord>;
  getUpcomingEconomicEvents(days?: number): Promise<EconomicEventRecord[]>;

  // Sector Performance
  persistSectorPerformance(perf: InsertSectorPerformance): Promise<SectorPerformanceRecord>;
  getLatestSectorPerformance(): Promise<SectorPerformanceRecord[]>;

  // Market Breadth
  persistMarketBreadth(breadth: InsertMarketBreadth): Promise<MarketBreadthRecord>;
  getLatestMarketBreadth(): Promise<MarketBreadthRecord | undefined>;

  // Credit Spreads
  persistCreditSpread(spread: InsertCreditSpread): Promise<CreditSpreadRecord>;
  getLatestCreditSpread(): Promise<CreditSpreadRecord | undefined>;

  // VIX Term Structure
  persistVixTermStructure(vix: InsertVixTermStructure): Promise<VixTermStructureRecord>;
  getLatestVixTermStructure(): Promise<VixTermStructureRecord | undefined>;

  // Technical Indicators
  persistTechnicalIndicator(indicator: InsertTechnicalIndicator): Promise<TechnicalIndicatorRecord>;
  getLatestTechnicalIndicator(instrumentId: number): Promise<TechnicalIndicatorRecord | undefined>;

  // Data Management
  cleanupOldData(retentionDays?: number): Promise<void>;
}

// ─── DatabaseStorage Implementation ──────────────────────────────────────────
export class DatabaseStorage implements IExtendedStorage {
  private db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.db = drizzle(databaseUrl);
  }

  // ─── Instruments ─────────────────────────────────────────────────────────────
  async getInstruments(): Promise<Instrument[]> {
    return this.db.select().from(instruments).where(eq(instruments.isActive, true));
  }

  async getInstrumentBySymbol(symbol: string): Promise<Instrument | undefined> {
    const result = await this.db.select().from(instruments).where(eq(instruments.symbol, symbol.toUpperCase())).limit(1);
    return result[0];
  }

  async addInstrument(instrument: InsertInstrument): Promise<Instrument> {
    const result = await this.db.insert(instruments).values(instrument).returning();
    return result[0];
  }

  async upsertInstrument(instrument: InsertInstrument): Promise<Instrument> {
    const existing = await this.getInstrumentBySymbol(instrument.symbol);
    if (existing) {
      await this.db.update(instruments)
        .set({ ...instrument, updatedAt: new Date() })
        .where(eq(instruments.id, existing.id));
      return { ...existing, ...instrument, updatedAt: new Date() };
    }
    return this.addInstrument(instrument);
  }

  // ─── Watchlist ───────────────────────────────────────────────────────────────
  async getWatchlist(): Promise<WatchlistItem[]> {
    return this.db.select().from(watchlistItems);
  }

  async addWatchlistItem(item: InsertWatchlistItem): Promise<WatchlistItem> {
    const result = await this.db.insert(watchlistItems).values(item).returning();
    return result[0];
  }

  async removeWatchlistItem(id: number): Promise<void> {
    await this.db.delete(watchlistItems).where(eq(watchlistItems.id, id));
  }

  // ─── Alerts ──────────────────────────────────────────────────────────────────
  async getAlerts(): Promise<Alert[]> {
    return this.db.select().from(alerts);
  }

  async addAlert(alert: InsertAlert): Promise<Alert> {
    const result = await this.db.insert(alerts).values(alert).returning();
    return result[0];
  }

  async deleteAlert(id: number): Promise<void> {
    await this.db.delete(alerts).where(eq(alerts.id, id));
  }

  async triggerAlert(id: number, details: { triggerPrice: number; triggeredAt: Date }): Promise<void> {
    await this.db.update(alerts)
      .set({ triggered: true, triggerPrice: details.triggerPrice, triggeredAt: details.triggeredAt })
      .where(eq(alerts.id, id));
  }

  // ─── Chat Messages ───────────────────────────────────────────────────────────
  async getChatMessages(): Promise<ChatMessage[]> {
    return this.db.select().from(chatMessages);
  }

  async addChatMessage(msg: InsertChatMessage): Promise<ChatMessage> {
    const result = await this.db.insert(chatMessages).values(msg).returning();
    return result[0];
  }

  async clearChatMessages(): Promise<void> {
    await this.db.delete(chatMessages);
  }

  // ─── Quotes ──────────────────────────────────────────────────────────────────
  async persistQuote(quote: InsertQuote): Promise<QuoteRecord> {
    const result = await this.db.insert(quotes).values(quote).returning();
    return result[0];
  }

  async getLatestQuote(instrumentId: number): Promise<QuoteRecord | undefined> {
    const result = await this.db.select()
      .from(quotes)
      .where(eq(quotes.instrumentId, instrumentId))
      .orderBy(desc(quotes.recordedAt))
      .limit(1);
    return result[0];
  }

  async getQuoteHistory(instrumentId: number, limit = 30): Promise<QuoteRecord[]> {
    return this.db.select()
      .from(quotes)
      .where(eq(quotes.instrumentId, instrumentId))
      .orderBy(desc(quotes.recordedAt))
      .limit(limit);
  }

  // ─── OHLCV Bars ─────────────────────────────────────────────────────────────
  async persistOhlcvBar(bar: InsertOhlcvBar): Promise<OhlcvBarRecord> {
    const result = await this.db.insert(ohlcvBars).values(bar).returning();
    return result[0];
  }

  async persistOhlcvBars(bars: InsertOhlcvBar[]): Promise<OhlcvBarRecord[]> {
    if (!bars.length) return [];
    const result = await this.db.insert(ohlcvBars).values(bars).returning();
    return result;
  }

  async getOhlcvHistory(instrumentId: number, interval: string, limit = 365): Promise<OhlcvBarRecord[]> {
    return this.db.select()
      .from(ohlcvBars)
      .where(and(eq(ohlcvBars.instrumentId, instrumentId), eq(ohlcvBars.interval, interval)))
      .orderBy(desc(ohlcvBars.date))
      .limit(limit);
  }

  // ─── News ────────────────────────────────────────────────────────────────────
  async persistNewsItem(item: InsertNewsItem): Promise<NewsItemRecord> {
    const result = await this.db.insert(newsItems).values({
      ...item,
      publishedAt: new Date(item.publishedAt),
    }).returning();
    return result[0];
  }

  async linkNewsToInstrument(newsId: number, instrumentId: number): Promise<NewsInstrument> {
    const result = await this.db.insert(newsInstruments).values({ newsId, instrumentId }).returning();
    return result[0];
  }

  async getNewsByInstrument(instrumentId: number, limit = 20): Promise<NewsItemRecord[]> {
    const linked = await this.db.select()
      .from(newsInstruments)
      .where(eq(newsInstruments.instrumentId, instrumentId))
      .limit(limit);
    
    if (!linked.length) return [];
    
    const newsIds = linked.map(l => l.newsId);
    return this.db.select()
      .from(newsItems)
      .where(sql`${newsItems.id} IN ${newsIds}`)
      .orderBy(desc(newsItems.publishedAt))
      .limit(limit);
  }

  async getRecentNews(limit = 40): Promise<NewsItemRecord[]> {
    return this.db.select()
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(limit);
  }

  // ─── Social Mentions ─────────────────────────────────────────────────────────
  async persistSocialMention(mention: InsertSocialMention): Promise<SocialMention> {
    const result = await this.db.insert(socialMentions).values(mention).returning();
    return result[0];
  }

  async persistSocialPost(post: InsertSocialPost): Promise<SocialPost> {
    const result = await this.db.insert(socialPosts).values(post).returning();
    return result[0];
  }

  async getLatestMention(instrumentId: number): Promise<SocialMention | undefined> {
    const result = await this.db.select()
      .from(socialMentions)
      .where(eq(socialMentions.instrumentId, instrumentId))
      .orderBy(desc(socialMentions.recordedAt))
      .limit(1);
    return result[0];
  }

  async getMentionHistory(instrumentId: number, limit = 30): Promise<SocialMention[]> {
    return this.db.select()
      .from(socialMentions)
      .where(eq(socialMentions.instrumentId, instrumentId))
      .orderBy(desc(socialMentions.recordedAt))
      .limit(limit);
  }

  // ─── Options Flow ────────────────────────────────────────────────────────────
  async persistOptionsFlow(flow: InsertOptionsFlow): Promise<OptionsFlowRecord> {
    const result = await this.db.insert(optionsFlow).values(flow).returning();
    return result[0];
  }

  async persistOptionsActivity(activity: InsertOptionsActivity): Promise<OptionsActivityRecord> {
    const result = await this.db.insert(optionsActivity).values(activity).returning();
    return result[0];
  }

  async getLatestOptionsFlow(instrumentId: number): Promise<OptionsFlowRecord | undefined> {
    const result = await this.db.select()
      .from(optionsFlow)
      .where(eq(optionsFlow.instrumentId, instrumentId))
      .orderBy(desc(optionsFlow.recordedAt))
      .limit(1);
    return result[0];
  }

  async getOptionsActivityHistory(instrumentId: number, limit = 30): Promise<OptionsActivityRecord[]> {
    return this.db.select()
      .from(optionsActivity)
      .where(eq(optionsActivity.instrumentId, instrumentId))
      .orderBy(desc(optionsActivity.recordedAt))
      .limit(limit);
  }

  // ─── Whale Transactions ──────────────────────────────────────────────────────
  async persistWhaleTransaction(tx: InsertWhaleTransaction): Promise<WhaleTransactionRecord> {
    const result = await this.db.insert(whaleTransactions).values(tx).returning();
    return result[0];
  }

  async getRecentWhaleTransactions(symbol?: string, limit = 20): Promise<WhaleTransactionRecord[]> {
    if (symbol) {
      return this.db.select()
        .from(whaleTransactions)
        .where(eq(whaleTransactions.symbol, symbol.toUpperCase()))
        .orderBy(desc(whaleTransactions.recordedAt))
        .limit(limit);
    }
    return this.db.select()
      .from(whaleTransactions)
      .orderBy(desc(whaleTransactions.recordedAt))
      .limit(limit);
  }

  // ─── Economic Events ─────────────────────────────────────────────────────────
  async persistEconomicEvent(event: InsertEconomicEvent): Promise<EconomicEventRecord> {
    const result = await this.db.insert(economicEvents).values(event).returning();
    return result[0];
  }

  async getUpcomingEconomicEvents(days = 30): Promise<EconomicEventRecord[]> {
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    return this.db.select()
      .from(economicEvents)
      .where(and(
        sql`${economicEvents.date} >= ${today}`,
        sql`${economicEvents.date} <= ${futureDate}`
      ))
      .orderBy(economicEvents.date);
  }

  // ─── Sector Performance ──────────────────────────────────────────────────────
  async persistSectorPerformance(perf: InsertSectorPerformance): Promise<SectorPerformanceRecord> {
    const result = await this.db.insert(sectorPerformance).values(perf).returning();
    return result[0];
  }

  async getLatestSectorPerformance(): Promise<SectorPerformanceRecord[]> {
    const latest = await this.db.select()
      .from(sectorPerformance)
      .orderBy(desc(sectorPerformance.recordedAt))
      .limit(1);
    
    if (!latest.length) return [];
    
    return this.db.select()
      .from(sectorPerformance)
      .where(eq(sectorPerformance.recordedAt, latest[0].recordedAt));
  }

  // ─── Market Breadth ──────────────────────────────────────────────────────────
  async persistMarketBreadth(breadth: InsertMarketBreadth): Promise<MarketBreadthRecord> {
    const result = await this.db.insert(marketBreadth).values(breadth).returning();
    return result[0];
  }

  async getLatestMarketBreadth(): Promise<MarketBreadthRecord | undefined> {
    const result = await this.db.select()
      .from(marketBreadth)
      .orderBy(desc(marketBreadth.recordedAt))
      .limit(1);
    return result[0];
  }

  // ─── Credit Spreads ──────────────────────────────────────────────────────────
  async persistCreditSpread(spread: InsertCreditSpread): Promise<CreditSpreadRecord> {
    const result = await this.db.insert(creditSpreads).values(spread).returning();
    return result[0];
  }

  async getLatestCreditSpread(): Promise<CreditSpreadRecord | undefined> {
    const result = await this.db.select()
      .from(creditSpreads)
      .orderBy(desc(creditSpreads.recordedAt))
      .limit(1);
    return result[0];
  }

  // ─── VIX Term Structure ──────────────────────────────────────────────────────
  async persistVixTermStructure(vix: InsertVixTermStructure): Promise<VixTermStructureRecord> {
    const result = await this.db.insert(vixTermStructure).values(vix).returning();
    return result[0];
  }

  async getLatestVixTermStructure(): Promise<VixTermStructureRecord | undefined> {
    const result = await this.db.select()
      .from(vixTermStructure)
      .orderBy(desc(vixTermStructure.recordedAt))
      .limit(1);
    return result[0];
  }

  // ─── Technical Indicators ────────────────────────────────────────────────────
  async persistTechnicalIndicator(indicator: InsertTechnicalIndicator): Promise<TechnicalIndicatorRecord> {
    const result = await this.db.insert(technicalIndicators).values(indicator).returning();
    return result[0];
  }

  async getLatestTechnicalIndicator(instrumentId: number): Promise<TechnicalIndicatorRecord | undefined> {
    const result = await this.db.select()
      .from(technicalIndicators)
      .where(eq(technicalIndicators.instrumentId, instrumentId))
      .orderBy(desc(technicalIndicators.recordedAt))
      .limit(1);
    return result[0];
  }

  // ─── Data Management ─────────────────────────────────────────────────────────
  async cleanupOldData(retentionDays = 90): Promise<void> {
    const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
    const cutoffStr = cutoffDate.toISOString();

    // Clean up old data based on retention policy
    await this.db.delete(chatMessages).where(sql`${chatMessages.createdAt} < ${cutoffStr}`);
    await this.db.delete(socialMentions).where(sql`${socialMentions.recordedAt} < ${cutoffStr}`);
    await this.db.delete(socialPosts).where(sql`${socialPosts.createdAt} < ${cutoffStr}`);
    await this.db.delete(optionsActivity).where(sql`${optionsActivity.recordedAt} < ${cutoffStr}`);
    await this.db.delete(whaleTransactions).where(sql`${whaleTransactions.recordedAt} < ${cutoffStr}`);
    await this.db.delete(technicalIndicators).where(sql`${technicalIndicators.recordedAt} < ${cutoffStr}`);

    // Keep quotes for 1 year
    const yearCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    await this.db.delete(quotes).where(sql`${quotes.recordedAt} < ${yearCutoff}`);

    // Keep OHLCV for 2 years
    const twoYearCutoff = new Date(Date.now() - 730 * 86400000).toISOString();
    await this.db.delete(ohlcvBars).where(sql`${ohlcvBars.recordedAt} < ${twoYearCutoff}`);

    // Keep news for 90 days
    await this.db.delete(newsItems).where(sql`${newsItems.createdAt} < ${cutoffStr}`);

    // Keep economic events for 1 year
    await this.db.delete(economicEvents).where(sql`${economicEvents.recordedAt} < ${yearCutoff}`);

    // Keep sector/breadth/credit/vix for 1 year
    await this.db.delete(sectorPerformance).where(sql`${sectorPerformance.recordedAt} < ${yearCutoff}`);
    await this.db.delete(marketBreadth).where(sql`${marketBreadth.recordedAt} < ${yearCutoff}`);
    await this.db.delete(creditSpreads).where(sql`${creditSpreads.recordedAt} < ${yearCutoff}`);
    await this.db.delete(vixTermStructure).where(sql`${vixTermStructure.recordedAt} < ${yearCutoff}`);
  }
}

// ─── MemStorage (Backward Compatible) ────────────────────────────────────────
export class MemStorage implements IStorage {
  private watchlist: Map<number, WatchlistItem> = new Map();
  private alertsMap: Map<number, Alert> = new Map();
  private chatMsgs: Map<number, ChatMessage> = new Map();
  private watchlistId = 1;
  private alertId = 1;
  private chatId = 1;

  constructor() {
    const defaults = [
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "MSFT", name: "Microsoft Corp." },
      { symbol: "NVDA", name: "NVIDIA Corp." },
      { symbol: "TSLA", name: "Tesla Inc." },
      { symbol: "GOOGL", name: "Alphabet Inc." },
      { symbol: "AMZN", name: "Amazon.com Inc." },
      { symbol: "META", name: "Meta Platforms" },
      { symbol: "BRK-B", name: "Berkshire Hathaway" },
    ];
    defaults.forEach(d => {
      const item: WatchlistItem = { id: this.watchlistId++, instrumentId: 0, symbol: d.symbol, name: d.name, notes: null, addedAt: new Date() };
      this.watchlist.set(item.id, item);
    });
  }

  async getWatchlist(): Promise<WatchlistItem[]> {
    return Array.from(this.watchlist.values());
  }

  async addWatchlistItem(item: InsertWatchlistItem): Promise<WatchlistItem> {
    const newItem: WatchlistItem = { ...item, notes: item.notes ?? null, id: this.watchlistId++, addedAt: new Date() };
    this.watchlist.set(newItem.id, newItem);
    return newItem;
  }

  async removeWatchlistItem(id: number): Promise<void> {
    this.watchlist.delete(id);
  }

  async getAlerts(): Promise<Alert[]> {
    return Array.from(this.alertsMap.values());
  }

  async addAlert(alert: InsertAlert): Promise<Alert> {
    const newAlert: Alert = {
      ...alert,
      id: this.alertId++,
      triggered: false,
      triggerPrice: null,
      createdAt: new Date(),
      triggeredAt: null,
    };
    this.alertsMap.set(newAlert.id, newAlert);
    return newAlert;
  }

  async deleteAlert(id: number): Promise<void> {
    this.alertsMap.delete(id);
  }

  async triggerAlert(id: number, details: { triggerPrice: number; triggeredAt: Date }): Promise<void> {
    const alert = this.alertsMap.get(id);
    if (alert) {
      this.alertsMap.set(id, { ...alert, triggered: true, triggerPrice: details.triggerPrice, triggeredAt: details.triggeredAt });
    }
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    return Array.from(this.chatMsgs.values());
  }

  async addChatMessage(msg: InsertChatMessage): Promise<ChatMessage> {
    const newMsg: ChatMessage = { ...msg, id: this.chatId++, createdAt: new Date() };
    this.chatMsgs.set(newMsg.id, newMsg);
    return newMsg;
  }

  async clearChatMessages(): Promise<void> {
    this.chatMsgs.clear();
  }
}

// ─── Storage Factory ─────────────────────────────────────────────────────────
function createStorage(): IStorage {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    console.log("Using database storage");
    return new DatabaseStorage(databaseUrl);
  }
  console.log("Using in-memory storage (no DATABASE_URL configured)");
  return new MemStorage();
}

export const storage = createStorage();
export const extendedStorage = process.env.DATABASE_URL
  ? new DatabaseStorage(process.env.DATABASE_URL)
  : null;
