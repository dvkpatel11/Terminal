import { useNewsArticle } from "@/lib/useFinance";
import type { NewsItem } from "@/lib/finance";
import { relativeTime, classifyThreat } from "@/lib/newsUtils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  item: NewsItem;
  onClose?: () => void;
}

const threatBannerClasses = {
  CRITICAL: "bg-red-500/10 border-red-500/30 text-red-400",
  HIGH: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  MEDIUM: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  LOW: "bg-green-500/10 border-green-500/30 text-green-400",
  INFO: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
};

export default function NewsArticleView({ item, onClose }: Props) {
  const { data: article, isLoading } = useNewsArticle(item);

  const threat = classifyThreat(`${item.title} ${item.summary}`);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[9px] font-terminal font-bold tracking-wider border rounded ${threatBannerClasses[threat]}`}>
            {threat}
          </span>
          <span className="px-1.5 py-0.5 text-[8px] font-terminal font-bold tracking-wider border border-border/50 text-cyan uppercase">
            {item.source}
          </span>
          <span className="text-[9px] font-terminal text-muted-foreground">
            {relativeTime(item.publishedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-[9px] font-terminal text-cyan border border-cyan/30 hover:bg-cyan/10 transition-colors"
          >
            OPEN SOURCE
          </a>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 text-[9px] font-terminal text-muted-foreground border border-border/50 hover:bg-white/5 transition-colors"
            >
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <h1 className="text-lg font-terminal font-bold text-foreground leading-snug">
          {item.title}
        </h1>

        {item.summary && (
          <p className="mt-3 text-sm font-terminal text-muted-foreground leading-relaxed">
            {item.summary}
          </p>
        )}

        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-full bg-border" />
            <Skeleton className="h-4 w-5/6 bg-border" />
            <Skeleton className="h-4 w-4/6 bg-border" />
          </div>
        ) : article?.content ? (
          <div className="mt-4 space-y-3">
            {article.content.map((paragraph, i) => (
              <p key={i} className="text-sm font-terminal text-foreground/90 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}