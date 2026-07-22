import { useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatPrice, formatPct, formatChange, formatBig, pctClass } from "@/lib/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";

interface Props { onSymbol: (sym: string) => void }

const FX_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"];

const FX_LABELS: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  USDCHF: "USD/CHF",
  AUDUSD: "AUD/USD",
  USDCAD: "USD/CAD",
  NZDUSD: "NZD/USD",
};

type SortField = "symbol" | "price" | "changePercent" | "change";
type SortDir = "asc" | "desc";

export default function FxDashboardPanel({ onSymbol }: Props) {
  const [sortField, setSortField] = useState<SortField>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: quotes, isLoading } = useQuotes(FX_PAIRS);

  const sorted = [...(quotes ?? [])]
    .filter((q) => q.price > 0)
    .sort((a: any, b: any) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th className="text-left py-2 px-3 cursor-pointer hover:text-[hsl(186,45%,55%)] select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        <span className="font-terminal text-[9px] tracking-wider">{label}</span>
        {sortField === field && (
          <span className="text-[hsl(186,45%,55%)]">{sortDir === "desc" ? "▼" : "▲"}</span>
        )}
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
        <div className="p-4 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 bg-border" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="panel-label">MAJOR FX PAIRS</span>
          <span className="ml-auto font-terminal text-[9px] text-muted-foreground">{sorted.length} PAIRS</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#070707] border-b border-border z-10">
            <tr className="text-muted-foreground">
              <SortHeader field="symbol" label="PAIR" />
              <SortHeader field="price" label="RATE" />
              <SortHeader field="change" label="CHG" />
              <SortHeader field="changePercent" label="CHG%" />
              <th className="text-left py-2 px-3 font-terminal text-[9px] tracking-wider text-muted-foreground">NAME</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((q) => {
              const changeClass = pctClass(q.changePercent);
              return (
                <tr
                  key={q.symbol}
                  onClick={() => onSymbol(q.symbol)}
                  className="border-b border-border/50 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-2 px-3 font-terminal text-[11px] font-bold text-[hsl(186,45%,55%)]">{q.symbol}</td>
                  <td className="py-2 px-3 font-terminal text-[11px] tabular-nums font-bold">{formatPrice(q.price)}</td>
                  <td className={`py-2 px-3 font-terminal text-[11px] tabular-nums font-semibold ${changeClass}`}>{formatChange(q.change)}</td>
                  <td className={`py-2 px-3 font-terminal text-[11px] tabular-nums font-semibold ${changeClass}`}>{formatPct(q.changePercent)}</td>
                  <td className="py-2 px-3 font-terminal text-[10px] text-muted-foreground">{FX_LABELS[q.symbol] ?? q.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-border/30 px-4 py-1.5 text-[9px] text-muted-foreground font-terminal">
        Data via Stooq &middot; 15-min delayed
      </div>
    </div>
  );
}
