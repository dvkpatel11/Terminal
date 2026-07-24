import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { NewsList, NewsArticleView } from "@/components/news";
import PanelLoadingSkeleton from "@/components/panel/PanelLoadingSkeleton";
import QueryErrorFallback from "@/components/panel/QueryErrorFallback";
import type { NewsItem } from "@/lib/finance";
import type { FeedItem, SocialPost } from "@/lib/useFinance";
import { useNews, useSocialFeed, useStoredSocialSources, mergeFeed, PLATFORM_BADGE } from "@/lib/useFinance";

interface Props {
  symbol?: string;
  onSymbol?: (symbol: string) => void;
}

export default function NewsPanel({ symbol, onSymbol }: Props) {
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedFeedItem, setSelectedFeedItem] = useState<FeedItem | null>(null);

  const { data: news = [], isLoading: newsLoading, isError, error, refetch } = useNews(symbol, query);
  const storedSources = useStoredSocialSources();
  const { data: socialData, isLoading: socialLoading } = useSocialFeed(
    storedSources.length ? storedSources : undefined,
    symbol,
  );

  const isLoading = newsLoading || socialLoading;

  const feedItems = useMemo(() => {
    return mergeFeed(news, socialData?.posts ?? []);
  }, [news, socialData]);

  const sources = useMemo(() => {
    const newsSources = news.map((item) => item.source.toUpperCase());
    const socialSources = (socialData?.posts ?? []).map((p) => p.platform.toUpperCase());
    return ["ALL", ...Array.from(new Set([...newsSources, ...socialSources])).sort()];
  }, [news, socialData]);

  const filtered = useMemo(() => {
    return feedItems.filter((fi) => {
      if (fi.kind === "news") {
        const sourceOk = sourceFilter === "ALL" || fi.item.source.toUpperCase() === sourceFilter;
        const sentimentOk = sentimentFilter === "ALL" || fi.item.sentiment === sentimentFilter.toLowerCase();
        return sourceOk && sentimentOk;
      }
      // Social post
      const sourceOk = sourceFilter === "ALL" || fi.item.platform.toUpperCase() === sourceFilter;
      if (!sourceOk) return false;
      if (sentimentFilter === "ALL") return true;
      if (sentimentFilter === "positive") return fi.item.sentiment.score > 0.3;
      if (sentimentFilter === "negative") return fi.item.sentiment.score < -0.3;
      return fi.item.sentiment.score >= -0.3 && fi.item.sentiment.score <= 0.3;
    });
  }, [feedItems, sentimentFilter, sourceFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedFeedItem(null);
      return;
    }

    if (!selectedFeedItem || !filtered.some((fi) => fi.kind === selectedFeedItem.kind && fi.item === selectedFeedItem.item)) {
      setSelectedFeedItem(filtered[0]);
    }
  }, [filtered, selectedFeedItem]);

  if (isLoading) {
    return <PanelLoadingSkeleton rows={8} />;
  }

  if (isError) {
    return <QueryErrorFallback label="News" error={error} onRetry={() => refetch()} />;
  }

  const feedItemCount = filtered.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border/70">
          <div className="panel-label shrink-0">{symbol ? `${symbol} FEED` : "MARKET FEED"}</div>
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SEARCH HEADLINES, POSTS, OR SOURCE"
              className="w-full h-8 bg-black/30 border border-border pl-8 pr-3 font-terminal text-[10px] tracking-widest text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[hsl(186,45%,50%)]"
              data-testid="news-search-input"
            />
          </div>
          <div className="font-terminal text-[8px] tracking-widest text-muted-foreground shrink-0">
            {feedItemCount} ITEMS
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
            activeFeedItem={selectedFeedItem}
            onSelectFeedItem={setSelectedFeedItem}
            className="flex-1"
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-[#050505]">
          {selectedFeedItem ? (
            selectedFeedItem.kind === "news" ? (
              <NewsArticleView
                item={selectedFeedItem.item}
                onClose={() => setSelectedFeedItem(null)}
              />
            ) : (
              <SocialPostDetail
                post={selectedFeedItem.item}
                onClose={() => setSelectedFeedItem(null)}
                onSymbol={onSymbol}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-terminal">
              Select an item to read
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline detail view for a social post in the unified feed. */
function SocialPostDetail({ post, onClose, onSymbol }: { post: SocialPost; onClose: () => void; onSymbol?: (symbol: string) => void }) {
  const badge = PLATFORM_BADGE[post.platform];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${badge?.bg} ${badge?.text}`}>
            {post.platform}
          </span>
          <span className="text-[10px] text-muted-foreground">{post.accountName}</span>
          <span className="text-[9px] text-muted-foreground/50">
            {new Date(post.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-[9px] font-terminal text-cyan border border-cyan/30 hover:bg-cyan/10 transition-colors"
          >
            OPEN POST
          </a>
          <button
            onClick={onClose}
            className="px-2 py-1 text-[9px] font-terminal text-muted-foreground border border-border/50 hover:bg-white/5 transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {post.title && (
          <h1 className="text-lg font-terminal font-bold text-foreground leading-snug">
            {post.title}
          </h1>
        )}
        <p className="mt-3 text-sm font-terminal text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {post.text}
        </p>
        {post.tickers.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <span className="text-[9px] font-terminal text-muted-foreground">TICKERS:</span>
            {post.tickers.map((t) => (
              <button
                key={t}
                onClick={() => onSymbol?.(t)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold hover:bg-primary/20 transition-colors"
              >
                ${t}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4 text-[10px] font-terminal text-muted-foreground">
          <span>SCORE: {post.score}</span>
          <span>ENGAGEMENT: {post.engagementScore}</span>
          <span>
            SENTIMENT:{" "}
            <span className={post.sentiment.score > 0.3 ? "text-green-400" : post.sentiment.score < -0.3 ? "text-red-400" : "text-muted-foreground"}>
              {post.sentiment.score > 0 ? "+" : ""}{post.sentiment.score.toFixed(2)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
