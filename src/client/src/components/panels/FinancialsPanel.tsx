import { useFundamentals } from "@/lib/useFinance";
import { formatBig } from "@/lib/finance";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  symbol: string;
}

export default function FinancialsPanel({ symbol }: Props) {
  const { data: fundamentals, isLoading } = useFundamentals(symbol);
  const income = fundamentals?.incomeStatement ?? [];

  if (isLoading) {
    return <div className="p-6 space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-6 bg-border" />)}</div>;
  }

  if (!income.length) {
    return <div className="p-6 font-terminal text-muted-foreground text-sm">No financial data for {symbol}</div>;
  }

  const sorted = [...income].sort((a, b) => (a.period_ending > b.period_ending ? 1 : -1));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-[#060606] shrink-0">
        <span className="font-terminal text-[10px] text-cyan-300 tracking-wider">INCOME STATEMENT</span>
        <span className="text-lg font-bold text-cyan-300 tracking-widest font-terminal">{symbol}</span>
        {fundamentals?.status && <DataStatusBadge status={fundamentals.status} compact />}
      </div>

      <ScrollArea className="flex-1">
        <table className="w-full text-[10px] font-terminal">
          <thead className="sticky top-0 bg-[#060606] border-b border-border">
            <tr className="text-muted-foreground">
              <th className="text-left px-3 py-1.5">METRIC</th>
              {sorted.map((row) => (
                <th key={row.period_ending} className="text-right px-3 py-1.5">{row.period_ending}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "TOTAL REVENUE", key: "total_revenue" as const, highlight: true },
              { label: "COST OF REVENUE", key: "cost_of_revenue" as const },
              { label: "GROSS PROFIT", key: "gross_profit" as const, highlight: true },
              { label: "OPERATING INCOME", key: "operating_income" as const, highlight: true },
              { label: "NET INCOME", key: "net_income" as const, highlight: true },
              { label: "EPS (BASIC)", key: "basic_earnings_per_share" as const },
            ].map(({ label, key, highlight }) => (
              <tr key={key} className={`border-b border-border/20 ${highlight ? "bg-cyan-600/5" : ""} hover:bg-white/5`}>
                <td className={`px-3 py-1.5 ${highlight ? "text-foreground font-bold" : "text-muted-foreground"}`}>{label}</td>
                {sorted.map((row) => (
                  <td key={row.period_ending} className="text-right px-3 py-1.5 tabular-nums">
                    {row[key] != null ? formatBig(row[key]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
