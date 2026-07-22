import { useEffect, useRef, useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatPrice, formatPct, TAPE_SYMBOLS } from "@/lib/finance";
import { cn } from "@/lib/utils";

interface Props {
  onSymbol: (sym: string) => void;
}

const SPEED = 0.5; // px per frame

export default function TickerTape({ onSymbol }: Props) {
  const { data: quotes } = useQuotes(TAPE_SYMBOLS);
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const prevPrices = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, "up" | "down">>(new Map());

  // Animation is decoupled from data updates: it runs continuously and only
  // pauses on hover. `quotes` changing no longer resets the scroll position.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const step = () => {
      if (!paused) {
        posRef.current += SPEED;
        const half = el.scrollWidth / 2;
        if (half > 0 && posRef.current >= half) posRef.current = 0;
        el.style.transform = `translateX(-${posRef.current}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // Track price direction changes for flash animations
  useEffect(() => {
    if (!quotes) return;
    const newFlash = new Map<string, "up" | "down">();
    for (const q of quotes) {
      const prev = prevPrices.current.get(q.symbol);
      if (prev !== undefined && q.price !== prev) {
        newFlash.set(q.symbol, q.price > prev ? "up" : "down");
      }
      prevPrices.current.set(q.symbol, q.price);
    }
    if (newFlash.size > 0) {
      setFlashMap(newFlash);
      const timeout = setTimeout(() => setFlashMap(new Map()), 300);
      return () => clearTimeout(timeout);
    }
  }, [quotes]);

  const items = quotes || TAPE_SYMBOLS.map(s => ({ symbol: s, price: 0, changePercent: 0, change: 0 }));
  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div
      className="h-6 bg-gradient-to-b from-surface-1 to-surface-0 border-b border-border/30 overflow-hidden relative shrink-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      title={paused ? "Scrolling paused — move away to resume" : "Hover to pause"}
    >
      <div
        ref={trackRef}
        className="flex items-center gap-0 whitespace-nowrap will-change-transform"
        style={{ width: "max-content" }}
      >
        {doubled.map((q: any, i) => {
          const change = q.changePercent ?? 0;
          const flash = flashMap.get(q.symbol);
          return (
            <button
              key={`${q.symbol}-${i}`}
              onClick={() => onSymbol(q.symbol)}
              className="flex items-center gap-2 px-3.5 h-6 border-r border-border/25 hover:bg-white/5 group cursor-pointer transition-colors duration-150"
            >
              <span className="text-data-sm font-terminal font-semibold text-market">
                {q.symbol.replace("^", "").replace("=F", "").replace("-USD", "")}
              </span>
              <span
                className={cn(
                  "px-1 rounded",
                  flash === "up" && "flash-up",
                  flash === "down" && "flash-down"
                )}
              >
                <span className="text-data-sm font-terminal tabular-nums text-foreground">
                  {q.price ? formatPrice(q.price) : "—"}
                </span>
              </span>
              {q.changePercent !== undefined && (
                <span className={cn(
                  "font-terminal tabular-nums text-data-xs font-medium",
                  change > 0 ? "text-positive" :
                  change < 0 ? "text-negative" :
                  "text-flat"
                )}>
                  {change > 0 ? "▲" : change < 0 ? "▼" : ""}
                  {change > 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
