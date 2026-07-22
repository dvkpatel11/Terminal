import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import SymbolSuggestions from "@/components/ui/SymbolSuggestions";
import { PanelSection, KVRow, SignalGroup } from "@/components/panel";
import { NewsList } from "@/components/news";
import { formatPrice, formatPct, formatBig, pctClass } from "@/lib/finance";
import { useQuote, useOHLCV, useNews, useFundamentals, useOnChain } from "@/lib/useFinance";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import type { ViewMode } from "@/lib/terminalTypes";
import { sigMA, sig52w, sigPE, sigFwdPE, sigEvEbitda, sigMargin, sigGrowth, sigAnalystUpside, sigAnalystRec, sigDebtEquity, sigDividend, tally, type Signal } from "@/lib/signals";

interface Props {
  symbol: string;
  onNav: (v: ViewMode) => void;
}

function formatPctFromDecimal(n?: number, decimals = 2): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
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
  return s.includes("=") || s.includes("X") && s.length === 6 || quote.exchange === "FX" || quote.exchange === "FOREX";
}

function isIndex(quote?: { assetClass?: string; exchange?: string; symbol?: string }) {
  if (!quote) return false;
  return quote.assetClass === "index" || quote.exchange === "INDEX" || quote.exchange === "CBOE" || quote.symbol?.startsWith("^") === true;
}

function isETF(quote?: { assetClass?: string; exchange?: string; sector?: string }) {
  if (!quote) return false;
  return quote.assetClass === "etf" || quote.sector === "ETF";
}

