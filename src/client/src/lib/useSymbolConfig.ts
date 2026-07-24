import { useQuery } from "@tanstack/react-query";

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
}

export function useSymbolConfig() {
  return useQuery<SymbolConfig>({
    queryKey: ["/api/symbols"],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
