import { useState, useEffect } from "react";
import { Search, Bell, Zap, Terminal } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import { getMarketStatus } from "@/lib/terminalChrome";

interface Props {
  activeSymbol: string;
  view: ViewMode;
  onNav: (v: ViewMode) => void;
  onSymbol: (sym: string) => void;
  onOpenCmd: () => void;
}

export default function TopBar({ activeSymbol, view, onNav, onSymbol, onOpenCmd }: Props) {
  const [searchVal, setSearchVal] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const mktStatus = getMarketStatus(clock);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const v = searchVal.trim().toUpperCase();
    if (v) {
      onSymbol(v);
      setSearchVal("");
    }
  };

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = clock.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();

  return (
    <header className="flex items-center gap-0 h-9 bg-[#0a0a0a] border-b border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 h-full border-r border-border bg-[hsl(38,95%,50%)] min-w-[140px]">
        <Terminal className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
        <span className="font-terminal text-xs font-bold tracking-widest text-black">TERMINAL</span>
      </div>

      {/* Nav buttons */}
      <nav className="flex items-center h-full">
        {([
          ["market",    "MRKT"],
          ["chart",     "CHRT"],
          ["news",      "NEWS"],
          ["screener",  "SCRN"],
          ["agent",     "AI"],
          ["economics", "ECON"],
          ["portfolio", "PORT"],
        ] as [ViewMode, string][]).map(([v, label]) => (
          <button
            key={v}
            data-testid={`nav-${v}`}
            onClick={() => onNav(v)}
            className={`h-full px-3 font-terminal text-[10px] tracking-widest border-r border-border transition-colors ${
              view === v
                ? "bg-amber-500/10 text-[hsl(38,95%,60%)] border-b-2 border-b-[hsl(38,95%,50%)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Market status */}
      <div className="flex items-center gap-1.5 px-3 h-full border-r border-border">
        {mktStatus.pulse && (
          <div className="relative w-1.5 h-1.5">
            <div className={`absolute inset-0 rounded-full ${mktStatus.color === "text-up" ? "bg-[hsl(142,71%,45%)]" : "bg-[hsl(38,95%,50%)]"} animate-ping opacity-75`} />
            <div className={`w-1.5 h-1.5 rounded-full ${mktStatus.color === "text-up" ? "bg-[hsl(142,71%,45%)]" : "bg-[hsl(38,95%,50%)]"}`} />
          </div>
        )}
        <span className={`font-terminal text-[9px] tracking-widest font-semibold ${mktStatus.color}`}>{mktStatus.label}</span>
      </div>

      {/* Active symbol badge */}
      <button
        className="flex items-center gap-1.5 px-2.5 h-full border-r border-border hover:bg-white/5"
        onClick={() => onNav("quote")}
        data-testid="active-symbol"
      >
        <span className="font-terminal text-[9px] text-muted-foreground">ACTIVE</span>
        <span className="font-terminal text-xs font-bold text-amber-500">{activeSymbol}</span>
      </button>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center h-full border-r border-border group">
        <div className="flex items-center gap-1.5 px-2.5">
          <Search className="w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="TICKER <GO>"
            value={searchVal}
            onChange={e => setSearchVal(e.target.value.toUpperCase())}
            className="bg-transparent font-terminal text-[10px] text-[hsl(38,95%,60%)] placeholder:text-muted-foreground/60 focus:outline-none w-24 uppercase"
            data-testid="ticker-search"
          />
          {searchVal && (
            <button type="submit" className="font-terminal text-[8px] px-1.5 py-0.5 bg-[hsl(38,95%,50%)] text-black rounded font-bold">
              GO
            </button>
          )}
        </div>
      </form>

      {/* Command bar shortcut */}
      <button
        onClick={onOpenCmd}
        className="flex items-center gap-1.5 px-2.5 h-full border-r border-border hover:bg-white/5 text-muted-foreground hover:text-foreground"
        data-testid="cmd-open"
      >
        <Zap className="w-3 h-3" />
        <span className="font-terminal text-[9px] tracking-widest">/CMD</span>
      </button>

      {/* Alerts */}
      <button
        onClick={() => onNav("alerts")}
        className="flex items-center justify-center w-9 h-full border-r border-border hover:bg-white/5 text-muted-foreground hover:text-[hsl(38,95%,55%)]"
        data-testid="nav-alerts"
      >
        <Bell className="w-3.5 h-3.5" />
      </button>

      {/* Clock */}
      <div className="flex flex-col items-end justify-center px-3 h-full font-terminal">
        <span className="text-[10px] text-foreground tabular-nums">{timeStr}</span>
        <span className="text-[9px] text-muted-foreground">{dateStr}</span>
      </div>
    </header>
  );
}
