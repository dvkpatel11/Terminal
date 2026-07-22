import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
}

interface Props {
  query: string;
  onSelect: (symbol: string) => void;
}

const POPULAR_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META", "JPM"];

export default function SymbolSuggestions({ query, onSelect }: Props) {
  const { data: results = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/finance/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/finance/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
    enabled: query.length > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-8 bg-border" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {results.length > 0 && (
        <div>
          <div className="font-terminal text-[9px] text-muted-foreground tracking-wider mb-1">DID YOU MEAN</div>
          <div className="flex flex-wrap gap-1.5">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => onSelect(r.symbol)}
                className="px-2.5 py-1.5 border border-border/50 hover:border-cyan-600 hover:text-cyan-300 font-terminal text-[10px] tracking-wider transition-colors"
              >
                {r.symbol}
                {r.name && <span className="text-muted-foreground ml-1.5">{r.name}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="font-terminal text-[9px] text-muted-foreground tracking-wider mb-1">POPULAR</div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => onSelect(t)}
              className="px-2 py-1 border border-border/50 hover:border-cyan-600 hover:text-cyan-300 font-terminal text-[9px] tracking-wider text-muted-foreground transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
