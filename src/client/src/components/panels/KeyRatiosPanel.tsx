import { useFundamentals } from "@/lib/useFinance";
import { formatPrice, formatBig, formatPct } from "@/lib/finance";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  symbol: string;
}

function KV({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/20">
      <span className="font-terminal text-[9px] text-muted-foreground tracking-wider">{label}</span>
      <span className={`font-terminal text-[11px] tabular-nums text-right ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="font-terminal text-[9px] text-cyan-300/70 tracking-wider mb-2 border-b border-border/40 pb-1">{title}</div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function formatPctFromDecimal(n?: number, decimals = 2): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

export default function KeyRatiosPanel({ symbol }: Props) {
  const { data: fundamentals, isLoading } = useFundamentals(symbol);
  const m = fundamentals?.metrics;

  if (isLoading) {
    return <div className="p-6 space-y-3">{Array(12).fill(0).map((_, i) => <Skeleton key={i} className="h-6 bg-border" />)}</div>;
  }

  if (!m) {
    return <div className="p-6 font-terminal text-muted-foreground text-sm">No metrics data for {symbol}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-[#060606] shrink-0">
        <span className="font-terminal text-[10px] text-cyan-300 tracking-wider">KEY RATIOS & METRICS</span>
        <span className="text-lg font-bold text-cyan-300 tracking-widest font-terminal">{symbol}</span>
        {fundamentals?.status && <DataStatusBadge status={fundamentals.status} compact />}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 grid grid-cols-2 gap-x-8 max-w-2xl">
          {/* Valuation */}
          <Section title="VALUATION">
            <KV label="P/E" value={m.pe_ratio != null ? m.pe_ratio.toFixed(2) : "—"} />
            <KV label="FORWARD P/E" value={m.forward_pe != null ? m.forward_pe.toFixed(2) : "—"} />
            <KV label="PEG RATIO" value={m.peg_ratio != null ? m.peg_ratio.toFixed(2) : "—"} />
            <KV label="EV/EBITDA" value={m.enterprise_to_ebitda != null ? m.enterprise_to_ebitda.toFixed(2) : "—"} />
            <KV label="P/B" value={m.price_to_book != null ? m.price_to_book.toFixed(2) : "—"} />
            <KV label="BOOK VALUE" value={m.book_value != null ? formatPrice(m.book_value) : "—"} />
            <KV label="ENTERPRISE VALUE" value={formatBig(m.enterprise_value)} />
          </Section>

          {/* Growth */}
          <Section title="GROWTH">
            <KV label="REVENUE GROWTH" value={formatPctFromDecimal(m.revenue_growth)} valueClass={m.revenue_growth != null && m.revenue_growth >= 0 ? "text-green-400" : "text-red-400"} />
            <KV label="EARNINGS GROWTH" value={formatPctFromDecimal(m.earnings_growth)} valueClass={m.earnings_growth != null && m.earnings_growth >= 0 ? "text-green-400" : "text-red-400"} />
          </Section>

          {/* Profitability */}
          <Section title="PROFITABILITY">
            <KV label="GROSS MARGIN" value={formatPctFromDecimal(m.gross_margin)} />
            <KV label="OPERATING MARGIN" value={formatPctFromDecimal(m.operating_margin)} />
            <KV label="PROFIT MARGIN" value={formatPctFromDecimal(m.profit_margin)} />
            <KV label="ROA" value={formatPctFromDecimal(m.return_on_assets)} />
            <KV label="ROE" value={formatPctFromDecimal(m.return_on_equity)} />
          </Section>

          {/* Balance Sheet */}
          <Section title="BALANCE SHEET">
            <KV label="CURRENT RATIO" value={m.current_ratio != null ? m.current_ratio.toFixed(2) : "—"} />
            <KV label="QUICK RATIO" value={m.quick_ratio != null ? m.quick_ratio.toFixed(2) : "—"} />
            <KV label="D/E" value={m.debt_to_equity != null ? m.debt_to_equity.toFixed(2) : "—"} />
          </Section>

          {/* Dividend */}
          <Section title="DIVIDEND">
            <KV label="DIVIDEND YIELD" value={formatPctFromDecimal(m.dividend_yield)} />
            <KV label="PAYOUT RATIO" value={formatPctFromDecimal(m.payout_ratio)} />
          </Section>

          {/* Scale */}
          <Section title="SCALE">
            <KV label="MARKET CAP" value={formatBig(m.market_cap)} />
            <KV label="BETA" value={m.beta != null ? m.beta.toFixed(2) : "—"} />
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}
