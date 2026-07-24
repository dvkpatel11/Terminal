import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import SymbolSuggestions from "@/components/ui/SymbolSuggestions";
import { PanelSection, KVRow } from "@/components/panel";
import { NewsList } from "@/components/news";
import { formatPrice, formatPct, formatBig, pctClass } from "@/lib/finance";
import { useQuote, useOHLCV, useNews, useFundamentals, useOnChain, useSocialSentiment } from "@/lib/useFinance";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import type { ViewMode } from "@/lib/terminalTypes";
import { computeSignalSummary } from "@shared/signalSummary";

interface Props {
  symbol: string;
  onNav: (v: ViewMode) => void;
  onSymbol?: (sym: string) => void;
}

function VerdictBadge({ verdict }: { verdict: "Bullish" | "Bearish" | "Mixed" | "Sparse" }) {
  const colors = {
    Bullish: "bg-green-500/20 text-green-400 border-green-500/30",
    Bearish: "bg-red-500/20 text-red-400 border-red-500/30",
    Mixed: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30",
    Sparse: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge className={`${colors[verdict]} font-terminal text-xs tracking-widest px-3 py-1.5 border`}>
      {verdict.toUpperCase()}
    </Badge>
  );
}

function isCrypto(quote?: { exchange?: string; symbol?: string }) {
  if (!quote) return false;
  return quote.exchange === "CRYPTO" || quote.symbol?.endsWith("-USD") === true;
}

function isForex(quote?: { exchange?: string; symbol?: string }) {
  if (!quote) return false;
  const s = quote.symbol ?? "";
  return s.includes("=") || (s.includes("X") && s.length === 6) || quote.exchange === "FX" || quote.exchange === "FOREX";
}

function isIndex(quote?: { assetClass?: string; exchange?: string; symbol?: string }) {
  if (!quote) return false;
  return quote.assetClass === "index" || quote.exchange === "INDEX" || quote.exchange === "CBOE" || quote.symbol?.startsWith("^") === true;
}

function isETF(quote?: { assetClass?: string; exchange?: string; sector?: string }) {
  if (!quote) return false;
  return quote.assetClass === "etf" || quote.sector === "ETF";
}

