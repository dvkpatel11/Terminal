import { useEffect, useRef, useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatPrice, formatPct } from "@/lib/finance";
import { useSymbolConfig } from "@/lib/useSymbolConfig";
import { cn } from "@/lib/utils";

interface Props {
  onSymbol: (sym: string) => void;
}

const SPEED = 0.5; // px per frame

export default function TickerTape({ onSymbol }: Props) {
  const { data: config } = useSymbolConfig();
  const tapeSymbols = config?.tape ?? [];
  const { data: quotes } = useQuotes(tapeSymbols);
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

  const items = quotes || tapeSymbols.map(s => ({ symbol: s, price: 0, changePercent: 0, change: 0 }));
  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div
      className="h-5 bg-surface-0 border-b border-border/20 overflow-hidden relative shrink-0"
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
          const flashClass = flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : "";
          return (
            <button
              key={`${q.symbol}-${i}`}
              onClick={() => onSymbol(q.symbol)}
              className="flex items-center gap-1.5 px-2.5 h-5 border-r border-border/15 hover:bg-white/[0.03] group cursor-pointer transition-colors duration-150"
            >
              <span className="text-[9px] font-terminal font-semibold text-market">
                {q.symbol.replace("^", "").replace("=F", "").replace("-USD", "")}
              </span>
              <span className={cn("px-0.5 rounded", flashClass)}>
                <span className="text-[9px] font-terminal tabular-nums text-foreground/70">
                  {q.price ? formatPrice(q.price) : "—"}
                </span>
              </span>
              {q.changePercent !== undefined && (
                <span className={cn(
                  "font-terminal tabular-nums text-[8px] font-medium",
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
