import { useState } from "react";
import { useSectorPerformance } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatPct, pctClass } from "@/lib/finance";
import { LayoutGrid, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  onSymbol: (sym: string) => void;
}

type SortKey = "changePercent" | "weekChange" | "monthChange" | "ytdChange" | "relativeStrength";

export default function SectorPanel({ onSymbol }: Props) {
  const { data: sectors, isLoading } = useSectorPerformance();
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...(sectors ?? [])].sort((a, b) => {
    const mult = sortDir === "desc" ? -1 : 1;
    return (a[sortKey] - b[sortKey]) * mult;
  });

  // Calculate rotation signal
  const leaders = sorted.slice(0, 3);
  const laggards = sorted.slice(-3).reverse();
  const avgChange = sectors?.reduce((sum, s) => sum + s.changePercent, 0) ?? 0;
  const rotationSignal = leaders.some(l => l.sector === "Utilities" || l.sector === "Consumer Defensive")
    ? "DEFENSIVE"
    : leaders.some(l => l.sector === "Technology" || l.sector === "Consumer Cyclical")
      ? "GROWTH"
      : "MIXED";

  if (isLoading) {
    return (
      <div className="h-full flex flex-col gap-4 p-4 bg-[#050505]">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[hsl(186_45%_55%)]" />
          <span className="panel-label">SECTOR PERFORMANCE</span>
        </div>
        <div className="space-y-2">
          {Array(11).fill(0).map((_, i) => <Skeleton key={i} className="h-8 bg-border" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[hsl(186_45%_55%)]" />
          <span className="panel-label">SECTOR PERFORMANCE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-terminal text-[9px] px-2 py-0.5 border ${
            rotationSignal === "DEFENSIVE"
              ? "text-[hsl(0_80%_55%)] border-[hsl(0_80%_55%)]/30"
              : rotationSignal === "GROWTH"
                ? "text-[hsl(186_45%_55%)] border-[hsl(186_45%_55%)]/30"
                : "text-muted-foreground border-border"
          }`}>
            {rotationSignal} ROTATION
          </span>
          <span className={`font-terminal text-[9px] ${pctClass(avgChange)}`}>
            AVG: {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Sort buttons */}
        <div className="flex items-center gap-2 text-[9px]">
          <span className="text-muted-foreground">SORT:</span>
          {[
            { key: "changePercent" as SortKey, label: "1D" },
            { key: "weekChange" as SortKey, label: "WOW" },
            { key: "monthChange" as SortKey, label: "MOM" },
            { key: "ytdChange" as SortKey, label: "YTD" },
            { key: "relativeStrength" as SortKey, label: "RS vs SPX" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`px-2 py-1 border transition-colors ${
                sortKey === key
                  ? "text-[hsl(186_45%_55%)] border-[hsl(186_45%_55%)]/30 bg-[hsl(186_45%_50%/0.1)]"
                  : "text-muted-foreground border-border hover:border-border/60"
              }`}
            >
              {label}
              {sortKey === key && (
                <ArrowUpDown className="w-2.5 h-2.5 inline ml-1" />
              )}
            </button>
          ))}
        </div>

        {/* Sector table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">SECTOR</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">PRICE</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">1D</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">WOW</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">MOM</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">YTD</th>
                <th className="text-right py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">RS</th>
                <th className="w-24 py-1.5 font-terminal text-[8px] text-muted-foreground tracking-wider">RELATIVE</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sector, i) => {
                const isLeader = i < 3;
                const isLaggard = i >= sorted.length - 3;
                return (
                  <tr
                    key={sector.symbol}
                    className={`border-b border-border/20 hover:bg-white/[0.02] cursor-pointer ${
                      isLeader ? "bg-[hsl(142_71%_45%/0.03)]" : isLaggard ? "bg-[hsl(0_80%_55%/0.03)]" : ""
                    }`}
                    onClick={() => onSymbol(sector.symbol)}
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-terminal text-[10px] text-foreground font-medium">{sector.label}</span>
                        {isLeader && <TrendingUp className="w-3 h-3 text-up" />}
                        {isLaggard && <TrendingDown className="w-3 h-3 text-down" />}
                      </div>
                    </td>
                    <td className="text-right py-2.5">
                      <span className="font-terminal text-[10px] tabular-nums text-foreground">
                        {formatPrice(sector.price)}
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(sector.changePercent)}`}>
                        {sector.changePercent >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(sector.weekChange)}`}>
                        {sector.weekChange >= 0 ? "+" : ""}{sector.weekChange.toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(sector.monthChange)}`}>
                        {sector.monthChange >= 0 ? "+" : ""}{sector.monthChange.toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(sector.ytdChange)}`}>
                        {sector.ytdChange >= 0 ? "+" : ""}{sector.ytdChange.toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <span className={`font-terminal text-[10px] tabular-nums ${pctClass(sector.relativeStrength)}`}>
                        {sector.relativeStrength >= 0 ? "+" : ""}{sector.relativeStrength.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5">
                      {/* Relative strength bar */}
                      <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            sector.relativeStrength > 0 ? "bg-up" : "bg-down"
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(5, Math.abs(sector.relativeStrength) * 10 + 50))}%`,
                            marginLeft: sector.relativeStrength < 0 ? "auto" : undefined,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Leaders/Laggards Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#080808] border border-border/30 p-3">
            <div className="font-terminal text-[8px] text-[hsl(142_71%_45%)] tracking-wider mb-2">LEADERS</div>
            <div className="space-y-1">
              {leaders.map((l) => (
                <div key={l.symbol} className="flex justify-between">
                  <span className="font-terminal text-[9px] text-foreground">{l.label}</span>
                  <span className="font-terminal text-[9px] tabular-nums text-up">
                    +{l.changePercent.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#080808] border border-border/30 p-3">
            <div className="font-terminal text-[8px] text-[hsl(0_80%_55%)] tracking-wider mb-2">LAGGARDS</div>
            <div className="space-y-1">
              {laggards.map((l) => (
                <div key={l.symbol} className="flex justify-between">
                  <span className="font-terminal text-[9px] text-foreground">{l.label}</span>
                  <span className="font-terminal text-[9px] tabular-nums text-down">
                    {l.changePercent.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
