import { useMemo, useState } from "react";
import { Briefcase, Target, Plus, Trash2, TrendingUp, TrendingDown, X, Check, Clock, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { usePortfolioAnalytics, useQuotes, usePositions, useAddPosition, useDeletePosition } from "@/lib/useFinance";
import { formatPct, formatPrice, pctClass } from "@/lib/finance";
import { ratePortfolio, type PositionForRating, type PortfolioMetrics, type RatingResult } from "@shared/portfolioRating";
import { Skeleton } from "@/components/ui/skeleton";

interface Play {
  id: number;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  thesis: string;
  status: "planned" | "active" | "closed" | "cancelled";
  outcome?: "win" | "loss" | "breakeven";
  actualEntry?: number;
  actualExit?: number;
  createdAt: Date;
  closedAt?: Date;
}

interface Props {
  onSymbol: (sym: string) => void;
}

const ALLOCATION_COLORS = [
  "hsl(186,45%,55%)",
  "hsl(38,30%,55%)",
  "hsl(142,71%,45%)",
  "hsl(265,70%,65%)",
  "hsl(0,80%,55%)",
  "hsl(200,80%,55%)",
  "hsl(60,90%,55%)",
  "hsl(300,70%,60%)",
];

function formatMetric(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 && suffix === "%" ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function GradeBadge({ rating }: { rating: RatingResult }) {
  const gradeColors: Record<string, string> = {
    "A+": "text-green-400 bg-green-500/20 border-green-500/30",
    "A": "text-green-400 bg-green-500/15 border-green-500/25",
    "A-": "text-green-300 bg-green-500/10 border-green-500/20",
    "B+": "text-cyan-400 bg-cyan-500/15 border-cyan-500/25",
    "B": "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
    "B-": "text-cyan-300 bg-cyan-500/10 border-cyan-500/15",
    "C+": "text-yellow-400 bg-yellow-500/15 border-yellow-500/25",
    "C": "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
    "C-": "text-yellow-300 bg-yellow-500/10 border-yellow-500/15",
    "D+": "text-orange-400 bg-orange-500/15 border-orange-500/25",
    "D": "text-orange-300 bg-orange-500/10 border-orange-500/20",
    "D-": "text-orange-300 bg-orange-500/10 border-orange-500/15",
    "F": "text-red-400 bg-red-500/20 border-red-500/30",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`font-terminal text-2xl font-bold px-2 py-0.5 border ${gradeColors[rating.grade] ?? "text-muted-foreground"}`}>
        {rating.grade}
      </span>
      <span className="font-terminal text-[9px] text-muted-foreground tabular-nums">{rating.score}/100</span>
    </div>
  );
}

export default function PortfolioDashboard({ onSymbol }: Props) {
  const { data: dbPositions = [], isLoading: positionsLoading } = usePositions();
  const addPositionMutation = useAddPosition();
  const deletePositionMutation = useDeletePosition();
  const [plays, setPlays] = useState<Play[]>([]);
  const [addSym, setAddSym] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addCost, setAddCost] = useState("");
  const [activeTab, setActiveTab] = useState<"positions" | "plays">("positions");
  const [showPlayForm, setShowPlayForm] = useState(false);

  // Play form state
  const [formSym, setFormSym] = useState("");
  const [formDirection, setFormDirection] = useState<"long" | "short">("long");
  const [formEntry, setFormEntry] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formThesis, setFormThesis] = useState("");

  // Map DB positions to the shape the component expects
  const positions = useMemo(() => dbPositions.map(p => ({
    id: p.id,
    symbol: p.symbol,
    shares: p.quantity,
    avgCost: p.avgEntry,
  })), [dbPositions]);

  const analyticsPositions = useMemo(() => {
    return positions.map(({ symbol, shares, avgCost }) => ({ symbol, shares, avgCost }));
  }, [positions]);

  const { data: quotes = [] } = useQuotes(positions.map((position) => position.symbol));
  const { data: analytics, isLoading: analyticsLoading } = usePortfolioAnalytics(analyticsPositions);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const positionsWithValue = positions.map((position) => {
    const quote = quoteMap.get(position.symbol);
    const currentPrice = quote?.price ?? position.avgCost;
    const value = currentPrice * position.shares;
    const cost = position.avgCost * position.shares;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { ...position, currentPrice, value, cost, pnl, pnlPct, quote };
  });

  const totalValue = positionsWithValue.reduce((sum, position) => sum + position.value, 0);
  const totalCost = positionsWithValue.reduce((sum, position) => sum + position.cost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const allocation = positionsWithValue.map((position) => ({ name: position.symbol, value: position.value }));

  // Portfolio rating
  const rating = useMemo(() => {
    if (positionsWithValue.length === 0) return null;
    const positionsForRating: PositionForRating[] = positionsWithValue.map(p => ({
      symbol: p.symbol,
      sector: undefined, // TODO: fetch sector from fundamentals
      weight: totalValue > 0 ? p.value / totalValue : 0,
      pnlPercent: p.pnlPct,
    }));
    const metrics: PortfolioMetrics = {
      beta: analytics?.beta ?? 1,
      annualizedVolatilityPct: analytics?.annualizedVolatilityPct ?? 0,
      maxDrawdownPct: analytics?.maxDrawdownPct ?? 0,
      activeReturnPct: analytics?.activeReturnPct ?? 0,
    };
    return ratePortfolio(positionsForRating, metrics);
  }, [positionsWithValue, totalValue, analytics]);

  // Position handlers
  const handleAddPosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSym.trim() || !addShares || !addCost) return;
    addPositionMutation.mutate({
      symbol: addSym.trim().toUpperCase(),
      side: "long",
      quantity: Number(addShares),
      avgEntry: Number(addCost),
    });
    setAddSym(""); setAddShares(""); setAddCost("");
  };

  const handleRemovePosition = (id: number) => {
    deletePositionMutation.mutate(id);
  };

  // Play handlers
  const handleAddPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSym.trim() || !formEntry || !formTarget || !formStop) return;
    setPlays([...plays, {
      id: Date.now(),
      symbol: formSym.trim().toUpperCase(),
      direction: formDirection,
      entryPrice: parseFloat(formEntry),
      targetPrice: parseFloat(formTarget),
      stopLoss: parseFloat(formStop),
      thesis: formThesis.trim(),
      status: "planned",
      createdAt: new Date(),
    }]);
    setFormSym(""); setFormDirection("long"); setFormEntry(""); setFormTarget(""); setFormStop(""); setFormThesis(""); setShowPlayForm(false);
  };

  const handleActivatePlay = (id: number) => {
    setPlays(plays.map(p => p.id === id ? { ...p, status: "active" as const, actualEntry: p.entryPrice } : p));
  };

  const handleClosePlay = (id: number, outcome: "win" | "loss" | "breakeven", exitPrice: number) => {
    setPlays(plays.map(p => p.id === id ? { ...p, status: "closed" as const, outcome, actualExit: exitPrice, closedAt: new Date() } : p));
  };

  const handleDeletePlay = (id: number) => {
    setPlays(plays.filter(p => p.id !== id));
  };

  const activePlays = plays.filter(p => p.status === "active");
  const winPlays = plays.filter(p => p.outcome === "win").length;
  const lossPlays = plays.filter(p => p.outcome === "loss").length;
  const winRate = winPlays + lossPlays > 0 ? (winPlays / (winPlays + lossPlays)) * 100 : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[hsl(186,45%,55%)]" />
          <span className="panel-label">PORTFOLIO</span>
          {rating && <GradeBadge rating={rating} />}
        </div>
        <div className="text-right">
          <div className="font-terminal text-lg font-bold tabular-nums">${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          <div className={`font-terminal text-[10px] tabular-nums ${pctClass(totalPnlPct)}`}>
            {totalPnl >= 0 ? "+" : "-"}${Math.abs(totalPnl).toFixed(0)} ({formatPct(totalPnlPct)})
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("positions")}
          className={`flex-1 px-3 py-1.5 font-terminal text-[9px] tracking-widest transition-colors border-r border-border ${
            activeTab === "positions" ? "bg-[hsl(186,45%,50%)/10] border-b-2 text-[hsl(186,45%,55%)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          POSITIONS ({positions.length})
        </button>
        <button
          onClick={() => setActiveTab("plays")}
          className={`flex-1 px-3 py-1.5 font-terminal text-[9px] tracking-widest transition-colors ${
            activeTab === "plays" ? "bg-[hsl(186,45%,50%)/10] border-b-2 text-[hsl(186,45%,55%)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          PLAYS ({plays.length}) {activePlays.length > 0 && <span className="text-[hsl(142,71%,45%)]">● {activePlays.length}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === "positions" ? (
          <div className="p-4 space-y-4">
            {/* Add position form */}
            <form onSubmit={handleAddPosition} className="flex items-center gap-2 p-3 border border-border bg-[#080808]">
              <span className="font-terminal text-[9px] text-muted-foreground shrink-0">ADD</span>
              <input value={addSym} onChange={e => setAddSym(e.target.value.toUpperCase())} placeholder="TICKER" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
              <input type="number" value={addShares} onChange={e => setAddShares(e.target.value)} placeholder="QTY" className="w-16 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
              <input type="number" value={addCost} onChange={e => setAddCost(e.target.value)} placeholder="AVG COST" step="0.01" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
              <button type="submit" className="flex items-center gap-1 px-2 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] text-[hsl(186,45%,55%)] hover:bg-[hsl(186,45%,50%)/25%]">
                <Plus className="w-3 h-3" /> ADD
              </button>
            </form>

            {/* Positions table */}
            <div className="bg-[#080808] border border-border">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
                {['SYMBOL', 'QTY', 'AVG COST', 'PRICE', 'VALUE', 'P&L', 'RETURN', 'WEIGHT', ''].map((h, i) => (
                  <span key={h + i} className={i > 0 ? 'text-right' : ''}>{h}</span>
                ))}
              </div>
              {positionsWithValue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Briefcase className="w-6 h-6 text-muted-foreground/30 mb-2" />
                  <span className="font-terminal text-[10px] text-muted-foreground/50 tracking-wider">NO POSITIONS</span>
                </div>
              ) : (
                positionsWithValue.map(pos => {
                  const weightPct = totalValue > 0 ? (pos.value / totalValue) * 100 : 0;
                  return (
                    <div key={pos.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-3 py-2 border-b border-border/50 hover:bg-white/5 group items-center cursor-pointer" onClick={() => onSymbol(pos.symbol)}>
                      <span className="font-terminal text-[11px] font-bold text-[hsl(186,45%,55%)]">{pos.symbol}</span>
                      <span className="font-terminal text-[10px] tabular-nums text-right">{pos.shares}</span>
                      <span className="font-terminal text-[10px] tabular-nums text-right text-muted-foreground">${formatPrice(pos.avgCost)}</span>
                      <span className="font-terminal text-[10px] tabular-nums text-right">${formatPrice(pos.currentPrice)}</span>
                      <span className="font-terminal text-[10px] tabular-nums text-right">${pos.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                      <span className={`font-terminal text-[10px] tabular-nums text-right font-semibold ${pctClass(pos.pnl)}`}>{pos.pnl >= 0 ? '+' : '-'}${Math.abs(pos.pnl).toFixed(0)}</span>
                      <span className={`font-terminal text-[10px] tabular-nums text-right font-semibold ${pctClass(pos.pnlPct)}`}>{formatPct(pos.pnlPct)}</span>
                      <span className="font-terminal text-[10px] tabular-nums text-right text-muted-foreground">{weightPct.toFixed(1)}%</span>
                      <button onClick={e => { e.stopPropagation(); handleRemovePosition(pos.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rating flags */}
            {rating && rating.flags.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 p-3 space-y-1">
                <div className="font-terminal text-[9px] text-amber-400 tracking-widest mb-1">ALERTS</div>
                {rating.flags.map((flag, i) => (
                  <div key={i} className="font-terminal text-[9px] text-muted-foreground flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">▸</span> {flag}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Plays tab */
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {plays.length > 0 && (
                  <span className="font-terminal text-[9px] tabular-nums text-muted-foreground">
                    WIN <span className="text-[hsl(142,71%,45%)]">{winRate.toFixed(0)}%</span> | {winPlays}W-{lossPlays}L
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowPlayForm(!showPlayForm)}
                className="flex items-center gap-1 px-2 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] text-[hsl(186,45%,55%)] hover:bg-[hsl(186,45%,50%)/25%]"
              >
                <Plus className="w-3 h-3" /> NEW PLAY
              </button>
            </div>

            {showPlayForm && (
              <form onSubmit={handleAddPlay} className="p-3 border border-border bg-[#080808] space-y-2">
                <div className="flex items-center gap-2">
                  <input value={formSym} onChange={e => setFormSym(e.target.value.toUpperCase())} placeholder="TICKER" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
                  <select value={formDirection} onChange={e => setFormDirection(e.target.value as "long" | "short")} className="bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none">
                    <option value="long">LONG</option>
                    <option value="short">SHORT</option>
                  </select>
                  <input type="number" value={formEntry} onChange={e => setFormEntry(e.target.value)} placeholder="ENTRY" step="0.01" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
                  <input type="number" value={formTarget} onChange={e => setFormTarget(e.target.value)} placeholder="TARGET" step="0.01" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
                  <input type="number" value={formStop} onChange={e => setFormStop(e.target.value)} placeholder="STOP" step="0.01" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <input value={formThesis} onChange={e => setFormThesis(e.target.value)} placeholder="Thesis..." className="flex-1 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
                  <button type="submit" className="px-3 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] text-[hsl(186,45%,55%)] hover:bg-[hsl(186,45%,50%)/25%]">ADD</button>
                  <button type="button" onClick={() => setShowPlayForm(false)} className="px-3 py-1 border border-border font-terminal text-[10px] text-muted-foreground hover:text-foreground">CANCEL</button>
                </div>
              </form>
            )}

            {plays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Target className="w-6 h-6 text-muted-foreground/30" />
                <span className="font-terminal text-[10px] text-muted-foreground/50">NO PLAYS TRACKED</span>
              </div>
            ) : (
              plays.map(play => (
                <div key={play.id} className="border border-border/50 hover:bg-white/[0.03] p-3 group">
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-6 rounded-full shrink-0 ${play.direction === "long" ? "bg-[hsl(142,71%,45%)]" : "bg-[hsl(0,80%,55%)]"}`} />
                    <button onClick={() => onSymbol(play.symbol)} className="font-terminal text-[11px] font-bold text-[hsl(186,45%,55%)] hover:underline">{play.symbol}</button>
                    <span className={`font-terminal text-[8px] px-1 py-0.5 ${play.direction === "long" ? "text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)/10]" : "text-[hsl(0,80%,55%)] bg-[hsl(0,80%,55%)/10]"}`}>{play.direction.toUpperCase()}</span>
                    <span className={`font-terminal text-[8px] px-1 py-0.5 ${play.status === "active" ? "text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)/10]" : play.status === "planned" ? "text-[hsl(38,30%,55%)] bg-[hsl(38,30%,55%)/10]" : "text-muted-foreground bg-muted-foreground/10"}`}>{play.status.toUpperCase()}</span>
                    <span className="ml-auto font-terminal text-[9px] tabular-nums text-muted-foreground">E:${play.entryPrice.toFixed(2)} T:${play.targetPrice.toFixed(2)} S:${play.stopLoss.toFixed(2)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {play.status === "planned" && <button onClick={() => handleActivatePlay(play.id)} className="p-1 text-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,45%)/10]"><Check className="w-3 h-3" /></button>}
                      {play.status === "active" && <button onClick={() => handleClosePlay(play.id, "win", play.targetPrice)} className="p-1 text-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,45%)/10]"><TrendingUp className="w-3 h-3" /></button>}
                      <button onClick={() => handleDeletePlay(play.id)} className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {play.thesis && <p className="font-terminal text-[9px] text-muted-foreground mt-1.5 ml-4">{play.thesis}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-[#070707] shrink-0">
        <span className="font-terminal text-[8px] text-muted-foreground">
          {positionsWithValue.length} positions | {plays.length} plays
        </span>
        <span className="font-terminal text-[8px] text-muted-foreground tabular-nums">
          {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
