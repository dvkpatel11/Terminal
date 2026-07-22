import { useState } from "react";
import { useQuote, useQuotes, useMarketGainers, useMarketLosers, useMostActive, useMarketSentiment, useNews, useIndexSparklines, useScorecard, useMarketBreadth, useCreditSpreads, useVixTermStructure, useSectorPerformance } from "@/lib/useFinance";
import { formatPrice, pctClass, INDICES } from "@/lib/finance";
import type { Quote } from "@/lib/finance";
import Sparkline from "@/components/ui/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsList } from "@/components/news";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";

interface Props {
  onSymbol: (sym: string) => void;
  onNav?: (v: ViewMode) => void;
}

function QuoteRow({ q, onClick }: { q: Quote; onClick: () => void }) {
  const isUp = q.changePercent >= 0;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 border-b border-border/50 text-left"
      data-testid={`quote-row-${q.symbol}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-terminal text-[11px] font-bold text-cyan truncate">{q.symbol}</div>
        <div className="font-terminal text-[9px] text-muted-foreground truncate">{q.name}</div>
      </div>
      <div className="text-right">
        <div className="font-terminal text-[11px] tabular-nums text-foreground">{formatPrice(q.price)}</div>
        <div className={`font-terminal text-[9px] tabular-nums ${pctClass(q.changePercent)}`}>
          {isUp ? "▲" : "▼"}{Math.abs(q.changePercent).toFixed(2)}%
        </div>
      </div>
    </button>
  );
}

function ScorecardCell({ value, format = "price" }: { value: number; format?: "price" | "pct" | "bps" }) {
  if (format === "pct") {
    return (
      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(value)}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}%
      </span>
    );
  }
  if (format === "bps") {
    return (
      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(value)}`}>
        {value >= 0 ? "+" : ""}{(value * 100).toFixed(0)}bps
      </span>
    );
  }
  return (
    <span className="font-terminal text-[10px] tabular-nums text-foreground">
      {formatPrice(value)}
    </span>
  );
}

