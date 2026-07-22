import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { NewsList, NewsArticleView } from "@/components/news";
import type { NewsItem } from "@/lib/finance";
import { useNews } from "@/lib/useFinance";

interface Props {
  symbol?: string;
}

export default function NewsPanel({ symbol }: Props) {
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const { data: news = [] } = useNews(symbol, query);

  const sources = useMemo(() => {
    return [
      "ALL",
      ...Array.from(new Set(news.map((item) => item.source.toUpperCase()))).sort(),
    ];
  }, [news]);

  const filtered = useMemo(() => {
    return news.filter((item: NewsItem) => {
      const sourceOk = sourceFilter === "ALL" || item.source.toUpperCase() === sourceFilter;
      const sentimentOk = sentimentFilter === "ALL" || item.sentiment === sentimentFilter.toLowerCase();
      return sourceOk && sentimentOk;
    });
  }, [news, sentimentFilter, sourceFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedItem(null);
      return;
    }

    if (!selectedItem || !filtered.some((item) => item.url === selectedItem.url)) {
      setSelectedItem(filtered[0]);
    }
  }, [filtered, selectedItem]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border/70">
          <div className="panel-label shrink-0">{symbol ? `${symbol} NEWS` : "MARKET NEWS"}</div>
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SEARCH HEADLINES OR SOURCE"
              className="w-full h-8 bg-black/30 border border-border pl-8 pr-3 font-terminal text-[10px] tracking-widest text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[hsl(186,45%,50%)]"
              data-testid="news-search-input"
            />
          </div>
          <div className="font-terminal text-[8px] tracking-widest text-muted-foreground shrink-0">
            {filtered.length} STORIES
          </div>
        </div>

        <div className="flex items-center gap-px overflow-x-auto scrollbar-thin px-2 py-1.5">
          {sources.map((source) => (
            <button
              key={source}
              onClick={() => setSourceFilter(source)}
              className={`px-2.5 py-1 font-terminal text-[9px] tracking-widest border border-border whitespace-nowrap transition-colors ${
                sourceFilter === source ? "bg-[hsl(186,45%,50%)/15%] text-[hsl(186,45%,55%)]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {source}
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          {(["ALL", "positive", "negative", "neutral"] as const).map((state) => {
            const value = state === "ALL" ? "ALL" : state;
            const activeClass = state === "positive"
              ? "text-up"
              : state === "negative"
                ? "text-down"
                : "text-[hsl(186,45%,55%)]";
            return (
              <button
                key={state}
                onClick={() => setSentimentFilter(value)}
                className={`px-2 py-1 font-terminal text-[9px] tracking-widest border border-border whitespace-nowrap transition-colors ${
                  sentimentFilter === value ? activeClass : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {state === "ALL" ? "ALL" : state === "positive" ? "▲ POS" : state === "negative" ? "▼ NEG" : "○ NEU"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="w-[42%] min-w-[320px] border-r border-border overflow-y-auto scrollbar-thin bg-[#060606]">
          <NewsList
            items={filtered}
            variant="expanded"
            activeItemId={selectedItem?.url}
            onSelectItem={setSelectedItem}
            className="flex-1"
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-[#050505]">
          {selectedItem ? (
            <NewsArticleView
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-terminal">
              Select an article to read
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
