import { useState } from "react";
import { useOHLCV, useQuote } from "@/lib/useFinance";
import { formatPrice, formatBig, pctClass } from "@/lib/finance";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  symbol: string;
}

const RANGES = ["1M", "3M", "6M", "1Y", "5Y"] as const;

export default function HistoricalPricesPanel({ symbol }: Props) {
  const [range, setRange] = useState<string>("1Y");
  const { data: quote } = useQuote(symbol);
  const { data: series, isLoading } = useOHLCV(symbol, range, "1d");

  const rows = series?.bars ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-[#060606] shrink-0">
        <span className="font-terminal text-[10px] text-cyan-300 tracking-wider">HISTORICAL PRICES</span>
        <div className="flex gap-1 ml-auto">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 font-terminal text-[9px] tracking-wider border transition-colors ${
                range === r
                  ? "border-cyan-600/50 text-cyan-300 bg-cyan-600/10"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {series?.status && <DataStatusBadge status={series.status} compact />}
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-6 bg-border" />)}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full text-[10px] font-terminal">
            <thead className="sticky top-0 bg-[#060606] border-b border-border">
              <tr className="text-muted-foreground">
                <th className="text-left px-3 py-1.5">DATE</th>
                <th className="text-right px-3 py-1.5">OPEN</th>
                <th className="text-right px-3 py-1.5">HIGH</th>
                <th className="text-right px-3 py-1.5">LOW</th>
                <th className="text-right px-3 py-1.5">CLOSE</th>
                <th className="text-right px-3 py-1.5">ADJ CLOSE</th>
                <th className="text-right px-3 py-1.5">VOLUME</th>
                <th className="text-right px-3 py-1.5">CHG%</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row, i) => {
                const prev = i < rows.length - 1 ? rows[rows.length - 1 - i - 1]?.close : undefined;
                const chgPct = prev && prev !== 0 ? ((row.close - prev) / prev) * 100 : undefined;

                return (
                  <tr key={row.date} className="border-b border-border/20 hover:bg-white/5">
                    <td className="px-3 py-1 text-foreground">{row.date}</td>
                    <td className="text-right px-3 py-1 tabular-nums">{formatPrice(row.open)}</td>
                    <td className="text-right px-3 py-1 tabular-nums">{formatPrice(row.high)}</td>
                    <td className="text-right px-3 py-1 tabular-nums">{formatPrice(row.low)}</td>
                    <td className="text-right px-3 py-1 tabular-nums font-bold">{formatPrice(row.close)}</td>
                    <td className="text-right px-3 py-1 tabular-nums text-muted-foreground">{formatPrice(row.close)}</td>
                    <td className="text-right px-3 py-1 tabular-nums text-muted-foreground">{formatBig(row.volume)}</td>
                    <td className={`text-right px-3 py-1 tabular-nums ${chgPct != null ? pctClass(chgPct) : "text-muted-foreground"}`}>
                      {chgPct != null ? `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">No historical data for {symbol}</td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      <div className="px-4 py-1.5 border-t border-border/50 bg-[#060606] text-[9px] text-muted-foreground font-terminal shrink-0">
        {rows.length} trading days · {range} range
      </div>
    </div>
  );
}
