import React, { useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/useFinance";
import NewsCard from "./NewsCard";

interface Props {
  items: FeedItem[];
  variant: "dense" | "expanded" | "hero";
  activeFeedItem?: FeedItem | null;
  onSelectFeedItem?: (item: FeedItem) => void;
  /** Legacy: select a raw NewsItem */
  activeItemId?: string;
  onSelectItem?: (item: FeedItem) => void;
  maxItems?: number;
  className?: string;
}

export default function NewsList({
  items,
  variant,
  activeFeedItem,
  onSelectFeedItem,
  activeItemId,
  onSelectItem,
  maxItems,
  className,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  const handleSelect = useCallback(
    (item: FeedItem) => {
      onSelectFeedItem?.(item);
      onSelectItem?.(item);
    },
    [onSelectFeedItem, onSelectItem],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const fi = displayItems[selectedIndex];
        if (fi) window.open(fi.item.url, "_blank", "noopener,noreferrer");
      } else if (e.key === " ") {
        e.preventDefault();
        const fi = displayItems[selectedIndex];
        if (fi) handleSelect(fi);
      }
    },
    [displayItems, selectedIndex, handleSelect],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  return (
    <div
      className={cn("flex flex-col overflow-y-auto scrollbar-thin", className)}
      role="list"
      aria-label="News feed"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {displayItems.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs font-terminal">
          No items available
        </div>
      ) : (
        displayItems.map((fi, index) => {
          const isActive = activeFeedItem
            ? fi.kind === activeFeedItem.kind && fi.item === activeFeedItem.item
            : fi.kind === "news" && fi.item.url === activeItemId || index === selectedIndex;
          return (
            <NewsCard
              key={fi.kind === "news" ? fi.item.url : fi.item.id}
              feedItem={fi}
              variant={variant}
              isActive={isActive}
              onClick={() => handleSelect(fi)}
            />
          );
        })
      )}
    </div>
  );
}
