import { useMemo } from "react";
import { useFundamentals } from "@/lib/useFinance";
import { formatPrice } from "@/lib/finance";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  symbol: string;
}

export default function DividendsPanel({ symbol }: Props) {
  const { data: fundamentals, isLoading } = useFundamentals(symbol);
  const dividends = fundamentals?.dividends ?? [];

  const annualTotals = useMemo(() => {
    const byYear: Record<string, number> = {};
    for (const d of dividends) {
      const year = d.ex_dividend_date?.slice(0, 4);
      if (year) byYear[year] = (byYear[year] ?? 0) + d.amount;
    }
    return Object.entries(byYear)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, total]) => ({ year, total }));
  }, [dividends]);

  if (isLoading) {
    return <div className="p-6 space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-6 bg-border" />)}</div>;
  }

  if (!dividends.length) {
    return <div className="p-6 font-terminal text-muted-foreground text-sm">No dividend data for {symbol}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-[#060606] shrink-0">
        <span className="font-terminal text-[10px] text-cyan-300 tracking-wider">DIVIDEND HISTORY</span>
        <span className="text-lg font-bold text-cyan-300 tracking-widest font-terminal">{symbol}</span>
        {fundamentals?.status && <DataStatusBadge status={fundamentals.status} compact />}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Historical payments */}
        <ScrollArea className="flex-1 border-r border-border/50">
          <div className="px-4 py-2 border-b border-border bg-[#070707]">
            <span className="font-terminal text-[9px] text-muted-foreground tracking-wider">ALL PAYMENTS</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] px-4 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
            <span>EX-DATE</span>
            <span className="text-right">AMOUNT</span>
          </div>
          {[...dividends].reverse().map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] px-4 py-1.5 border-b border-border/20 hover:bg-white/5">
              <span className="font-terminal text-[10px] text-foreground">{d.ex_dividend_date}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right text-green-400">{formatPrice(d.amount)}</span>
            </div>
          ))}
        </ScrollArea>

        {/* Annual totals */}
        <ScrollArea className="w-48">
          <div className="px-4 py-2 border-b border-border bg-[#070707]">
            <span className="font-terminal text-[9px] text-muted-foreground tracking-wider">ANNUAL TOTALS</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] px-4 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
            <span>YEAR</span>
            <span className="text-right">TOTAL</span>
          </div>
          {annualTotals.map(({ year, total }) => (
            <div key={year} className="grid grid-cols-[1fr_auto] px-4 py-1.5 border-b border-border/20 hover:bg-white/5">
              <span className="font-terminal text-[10px] text-foreground">{year}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right text-cyan-300">{formatPrice(total)}</span>
            </div>
          ))}
        </ScrollArea>
      </div>
    </div>
  );
}