export default function MarketOverview({ onSymbol, onNav }: Props) {
  const indexSymbols = INDICES.map(i => i.symbol);
  const { data: indices, isLoading: idxLoad } = useQuotes(indexSymbols);
  const { data: sparklines } = useIndexSparklines();
  const { data: gainers, isLoading: gLoad } = useMarketGainers();
  const { data: losers, isLoading: lLoad } = useMarketLosers();
  const { data: active, isLoading: aLoad } = useMostActive();
  const { data: sentiment } = useMarketSentiment();
  const { data: news } = useNews();
  const { data: vixQuote } = useQuote("^VIX");
  const { data: scorecard } = useScorecard();
  const { data: breadth } = useMarketBreadth();
  const { data: credit } = useCreditSpreads();
  const { data: vixTerm } = useVixTermStructure();
  const { data: sectors } = useSectorPerformance();

  const [tab, setTab] = useState<"gainers" | "losers" | "active">("gainers");
  const tabData = tab === "gainers" ? gainers : tab === "losers" ? losers : active;
  const tabLoad = tab === "gainers" ? gLoad : tab === "losers" ? lLoad : aLoad;

  const mktStatus = getMarketStatus();
  const macroRows = scorecard?.filter(r => ["fx", "commodity", "crypto", "volatility", "rates"].includes(r.category)) ?? [];
  const sectorSorted = [...(sectors ?? [])].sort((a, b) => b.changePercent - a.changePercent);
  const avgSectorChange = sectors?.reduce((sum, s) => sum + s.changePercent, 0) ?? 0;
  const rotationSignal = sectorSorted.slice(0, 3).some(l => l.sector === "Utilities" || l.sector === "Consumer Defensive")
    ? "DEFENSIVE"
    : sectorSorted.slice(0, 3).some(l => l.sector === "Technology" || l.sector === "Consumer Cyclical")
      ? "GROWTH"
      : "MIXED";

  return (
    <div className="panel-shell">
      {/* Indices bar — full width top */}
      <div className="bg-surface-1 flex flex-col shrink-0">
        <div className="panel-header">
          <span className="panel-label">GLOBAL INDICES</span>
          <span className={`font-terminal text-[9px] font-semibold ${mktStatus.color}`}>{mktStatus.label}</span>
          <span className="font-terminal text-[9px] text-muted-foreground ml-auto">{new Date().toLocaleTimeString()}</span>
        </div>
        <div className="grid grid-cols-6 gap-px bg-border">
          {INDICES.map((idx, i) => {
            const q = indices?.[i];
            const sparkData = sparklines?.[idx.symbol];
            const isUp = (q?.changePercent ?? 0) >= 0;
            const isVix = idx.symbol === '^VIX';

            const vixColor = (p: number) =>
              p < 20 ? "hsl(142,71%,45%)" :
              p < 30 ? "hsl(186,45%,55%)" :
              "hsl(0,80%,55%)";
            const vixLabel = (p: number) =>
              p < 20 ? "LOW FEAR" :
              p < 30 ? "NORMAL" :
              p < 35 ? "ELEVATED" :
              "HIGH FEAR";
            const vixPrice = q?.price ?? 0;
            const vixGaugeColor = vixColor(vixPrice);
            const range52 = (q?.high52 ?? 80) - (q?.low52 ?? 10);
            const percentile = range52 > 0 ? ((vixPrice - (q?.low52 ?? 10)) / range52) * 100 : 50;

            const vixIsUp = (q?.changePercent ?? 0) >= 0;
            const changeColor = isVix
              ? (vixIsUp ? "text-down" : "text-up")
              : pctClass(q?.changePercent ?? 0);
            const arrowClass = isVix
              ? (vixIsUp ? "text-down" : "text-up")
              : (isUp ? "text-up" : "text-down");

            return (
              <button
                key={idx.symbol}
                onClick={() => onSymbol(idx.symbol)}
                className="bg-surface-2 hover:bg-white/5 flex flex-col justify-between px-2 py-1.5 transition-colors group min-h-0"
                data-testid={`index-${idx.symbol}`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <div className="font-terminal text-[10px] tracking-[0.06em] truncate text-foreground/70 font-medium">
                    {isVix ? "VOLATILITY" : idx.label}
                  </div>
                  <div className={`font-terminal text-[8px] shrink-0 ${arrowClass}`}>
                    {isVix ? (vixIsUp ? "▲" : "▼") : (isUp ? "▲" : "▼")}
                  </div>
                </div>

                {q ? (
                  isVix ? (
                    <div className="flex flex-col gap-0.5 flex-1 justify-center">
                      <div className="font-terminal text-sm font-bold tabular-nums leading-tight" style={{ color: vixGaugeColor }}>
                        {q.price.toFixed(2)}
                      </div>
                      <div className="w-full h-1 bg-border/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{
                          width: `${Math.min(100, Math.max(0, (vixPrice / 50) * 100))}%`,
                          background: vixGaugeColor
                        }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-terminal text-[8px] font-semibold" style={{ color: vixGaugeColor }}>{vixLabel(vixPrice)}</span>
                        <span className="font-terminal text-[7px] text-muted-foreground tabular-nums">{percentile.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`font-terminal text-[8px] tabular-nums font-semibold ${changeColor}`}>
                          {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                        </span>
                        <span className={`font-terminal text-[7px] tabular-nums ${changeColor}`}>
                          {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-terminal text-xs font-bold text-foreground tabular-nums leading-tight">
                        {formatPrice(q.price)}
                      </div>
                      {sparkData ? (
                        <div className="opacity-75 group-hover:opacity-100 transition-opacity -my-0.5">
                          <Sparkline data={sparkData} width={72} height={18} strokeWidth={1.2} />
                        </div>
                      ) : (
                        <div className="h-[18px] w-full" />
                      )}
                      <div className="flex items-center gap-1">
                        <span className={`font-terminal text-[9px] tabular-nums font-semibold ${pctClass(q.changePercent)}`}>
                          {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                        </span>
                        <span className={`font-terminal text-[8px] tabular-nums ${pctClass(q.change)}`}>
                          {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <Skeleton className="h-3 w-16 bg-border" />
                    <Skeleton className="h-[18px] w-full bg-border" />
                    <Skeleton className="h-2 w-10 bg-border" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable middle: Sectors + Internals */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-surface-1">
        {/* Sector Performance — compact */}
        {sectors && sectors.length > 0 && (
          <div className="border-b border-border">
            <div className="panel-header">
              <span className="panel-label">SECTORS</span>
              <span className={`font-terminal text-[9px] px-1.5 py-0.5 border ${
                rotationSignal === "DEFENSIVE"
                  ? "text-[hsl(0_80%_55%)] border-[hsl(0_80%_55%)]/30"
                  : rotationSignal === "GROWTH"
                    ? "text-[hsl(186_45%_55%)] border-[hsl(186_45%_55%)]/30"
                    : "text-muted-foreground border-border"
              }`}>
                {rotationSignal}
              </span>
              <span className={`font-terminal text-[9px] ${pctClass(avgSectorChange)}`}>
                AVG: {avgSectorChange >= 0 ? "+" : ""}{avgSectorChange.toFixed(2)}%
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">SECTOR</th>
                    <th className="text-right px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">1D</th>
                    <th className="text-right px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">WOW</th>
                    <th className="text-right px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">MOM</th>
                    <th className="text-right px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">YTD</th>
                    <th className="text-right px-4 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">RS</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorSorted.map((sector, i) => {
                    const isLeader = i < 3;
                    const isLaggard = i >= sectorSorted.length - 3;
                    return (
                      <tr
                        key={sector.symbol}
                        className={`border-b border-border/20 hover:bg-white/[0.02] cursor-pointer ${
                          isLeader ? "bg-[hsl(142_71%_45%/0.03)]" : isLaggard ? "bg-[hsl(0_80%_55%/0.03)]" : ""
                        }`}
                        onClick={() => onSymbol(sector.symbol)}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-terminal text-[10px] text-foreground font-medium">{sector.label}</span>
                            {isLeader && <TrendingUp className="w-3 h-3 text-up" />}
                            {isLaggard && <TrendingDown className="w-3 h-3 text-down" />}
                          </div>
                        </td>
                        <td className="text-right px-4 py-2"><ScorecardCell value={sector.changePercent} format="pct" /></td>
                        <td className="text-right px-4 py-2"><ScorecardCell value={sector.weekChange} format="pct" /></td>
                        <td className="text-right px-4 py-2"><ScorecardCell value={sector.monthChange} format="pct" /></td>
                        <td className="text-right px-4 py-2"><ScorecardCell value={sector.ytdChange} format="pct" /></td>
                        <td className="text-right px-4 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <ScorecardCell value={sector.relativeStrength} format="pct" />
                            <div className="w-12 h-1 bg-border/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${sector.relativeStrength > 0 ? "bg-up" : "bg-down"}`}
                                style={{ width: `${Math.min(100, Math.max(5, Math.abs(sector.relativeStrength) * 10 + 50))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Market Internals — 4 stat boxes */}
        {(breadth || credit || vixTerm) && (
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="panel-label">MARKET INTERNALS</span>
              {breadth && (
                <span className={`font-terminal text-[9px] ${pctClass(breadth.advanceDeclineRatio - 1)}`}>
                  A/D: {breadth.advanceDeclineRatio.toFixed(2)}
                </span>
              )}
              {credit && (
                <span className={`font-terminal text-[9px] ${credit.trend === "widening" ? "text-down" : credit.trend === "tightening" ? "text-up" : "text-muted-foreground"}`}>
                  IG: {credit.igOas.toFixed(0)}bps {credit.trend === "widening" ? "↑" : credit.trend === "tightening" ? "↓" : "→"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {breadth && (
                <div className="bg-[#080808] border border-border/30 p-2">
                  <div className="font-terminal text-[7px] text-muted-foreground tracking-wider mb-1">BREADTH</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">&gt;200 DMA</span>
                      <span className={`font-terminal text-[9px] tabular-nums ${breadth.percentAbove200dma > 60 ? "text-up" : breadth.percentAbove200dma < 40 ? "text-down" : "text-muted-foreground"}`}>
                        {breadth.percentAbove200dma.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">&gt;50 DMA</span>
                      <span className={`font-terminal text-[9px] tabular-nums ${breadth.percentAbove50dma > 60 ? "text-up" : breadth.percentAbove50dma < 40 ? "text-down" : "text-muted-foreground"}`}>
                        {breadth.percentAbove50dma.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">H/L</span>
                      <span className="font-terminal text-[9px] tabular-nums text-muted-foreground">
                        {breadth.newHighs}/{breadth.newLows}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {vixTerm && (
                <div className="bg-[#080808] border border-border/30 p-2">
                  <div className="font-terminal text-[7px] text-muted-foreground tracking-wider mb-1">VIX CURVE</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">Spot</span>
                      <span className={`font-terminal text-[9px] tabular-nums ${vixTerm.spot > 25 ? "text-down" : vixTerm.spot < 15 ? "text-up" : "text-muted-foreground"}`}>
                        {vixTerm.spot.toFixed(2)}
                      </span>
                    </div>
                    {vixTerm.vix2m != null && (
                      <div className="flex justify-between">
                        <span className="font-terminal text-[8px] text-muted-foreground">2M</span>
                        <span className="font-terminal text-[9px] tabular-nums text-muted-foreground">{vixTerm.vix2m.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">Shape</span>
                      <span className={`font-terminal text-[9px] tracking-wider ${vixTerm.curveShape === "backwardation" ? "text-down" : "text-up"}`}>
                        {vixTerm.curveShape.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {credit && (
                <div className="bg-[#080808] border border-border/30 p-2">
                  <div className="font-terminal text-[7px] text-muted-foreground tracking-wider mb-1">CREDIT</div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">IG OAS</span>
                      <span className="font-terminal text-[9px] tabular-nums text-muted-foreground">{credit.igOas.toFixed(0)}bps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">IG %ile</span>
                      <span className={`font-terminal text-[9px] tabular-nums ${credit.igOasPercentile > 80 ? "text-down" : credit.igOasPercentile < 20 ? "text-up" : "text-muted-foreground"}`}>
                        {credit.igOasPercentile.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-terminal text-[8px] text-muted-foreground">HY OAS</span>
                      <span className="font-terminal text-[9px] tabular-nums text-muted-foreground">{credit.hyOas.toFixed(0)}bps</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-[#080808] border border-border/30 p-2">
                <div className="font-terminal text-[7px] text-muted-foreground tracking-wider mb-1">SIGNALS</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-terminal text-[8px] text-muted-foreground">VIX</span>
                    <span className={`font-terminal text-[9px] tracking-wider ${vixTerm?.curveShape === "backwardation" ? "text-down" : "text-up"}`}>
                      {vixTerm?.curveShape === "backwardation" ? "FEAR" : "COMPLACENT"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[8px] text-muted-foreground">Credit</span>
                    <span className={`font-terminal text-[9px] tracking-wider ${credit?.trend === "widening" ? "text-down" : credit?.trend === "tightening" ? "text-up" : "text-muted-foreground"}`}>
                      {credit?.trend?.toUpperCase() ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[8px] text-muted-foreground">Breadth</span>
                    <span className={`font-terminal text-[9px] tracking-wider ${(breadth?.advanceDeclineRatio ?? 1) > 1.2 ? "text-up" : (breadth?.advanceDeclineRatio ?? 1) < 0.8 ? "text-down" : "text-muted-foreground"}`}>
                      {(breadth?.advanceDeclineRatio ?? 1) > 1.2 ? "STRONG" : (breadth?.advanceDeclineRatio ?? 1) < 0.8 ? "WEAK" : "NEUTRAL"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[8px] text-muted-foreground">Risk-On</span>
                    <span className="font-terminal text-[9px] tracking-wider text-muted-foreground">
                      {(breadth?.percentAbove200dma ?? 50) > 60 && (vixTerm?.spot ?? 20) < 20 ? "YES" : "NO"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex gap-px flex-1 overflow-hidden">
        {/* Movers panel */}
        <div className="w-64 bg-surface-1 flex flex-col overflow-hidden shrink-0">
          <div className="panel-header gap-0 p-0">
            {(["gainers", "losers", "active"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 font-terminal text-[9px] tracking-widest border-r border-border transition-colors ${
                  tab === t ? "bg-cyan-600/10 text-cyan" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "gainers" ? "TOP GAIN" : t === "losers" ? "TOP LOSS" : "ACTIVE"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {tabLoad
              ? Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-9 mx-2 my-1 bg-border" />)
              : (tabData ?? []).slice(0, 10).map((q: Quote) => (
                  <QuoteRow key={q.symbol} q={q} onClick={() => onSymbol(q.symbol)} />
                ))
            }
          </div>
        </div>

        {/* Sentiment — compact */}
        <div className="w-52 bg-surface-1 flex flex-col overflow-hidden shrink-0">
          <div className="panel-header">
            <span className="panel-label">FEAR & GREED</span>
          </div>
          <div className="flex-1 flex flex-col p-3 gap-2">
            {sentiment ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="font-terminal text-2xl font-bold tabular-nums leading-none" style={{
                    color: sentiment.score > 60 ? "hsl(142,71%,45%)" : sentiment.score < 40 ? "hsl(0,80%,55%)" : "hsl(186,45%,55%)"
                  }}>
                    {sentiment.score.toFixed(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-terminal text-[9px] font-semibold ${
                      sentiment.sentiment === "Bullish" ? "text-up" :
                      sentiment.sentiment === "Bearish" ? "text-down" :
                      "text-cyan"
                    }`}>{sentiment.sentiment.toUpperCase()}</span>
                    <span className="font-terminal text-[8px] text-muted-foreground">FEAR & GREED</span>
                  </div>
                  {vixQuote && vixQuote.price > 0 && (
                    <div className="ml-auto flex items-center gap-1.5 border-l border-border/40 pl-2">
                      <span className="font-terminal text-[8px] text-muted-foreground">VIX</span>
                      <Sparkline data={sparklines?.["^VIX"] ?? []} width={30} height={12} strokeWidth={1} />
                      <span className={`font-terminal text-[9px] font-bold tabular-nums ${
                        vixQuote.price < 15 ? "text-up" : vixQuote.price < 25 ? "text-cyan" : "text-down"
                      }`}>
                        {vixQuote.price.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-terminal text-[8px] text-up font-semibold w-8">{sentiment.bullish}%</span>
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden flex">
                    <div className="h-full bg-[hsl(142,71%,45%)] transition-all duration-500" style={{ width: `${sentiment.bullish}%` }} />
                    <div className="h-full bg-[hsl(0,80%,55%)] transition-all duration-500" style={{ width: `${sentiment.bearish}%` }} />
                  </div>
                  <span className="font-terminal text-[8px] text-down font-semibold w-8 text-right">{sentiment.bearish}%</span>
                </div>
              </>
            ) : (
              <Skeleton className="h-16 w-full bg-border" />
            )}
          </div>
        </div>

        {/* News */}
        <div className="flex-1 bg-surface-1 flex flex-col overflow-hidden">
          <div className="panel-header">
            <span className="panel-label">MARKET HEADLINES</span>
            <span className="font-terminal text-[9px] text-muted-foreground">LIVE</span>
          </div>
          <NewsList
            items={news ?? []}
            variant="dense"
            maxItems={10}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}

// Market status helper (imported from terminalChrome)
function getMarketStatus() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const t = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return { label: "WEEKEND", color: "text-muted-foreground" };
  if (t >= 240 && t < 570) return { label: "PRE-MARKET", color: "text-cyan" };
  if (t >= 570 && t < 960) return { label: "MARKET OPEN", color: "text-up" };
  if (t >= 960 && t < 1200) return { label: "AFTER-HOURS", color: "text-cyan" };
  return { label: "MARKET CLOSED", color: "text-muted-foreground" };
}
