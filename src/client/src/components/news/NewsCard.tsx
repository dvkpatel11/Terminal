import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { FeedItem, SocialPost } from "@/lib/useFinance";
import { PLATFORM_BADGE } from "@/lib/useFinance";
import type { ThreatLevel } from "@/lib/newsUtils";
import { relativeTime, sentimentBorderColor, classifyThreat } from "@/lib/newsUtils";
import NewsThumb from "./NewsThumb";

interface Props {
  feedItem: FeedItem;
  variant: "dense" | "expanded" | "hero";
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

const threatBadgeClasses: Record<ThreatLevel, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
  INFO: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

function SocialRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SentimentDot({ score }: { score: number }) {
  if (score > 0.3) return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/80" />;
  if (score < -0.3) return <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500/80" />;
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />;
}

export default function NewsCard({
  feedItem,
  variant,
  isActive = false,
  onClick,
  className,
}: Props) {
  const handleHeadlineClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(feedItem.item.url, "_blank", "noopener,noreferrer");
    },
    [feedItem.item.url],
  );

  const handleCardClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  if (feedItem.kind === "social") {
    return <SocialCard post={feedItem.item} variant={variant} isActive={isActive} onClick={handleCardClick} onHeadlineClick={handleHeadlineClick} className={className} />;
  }

  const item = feedItem.item;
  const effectiveThreat = classifyThreat(`${item.title} ${item.summary}`);
  const borderClass = sentimentBorderColor(item.sentiment);

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "flex border-l-4 transition-colors cursor-pointer",
        borderClass,
        isActive ? "bg-[hsl(186,45%,50%)/8]" : "hover:bg-white/[0.03]",
        className,
      )}
    >
      {/* Content area */}
      <div className="flex-1 min-w-0 px-3 py-2">
        {/* Headline row */}
        <div className="flex items-start gap-2">
          <h3
            onClick={handleHeadlineClick}
            className={cn(
              "flex-1 font-terminal font-medium text-foreground leading-snug line-clamp-2 hover:underline hover:decoration-cyan",
              variant === "hero" ? "text-base" : variant === "expanded" ? "text-xs" : "text-[11px]",
            )}
          >
            {item.title}
          </h3>
        </div>

        {/* Summary (expanded/hero only) */}
        {(variant === "expanded" || variant === "hero") && item.summary && (
          <p className="mt-1 text-[11px] font-terminal text-muted-foreground leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="px-1.5 py-0.5 text-[8px] font-terminal font-bold tracking-wider border border-border/50 text-cyan uppercase">
            {item.source}
          </span>
          <span className="text-[9px] font-terminal text-muted-foreground">
            {relativeTime(item.publishedAt)}
          </span>
        </div>
      </div>

      {/* Thumbnail (expanded/hero only) */}
      {(variant === "expanded" || variant === "hero") && (
        <div className="flex items-center pr-3 py-2">
          <NewsThumb
            image={item.image}
            source={item.source}
            size={variant === "hero" ? "lg" : "md"}
          />
        </div>
      )}
    </div>
  );
}

function SocialCard({
  post,
  variant,
  isActive,
  onClick,
  onHeadlineClick,
  className,
}: {
  post: SocialPost;
  variant: "dense" | "expanded" | "hero";
  isActive: boolean;
  onClick: () => void;
  onHeadlineClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  const badge = PLATFORM_BADGE[post.platform];
  const title = post.title || post.text.slice(0, 150);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex border-l-4 border-l-purple-500/50 transition-colors cursor-pointer",
        isActive ? "bg-[hsl(186,45%,50%)/8]" : "hover:bg-white/[0.03]",
        className,
      )}
    >
      <div className="flex-1 min-w-0 px-3 py-2">
        {/* Headline row */}
        <div className="flex items-start gap-2">
          <h3
            onClick={onHeadlineClick}
            className={cn(
              "flex-1 font-terminal font-medium text-foreground leading-snug line-clamp-2 hover:underline hover:decoration-cyan",
              variant === "hero" ? "text-base" : variant === "expanded" ? "text-xs" : "text-[11px]",
            )}
          >
            {title}
          </h3>
        </div>

        {/* Body (expanded/hero only) */}
        {(variant === "expanded" || variant === "hero") && post.text && post.text !== post.title && (
          <p className="mt-1 text-[11px] font-terminal text-muted-foreground leading-relaxed line-clamp-3">
            {post.text.slice(0, 200)}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-terminal font-bold uppercase ${badge?.bg} ${badge?.text}`}>
            {badge?.label ?? post.platform}
          </span>
          <span className="text-[9px] font-terminal text-muted-foreground truncate">{post.accountName}</span>
          <span className="text-[9px] font-terminal text-muted-foreground/50 shrink-0">{SocialRelativeTime(post.createdAt)}</span>
          <SentimentDot score={post.sentiment.score} />
          <span className="text-[9px] font-terminal text-muted-foreground/40 ml-auto">
            {post.score > 0 && <>{post.platform === "x" ? `\u2665` : `\u2191`}{post.score}</>}
          </span>
        </div>
      </div>
    </div>
  );
}
