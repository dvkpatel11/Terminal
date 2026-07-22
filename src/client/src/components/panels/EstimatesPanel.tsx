import { useQuote, useFundamentals } from "@/lib/useFinance";
import { formatPrice, formatPct } from "@/lib/finance";
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

const REC_COLORS: Record<string, string> = {
  "Strong Buy": "text-green-400",
  "Buy": "text-green-300",
  "Hold": "text-cyan-300",
  "Underperform": "text-orange-400",
  "Sell": "text-red-400",
};

export default function EstimatesPanel({ symbol }: Props) {
  const { data: quote } = useQuote(symbol);
  const { data: fundamentals, isLoading } = useFundamentals(symbol);
  const c = fundamentals?.consensus;
  const price = quote?.price ?? c?.current_price ?? 0;

  if (isLoading) {
    return <div className="p-6 space-y-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-6 bg-border" />)}</div>;
  }

  if (!c) {
    return <div className="p-6 font-terminal text-muted-foreground text-sm">No analyst estimates for {symbol}</div>;
  }

  const upside = c.target_consensus != null && price > 0 ? ((c.target_consensus - price) / price) * 100 : null;
  const meanScore = c.recommendation_mean != null ? c.recommendation_mean.toFixed(1) : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-[#060606] shrink-0">
        <span className="font-terminal text-[10px] text-cyan-300 tracking-wider">ANALYST ESTIMATES</span>
        <span className="text-lg font-bold text-cyan-300 tracking-widest font-terminal">{symbol}</span>
        {fundamentals?.status && <DataStatusBadge status={fundamentals.status} compact />}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 max-w-2xl">
          {/* Consensus Recommendation */}
          <div className="mb-6">
            <div className="font-terminal text-[9px] text-cyan-300/70 tracking-wider mb-2 border-b border-border/40 pb-1">CONSENSUS</div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className={`text-2xl font-bold font-terminal ${REC_COLORS[c.recommendation ?? ""] ?? "text-foreground"}`}>
                {c.recommendation ?? "N/A"}
              </span>
              {meanScore && (
                <span className="font-terminal text-[11px] text-muted-foreground">({meanScore}/5.0)</span>
              )}
              <span className="font-terminal text-[9px] text-muted-foreground">
                {c.number_of_analysts ?? "—"} analysts
              </span>
            </div>
          </div>

          {/* Target Prices */}
          <div className="mb-6">
            <div className="font-terminal text-[9px] text-cyan-300/70 tracking-wider mb-2 border-b border-border/40 pb-1">PRICE TARGETS</div>
            <div className="grid grid-cols-2 gap-x-8 mt-2">
              <div>
                <KV label="CURRENT PRICE" value={formatPrice(price)} />
                <KV label="CONSENSUS" value={<span className="text-cyan-300">{formatPrice(c.target_consensus ?? 0)}</span>} />
                <KV label="MEDIAN" value={formatPrice(c.target_median ?? 0)} />
              </div>
              <div>
                <KV label="HIGH" value={<span className="text-green-400">{formatPrice(c.target_high ?? 0)}</span>} />
                <KV label="LOW" value={<span className="text-red-400">{formatPrice(c.target_low ?? 0)}</span>} />
                {upside != null && (
                  <KV label="IMPLIED UPSIDE" value={upside >= 0 ? `+${upside.toFixed(1)}%` : `${upside.toFixed(1)}%`} valueClass={upside >= 0 ? "text-green-400" : "text-red-400"} />
                )}
              </div>
            </div>
          </div>

          {/* Target Range Bar */}
          {c.target_high != null && c.target_low != null && c.target_low !== c.target_high && (
            <div className="mb-6">
              <div className="font-terminal text-[9px] text-cyan-300/70 tracking-wider mb-2 border-b border-border/40 pb-1">TARGET RANGE</div>
              <div className="flex items-center gap-2 text-[10px] font-terminal">
                <span className="text-red-400 w-14 text-right">{formatPrice(c.target_low)}</span>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden relative">
                  <div className="absolute h-full bg-cyan-600/30 rounded-full" style={{
                    left: `${((c.target_low - c.target_low) / (c.target_high - c.target_low)) * 100}%`,
                    width: `${((c.target_high - c.target_low) / (c.target_high - c.target_low)) * 100}%`,
                  }} />
                  {c.target_consensus != null && (
                    <div className="absolute h-4 w-0.5 bg-amber-400 -top-1" style={{
                      left: `${((c.target_consensus - c.target_low) / (c.target_high - c.target_low)) * 100}%`,
                    }} />
                  )}
                  {price > 0 && (
                    <div className="absolute h-4 w-0.5 bg-foreground -top-1" style={{
                      left: `${Math.min(100, Math.max(0, ((price - c.target_low) / (c.target_high - c.target_low)) * 100))}%`,
                    }} />
                  )}
                </div>
                <span className="text-green-400 w-14">{formatPrice(c.target_high)}</span>
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground font-terminal mt-1">
                <span>LOW</span>
                <span className="text-cyan-300">● CONSENSUS</span>
                <span>HIGH</span>
              </div>
            </div>
          )}

          {/* Details */}
          <div>
            <div className="font-terminal text-[9px] text-cyan-300/70 tracking-wider mb-2 border-b border-border/40 pb-1">DETAILS</div>
            {c.target_consensus != null && price > 0 && (
              <KV label="UPSIDE TO CONSENSUS" value={`${upside! >= 0 ? "+" : ""}${upside!.toFixed(1)}%`} valueClass={upside! >= 0 ? "text-green-400" : "text-red-400"} />
            )}
            <KV label="RECOMMENDATION SCORE" value={meanScore ? `${meanScore}/5.0` : "—"} />
            <KV label="ANALYST COVERAGE" value={`${c.number_of_analysts ?? "—"} analysts`} />
            {c.currency && <KV label="CURRENCY" value={c.currency} />}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
