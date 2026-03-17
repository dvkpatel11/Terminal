import { useState, useRef, useEffect } from "react";
import { Search, TrendingUp, LineChart, Newspaper, Bot, Filter, Star, BellRing, Globe2, Briefcase, LayoutDashboard, X } from "lucide-react";
import type { ViewMode } from "@/pages/Terminal";

interface Props {
  onClose: () => void;
  onSymbol: (sym: string) => void;
  onNav: (v: ViewMode) => void;
}

const QUICK_COMMANDS = [
  { label: "Market Overview",  key: "M",  view: "market" as ViewMode,    icon: LayoutDashboard },
  { label: "Chart",            key: "G",  view: "chart" as ViewMode,     icon: LineChart },
  { label: "News Feed",        key: "N",  view: "news" as ViewMode,      icon: Newspaper },
  { label: "AI Agent",         key: "A",  view: "agent" as ViewMode,     icon: Bot },
  { label: "Stock Screener",   key: "S",  view: "screener" as ViewMode,  icon: Filter },
  { label: "Watchlist",        key: "W",  view: "watchlist" as ViewMode, icon: Star },
  { label: "Price Alerts",     key: "!",  view: "alerts" as ViewMode,    icon: BellRing },
  { label: "Economics",        key: "E",  view: "economics" as ViewMode, icon: Globe2 },
  { label: "Portfolio",        key: "P",  view: "portfolio" as ViewMode, icon: Briefcase },
];

const POPULAR_TICKERS = ["AAPL","MSFT","NVDA","TSLA","GOOGL","AMZN","META","JPM","BTC-USD","ETH-USD","GC=F","SPY"];

export default function CommandBar({ onClose, onSymbol, onNav }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isTickerQuery = query.trim().length > 0 && /^[A-Z0-9^.=-]+$/i.test(query.trim());

  const filteredCmds = QUICK_COMMANDS.filter(c =>
    !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.key.toLowerCase() === query.toLowerCase()
  );

  const filteredTickers = POPULAR_TICKERS.filter(t =>
    t.toLowerCase().includes(query.toUpperCase())
  );

  const allResults: Array<{ type: "cmd" | "ticker"; label: string; value: string; icon?: any }> = [
    ...filteredCmds.map(c => ({ type: "cmd" as const, label: c.label, value: c.view, icon: c.icon })),
    ...filteredTickers.map(t => ({ type: "ticker" as const, label: t, value: t, icon: TrendingUp })),
  ];

  const handleSelect = (item: (typeof allResults)[0]) => {
    if (item.type === "cmd") onNav(item.value as ViewMode);
    else onSymbol(item.value);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, allResults.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (allResults[selected]) handleSelect(allResults[selected]);
      else if (isTickerQuery) onSymbol(query.trim().toUpperCase());
    }
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-[#0d0d0d] border border-[hsl(38,95%,50%)/40%] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-[hsl(38,95%,55%)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value.toUpperCase()); setSelected(0); }}
            onKeyDown={handleKey}
            placeholder="TYPE TICKER OR COMMAND..."
            className="flex-1 bg-transparent font-terminal text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            data-testid="cmd-input"
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {allResults.length === 0 && query && (
            <div className="px-4 py-8 text-center font-terminal text-xs text-muted-foreground">
              PRESS ENTER TO QUOTE <span className="text-[hsl(38,95%,55%)]">{query}</span>
            </div>
          )}
          {allResults.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.type}-${item.value}`}
                onClick={() => handleSelect(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/50 text-left transition-colors ${
                  i === selected ? "bg-[hsl(38,95%,50%)/10%] text-foreground" : "hover:bg-white/5 text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="font-terminal text-xs">{item.label}</span>
                {item.type === "ticker" && (
                  <span className="ml-auto font-terminal text-[9px] text-[hsl(38,95%,55%)] tracking-widest">QUOTE</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 bg-black/30 border-t border-border">
          <span className="font-terminal text-[9px] text-muted-foreground">↑↓ NAVIGATE</span>
          <span className="font-terminal text-[9px] text-muted-foreground">↵ SELECT</span>
          <span className="font-terminal text-[9px] text-muted-foreground">ESC CLOSE</span>
          <span className="font-terminal text-[9px] text-muted-foreground ml-auto">/ TO OPEN</span>
        </div>
      </div>
    </div>
  );
}
