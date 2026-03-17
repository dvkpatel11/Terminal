import { useState } from "react";
import { useNews } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Search } from "lucide-react";

interface Props { symbol?: string }

const SOURCES = ["ALL","BLOOMBERG","REUTERS","CNBC","FT","WSJ","COINDESK"];

export default function NewsPanel({ symbol }: Props) {
  const { data: news, isLoading } = useNews(symbol);
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");

  const filtered = (news || []).filter((n: any) => {
    const srcOk = sourceFilter === "ALL" || n.source.toUpperCase().includes(sourceFilter);
    const sentOk = sentimentFilter === "ALL" || n.sentiment === sentimentFilter.toLowerCase();
    return srcOk && sentOk;
  });

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-px border-b border-border bg-[#070707] shrink-0 overflow-x-auto scrollbar-thin">
        <div className="panel-label px-3 py-2 border-r border-border shrink-0">
          {symbol ? `${symbol} NEWS` : "MARKET NEWS"}
        </div>
        {SOURCES.map(s => (
          <button key={s} onClick={() => setSourceFilter(s)}
            className={`px-3 py-2 font-terminal text-[9px] tracking-widest border-r border-border whitespace-nowrap transition-colors ${
              sourceFilter === s ? "bg-[hsl(38,95%,50%)/15%] text-[hsl(38,95%,55%)]" : "text-muted-foreground hover:text-foreground"
            }`}>
            {s}
          </button>
        ))}
        <div className="ml-2 flex items-center gap-px">
          {["ALL","positive","negative","neutral"].map(s => (
            <button key={s} onClick={() => setSentimentFilter(s.toUpperCase() === "ALL" ? "ALL" : s)}
              className={`px-2 py-2 font-terminal text-[9px] tracking-widest whitespace-nowrap transition-colors ${
                sentimentFilter === (s.toUpperCase() === "ALL" ? "ALL" : s) ? (
                  s === "positive" ? "text-up" : s === "negative" ? "text-down" : "text-[hsl(38,95%,55%)]"
                ) : "text-muted-foreground hover:text-foreground"
              }`}>
              {s === "ALL" ? "ALL" : s === "positive" ? "▲ POS" : s === "negative" ? "▼ NEG" : "○ NEU"}
            </button>
          ))}
        </div>
      </div>

      {/* News list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-border" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 font-terminal text-muted-foreground text-xs">NO RESULTS</div>
        ) : (
          filtered.map((n: any, i: number) => (
            <div key={i} className="border-b border-border hover:bg-white/5 cursor-pointer group p-4">
              <div className="flex items-start gap-3">
                {/* Sentiment badge */}
                <div className={`shrink-0 w-1.5 h-1.5 rounded-full mt-2 ${
                  n.sentiment === "positive" ? "bg-[hsl(142,71%,45%)]" :
                  n.sentiment === "negative" ? "bg-[hsl(0,80%,55%)]" :
                  "bg-[hsl(38,95%,55%)]"
                }`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-terminal text-sm text-foreground leading-snug group-hover:text-[hsl(38,95%,55%)] transition-colors">
                    {n.title}
                  </h3>
                  <p className="font-terminal text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    {n.summary}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`font-terminal text-[9px] font-bold px-1.5 py-0.5 border ${
                      n.sentiment === "positive" ? "border-[hsl(142,71%,45%)/40%] text-[hsl(142,71%,50%)]" :
                      n.sentiment === "negative" ? "border-[hsl(0,80%,50%)/40%] text-[hsl(0,80%,60%)]" :
                      "border-border text-muted-foreground"
                    }`}>
                      {n.source.toUpperCase()}
                    </span>
                    <span className="font-terminal text-[9px] text-muted-foreground">{relativeTime(n.publishedAt)}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
