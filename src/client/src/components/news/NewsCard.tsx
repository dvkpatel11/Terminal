import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/finance";
import type { ThreatLevel } from "@/lib/newsUtils";
import { relativeTime, sentimentBorderColor, classifyThreat } from "@/lib/newsUtils";
import NewsThumb from "./NewsThumb";

interface Props {
  item: NewsItem;
  variant: "dense" | "expanded" | "hero";
  isActive?: boolean;
  onClick?: () => void;
  threatLevel?: ThreatLevel;
  className?: string;
}

const threatBadgeClasses: Record<ThreatLevel, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
  INFO: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function NewsCard({
  item,
  variant,
  isActive = false,
  onClick,
  threatLevel,
  className,
}: Props) {
  const handleHeadlineClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(item.url, "_blank", "noopener,noreferrer");
    },
    [item.url]
  );

  const handleCardClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const effectiveThreat = threatLevel ?? classifyThreat(`${item.title} ${item.summary}`);
  const borderClass = sentimentBorderColor(item.sentiment);

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "flex border-l-4 transition-colors cursor-pointer",
        borderClass,
        isActive ? "bg-[hsl(186,45%,50%)/8]" : "hover:bg-white/[0.03]",
        className
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
              variant === "hero" ? "text-base" : variant === "expanded" ? "text-xs" : "text-[11px]"
            )}
          >
            {item.title}
          </h3>
          {threatLevel && (
            <span
              className={cn(
                "shrink-0 px-1.5 py-0.5 text-[8px] font-terminal font-bold tracking-wider border rounded",
                threatBadgeClasses[effectiveThreat]
              )}
            >
              {effectiveThreat}
            </span>
          )}
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
