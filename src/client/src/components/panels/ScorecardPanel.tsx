import { useScorecard, useMarketBreadth, useCreditSpreads, useVixTermStructure } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatPct, pctClass } from "@/lib/finance";
import { TrendingUp, TrendingDown, Minus, Activity, BarChart3, AlertTriangle } from "lucide-react";

interface Props {
  onSymbol: (sym: string) => void;
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

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    equity: "text-[hsl(186_45%_55%)] border-[hsl(186_45%_55%)]/30",
    fx: "text-[hsl(38_45%_55%)] border-[hsl(38_45%_55%)]/30",
    commodity: "text-[hsl(265_45%_55%)] border-[hsl(265_45%_55%)]/30",
    crypto: "text-[hsl(186_45%_55%)] border-[hsl(186_45%_55%)]/30",
    volatility: "text-[hsl(0_80%_55%)] border-[hsl(0_80%_55%)]/30",
    rates: "text-amber-400 border-amber-400/30",
  };
  return (
    <span className={`text-[7px] px-1 py-0.5 border ${colors[category] ?? "text-muted-foreground border-border"}`}>
      {category.toUpperCase()}
    </span>
  );
}

export default function ScorecardPanel({ onSymbol }: Props) {
  const { data: scorecard, isLoading: scorecardLoading } = useScorecard();
  const { data: breadth } = useMarketBreadth();
  const { data: credit } = useCreditSpreads();
  const { data: vixTerm } = useVixTermStructure();

  if (scorecardLoading) {
    return (
      <div className="h-full flex flex-col gap-4 p-4 bg-[#050505]">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[hsl(186_45%_55%)]" />
          <span className="panel-label">MARKET SCORECARD</span>
        </div>
        <div className="space-y-2">
          {Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-8 bg-border" />)}
        </div>
      </div>
    );
  }

  const equityRows = scorecard?.filter(r => r.category === "equity") ?? [];
  const macroRows = scorecard?.filter(r => ["fx", "commodity", "crypto", "volatility", "rates"].includes(r.category)) ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[hsl(186_45%_55%)]" />
          <span className="panel-label">MARKET SCORECARD</span>
        </div>
        <div className="flex items-center gap-3">
          {breadth && (
            <div className="flex items-center gap-1.5 text-[9px]">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className={pctClass(breadth.advanceDeclineRatio - 1)}>
                A/D: {breadth.advanceDeclineRatio.toFixed(2)}
              </span>
            </div>
          )}
          {credit && (
            <div className="flex items-center gap-1.5 text-[9px]">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
              <span className={credit.trend === "widening" ? "text-down" : credit.trend === "tightening" ? "text-up" : "text-muted-foreground"}>
                IG: {credit.igOas.toFixed(0)}bps {credit.trend === "widening" ? "↑" : credit.trend === "tightening" ? "↓" : "→"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        {/* Equity Indices */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-terminal text-[10px] text-muted-foreground tracking-wider">EQUITY INDICES</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">INDEX</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">LEVEL</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">1D</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">WOW</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">MOM</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">YTD</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">52W%</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">LEVELS</th>
                </tr>
              </thead>
              <tbody>
                {equityRows.map((row) => (
                  <tr
                    key={row.symbol}
                    className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => onSymbol(row.symbol)}
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-terminal text-[10px] text-foreground font-medium">{row.label}</span>
                        <CategoryBadge category={row.category} />
                      </div>
                    </td>
                    <td className="text-right py-2">
                      <span className="font-terminal text-[11px] tabular-nums text-foreground font-medium">
                        {formatPrice(row.price)}
                      </span>
                    </td>
                    <td className="text-right py-2"><ScorecardCell value={row.changePercent} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.weekChange} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.monthChange} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.ytdChange} format="pct" /></td>
                    <td className="text-right py-2">
                      <span className={`font-terminal text-[10px] tabular-nums ${row.high52Pct > -5 ? "text-up" : row.high52Pct < -15 ? "text-down" : "text-muted-foreground"}`}>
                        {row.high52Pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-2">
                      <span className="font-terminal text-[9px] text-muted-foreground">{row.keyLevel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Macro Assets */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-terminal text-[10px] text-muted-foreground tracking-wider">MACRO & RATES</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">ASSET</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">LEVEL</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">1D</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">WOW</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">MOM</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">YTD</th>
                  <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">52W%</th>
                </tr>
              </thead>
              <tbody>
                {macroRows.map((row) => (
                  <tr
                    key={row.symbol}
                    className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => onSymbol(row.symbol)}
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-terminal text-[10px] text-foreground font-medium">{row.label}</span>
                        <CategoryBadge category={row.category} />
                      </div>
                    </td>
                    <td className="text-right py-2">
                      <span className="font-terminal text-[11px] tabular-nums text-foreground font-medium">
                        {row.category === "rates" ? `${row.price.toFixed(2)}%` : formatPrice(row.price)}
                      </span>
                    </td>
                    <td className="text-right py-2"><ScorecardCell value={row.changePercent} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.weekChange} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.monthChange} format="pct" /></td>
                    <td className="text-right py-2"><ScorecardCell value={row.ytdChange} format="pct" /></td>
                    <td className="text-right py-2">
                      <span className={`font-terminal text-[10px] tabular-nums ${row.high52Pct > -5 ? "text-up" : row.high52Pct < -15 ? "text-down" : "text-muted-foreground"}`}>
                        {row.high52Pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Market Internals */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-terminal text-[10px] text-muted-foreground tracking-wider">MARKET INTERNALS</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {/* Breadth */}
            {breadth && (
              <div className="bg-[#080808] border border-border/30 p-3">
                <div className="font-terminal text-[8px] text-muted-foreground tracking-wider mb-2">BREADTH</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">A/D Ratio</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${pctClass(breadth.advanceDeclineRatio - 1)}`}>
                      {breadth.advanceDeclineRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">&gt;200 DMA</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${breadth.percentAbove200dma > 60 ? "text-up" : breadth.percentAbove200dma < 40 ? "text-down" : "text-muted-foreground"}`}>
                      {breadth.percentAbove200dma.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">&gt;50 DMA</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${breadth.percentAbove50dma > 60 ? "text-up" : breadth.percentAbove50dma < 40 ? "text-down" : "text-muted-foreground"}`}>
                      {breadth.percentAbove50dma.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">New H/L</span>
                    <span className="font-terminal text-[10px] tabular-nums text-muted-foreground">
                      {breadth.newHighs}/{breadth.newLows}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* VIX Term */}
            {vixTerm && (
              <div className="bg-[#080808] border border-border/30 p-3">
                <div className="font-terminal text-[8px] text-muted-foreground tracking-wider mb-2">VIX CURVE</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">Spot</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${vixTerm.spot > 25 ? "text-down" : vixTerm.spot < 15 ? "text-up" : "text-muted-foreground"}`}>
                      {vixTerm.spot.toFixed(2)}
                    </span>
                  </div>
                  {vixTerm.vix2m != null && (
                    <div className="flex justify-between">
                      <span className="font-terminal text-[9px] text-muted-foreground">2M</span>
                      <span className="font-terminal text-[10px] tabular-nums text-muted-foreground">
                        {vixTerm.vix2m.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {vixTerm.vix3m != null && (
                    <div className="flex justify-between">
                      <span className="font-terminal text-[9px] text-muted-foreground">3M</span>
                      <span className="font-terminal text-[10px] tabular-nums text-muted-foreground">
                        {vixTerm.vix3m.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">Shape</span>
                    <span className={`font-terminal text-[10px] tracking-wider ${vixTerm.curveShape === "backwardation" ? "text-down" : "text-up"}`}>
                      {vixTerm.curveShape.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Credit */}
            {credit && (
              <div className="bg-[#080808] border border-border/30 p-3">
                <div className="font-terminal text-[8px] text-muted-foreground tracking-wider mb-2">CREDIT SPREADS</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">IG OAS</span>
                    <span className="font-terminal text-[10px] tabular-nums text-muted-foreground">
                      {credit.igOas.toFixed(0)}bps
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">IG %ile</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${credit.igOasPercentile > 80 ? "text-down" : credit.igOasPercentile < 20 ? "text-up" : "text-muted-foreground"}`}>
                      {credit.igOasPercentile.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">HY OAS</span>
                    <span className="font-terminal text-[10px] tabular-nums text-muted-foreground">
                      {credit.hyOas.toFixed(0)}bps
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-terminal text-[9px] text-muted-foreground">HY %ile</span>
                    <span className={`font-terminal text-[10px] tabular-nums ${credit.hyOasPercentile > 80 ? "text-down" : credit.hyOasPercentile < 20 ? "text-up" : "text-muted-foreground"}`}>
                      {credit.hyOasPercentile.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="bg-[#080808] border border-border/30 p-3">
              <div className="font-terminal text-[8px] text-muted-foreground tracking-wider mb-2">QUICK STATS</div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-terminal text-[9px] text-muted-foreground">VIX Trend</span>
                  <span className={`font-terminal text-[10px] tracking-wider ${vixTerm?.curveShape === "backwardation" ? "text-down" : "text-up"}`}>
                    {vixTerm?.curveShape === "backwardation" ? "FEAR" : "COMPLACENT"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-terminal text-[9px] text-muted-foreground">Credit</span>
                  <span className={`font-terminal text-[10px] tracking-wider ${credit?.trend === "widening" ? "text-down" : credit?.trend === "tightening" ? "text-up" : "text-muted-foreground"}`}>
                    {credit?.trend?.toUpperCase() ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-terminal text-[9px] text-muted-foreground">Breadth</span>
                  <span className={`font-terminal text-[10px] tracking-wider ${(breadth?.advanceDeclineRatio ?? 1) > 1.2 ? "text-up" : (breadth?.advanceDeclineRatio ?? 1) < 0.8 ? "text-down" : "text-muted-foreground"}`}>
                    {(breadth?.advanceDeclineRatio ?? 1) > 1.2 ? "STRONG" : (breadth?.advanceDeclineRatio ?? 1) < 0.8 ? "WEAK" : "NEUTRAL"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-terminal text-[9px] text-muted-foreground">Risk-On</span>
                  <span className="font-terminal text-[10px] tracking-wider text-muted-foreground">
                    {(breadth?.percentAbove200dma ?? 50) > 60 && (vixTerm?.spot ?? 20) < 20 ? "YES" : "NO"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
