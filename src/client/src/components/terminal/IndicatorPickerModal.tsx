import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, TrendingUp, Activity, BarChart3, Waves } from "lucide-react";

interface IndicatorDef {
  id: string;
  name: string;
  category: "trend" | "momentum" | "volatility" | "volume";
  description: string;
}

const INDICATORS: IndicatorDef[] = [
  { id: "SMA20", name: "SMA (20)", category: "trend", description: "Simple Moving Average, 20 period" },
  { id: "SMA50", name: "SMA (50)", category: "trend", description: "Simple Moving Average, 50 period" },
  { id: "SMA200", name: "SMA (200)", category: "trend", description: "Simple Moving Average, 200 period" },
  { id: "EMA20", name: "EMA (20)", category: "trend", description: "Exponential Moving Average, 20 period" },
  { id: "EMA50", name: "EMA (50)", category: "trend", description: "Exponential Moving Average, 50 period" },
  { id: "VWAP", name: "VWAP", category: "trend", description: "Volume Weighted Average Price" },
  { id: "RSI", name: "RSI (14)", category: "momentum", description: "Relative Strength Index, 14 period" },
  { id: "MACD", name: "MACD (12,26,9)", category: "momentum", description: "Moving Average Convergence Divergence" },
  { id: "BB", name: "Bollinger Bands", category: "volatility", description: "Bollinger Bands, 20 period, 2 std dev" },
];

const CATEGORIES = [
  { id: "trend", label: "TREND", icon: TrendingUp, color: "hsl(186,45%,55%)" },
  { id: "momentum", label: "MOMENTUM", icon: Activity, color: "hsl(38,30%,55%)" },
  { id: "volatility", label: "VOLATILITY", icon: Waves, color: "hsl(265,70%,65%)" },
  { id: "volume", label: "VOLUME", icon: BarChart3, color: "hsl(142,71%,45%)" },
] as const;

interface Props {
  activeOverlays: Set<string>;
  activeIndicators: Set<string>;
  onToggleOverlay: (key: string) => void;
  onToggleIndicator: (key: string) => void;
  onClose: () => void;
}

export default function IndicatorPickerModal({
  activeOverlays,
  activeIndicators,
  onToggleOverlay,
  onToggleIndicator,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return INDICATORS;
    const q = search.toLowerCase();
    return INDICATORS.filter(
      (ind) =>
        ind.name.toLowerCase().includes(q) ||
        ind.description.toLowerCase().includes(q) ||
        ind.category.includes(q)
    );
  }, [search]);

  const isActive = (id: string) => {
    // Overlays are toggled via onToggleOverlay, indicators via onToggleIndicator
    if (["SMA20", "SMA50", "SMA200", "EMA20", "EMA50", "BB", "VWAP"].includes(id)) {
      return activeOverlays.has(id);
    }
    return activeIndicators.has(id);
  };

  const handleToggle = (ind: IndicatorDef) => {
    if (["SMA20", "SMA50", "SMA200", "EMA20", "EMA50", "BB", "VWAP"].includes(ind.id)) {
      onToggleOverlay(ind.id);
    } else {
      onToggleIndicator(ind.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#0d0d0d] border border-[hsl(186_45%_50%/0.4)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="font-terminal text-[11px] tracking-[0.15em] text-foreground/90">INDICATORS</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 bg-[#050505] border border-border/60 px-3 py-2 rounded-sm">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indicators..."
              className="bg-transparent flex-1 font-terminal text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground/50 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Indicator list */}
        <div className="max-h-80 overflow-y-auto scrollbar-thin px-4 py-3 space-y-4">
          {CATEGORIES.map((cat) => {
            const items = filtered.filter((ind) => ind.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-1.5 mb-2">
                  <cat.icon className="w-3 h-3" style={{ color: cat.color }} />
                  <span className="font-terminal text-[8px] tracking-[0.2em] text-muted-foreground/70">{cat.label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((ind) => {
                    const active = isActive(ind.id);
                    return (
                      <button
                        key={ind.id}
                        onClick={() => handleToggle(ind)}
                        className={`px-2.5 py-1.5 font-terminal text-[9px] rounded-sm border transition-all duration-150 ${
                          active
                            ? "bg-[hsl(186,45%,50%)/12%] border-[hsl(186,45%,50%)/40%] text-[hsl(186,45%,60%)]"
                            : "bg-transparent border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground"
                        }`}
                        title={ind.description}
                      >
                        {ind.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-8 font-terminal text-[10px] text-muted-foreground/50">
              No indicators match "{search}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 shrink-0">
          <span className="font-terminal text-[8px] text-muted-foreground/50">
            {activeOverlays.size + activeIndicators.size} active
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 font-terminal text-[9px] text-[hsl(186,45%,55%)] hover:bg-[hsl(186,45%,50%)/10%] border border-[hsl(186,45%,50%)/30%] rounded-sm transition-colors"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
