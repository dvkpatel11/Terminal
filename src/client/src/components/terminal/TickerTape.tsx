import { useEffect, useRef, useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatPrice, formatPct, TAPE_SYMBOLS } from "@/lib/finance";

interface Props {
  onSymbol: (sym: string) => void;
}

const SPEED = 0.5; // px per frame

export default function TickerTape({ onSymbol }: Props) {
  const { data: quotes } = useQuotes(TAPE_SYMBOLS);
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const [paused, setPaused] = useState(false);

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

  const items = quotes || TAPE_SYMBOLS.map(s => ({ symbol: s, price: 0, changePercent: 0, change: 0 }));
  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div
      className="h-6 bg-gradient-to-b from-[#070707] to-[#040404] border-b border-border/30 overflow-hidden relative shrink-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      title={paused ? "Scrolling paused — move away to resume" : "Hover to pause"}
    >
      <div
        ref={trackRef}
        className="flex items-center gap-0 whitespace-nowrap will-change-transform"
        style={{ width: "max-content" }}
      >
        {doubled.map((q: any, i) => (
          <button
            key={`${q.symbol}-${i}`}
            onClick={() => onSymbol(q.symbol)}
            className="flex items-center gap-2 px-3.5 h-6 border-r border-border/25 hover:bg-white/[0.03] group cursor-pointer transition-colors duration-150"
          >
            <span className="font-terminal text-[9px] font-semibold text-[hsl(186,45%,55%)] group-hover:text-[hsl(186,45%,68%)] transition-colors duration-150">
              {q.symbol.replace("^", "").replace("=F", "").replace("-USD", "")}
            </span>
            <span className="font-terminal text-[9px] text-foreground/80 tabular-nums">
              {q.price ? formatPrice(q.price) : "—"}
            </span>
            {q.changePercent !== undefined && (
              <span className={`font-terminal text-[9px] tabular-nums font-medium ${q.changePercent >= 0 ? "text-up" : "text-down"}`}>
                {q.changePercent >= 0 ? "▲" : "▼"}{Math.abs(q.changePercent).toFixed(2)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
