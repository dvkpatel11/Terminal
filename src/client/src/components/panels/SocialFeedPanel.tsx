import { useState, useMemo } from "react";
import { Settings, RefreshCw, ExternalLink } from "lucide-react";
import { useSocialFeed, useStoredSocialSources, type SocialPost } from "@/lib/useFinance";
import SourceConfigModal from "@/components/terminal/SourceConfigModal";
import type { ViewMode } from "@/lib/terminalTypes";

interface Props {
  symbol?: string;
  onSymbol?: (symbol: string) => void;
  onNav?: (view: ViewMode) => void;
}

type Tab = "feed" | "reddit" | "x" | "truth";

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: "feed", label: "Feed", color: "text-foreground" },
  { id: "reddit", label: "Reddit", color: "text-orange-400" },
  { id: "x", label: "X", color: "text-blue-400" },
  { id: "truth", label: "Truth", color: "text-gray-400" },
];

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  reddit: { bg: "bg-orange-500/20", text: "text-orange-400" },
  x: { bg: "bg-blue-500/20", text: "text-blue-400" },
  truth: { bg: "bg-gray-500/20", text: "text-gray-400" },
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SentimentDot({ score }: { score: number }) {
  if (score > 0.3) return <span className="inline-block w-2 h-2 rounded-full bg-green-500/80" />;
  if (score < -0.3) return <span className="inline-block w-2 h-2 rounded-full bg-red-500/80" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" />;
}

function FeedItem({ post, onSymbol }: { post: SocialPost; onSymbol?: (s: string) => void }) {
  const badge = PLATFORM_COLORS[post.platform];

  return (
    <div className="flex gap-3 px-3 py-2.5 border-b border-border/40 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.bg} ${badge.text}`}>
            {post.platform}
          </span>
          <span className="text-xs text-muted-foreground truncate">{post.accountName}</span>
          <span className="text-[10px] text-muted-foreground/50 shrink-0">{relativeTime(post.createdAt)}</span>
        </div>
        <p className="text-sm leading-snug">
          {post.title || post.text.slice(0, 150)}
        </p>
        {post.text && post.title && post.text !== post.title && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{post.text.slice(0, 200)}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {post.tickers.length > 0 && post.tickers.slice(0, 5).map((t) => (
            <button
              key={t}
              onClick={() => onSymbol?.(t)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono font-bold"
            >
              ${t}
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground/40 ml-auto flex items-center gap-1">
            {post.contentType !== "meme" && (
              <span className="uppercase">{post.contentType}</span>
            )}
          </span>
        </div>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        <div className="text-xs font-mono text-muted-foreground">
          {post.platform === "x" ? `\u2665${post.score}` : `\u2191${post.score}`}
        </div>
        <SentimentDot score={post.sentiment.score} />
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/30 hover:text-primary"
        >
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}

function SentimentSidebar({ sentiment }: { sentiment: Record<string, { positive: number; negative: number; score: number; count: number }> }) {
  const sorted = useMemo(
    () => Object.entries(sentiment).sort((a, b) => b[1].count - a[1].count).slice(0, 20),
    [sentiment]
  );

  return (
    <div className="w-44 border-l border-border bg-[#070707] shrink-0 overflow-y-auto scrollbar-thin">
      <div className="px-3 py-2 border-b border-border/50">
        <div className="panel-label text-[10px]">SENTIMENT</div>
      </div>
      <div className="p-2 space-y-0.5">
        {sorted.map(([ticker, data]) => (
          <div key={ticker} className="flex items-center justify-between py-1 px-1 text-xs rounded hover:bg-white/[0.03]">
            <span className="font-mono font-bold text-foreground">{ticker}</span>
            <span
              className={
                data.score > 0.3
                  ? "text-green-400 font-mono"
                  : data.score < -0.3
                    ? "text-red-400 font-mono"
                    : "text-muted-foreground font-mono"
              }
            >
              {data.score > 0 ? "+" : ""}
              {data.score.toFixed(2)}
            </span>
            <span className="text-muted-foreground/40 text-[10px] w-5 text-right">{data.count}</span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-[10px] text-muted-foreground/40 py-4 text-center">No ticker mentions yet</div>
        )}
      </div>
    </div>
  );
}

export default function SocialFeedPanel({ onSymbol, onNav }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [configOpen, setConfigOpen] = useState(false);
  const storedSources = useStoredSocialSources();
  const { data, isLoading, refetch, isFetching } = useSocialFeed(storedSources.length ? storedSources : undefined);

  const posts = useMemo(() => {
    if (!data?.posts) return [];
    if (activeTab === "feed") return data.posts;
    return data.posts.filter((p) => p.platform === activeTab);
  }, [data, activeTab]);

  const sentiment = data?.sentiment ?? {};

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border/70">
          <div className="panel-label shrink-0">SOCIAL FEED</div>
          <div className="flex items-center gap-1 ml-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  activeTab === tab.id
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(data?.source === "none" || data?.source === "unavailable") && (
              <span className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                NO LIVE SOURCE
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-muted-foreground/40 hover:text-foreground disabled:opacity-30"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setConfigOpen(true)}
              className="text-muted-foreground/40 hover:text-foreground"
            >
              <Settings size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
              Loading social feed...
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50 text-xs gap-2">
              <span>No posts found</span>
              <button
                onClick={() => setConfigOpen(true)}
                className="text-primary text-[10px] hover:underline"
              >
                Configure sources
              </button>
            </div>
          ) : (
            posts.map((post) => (
              <FeedItem key={post.id} post={post} onSymbol={onSymbol} />
            ))
          )}
        </div>
        <SentimentSidebar sentiment={sentiment} />
      </div>

      <div className="shrink-0 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground/40 flex items-center justify-between bg-[#070707]">
        <span>
          {activeTab === "feed" ? "All platforms" : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} · {posts.length} post{posts.length !== 1 ? "s" : ""}
        </span>
        <span>
          {data?.source === "none" ? "No live source configured" : `Source: ${data?.source ?? "loading"}`}
        </span>
      </div>

      {configOpen && <SourceConfigModal onClose={() => setConfigOpen(false)} />}
    </div>
  );
}
