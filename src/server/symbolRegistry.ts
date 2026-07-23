import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IndexEntry {
  symbol: string;
  label: string;
  region: string;
}

export interface SectorEtf {
  symbol: string;
  label: string;
  sector: string;
}

export interface ScorecardAsset {
  symbol: string;
  label: string;
  category: string;
}

export interface VixTerm {
  symbol: string;
  label: string;
  tenor: string;
}

export interface InstrumentProfile {
  name: string;
  exchange: string;
  sector: string;
  marketCap?: number;
  referencePrice?: number;
  eps?: number;
  assetClass: string;
  coinGeckoId?: string;
}

export interface SymbolConfig {
  tape: string[];
  popularTickers: string[];
  indices: IndexEntry[];
  sectorEtfs: SectorEtf[];
  scorecardAssets: ScorecardAsset[];
  vixTerms: VixTerm[];
  crypto: {
    symbols: string[];
    labels: Record<string, string>;
    binanceMap: Record<string, string>;
  };
  fx: {
    pairs: string[];
    yahooSymbols: Record<string, string>;
    labels: Record<string, string>;
  };
  finnhubEquities: string[];
  screenerUniverse: string[];
  screenerSectors: string[];
  sampleSymbols: string[];
  optionsFlowDefaults: string[];
  commonTickers: string[];
  peerMap: Record<string, string[]>;
  indexSparklines: string[];
  profileCatalog: Record<string, InstrumentProfile>;
  defaults: {
    benchmark: string;
    economicsCommodities: string[];
  };
  indexDescriptions: Record<string, string>;
  discord: {
    trackedChannels: DiscordTrackedChannel[];
  };
}

export interface DiscordTrackedChannel {
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
  addedAt: string;
  lastMessageId?: string;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

let _config: SymbolConfig | null = null;

export function loadSymbolConfig(): SymbolConfig {
  if (_config) return _config;

  const configPath = resolve(process.cwd(), "symbolConfig.json");
  const raw = readFileSync(configPath, "utf-8");
  _config = JSON.parse(raw) as SymbolConfig;
  return _config;
}

/** Reload config from disk (call after external edits) */
export function reloadSymbolConfig(): SymbolConfig {
  _config = null;
  return loadSymbolConfig();
}

// ─── Convenience accessors ──────────────────────────────────────────────────

export function getTapeSymbols(): string[] {
  return loadSymbolConfig().tape;
}

export function getPopularTickers(): string[] {
  return loadSymbolConfig().popularTickers;
}

export function getIndices(): IndexEntry[] {
  return loadSymbolConfig().indices;
}

export function getSectorEtfs(): SectorEtf[] {
  return loadSymbolConfig().sectorEtfs;
}

export function getScorecardAssets(): ScorecardAsset[] {
  return loadSymbolConfig().scorecardAssets;
}

export function getVixTerms(): VixTerm[] {
  return loadSymbolConfig().vixTerms;
}

export function getCryptoSymbols(): string[] {
  return loadSymbolConfig().crypto.symbols;
}

export function getCryptoLabels(): Record<string, string> {
  return loadSymbolConfig().crypto.labels;
}

export function getBinanceSymbolMap(): Record<string, string> {
  return loadSymbolConfig().crypto.binanceMap;
}

export function getFxPairs(): string[] {
  return loadSymbolConfig().fx.pairs;
}

export function getFxLabels(): Record<string, string> {
  return loadSymbolConfig().fx.labels;
}

export function getFxYahooSymbols(): Record<string, string> {
  return loadSymbolConfig().fx.yahooSymbols ?? {};
}

export function getDefaultBenchmark(): string {
  return loadSymbolConfig().defaults?.benchmark ?? "SPY";
}

export function getEconomicsCommodities(): string[] {
  return loadSymbolConfig().defaults?.economicsCommodities ?? ["GC=F", "CL=F"];
}

export function getFinnhubEquities(): string[] {
  return loadSymbolConfig().finnhubEquities;
}

export function getScreenerUniverse(): string[] {
  return loadSymbolConfig().screenerUniverse;
}

export function getScreenerSectors(): string[] {
  return loadSymbolConfig().screenerSectors;
}

export function getSampleSymbols(): string[] {
  return loadSymbolConfig().sampleSymbols;
}

export function getOptionsFlowDefaults(): string[] {
  return loadSymbolConfig().optionsFlowDefaults;
}

export function getCommonTickers(): Set<string> {
  return new Set(loadSymbolConfig().commonTickers);
}

export function getPeerMap(): Record<string, string[]> {
  return loadSymbolConfig().peerMap;
}

export function getPeersForSymbol(symbol: string): string[] {
  const map = loadSymbolConfig().peerMap;
  const popular = loadSymbolConfig().popularTickers;
  return map[symbol] ?? popular.slice(0, 5);
}

export function getIndexSparklineSymbols(): string[] {
  return loadSymbolConfig().indexSparklines;
}

export function getProfileCatalog(): Record<string, InstrumentProfile> {
  return loadSymbolConfig().profileCatalog;
}

export function getProfile(symbol: string): InstrumentProfile | undefined {
  return loadSymbolConfig().profileCatalog[symbol];
}

export function getIndexDescriptions(): Record<string, string> {
  return loadSymbolConfig().indexDescriptions ?? {};
}

export function getDiscordTrackedChannels(): DiscordTrackedChannel[] {
  return (loadSymbolConfig() as any).discord?.trackedChannels || [];
}

export function getSymbolConfig(): SymbolConfig {
  return loadSymbolConfig();
}
