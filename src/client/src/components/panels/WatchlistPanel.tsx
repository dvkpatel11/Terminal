import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuotes, useNews } from "@/lib/useFinance";
import { formatPrice, formatBig, pctClass } from "@/lib/finance";
import type { Quote, NewsItem } from "@/lib/finance";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Star, BarChart3, Newspaper, Info } from "lucide-react";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { WatchlistItem } from "@shared/schema";
import type { ViewMode } from "@/lib/terminalTypes";
import { NewsList } from "@/components/news";

interface Props {
  onSymbol: (sym: string) => void;
  onNav?: (v: ViewMode) => void;
}

const ACCENT = "hsl(186,45%,55%)";

export default function WatchlistPanel({ onSymbol, onNav }: Props) {
  const [addSym, setAddSym] = useState("");
  const [addName, setAddName] = useState("");
  const [selectedSym, setSelectedSym] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"news" | "stats">("news");
  const qc = useQueryClient();

  const { data: watchlist = [], isLoading: wLoad } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
    queryFn: async () => {
      const res = await fetch("/api/watchlist");
      return res.json();
    },
  });

  const symbols = watchlist.map(w => w.symbol);
  const { data: quotes } = useQuotes(symbols);
  const quoteMap = new Map((quotes ?? []).map((q: Quote) => [q.symbol, q]));

  const activeSymbol = selectedSym || watchlist[0]?.symbol || "";
  const activeQuote = quoteMap.get(activeSymbol);

  const { data: news = [] } = useNews(activeSymbol);

  if (!selectedSym && watchlist.length > 0) {
    setSelectedSym(watchlist[0].symbol);
  }

  const addMut = useMutation({
    mutationFn: async ({ symbol, name }: { symbol: string; name: string }) => {
      await apiRequest("POST", "/api/watchlist", { symbol, name });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/watchlist"] }); setAddSym(""); setAddName(""); },
  });

  const removeMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/watchlist"] }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = addSym.trim().toUpperCase();
    if (!sym) return;
    addMut.mutate({ symbol: sym, name: addName.trim() || sym });
  };

  const gainers = quotes?.filter((q: Quote) => q.changePercent > 0).length ?? 0;
  const losers = quotes?.filter((q: Quote) => q.changePercent < 0).length ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <Star className="w-4 h-4" style={{ color: ACCENT }} />
        <span className="panel-label">WATCHLIST</span>
        <span className="font-terminal text-[9px] text-muted-foreground ml-2">{watchlist.length} SYMBOLS</span>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <span className="font-terminal text-[9px] text-muted-foreground shrink-0">ADD</span>
        <input
          value={addSym}
          onChange={e => setAddSym(e.target.value.toUpperCase())}
          placeholder="TICKER"
          className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
        />
        <input
          value={addName}
          onChange={e => setAddName(e.target.value)}
          placeholder="NAME (optional)"
          className="flex-1 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
        />
        <button
          type="submit"
          disabled={!addSym.trim() || addMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] hover:bg-[hsl(186,45%,50%)/25%] disabled:opacity-40 transition-colors"
          style={{ color: ACCENT }}
        >
          <Plus className="w-3 h-3" /> ADD
        </button>
      </form>

      {/* Main content: left table + right detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Watchlist table */}
        <div className="w-[280px] shrink-0 flex flex-col border-r border-border">
          <div className="grid grid-cols-[1fr_70px_60px] gap-px px-3 py-1.5 border-b border-border bg-[#0a0a0a] shrink-0">
            {["TICKER", "PRICE", "CHG%"].map((h, i) => (
              <span key={i} className={`font-terminal text-[8px] tracking-wider text-muted-foreground ${i > 0 ? "text-right" : ""}`}>{h}</span>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {wLoad ? (
              Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 mx-3 my-1 bg-border" />)
            ) : watchlist.length === 0 ? (
              <div className="flex items-center justify-center h-32 font-terminal text-[10px] text-muted-foreground">
                Add symbols to your watchlist
              </div>
            ) : watchlist.map((w) => {
              const q = quoteMap.get(w.symbol);
              const isSelected = w.symbol === activeSymbol;
              return (
                <div
                  key={w.id}
                  className={`grid grid-cols-[1fr_70px_60px_auto] gap-px px-3 py-2 border-b border-border/50 items-center cursor-pointer group hover:bg-white/[0.03] transition-colors ${
                    isSelected ? "bg-[hsl(186,45%,50%)/8] border-l-2" : ""
                  }`}
                  style={isSelected ? { borderLeftColor: ACCENT } : {}}
                  onClick={() => { setSelectedSym(w.symbol); onSymbol(w.symbol); }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Star className="w-2.5 h-2.5 shrink-0" style={{ color: ACCENT, fill: ACCENT }} />
                    <span className="font-terminal text-[11px] font-bold truncate" style={{ color: ACCENT }}>{w.symbol}</span>
                  </div>
                  <span className="font-terminal text-[11px] tabular-nums text-right text-foreground">
                    {q ? `$${formatPrice(q.price)}` : "—"}
                  </span>
                  <span className={`font-terminal text-[10px] tabular-nums font-semibold text-right ${q ? pctClass(q.changePercent) : "text-muted-foreground"}`}>
                    {q ? `${q.changePercent >= 0 ? "▲" : "▼"}${Math.abs(q.changePercent).toFixed(2)}%` : "—"}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removeMut.mutate(w.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-[hsl(0,80%,60%)] transition-all p-0.5 ml-1"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Symbol detail */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#060606]">
          {activeSymbol ? (
            <>
              {/* Symbol header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <span className="font-terminal text-lg font-bold" style={{ color: ACCENT }}>{activeSymbol}</span>
                  {activeQuote && (
                    <span className="font-terminal text-[10px] text-muted-foreground truncate max-w-[200px]">{activeQuote.name}</span>
                  )}
                  {activeQuote?.status && (
                    <DataStatusBadge status={activeQuote.status} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSymbol(activeSymbol)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:border-cyan-500/60 hover:text-cyan-400 font-terminal text-[10px] text-muted-foreground transition-colors"
                  >
                    <BarChart3 className="w-3 h-3" /> DETAILS
                  </button>
                  {onNav && (
                    <button
                      onClick={() => onNav("chart")}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:border-cyan-500/60 hover:text-cyan-400 font-terminal text-[10px] text-muted-foreground transition-colors"
                    >
                      <BarChart3 className="w-3 h-3" /> CHART
                    </button>
                  )}
                </div>
              </div>

              {/* Key stats row */}
              {activeQuote && (
                <div className="flex items-center gap-6 px-5 py-2.5 border-b border-border/50 shrink-0 bg-[#080808]">
                  <div className="flex items-baseline gap-3">
                    <span className="font-terminal text-xl font-bold tabular-nums text-foreground">${formatPrice(activeQuote.price)}</span>
                    <span className={`font-terminal text-sm font-semibold tabular-nums ${pctClass(activeQuote.change)}`}>
                      {activeQuote.change >= 0 ? "+" : ""}{activeQuote.change.toFixed(2)}
                    </span>
                    <span className={`font-terminal text-sm font-semibold tabular-nums ${pctClass(activeQuote.changePercent)}`}>
                      ({activeQuote.changePercent >= 0 ? "+" : ""}{activeQuote.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="font-terminal text-[9px] tabular-nums">
                      MCAP <span className="text-foreground">{formatBig(activeQuote.marketCap)}</span>
                    </span>
                    <span className="font-terminal text-[9px] tabular-nums">
                      P/E <span className="text-foreground">{activeQuote.pe !== null ? activeQuote.pe.toFixed(1) : "—"}</span>
                    </span>
                    <span className="font-terminal text-[9px] tabular-nums">
                      VOL <span className="text-foreground">{(activeQuote.volume / 1e6).toFixed(1)}M</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Sub-panels: News + Stats */}
              <div className="flex flex-1 overflow-hidden">
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex border-b border-border shrink-0">
                    <button
                      onClick={() => setDetailTab("news")}
                      className={`flex items-center gap-1.5 px-4 py-2 font-terminal text-[9px] tracking-widest transition-colors border-r border-border ${
                        detailTab === "news"
                          ? "bg-cyan-500/10 border-b-2"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      style={detailTab === "news" ? { color: ACCENT, borderBottomColor: ACCENT } : {}}
                    >
                      <Newspaper className="w-3 h-3" /> FINANCIAL NEWS
                    </button>
                    <button
                      onClick={() => setDetailTab("stats")}
                      className={`flex items-center gap-1.5 px-4 py-2 font-terminal text-[9px] tracking-widest transition-colors ${
                        detailTab === "stats"
                          ? "bg-cyan-500/10 border-b-2"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      style={detailTab === "stats" ? { color: ACCENT, borderBottomColor: ACCENT } : {}}
                    >
                      <Info className="w-3 h-3" /> KEY STATS
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {detailTab === "news" ? (
                      news.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="font-terminal text-[10px] text-muted-foreground">No recent news for {activeSymbol}</p>
                        </div>
                      ) : (
                        <NewsList
                          items={news}
                          variant="dense"
                          maxItems={20}
                          className="flex-1"
                        />
                      )
                    ) : (
                      activeQuote ? (
                        <div className="p-5 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <StatBox label="OPEN" value={`$${formatPrice(activeQuote.open)}`} />
                            <StatBox label="PREV CLOSE" value={`$${formatPrice(activeQuote.previousClose)}`} />
                            <StatBox label="DAY HIGH" value={`$${formatPrice(activeQuote.dayHigh)}`} />
                            <StatBox label="DAY LOW" value={`$${formatPrice(activeQuote.dayLow)}`} />
                            <StatBox label="52W HIGH" value={`$${formatPrice(activeQuote.high52)}`} />
                            <StatBox label="52W LOW" value={`$${formatPrice(activeQuote.low52)}`} />
                            <StatBox label="VOLUME" value={activeQuote.volume.toLocaleString()} />
                            <StatBox label="AVG VOLUME" value={activeQuote.avgVolume.toLocaleString()} />
                            {activeQuote.pe !== null && <StatBox label="P/E RATIO" value={activeQuote.pe.toFixed(1)} />}
                            {activeQuote.eps !== null && <StatBox label="EPS (TTM)" value={`$${activeQuote.eps.toFixed(2)}`} />}
                            <StatBox label="MARKET CAP" value={formatBig(activeQuote.marketCap)} />
                            <StatBox label="EXCHANGE" value={activeQuote.exchange} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="font-terminal text-[10px] text-muted-foreground">No data available</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="font-terminal text-[10px] text-muted-foreground">Add symbols to your watchlist to see details</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-terminal text-[8px] text-muted-foreground">
            <span className="text-up">▲ {gainers}</span>  <span className="text-down">▼ {losers}</span>  <span className="text-flat">— {symbols.length - gainers - losers}</span>
          </span>
          <span className="font-terminal text-[8px] text-muted-foreground tracking-wider">{quotes?.length ?? 0}/{symbols.length} LOADED</span>
        </div>
        <div className="flex items-center gap-3">
          {activeQuote && (
            <span className="font-terminal text-[8px] text-muted-foreground tabular-nums">
              DAY: ${formatPrice(activeQuote.dayLow)} — ${formatPrice(activeQuote.dayHigh)}
            </span>
          )}
          <span className="font-terminal text-[8px] text-muted-foreground">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#080808] border border-border/50 px-3 py-2.5">
      <div className="font-terminal text-[8px] text-muted-foreground tracking-wider">{label}</div>
      <div className="font-terminal text-[11px] tabular-nums text-foreground mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
