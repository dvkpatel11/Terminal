import { useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatBig, formatPrice, formatPct, formatChange, pctClass } from "@/lib/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";

interface Props { onSymbol: (sym: string) => void }

const CRYPTO_SYMBOLS = [
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD",
  "ADA-USD", "DOGE-USD", "DOT-USD", "LINK-USD",
  "AVAX-USD", "MATIC-USD", "UNI-USD", "LTC-USD",
];

const CRYPTO_LABELS: Record<string, string> = {
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "SOL-USD": "Solana",
  "XRP-USD": "XRP",
  "ADA-USD": "Cardano",
  "DOGE-USD": "Dogecoin",
  "DOT-USD": "Polkadot",
  "LINK-USD": "Chainlink",
  "AVAX-USD": "Avalanche",
  "MATIC-USD": "Polygon",
  "UNI-USD": "Uniswap",
  "LTC-USD": "Litecoin",
};

type SortField = "symbol" | "price" | "changePercent" | "marketCap" | "volume";
type SortDir = "asc" | "desc";

export default function CryptoPanel({ onSymbol }: Props) {
  const [sortField, setSortField] = useState<SortField>("marketCap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: quotes, isLoading } = useQuotes(CRYPTO_SYMBOLS);

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
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 bg-border" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-2 px-4 py-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="panel-label">CRYPTOCURRENCIES</span>
          <span className="ml-auto font-terminal text-[9px] text-muted-foreground">{sorted.length} COINS</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#070707] border-b border-border z-10">
            <tr className="text-muted-foreground">
              <SortHeader field="symbol" label="ASSET" />
              <SortHeader field="price" label="PRICE" />
              <SortHeader field="changePercent" label="24H CHG%" />
              <SortHeader field="volume" label="VOLUME" />
              <SortHeader field="marketCap" label="MARKET CAP" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((q) => {
              const changeClass = pctClass(q.changePercent);
              const ticker = q.symbol.replace("-USD", "");
              return (
                <tr
                  key={q.symbol}
                  onClick={() => onSymbol(q.symbol)}
                  className="border-b border-border/50 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-terminal text-[11px] font-bold text-[hsl(186,45%,55%)]">{ticker}</span>
                      <span className="font-terminal text-[9px] text-muted-foreground">{CRYPTO_LABELS[q.symbol] ?? q.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-terminal text-[11px] tabular-nums font-bold">${formatPrice(q.price)}</td>
                  <td className={`py-2 px-3 font-terminal text-[11px] tabular-nums font-semibold ${changeClass}`}>
                    {q.changePercent >= 0 ? "▲" : "▼"} {Math.abs(q.changePercent).toFixed(2)}%
                  </td>
                  <td className="py-2 px-3 font-terminal text-[11px] tabular-nums text-muted-foreground">{formatBig(q.volume)}</td>
                  <td className="py-2 px-3 font-terminal text-[11px] tabular-nums text-muted-foreground">{formatBig(q.marketCap)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-border/30 px-4 py-1.5 text-[9px] text-muted-foreground font-terminal">
        Data via CoinGecko
      </div>
    </div>
  );
}