export default function IntelPanel({ symbol, onNav }: Props) {
  const openView = useWorkspaceStore((s) => s.openView);
  const { data: quote, isLoading: quoteLoading } = useQuote(symbol);
  const { data: ohlcvSeries } = useOHLCV(symbol, "1Y", "1d");
  const { data: news } = useNews(symbol);
  const { data: fundamentals, isLoading: fundLoading } = useFundamentals(symbol);
  const { data: onChain } = useOnChain(isCrypto(quote) ? symbol : undefined);

  const profile = fundamentals?.profile;
  const metrics = fundamentals?.metrics;
  const consensus = fundamentals?.consensus;
  const income = fundamentals?.incomeStatement ?? [];

  const crypto = isCrypto(quote);
  const forex = isForex(quote);
  const index = isIndex(quote);
  const etf = isETF(quote);

  const revSeries = useMemo(() => {
    const sorted = [...income].sort((a, b) => (a.period_ending > b.period_ending ? 1 : -1));
    return sorted.map((r) => r.total_revenue ?? 0);
  }, [income]);

  const price = quote?.price ?? 0;
  const prevClose = quote?.previousClose;
  const chg = price && prevClose ? price - prevClose : undefined;
  const chgPct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : undefined;
  const range52Pct = quote ? (quote.high52 === quote.low52 ? 50 : ((price - quote.low52) / (quote.high52 - quote.low52)) * 100) : 50;

  const technicals: Signal[] = [
    sigMA(price, quote?.ma_50d ?? undefined, "50d MA"),
    sigMA(price, quote?.ma_200d ?? undefined, "200d MA"),
    sig52w(price, quote?.high52, quote?.low52),
  ];

  const valuation: Signal[] = crypto || forex ? [] : [
    sigPE(metrics?.pe_ratio),
    sigFwdPE(metrics?.forward_pe, metrics?.pe_ratio),
    sigEvEbitda(metrics?.enterprise_to_ebitda),
  ];

  const fundSignals: Signal[] = crypto || forex ? [] : [
    sigGrowth(metrics?.revenue_growth, "Revenue"),
    sigGrowth(metrics?.earnings_growth, "Earnings"),
    sigMargin(metrics?.operating_margin, "op"),
    sigMargin(metrics?.gross_margin, "gross"),
    sigDebtEquity(metrics?.debt_to_equity),
  ];

  const analyst: Signal[] = crypto || forex ? [] : [
    sigAnalystRec(consensus?.recommendation, consensus?.recommendation_mean),
    sigAnalystUpside(consensus?.current_price ?? price ?? 0, consensus?.target_consensus),
  ];

  const shareholder: Signal[] = crypto || forex ? [] : [
    sigDividend(metrics?.dividend_yield ?? profile?.dividend_yield, metrics?.payout_ratio),
  ];

  const allSignals = crypto
    ? [...technicals]
    : forex
      ? [...technicals]
      : [...technicals, ...valuation, ...fundSignals, ...analyst, ...shareholder];
  const t = tally(allSignals);

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

  const loading = quoteLoading || fundLoading;
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64 bg-border" />
        <Skeleton className="h-8 w-48 bg-border" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Array(9).fill(0).map((_, i) => <Skeleton key={i} className="h-32 bg-border" />)}
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6 space-y-4">
        <div className="font-terminal text-muted-foreground text-sm">No data for {symbol}</div>
        <SymbolSuggestions query={symbol} onSelect={(s) => openView("intel", s)} />
      </div>
    );
  }

  if (crypto) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 font-terminal text-xs">
          <div className="flex items-start justify-between border-b border-border/50 pb-4">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
                <span className="text-foreground">{quote.name}</span>
                <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">CRYPTO</span>
                <DataStatusBadge status={quote.status} showAsOf relative />
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
              <span className="text-muted-foreground tracking-wider">INTELLIGENCE VERDICT</span>
              <VerdictBadge verdict={t.verdict} />
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-green-400 font-mono">{t.bull}</span> bullish</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-600" /><span className="text-cyan-300 font-mono">{t.neutral}</span> neutral</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-red-400 font-mono">{t.bear}</span> bearish</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="MARKET OVERVIEW">
              <KVRow label="MKT CAP" value={formatBig(quote.marketCap)} />
              <KVRow label="24H VOLUME" value={formatBig(quote.volume)} />
              <KVRow label="24H CHANGE" value={
                <span className={pctClass(chgPct ?? 0)}>{chgPct != null ? formatPct(chgPct) : "—"}</span>
              } />
              <KVRow label="24H HIGH" value={formatPrice(quote.dayHigh)} />
              <KVRow label="24H LOW" value={formatPrice(quote.dayLow)} />
              <KVRow label="SOURCE" value={<span className="text-cyan">{quote.quoteSource}</span>} />
            </PanelSection>

            <SignalGroup title="TECHNICAL" signals={technicals} />

            <PanelSection title="PRICE PERFORMANCE">
              {pricePerf ? (
                <>
                  <KVRow label="7D" value={<span className={pctClass(pricePerf.d7)}>{formatPct(pricePerf.d7)}</span>} />
                  <KVRow label="30D" value={<span className={pctClass(pricePerf.d30)}>{formatPct(pricePerf.d30)}</span>} />
                  <KVRow label="90D" value={<span className={pctClass(pricePerf.d90)}>{formatPct(pricePerf.d90)}</span>} />
                  <KVRow label="YTD" value={<span className={pctClass(pricePerf.ytd)}>{formatPct(pricePerf.ytd)}</span>} />
                </>
              ) : (
                <div className="text-muted-foreground text-[10px] py-2">Loading performance data...</div>
              )}
            </PanelSection>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {onChain?.transactions?.length ? (
              <PanelSection title="WHALE ACTIVITY">
                <div className="space-y-1 divide-y divide-border/30">
                  {onChain.transactions.slice(0, 5).map((tx, i) => (
                    <div key={i} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-terminal text-[10px] font-bold text-cyan">{tx.symbol}</span>
                        <span className="font-terminal text-[9px] text-muted-foreground">{tx.type}</span>
                        <span className="font-terminal text-[9px] text-foreground ml-auto">{formatBig(tx.amount)}</span>
                      </div>
                      {tx.txHash && (
                        <div className="font-terminal text-[8px] text-muted-foreground/50 mt-0.5 truncate">{tx.txHash}</div>
                      )}
                    </div>
                  ))}
                </div>
              </PanelSection>
            ) : (
              <PanelSection title="ON-CHAIN">
                <div className="text-muted-foreground text-[10px] py-4 text-center">No on-chain data available</div>
              </PanelSection>
            )}

            <PanelSection title="LATEST HEADLINES">
              <NewsList
                items={news ?? []}
                variant="dense"
                maxItems={5}
                className="max-h-48"
              />
            </PanelSection>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
            <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
            {[
              { v: "chart" as ViewMode, c: "GP", label: "Chart" },
              { v: "news" as ViewMode, c: "NI", label: "All News" },
              { v: "crypto" as ViewMode, c: "CRYPTO", label: "All Crypto" },
            ].map((x) => (
              <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
                {x.c} <span className="text-muted-foreground">· {x.label}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (forex) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 font-terminal text-xs">
          <div className="flex items-start justify-between border-b border-border/50 pb-4">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
                <span className="text-foreground">{quote.name}</span>
                <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">FOREX</span>
                <DataStatusBadge status={quote.status} showAsOf relative />
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className={`text-3xl font-bold tabular-nums ${pctClass(chgPct ?? 0)}`}>{formatPrice(price)}</span>
                <span className={`text-lg font-semibold tabular-nums ${pctClass(chgPct ?? 0)}`}>
                  {chg == null ? "" : (chg >= 0 ? "+" : "") + formatPrice(chg)}
                  ({chgPct == null ? "" : formatPct(chgPct)})
                </span>
                <span className="text-muted-foreground">{quote.currency ?? "USD"}</span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1 min-w-[200px]">
              <span className="text-muted-foreground tracking-wider">INTELLIGENCE VERDICT</span>
              <VerdictBadge verdict={t.verdict} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <SignalGroup title="TECHNICAL" signals={technicals} />

            <PanelSection title="SESSION">
              <KVRow label="OPEN" value={formatPrice(quote.open)} />
              <KVRow label="PREV CLOSE" value={formatPrice(quote.previousClose)} />
              <KVRow label="DAY HIGH" value={formatPrice(quote.dayHigh)} />
              <KVRow label="DAY LOW" value={formatPrice(quote.dayLow)} />
              <KVRow label="SOURCE" value={<span className="text-cyan">{quote.quoteSource}</span>} />
            </PanelSection>

            <PanelSection title="PRICE PERFORMANCE">
              {pricePerf ? (
                <>
                  <KVRow label="7D" value={<span className={pctClass(pricePerf.d7)}>{formatPct(pricePerf.d7)}</span>} />
                  <KVRow label="30D" value={<span className={pctClass(pricePerf.d30)}>{formatPct(pricePerf.d30)}</span>} />
                  <KVRow label="90D" value={<span className={pctClass(pricePerf.d90)}>{formatPct(pricePerf.d90)}</span>} />
                  <KVRow label="YTD" value={<span className={pctClass(pricePerf.ytd)}>{formatPct(pricePerf.ytd)}</span>} />
                </>
              ) : (
                <div className="text-muted-foreground text-[10px] py-2">Loading performance data...</div>
              )}
            </PanelSection>
          </div>

          <PanelSection title="LATEST HEADLINES">
            <NewsList
              items={news ?? []}
              variant="dense"
              maxItems={5}
              className="max-h-48"
            />
          </PanelSection>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
            <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
            {[
              { v: "chart" as ViewMode, c: "GP", label: "Chart" },
              { v: "news" as ViewMode, c: "NI", label: "All News" },
              { v: "fxc" as ViewMode, c: "FXC", label: "FX Dashboard" },
            ].map((x) => (
              <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
                {x.c} <span className="text-muted-foreground">· {x.label}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (index) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 font-terminal text-xs">
          <div className="flex items-start justify-between border-b border-border/50 pb-4">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
                <span className="text-foreground">{quote.name}</span>
                <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">INDEX</span>
                {quote.sector && quote.sector !== "Index" && (
                  <span className="text-amber border border-amber/30 px-1.5 py-0.5">{quote.sector}</span>
                )}
                <DataStatusBadge status={quote.status} showAsOf relative />
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className={`text-3xl font-bold tabular-nums ${pctClass(chgPct ?? 0)}`}>{formatPrice(price)}</span>
                <span className={`text-lg font-semibold tabular-nums ${pctClass(chgPct ?? 0)}`}>
                  {chg == null ? "" : (chg >= 0 ? "+" : "") + formatPrice(chg)}
                  ({chgPct == null ? "" : formatPct(chgPct)})
                </span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1 min-w-[200px]">
              <span className="text-muted-foreground tracking-wider">INDEX OVERVIEW</span>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                {quote.sector === "Volatility" ? (
                  <>
                    <div>Measures market implied volatility</div>
                    <div>Over S&P 500 options (VIX methodology)</div>
                  </>
                ) : (
                  <>
                    <div>Market-cap weighted composite</div>
                    <div>Tracks {symbol === "^GSPC" ? "500 large-cap US equities" : symbol === "^DJI" ? "30 blue-chip US stocks" : symbol === "^IXIC" ? "all NASDAQ-listed securities" : symbol === "^FTSE" ? "100 London Stock Exchange listings" : symbol === "^GDAXI" ? "40 Frankfurt Stock Exchange listings" : symbol === "^N225" ? "225 Tokyo Stock Exchange listings" : "constituent securities"}</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="SESSION">
              <KVRow label="OPEN" value={formatPrice(quote.open)} />
              <KVRow label="PREV CLOSE" value={formatPrice(quote.previousClose)} />
              <KVRow label="DAY HIGH" value={formatPrice(quote.dayHigh)} />
              <KVRow label="DAY LOW" value={formatPrice(quote.dayLow)} />
              <KVRow label="VOLUME" value={quote.volume > 0 ? formatBig(quote.volume) : "—"} />
            </PanelSection>

            <PanelSection title="52-WEEK RANGE">
              <KVRow label="52W HIGH" value={<span className="text-green-400">{formatPrice(quote.high52)}</span>} />
              <KVRow label="52W LOW" value={<span className="text-red-400">{formatPrice(quote.low52)}</span>} />
              <KVRow label="RANGE POSITION" value={
                <span className={range52Pct > 80 ? "text-green-400" : range52Pct < 20 ? "text-red-400" : "text-muted-foreground"}>
                  {range52Pct.toFixed(1)}%
                </span>
              } />
              <div className="mt-1.5">
                <div className="w-full h-1.5 bg-border/50 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan/50 rounded-full" style={{ width: `${range52Pct}%` }} />
                </div>
              </div>
            </PanelSection>

            <SignalGroup title="TECHNICAL" signals={technicals} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="PRICE PERFORMANCE">
              {pricePerf ? (
                <>
                  <KVRow label="1W" value={<span className={pctClass(pricePerf.d7)}>{formatPct(pricePerf.d7)}</span>} />
                  <KVRow label="1M" value={<span className={pctClass(pricePerf.d30)}>{formatPct(pricePerf.d30)}</span>} />
                  <KVRow label="3M" value={<span className={pctClass(pricePerf.d90)}>{formatPct(pricePerf.d90)}</span>} />
                  <KVRow label="YTD" value={<span className={pctClass(pricePerf.ytd)}>{formatPct(pricePerf.ytd)}</span>} />
                </>
              ) : (
                <div className="text-muted-foreground text-[10px] py-2">Loading...</div>
              )}
            </PanelSection>

            <PanelSection title="KEY LEVELS">
              <KVRow label="PREV CLOSE" value={formatPrice(quote.previousClose)} />
              <KVRow label="OPEN" value={formatPrice(quote.open)} />
              <KVRow label="Pivot (PP)" value={formatPrice((quote.dayHigh + quote.dayLow + quote.previousClose) / 3)} />
              <KVRow label="R1" value={formatPrice(2 * (quote.dayHigh + quote.dayLow + quote.previousClose) / 3 - quote.dayLow)} />
              <KVRow label="S1" value={formatPrice(2 * (quote.dayHigh + quote.dayLow + quote.previousClose) / 3 - quote.dayHigh)} />
            </PanelSection>

            <PanelSection title="LATEST HEADLINES">
              <NewsList items={news ?? []} variant="dense" maxItems={5} className="max-h-48" />
            </PanelSection>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
            <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
            {[
              { v: "chart" as ViewMode, c: "GP", label: "Chart" },
              { v: "news" as ViewMode, c: "NI", label: "All News" },
              { v: "economics" as ViewMode, c: "ECST", label: "Economics" },
            ].map((x) => (
              <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
                {x.c} <span className="text-muted-foreground">· {x.label}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (etf) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 font-terminal text-xs">
          <div className="flex items-start justify-between border-b border-border/50 pb-4">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-bold text-cyan tracking-widest">{symbol}</span>
                <span className="text-foreground">{quote.name}</span>
                {quote.exchange && <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">{quote.exchange}</span>}
                {quote.sector && quote.sector !== "ETF" && (
                  <span className="text-amber border border-amber/30 px-1.5 py-0.5">{quote.sector}</span>
                )}
                {quote.sector === "ETF" && <span className="text-muted-foreground border border-border/30 px-1.5 py-0.5">SECTOR ETF</span>}
                <DataStatusBadge status={quote.status} showAsOf relative />
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className={`text-3xl font-bold tabular-nums ${pctClass(chgPct ?? 0)}`}>${formatPrice(price)}</span>
                <span className={`text-lg font-semibold tabular-nums ${pctClass(chgPct ?? 0)}`}>
                  {chg == null ? "" : (chg >= 0 ? "+" : "") + formatPrice(chg)}
                  ({chgPct == null ? "" : formatPct(chgPct)})
                </span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1 min-w-[200px]">
              <span className="text-muted-foreground tracking-wider">ETF PROFILE</span>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <div>Tracks {quote.sector === "ETF" ? "broad market index" : `${quote.sector} sector`}</div>
                <div>Exchange-traded fund · {quote.exchange}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="SESSION">
              <KVRow label="OPEN" value={formatPrice(quote.open)} />
              <KVRow label="PREV CLOSE" value={formatPrice(quote.previousClose)} />
              <KVRow label="DAY HIGH" value={formatPrice(quote.dayHigh)} />
              <KVRow label="DAY LOW" value={formatPrice(quote.dayLow)} />
              <KVRow label="VOLUME" value={formatBig(quote.volume)} />
              <KVRow label="AVG VOLUME" value={formatBig(quote.avgVolume)} />
            </PanelSection>

            <PanelSection title="52-WEEK RANGE">
              <KVRow label="52W HIGH" value={<span className="text-green-400">{formatPrice(quote.high52)}</span>} />
              <KVRow label="52W LOW" value={<span className="text-red-400">{formatPrice(quote.low52)}</span>} />
              <KVRow label="RANGE POSITION" value={
                <span className={range52Pct > 80 ? "text-green-400" : range52Pct < 20 ? "text-red-400" : "text-muted-foreground"}>
                  {range52Pct.toFixed(1)}%
                </span>
              } />
              <div className="mt-1.5">
                <div className="w-full h-1.5 bg-border/50 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan/50 rounded-full" style={{ width: `${range52Pct}%` }} />
                </div>
              </div>
            </PanelSection>

            <SignalGroup title="TECHNICAL" signals={technicals} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PanelSection title="PRICE PERFORMANCE">
              {pricePerf ? (
                <>
                  <KVRow label="1W" value={<span className={pctClass(pricePerf.d7)}>{formatPct(pricePerf.d7)}</span>} />
                  <KVRow label="1M" value={<span className={pctClass(pricePerf.d30)}>{formatPct(pricePerf.d30)}</span>} />
                  <KVRow label="3M" value={<span className={pctClass(pricePerf.d90)}>{formatPct(pricePerf.d90)}</span>} />
                  <KVRow label="YTD" value={<span className={pctClass(pricePerf.ytd)}>{formatPct(pricePerf.ytd)}</span>} />
                </>
              ) : (
                <div className="text-muted-foreground text-[10px] py-2">Loading...</div>
              )}
            </PanelSection>

            <PanelSection title="ETF STATISTICS">
              {quote.sector && quote.sector !== "ETF" && <KVRow label="SECTOR" value={quote.sector} />}
              <KVRow label="EXCHANGE" value={quote.exchange} />
              <KVRow label="52W HIGH" value={formatPrice(quote.high52)} />
              <KVRow label="52W LOW" value={formatPrice(quote.low52)} />
              <KVRow label="AVG VOLUME" value={formatBig(quote.avgVolume)} />
            </PanelSection>

            <PanelSection title="LATEST HEADLINES">
              <NewsList items={news ?? []} variant="dense" maxItems={5} className="max-h-48" />
            </PanelSection>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
            <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
            {[
              { v: "chart" as ViewMode, c: "GP", label: "Chart" },
              { v: "news" as ViewMode, c: "NI", label: "All News" },
              { v: "sectors" as ViewMode, c: "SECT", label: "All Sectors" },
            ].map((x) => (
              <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
                {x.c} <span className="text-muted-foreground">· {x.label}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 font-terminal text-xs">
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
            <span className="text-muted-foreground tracking-wider">INTELLIGENCE VERDICT</span>
            <VerdictBadge verdict={t.verdict} />
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-green-400 font-mono">{t.bull}</span> bullish</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-600" /><span className="text-cyan-300 font-mono">{t.neutral}</span> neutral</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-red-400 font-mono">{t.bear}</span> bearish</span>
            </div>
            <span className="text-[9px] text-muted-foreground">RULE-BASED · NOT INVESTMENT ADVICE</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SignalGroup title="TECHNICAL" signals={technicals} />
          <SignalGroup
            title="VALUATION"
            signals={valuation}
            extra={
              <>
                <Separator className="my-1" />
                <KVRow label="PEG" value={metrics?.peg_ratio?.toFixed(2) ?? "—"} />
                <KVRow label="P/B" value={metrics?.price_to_book?.toFixed(2) ?? "—"} />
                <KVRow label="BOOK VALUE" value={metrics?.book_value != null ? formatPrice(metrics.book_value) : "—"} />
              </>
            }
          />
          <SignalGroup
            title="FUNDAMENTALS"
            signals={fundSignals}
            extra={
              <>
                <Separator className="my-1" />
                <KVRow label="NET MARGIN" value={formatPctFromDecimal(metrics?.profit_margin)} />
                <KVRow label="ROA" value={formatPctFromDecimal(metrics?.return_on_assets)} />
                <KVRow label="ROE" value={formatPctFromDecimal(metrics?.return_on_equity)} />
              </>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PanelSection title="SNAPSHOT">
            <KVRow label="OPEN" value={formatPrice(quote.open)} />
            <KVRow label="PREV CLOSE" value={formatPrice(quote.previousClose)} />
            <KVRow label="DAY HIGH" value={<span className="text-green-400">{formatPrice(quote.dayHigh)}</span>} />
            <KVRow label="DAY LOW" value={<span className="text-red-400">{formatPrice(quote.dayLow)}</span>} />
            <KVRow label="VOLUME" value={formatBig(quote.volume)} />
            <KVRow label="AVG VOL" value={formatBig(quote.avgVolume)} />
            {quote.avgVolume > 0 && (
              <KVRow label="VOL RATIO" value={`${(quote.volume / quote.avgVolume).toFixed(2)}x`} />
            )}
          </PanelSection>

          <PanelSection title="52-WEEK RANGE">
            <KVRow label="HIGH" value={<span className="text-green-400">{formatPrice(quote.high52)}</span>} />
            <KVRow label="LOW" value={<span className="text-red-400">{formatPrice(quote.low52)}</span>} />
            <KVRow label="POSITION" value={`${range52Pct.toFixed(1)}%`} />
            <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-cyan-600 rounded-full" style={{ width: `${range52Pct}%` }} />
            </div>
            <KVRow label="50d MA" value={quote.ma_50d != null ? formatPrice(quote.ma_50d) : "—"} valueClassName={quote.ma_50d != null && price >= quote.ma_50d ? "text-green-400" : quote.ma_50d != null ? "text-red-400" : ""} />
            <KVRow label="200d MA" value={quote.ma_200d != null ? formatPrice(quote.ma_200d) : "—"} valueClassName={quote.ma_200d != null && price >= quote.ma_200d ? "text-green-400" : quote.ma_200d != null ? "text-red-400" : ""} />
            {quote.ma_50d != null && quote.ma_200d != null && (
              <KVRow label="MA TREND" value={quote.ma_50d > quote.ma_200d ? "BULLISH" : "BEARISH"} valueClassName={quote.ma_50d > quote.ma_200d ? "text-green-400" : "text-red-400"} />
            )}
          </PanelSection>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <PanelSection
            title="ANALYSTS"
            badge={<span className="font-terminal text-[9px] text-muted-foreground">{consensus?.number_of_analysts ?? "—"} covering</span>}
          >
            <div className="space-y-2">
              {analyst.map((s, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className={`flex-1 text-xs ${s.level === "bull" && "text-green-400"} ${s.level === "bear" && "text-red-400"} ${s.level === "neutral" && "text-cyan-300"} ${s.level === "na" && "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {s.detail && <span className="text-xs text-muted-foreground font-mono tabular-nums">{s.detail}</span>}
                </div>
              ))}
              {consensus?.recommendation_mean != null && (
                <KVRow label="SCORE" value={`${consensus.recommendation_mean.toFixed(1)}/5`} />
              )}
              <Separator className="my-2" />
              <KVRow label="CURRENT" value={formatPrice(consensus?.current_price ?? price)} />
              <KVRow label="TARGET" value={<span className="text-cyan-300">{formatPrice(consensus?.target_consensus ?? 0)}</span>} />
              <KVRow label="MEDIAN" value={formatPrice(consensus?.target_median ?? 0)} />
              <KVRow label="HIGH" value={<span className="text-green-400">{formatPrice(consensus?.target_high ?? 0)}</span>} />
              <KVRow label="LOW" value={<span className="text-red-400">{formatPrice(consensus?.target_low ?? 0)}</span>} />
              {consensus?.target_consensus != null && price > 0 && (
                <KVRow label="IMPLIED UPSIDE" value={
                  <span className={((consensus.target_consensus - price) / price) >= 0 ? "text-green-400" : "text-red-400"}>
                    {((consensus.target_consensus - price) / price) >= 0 ? "+" : ""}{((consensus.target_consensus - price) / price * 100).toFixed(1)}%
                  </span>
                } />
              )}
            </div>
          </PanelSection>

          <PanelSection title="DIVIDEND">
            <div className="space-y-2">
              {shareholder.map((s, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className={`flex-1 text-xs ${s.level === "bull" && "text-green-400"} ${s.level === "bear" && "text-red-400"} ${s.level === "neutral" && "text-cyan-300"} ${s.level === "na" && "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {s.detail && <span className="text-xs text-muted-foreground font-mono tabular-nums">{s.detail}</span>}
                </div>
              ))}
              <Separator className="my-2" />
              <KVRow label="YIELD" value={formatPctFromDecimal(metrics?.dividend_yield ?? profile?.dividend_yield)} />
              <KVRow label="PAYOUT" value={formatPctFromDecimal(metrics?.payout_ratio)} />
            </div>
          </PanelSection>

          <PanelSection title="SIZE & TREND">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <KVRow label="MKT CAP" value={formatBig(metrics?.market_cap ?? profile?.market_cap)} />
              <KVRow label="EV" value={formatBig(metrics?.enterprise_value)} />
              <KVRow label="SHARES" value={formatBig(profile?.shares_outstanding)} />
              <KVRow label="BETA" value={profile?.beta != null ? profile.beta.toFixed(2) : "—"} />
              <KVRow label="CURRENT RATIO" value={metrics?.current_ratio?.toFixed(2) ?? "—"} />
              <KVRow label="QUICK RATIO" value={metrics?.quick_ratio?.toFixed(2) ?? "—"} />
            </div>
            {revSeries.length > 1 && (
              <div className="mt-2">
                <div className="font-terminal text-[9px] text-muted-foreground tracking-wider mb-1">REVENUE TREND (ANNUAL)</div>
                <div className="flex items-end gap-1 h-10">
                  {revSeries.map((v, i) => {
                    const max = Math.max(...revSeries);
                    const h = max > 0 ? (v / max) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 bg-cyan-600/70 min-w-[8px]" style={{ height: `${h}%` }} title={formatBig(v)} />
                    );
                  })}
                </div>
              </div>
            )}
          </PanelSection>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PanelSection title="BUSINESS">
            <p className="text-xs text-muted-foreground leading-relaxed max-h-[160px] overflow-y-auto scrollbar-thin">
              {profile?.long_description ?? "No description available."}
            </p>
          </PanelSection>

          <PanelSection title="LATEST HEADLINES">
            <NewsList
              items={news ?? []}
              variant="dense"
              maxItems={5}
              className="max-h-48"
            />
          </PanelSection>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[10px]">
          <span className="text-muted-foreground tracking-wider">DRILL DOWN:</span>
          {[
            { v: "chart" as ViewMode, c: "GP", label: "Chart" },
            { v: "fa" as ViewMode, c: "FA", label: "Financials" },
            { v: "dvd" as ViewMode, c: "DVD", label: "Dividends" },
            { v: "news" as ViewMode, c: "NI", label: "All News" },
            { v: "options" as ViewMode, c: "OMON", label: "Options" },
          ].map((x) => (
            <button key={x.c} onClick={() => onNav(x.v)} className="px-2 py-1 border border-border/50 hover:border-cyan/50 hover:text-cyan text-muted-foreground tracking-wider transition-colors">
              {x.c} <span className="text-muted-foreground">· {x.label}</span>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