export default function SynthesisPanel({ symbol, onNav, onSymbol }: Props) {
  const openView = useWorkspaceStore((s) => s.openView);
  const { data: quote, isLoading: quoteLoading, isError: quoteError } = useQuote(symbol);
  const { data: ohlcvSeries } = useOHLCV(symbol, "1Y", "1d");
  const { data: news } = useNews(symbol);
  const { data: fundamentals, isError: fundError } = useFundamentals(symbol);
  const { data: onChain } = useOnChain(isCrypto(quote) ? symbol : undefined);
  const { data: socialSentiment } = useSocialSentiment(symbol);

  const profile = fundamentals?.profile;
  const metrics = fundamentals?.metrics;
  const consensus = fundamentals?.consensus;

  const crypto = isCrypto(quote);
  const forex = isForex(quote);
  const index = isIndex(quote);
  const etf = isETF(quote);
  const skipFundamentals = crypto || forex || index || etf;

  const price = quote?.price ?? 0;
  const prevClose = quote?.previousClose;
  const chg = price && prevClose ? price - prevClose : undefined;
  const chgPct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : undefined;

  const socialMention = socialSentiment?.mentions?.find((m) => m.symbol === symbol);

  const signalResult = useMemo(() => {
    if (!quote) return null;
    return computeSignalSummary({
      quote: { price, pe: metrics?.pe_ratio ?? quote.pe, changePercent: chgPct ?? 0, volume: quote.volume, avgVolume: quote.avgVolume },
      technicals: { rsi14: null, macd: null, macdHistogram: null, support: null, resistance: null },
      fundamentals: { sectorPe: null, revenueGrowth: metrics?.revenue_growth },
      macro: { yieldCurve: null, vix: null },
      social: socialMention ? { score: socialMention.sentiment, count: socialMention.count } : null,
    });
  }, [quote, metrics, chgPct, socialMention, price]);

  const pricePerf = useMemo(() => {
    if (!ohlcvSeries?.bars?.length) return null;
    const bars = ohlcvSeries.bars;
    const current = bars[bars.length - 1]?.close ?? price;
    const getClose = (daysAgo: number) => {
      const idx = Math.max(0, bars.length - 1 - daysAgo);
      return bars[idx]?.close ?? current;
    };
    const calc = (days: number) => {
      const prev = getClose(days);
      return prev > 0 ? ((current - prev) / prev) * 100 : 0;
    };
    return { d7: calc(7), d30: calc(30), d90: calc(90), ytd: calc(Math.min(bars.length - 1, 365)) };
  }, [ohlcvSeries, price]);

  if (quoteLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64 bg-border" />
        <Skeleton className="h-8 w-48 bg-border" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-32 bg-border" />)}
        </div>
      </div>
    );
  }

  if (!quote && quoteError) {
    return (
      <div className="p-6 space-y-4">
        <div className="font-terminal text-negative text-sm">Failed to load data for {symbol}</div>
        <div className="font-terminal text-muted-foreground text-xs">Check your connection or try a different symbol.</div>
        <SymbolSuggestions query={symbol} onSelect={(s) => onSymbol?.(s)} />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6 space-y-4">
        <div className="font-terminal text-muted-foreground text-sm">No data for {symbol}</div>
        <SymbolSuggestions query={symbol} onSelect={(s) => onSymbol?.(s)} />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 font-terminal text-xs">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/50 pb-4">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
              <span className="text-foreground">{profile?.name ?? quote.name}</span>
              {quote.exchange && <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">{quote.exchange}</span>}
              {profile?.sector && <span className="text-amber border border-amber/30 px-1.5 py-0.5">{profile.sector}</span>}
              <DataStatusBadge status={fundamentals?.status ?? quote.status} showAsOf relative />
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className={`text-3xl font-bold tabular-nums ${pctClass(chgPct ?? 0)}`}>${formatPrice(price)}</span>
              <span className={`text-lg font-semibold tabular-nums ${pctClass(chgPct ?? 0)}`}>
                {chg == null ? "" : (chg >= 0 ? "+" : "") + formatPrice(chg)}
                ({chgPct == null ? "" : formatPct(chgPct)})
              </span>
              <span className="text-muted-foreground">{quote.currency ?? "USD"}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1 min-w-[200px]">
            <span className="text-muted-foreground tracking-wider">SYNTHESIS</span>
            {signalResult && (
              <VerdictBadge
                verdict={
                  signalResult.direction === "bullish" ? "Bullish"
                    : signalResult.direction === "bearish" ? "Bearish"
                      : signalResult.direction === "mixed" ? "Mixed"
                        : "Sparse"
                }
              />
            )}
            <div className="text-[10px] text-muted-foreground mt-1 max-w-[250px] text-right leading-relaxed">
              {signalResult?.summary ?? "Gathering signals..."}
            </div>
          </div>
        </div>

        {/* Signal Summary Banner */}
        {signalResult && signalResult.signals.length > 0 && (
          <PanelSection title="SIGNAL SUMMARY">
            <div className="flex flex-wrap gap-1.5">
              {signalResult.signals.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-muted-foreground border border-border/30">
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <span className="text-green-400">
                {signalResult.signals.filter((s) => s.includes("bullish") || s.includes("oversold") || s.includes("discount") || s.includes("above-average")).length} bullish
              </span>
              <span className="text-red-400">
                {signalResult.signals.filter((s) => s.includes("bearish") || s.includes("overbought") || s.includes("premium") || s.includes("elevated") || s.includes("inverted")).length} bearish
              </span>
              <span className="text-muted-foreground">Confidence: {signalResult.confidence}</span>
            </div>
          </PanelSection>
        )}

        {/* Price / Valuation / Technicals (non-crypto/forex/index/etf) */}
        {!skipFundamentals && (
          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="PRICE">
              <KVRow label="MKT CAP" value={formatBig(metrics?.market_cap ?? profile?.market_cap)} />
              <KVRow label="VOLUME" value={formatBig(quote.volume)} />
              <KVRow label="AVG VOL" value={formatBig(quote.avgVolume)} />
              {quote.avgVolume > 0 && <KVRow label="VOL RATIO" value={`${(quote.volume / quote.avgVolume).toFixed(2)}x`} />}
              <KVRow label="BETA" value={profile?.beta != null ? profile.beta.toFixed(2) : "—"} />
            </PanelSection>

            <PanelSection title="VALUATION">
              <KVRow label="P/E" value={metrics?.pe_ratio?.toFixed(1) ?? quote.pe?.toFixed(1) ?? "—"} />
              <KVRow label="FWD P/E" value={metrics?.forward_pe?.toFixed(1) ?? "—"} />
              <KVRow label="EV/EBITDA" value={metrics?.enterprise_to_ebitda?.toFixed(1) ?? "—"} />
              <KVRow label="PEG" value={metrics?.peg_ratio?.toFixed(2) ?? "—"} />
              <KVRow label="P/B" value={metrics?.price_to_book?.toFixed(2) ?? "—"} />
            </PanelSection>

            <PanelSection title="TECHNICALS">
              <KVRow
                label="50d MA"
                value={quote.ma_50d != null ? formatPrice(quote.ma_50d) : "—"}
                valueClassName={quote.ma_50d != null && price >= quote.ma_50d ? "text-green-400" : quote.ma_50d != null ? "text-red-400" : ""}
              />
              <KVRow
                label="200d MA"
                value={quote.ma_200d != null ? formatPrice(quote.ma_200d) : "—"}
                valueClassName={quote.ma_200d != null && price >= quote.ma_200d ? "text-green-400" : quote.ma_200d != null ? "text-red-400" : ""}
              />
              <KVRow label="52W HIGH" value={<span className="text-green-400">{formatPrice(quote.high52)}</span>} />
              <KVRow label="52W LOW" value={<span className="text-red-400">{formatPrice(quote.low52)}</span>} />
            </PanelSection>
          </div>
        )}

        {/* AI Thesis + Analysts (non-crypto/forex/index/etf) */}
        {!skipFundamentals && (
          <div className="grid grid-cols-2 gap-3">
            <PanelSection title="AI THESIS">
              <div className="space-y-1.5">
                {metrics?.revenue_growth != null && (
                  <KVRow label="REVENUE GROWTH" value={<span className={metrics.revenue_growth >= 0 ? "text-green-400" : "text-red-400"}>{(metrics.revenue_growth * 100).toFixed(1)}%</span>} />
                )}
                {metrics?.operating_margin != null && (
                  <KVRow label="OP MARGIN" value={`${(metrics.operating_margin * 100).toFixed(1)}%`} />
                )}
                {metrics?.profit_margin != null && (
                  <KVRow label="NET MARGIN" value={`${(metrics.profit_margin * 100).toFixed(1)}%`} />
                )}
                {metrics?.debt_to_equity != null && (
                  <KVRow label="D/E" value={metrics.debt_to_equity.toFixed(2)} />
                )}
              </div>
            </PanelSection>

            <PanelSection title="ANALYSTS">
              <div className="space-y-1.5">
                <KVRow label="CONSENSUS" value={consensus?.recommendation ?? "—"} />
                {consensus?.recommendation_mean != null && (
                  <KVRow label="SCORE" value={`${consensus.recommendation_mean.toFixed(1)}/5`} />
                )}
                <KVRow label="TARGET" value={<span className="text-cyan-300">{formatPrice(consensus?.target_consensus ?? 0)}</span>} />
                <KVRow label="HIGH" value={<span className="text-green-400">{formatPrice(consensus?.target_high ?? 0)}</span>} />
                <KVRow label="LOW" value={<span className="text-red-400">{formatPrice(consensus?.target_low ?? 0)}</span>} />
                <KVRow label="COVERING" value={`${consensus?.number_of_analysts ?? "—"} analysts`} />
              </div>
            </PanelSection>
          </div>
        )}

        {/* Social + Size & Scale */}
        <div className="grid grid-cols-2 gap-3">
          <PanelSection title="SOCIAL SENTIMENT">
            {socialMention ? (
              <div className="space-y-1.5">
                <KVRow label="SCORE" value={
                  <span className={socialMention.sentiment > 0.3 ? "text-green-400" : socialMention.sentiment < -0.3 ? "text-red-400" : "text-muted-foreground"}>
                    {socialMention.sentiment > 0 ? "+" : ""}{socialMention.sentiment.toFixed(2)}
                  </span>
                } />
                <KVRow label="MENTIONS" value={`${socialMention.count}`} />
                <KVRow label="SENTIMENT" value={
                  socialMention.sentiment > 0.3 ? "Bullish" : socialMention.sentiment < -0.3 ? "Bearish" : "Neutral"
                } />
              </div>
            ) : (
              <div className="text-muted-foreground text-[10px] py-2">No social data available</div>
            )}
          </PanelSection>

          <PanelSection title="SIZE & SCALE">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <KVRow label="MKT CAP" value={formatBig(metrics?.market_cap ?? profile?.market_cap)} />
              <KVRow label="EMPLOYEES" value={profile?.employees != null ? profile.employees.toLocaleString() : "—"} />
              <KVRow label="SHARES" value={formatBig(profile?.shares_outstanding)} />
              <KVRow label="SECTOR" value={profile?.sector ?? "—"} />
              <KVRow label="EXCHANGE" value={quote.exchange} />
            </div>
          </PanelSection>
        </div>

        {/* Crypto: On-Chain preview */}
        {crypto && onChain?.transactions?.length ? (
          <PanelSection title="WHALE ACTIVITY">
            <div className="space-y-1 divide-y divide-border/30">
              {onChain.transactions.slice(0, 5).map((tx, i) => (
                <div key={i} className="py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSymbol?.(tx.symbol)}
                      className="font-terminal text-[10px] font-bold text-cyan hover:underline"
                    >
                      {tx.symbol}
                    </button>
                    <span className="font-terminal text-[9px] text-muted-foreground">{tx.type}</span>
                    <span className="font-terminal text-[9px] text-foreground ml-auto">{formatBig(tx.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        ) : null}

        {/* Latest Headlines */}
        <PanelSection title="LATEST HEADLINES">
          <NewsList
            items={(news ?? []).map((n) => ({ kind: "news" as const, item: n }))}
            variant="dense"
            maxItems={5}
            className="max-h-48"
          />
        </PanelSection>

        {/* Drill Down */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
          <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
          {[
            { v: "chart" as ViewMode, c: "GP", label: "Chart" },
            { v: "fa" as ViewMode, c: "FA", label: "Financials" },
            { v: "options" as ViewMode, c: "OMON", label: "Options" },
            { v: "news" as ViewMode, c: "NEWS", label: "News" },
            { v: "dvd" as ViewMode, c: "DVD", label: "Dividends" },
            { v: "social" as ViewMode, c: "SCFL", label: "Social" },
            ...(crypto ? [{ v: "onchain" as ViewMode, c: "ONCH", label: "On-Chain" }] : []),
          ].map((x) => (
            <button
              key={x.c}
              onClick={() => onNav(x.v)}
              className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors"
            >
              {x.c} <span className="text-muted-foreground">· {x.label}</span>
            </button>
          ))}
        </div>

        {/* Data Status */}
        <div className="text-[9px] text-muted-foreground/40 pt-1">
          DATA STATUS: {quote.quoteSource} · {fundamentals?.status?.provider?.toUpperCase() ?? "REF"}
        </div>
      </div>
    </ScrollArea>
  );
}
