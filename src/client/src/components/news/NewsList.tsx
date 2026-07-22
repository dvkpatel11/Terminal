import React, { useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/finance";
import NewsCard from "./NewsCard";

interface Props {
  items: NewsItem[];
  variant: "dense" | "expanded" | "hero";
  activeItemId?: string;
  onSelectItem?: (item: NewsItem) => void;
  maxItems?: number;
  className?: string;
}

export default function NewsList({
  items,
  variant,
  activeItemId,
  onSelectItem,
  maxItems,
  className,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

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
        const item = displayItems[selectedIndex];
        if (item) window.open(item.url, "_blank", "noopener,noreferrer");
      } else if (e.key === " ") {
        e.preventDefault();
        const item = displayItems[selectedIndex];
        if (item) onSelectItem?.(item);
      }
    },
    [displayItems, selectedIndex, onSelectItem]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  return (
    <div
      className={cn("flex flex-col overflow-y-auto scrollbar-thin", className)}
      role="list"
      aria-label="News articles"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {displayItems.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs font-terminal">
          No news available
        </div>
      ) : (
        displayItems.map((item, index) => (
          <NewsCard
            key={`${item.url}-${item.publishedAt}`}
            item={item}
            variant={variant}
            isActive={item.url === activeItemId || index === selectedIndex}
            onClick={() => onSelectItem?.(item)}
          />
        ))
      )}
    </div>
  );
}
