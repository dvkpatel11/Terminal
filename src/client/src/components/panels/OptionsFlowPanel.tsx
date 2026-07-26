import { useState, useMemo } from "react";
import { useOptionsFlow } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { CandlestickChart, TrendingUp, TrendingDown, AlertTriangle, ArrowUpDown, ArrowDownUp } from "lucide-react";

interface Props {
  symbol?: string;
  onSymbol?: (s: string) => void;
}

function StatBox({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="text-center">
      <div className="font-terminal text-[9px] text-muted-foreground tracking-wider">{label}</div>
      <div className={`font-terminal text-lg font-bold tabular-nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function ratioClass(ratio: number): string {
  if (ratio < 0.4) return "text-up";
  if (ratio > 0.6) return "text-down";
  return "text-[hsl(186,45%,55%)]";
}

function formatPremium(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

type SortKey = "vOiRatio" | "volume" | "premium" | "strike";

export default function OptionsFlowPanel({ symbol, onSymbol }: Props) {
  const { data, isLoading } = useOptionsFlow(symbol);
  const summary = data?.summary;
  const activity = data?.activity ?? [];

  const [typeFilter, setTypeFilter] = useState<"all" | "call" | "put">("all");
  const [sortKey, setSortKey] = useState<SortKey>("vOiRatio");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let items = activity;
    if (typeFilter !== "all") items = items.filter(i => i.optionType === typeFilter);
    const mult = sortDir === "desc" ? -1 : 1;
    return [...items].sort((a, b) => (a[sortKey] - b[sortKey]) * mult);
  }, [activity, typeFilter, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48 bg-border" />
        <div className="grid grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-border" />)}
        </div>
        <Skeleton className="h-64 w-full bg-border" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border bg-[#060606] px-5 py-3">
        <div className="flex items-center gap-2">
          <CandlestickChart className="w-4 h-4 text-[hsl(186,45%,55%)]" />
          <span className="font-terminal text-xs font-bold tracking-wider text-foreground">OPTIONS FLOW</span>
          {symbol && (
            <span className="font-terminal text-[10px] text-[hsl(186,45%,55%)] border border-[hsl(186,45%,55%)]/30 px-1.5 py-0.5">{symbol}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Source indicator */}
        {data?.source && (
          <div className="px-5 py-1.5 bg-[#040404] border-b border-border/50 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-muted-foreground" />
            <span className="font-terminal text-[8px] text-muted-foreground tracking-wider">
              {data.source === 'unavailable' ? 'NO LIVE OPTIONS FEED AVAILABLE' : data.source === 'stale' ? `SOURCE: CBOE (PRIOR DAY)` : `SOURCE: ${data.source.toUpperCase()}`}
            </span>
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-border bg-[#060606]">
            <StatBox label="PUT/CALL RATIO" value={summary.putCallRatio.toFixed(2)} cls={ratioClass(summary.putCallRatio)} />
            <StatBox label="TOTAL VOLUME" value={(summary.totalVolume / 1e6).toFixed(1) + "M"} />
            <StatBox label="CALL VOLUME" value={(summary.callVolume / 1e6).toFixed(1) + "M"} cls="text-up" />
            <StatBox label="PUT VOLUME" value={(summary.putVolume / 1e6).toFixed(1) + "M"} cls="text-down" />
          </div>
        )}

        {/* Filters + Sort bar */}
        <div className="px-5 py-2 bg-[#040404] border-b border-border flex items-center gap-3">
          <div className="flex items-center gap-1">
            {(["all", "call", "put"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`font-terminal text-[8px] px-2 py-1 border transition-colors ${
                  typeFilter === t
                    ? t === "call" ? "text-up border-up/30 bg-up/10"
                      : t === "put" ? "text-down border-down/30 bg-down/10"
                      : "text-[hsl(186,45%,55%)] border-[hsl(186,45%,55%)]/30 bg-[hsl(186,45%,50%)/0.1]"
                    : "text-muted-foreground border-border hover:border-border/60"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-border/50" />
          <div className="flex items-center gap-1">
            <span className="font-terminal text-[8px] text-muted-foreground">SORT:</span>
            {([
              { key: "vOiRatio" as SortKey, label: "V/OI" },
              { key: "volume" as SortKey, label: "VOL" },
              { key: "premium" as SortKey, label: "$" },
              { key: "strike" as SortKey, label: "STRIKE" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`font-terminal text-[8px] px-1.5 py-0.5 border transition-colors ${
                  sortKey === key
                    ? "text-[hsl(186,45%,55%)] border-[hsl(186,45%,55%)]/30 bg-[hsl(186,45%,50%)/0.1]"
                    : "text-muted-foreground border-border hover:border-border/60"
                }`}
              >
                {label}
                {sortKey === key && <ArrowUpDown className="w-2 h-2 inline ml-0.5" />}
              </button>
            ))}
          </div>
          <span className="ml-auto font-terminal text-[8px] text-muted-foreground">{filtered.length} contracts</span>
        </div>

        {/* Activity table */}
        <div className="border-b border-border">
          <div className="grid grid-cols-[1fr_60px_80px_70px_70px_70px_80px] gap-2 px-5 py-1.5 bg-[#040404] font-terminal text-[8px] text-muted-foreground tracking-wider border-b border-border/50">
            <span>SYMBOL</span>
            <span className="text-right">TYPE</span>
            <span className="text-right">STRIKE</span>
            <span className="text-right">VOLUME</span>
            <span className="text-right">O.I.</span>
            <span className="text-right">V/OI</span>
            <span className="text-right">PREMIUM</span>
          </div>
          <div className="divide-y divide-border/50">
            {filtered.slice(0, 20).map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_80px_70px_70px_70px_80px] gap-2 px-5 py-2 hover:bg-white/[0.02] items-center">
                <div className="flex items-center gap-1.5 min-w-0">
                  {onSymbol ? (
                    <button onClick={() => onSymbol(item.symbol)} className="font-terminal text-[10px] font-bold text-[hsl(186,45%,55%)] hover:underline truncate">{item.symbol}</button>
                  ) : (
                    <span className="font-terminal text-[10px] font-bold text-[hsl(186,45%,55%)] truncate">{item.symbol}</span>
                  )}
                  {item.sentiment === 'bullish' ? (
                    <TrendingUp className="w-3 h-3 text-up" />
                  ) : item.sentiment === 'bearish' ? (
                    <TrendingDown className="w-3 h-3 text-down" />
                  ) : null}
                </div>
                <span className={`font-terminal text-[10px] tabular-nums text-right ${item.optionType === 'call' ? 'text-up' : 'text-down'}`}>
                  {item.optionType.toUpperCase()}
                </span>
                <span className="font-terminal text-[10px] tabular-nums text-right text-foreground">${item.strike.toFixed(1)}</span>
                <span className="font-terminal text-[10px] tabular-nums text-right text-foreground">{item.volume.toLocaleString()}</span>
                <span className="font-terminal text-[10px] tabular-nums text-right text-muted-foreground">{item.openInterest.toLocaleString()}</span>
                <span className="font-terminal text-[10px] tabular-nums text-right text-[hsl(186,45%,55%)]">{item.vOiRatio.toFixed(1)}x</span>
                <span className="font-terminal text-[10px] tabular-nums text-right text-amber-400">{formatPremium(item.premium)}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center">
                <div className="font-terminal text-xs text-muted-foreground">
                  {activity.length === 0
                    ? (data?.source === 'unavailable' ? 'Live options data unavailable' : 'No unusual activity detected')
                    : `No ${typeFilter} activity found`
                  }
                </div>
                <div className="font-terminal text-[9px] text-muted-foreground/60 mt-1">
                  {activity.length === 0 ? 'Monitoring for high V/OI ratios' : 'Try adjusting filters'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
