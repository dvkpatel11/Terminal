import { useState } from "react";
import { useQuotes } from "@/lib/useFinance";
import { formatPrice, formatPct, formatBig, pctClass } from "@/lib/finance";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";

interface Position {
  id: number;
  symbol: string;
  shares: number;
  avgCost: number;
}

interface Props { onSymbol: (sym: string) => void }

const DEFAULT_POSITIONS: Position[] = [
  { id: 1, symbol: "AAPL",  shares: 50,   avgCost: 185.20 },
  { id: 2, symbol: "MSFT",  shares: 25,   avgCost: 380.40 },
  { id: 3, symbol: "NVDA",  shares: 20,   avgCost: 620.00 },
  { id: 4, symbol: "TSLA",  shares: 30,   avgCost: 220.50 },
  { id: 5, symbol: "META",  shares: 15,   avgCost: 480.00 },
  { id: 6, symbol: "GOOGL", shares: 10,   avgCost: 165.00 },
  { id: 7, symbol: "JPM",   shares: 40,   avgCost: 215.00 },
  { id: 8, symbol: "XOM",   shares: 35,   avgCost: 105.00 },
];

// Portfolio history (30 days simulated)
const genHistory = () => {
  let val = 125000;
  return Array.from({ length: 30 }, (_, i) => {
    val = val * (1 + (Math.random() - 0.48) * 0.01);
    return {
      date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(val),
    };
  });
};

const PORTFOLIO_HISTORY = genHistory();

const SECTOR_COLORS = [
  "hsl(38,95%,55%)", "hsl(186,80%,55%)", "hsl(142,71%,45%)", "hsl(265,70%,65%)",
  "hsl(0,80%,55%)", "hsl(200,80%,55%)", "hsl(60,90%,55%)", "hsl(300,70%,60%)",
];

export default function PortfolioPanel({ onSymbol }: Props) {
  const [positions, setPositions] = useState<Position[]>(DEFAULT_POSITIONS);
  const [addSym, setAddSym] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addCost, setAddCost] = useState("");
  const [nextId, setNextId] = useState(DEFAULT_POSITIONS.length + 1);

  const { data: quotes } = useQuotes(positions.map(p => p.symbol));
  const quoteMap = new Map((quotes || []).map((q: any) => [q.symbol, q]));

  const positionsWithValue = positions.map(p => {
    const q = quoteMap.get(p.symbol) as any;
    const currentPrice = q?.price ?? p.avgCost;
    const value = currentPrice * p.shares;
    const cost = p.avgCost * p.shares;
    const pnl = value - cost;
    const pnlPct = (pnl / cost) * 100;
    return { ...p, currentPrice, value, cost, pnl, pnlPct, quote: q };
  });

  const totalValue = positionsWithValue.reduce((s, p) => s + p.value, 0);
  const totalCost = positionsWithValue.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const pieData = positionsWithValue.map(p => ({ name: p.symbol, value: p.value }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSym.trim() || !addShares || !addCost) return;
    setPositions(prev => [...prev, {
      id: nextId,
      symbol: addSym.trim().toUpperCase(),
      shares: parseFloat(addShares),
      avgCost: parseFloat(addCost),
    }]);
    setNextId(n => n + 1);
    setAddSym(""); setAddShares(""); setAddCost("");
  };

  const handleRemove = (id: number) => setPositions(prev => prev.filter(p => p.id !== id));

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[hsl(38,95%,55%)]" />
          <span className="panel-label">PORTFOLIO</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-terminal text-lg font-bold tabular-nums">${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
            <div className={`font-terminal text-[10px] tabular-nums ${pctClass(totalPnlPct)}`}>
              {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(0)} ({formatPct(totalPnlPct)})
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Add position form */}
        <form onSubmit={handleAdd} className="flex items-center gap-2 p-3 border border-border bg-[#080808]">
          <span className="font-terminal text-[9px] text-muted-foreground shrink-0">ADD POSITION</span>
          <input value={addSym} onChange={e => setAddSym(e.target.value.toUpperCase())} placeholder="TICKER" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
          <input type="number" value={addShares} onChange={e => setAddShares(e.target.value)} placeholder="SHARES" className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
          <input type="number" value={addCost} onChange={e => setAddCost(e.target.value)} placeholder="AVG COST" step="0.01" className="w-24 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none" />
          <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(38,95%,50%)/15%] border border-[hsl(38,95%,50%)/40%] font-terminal text-[10px] text-[hsl(38,95%,55%)] hover:bg-[hsl(38,95%,50%)/25%]">
            <Plus className="w-3 h-3" /> ADD
          </button>
        </form>

        {/* Summary cards + chart */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "TOTAL VALUE",  value: `$${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, cls: "" },
            { label: "TOTAL P&L",    value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(0)}`, cls: pctClass(totalPnl) },
            { label: "RETURN %",     value: formatPct(totalPnlPct), cls: pctClass(totalPnlPct) },
          ].map(card => (
            <div key={card.label} className="bg-[#080808] border border-border p-3">
              <div className="font-terminal text-[9px] text-muted-foreground tracking-widest mb-1">{card.label}</div>
              <div className={`font-terminal text-xl font-bold tabular-nums ${card.cls}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Performance chart + allocation pie */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-[#080808] border border-border p-3">
            <div className="panel-label mb-2">30D PERFORMANCE</div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={PORTFOLIO_HISTORY} margin={{ top: 4, right: 4, bottom: 4, left: 48 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(0,0%,12%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} interval={6} />
                <YAxis tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: "#0d0d0d", border: "1px solid hsl(0,0%,13%)", fontFamily: "monospace", fontSize: 9 }} formatter={(v: any) => [`$${v.toLocaleString()}`, "Value"]} />
                <Line type="monotone" dataKey="value" stroke="hsl(38,95%,55%)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#080808] border border-border p-3">
            <div className="panel-label mb-2">ALLOCATION</div>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={50} dataKey="value" nameKey="name" label={({ name }) => name} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Positions table */}
        <div className="bg-[#080808] border border-border">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1.5fr_1.5fr_auto] px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
            {["SYMBOL","SHARES","AVG COST","CURRENT","VALUE","P&L","RETURN",""].map((h, i) => (
              <span key={i} className={i > 0 ? "text-right" : ""}>{h}</span>
            ))}
          </div>
          {positionsWithValue.map(p => (
            <div
              key={p.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_1.5fr_1.5fr_auto] px-3 py-2.5 border-b border-border/50 hover:bg-white/5 group items-center cursor-pointer"
              onClick={() => onSymbol(p.symbol)}
            >
              <span className="font-terminal text-[11px] font-bold text-[hsl(38,95%,55%)]">{p.symbol}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right">{p.shares}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right text-muted-foreground">${formatPrice(p.avgCost)}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right">${formatPrice(p.currentPrice)}</span>
              <span className="font-terminal text-[10px] tabular-nums text-right">${p.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
              <span className={`font-terminal text-[10px] tabular-nums text-right font-semibold ${pctClass(p.pnl)}`}>
                {p.pnl >= 0 ? "+" : ""}${Math.abs(p.pnl).toFixed(0)}
              </span>
              <span className={`font-terminal text-[10px] tabular-nums text-right font-semibold ${pctClass(p.pnlPct)}`}>
                {formatPct(p.pnlPct)}
              </span>
              <button onClick={e => { e.stopPropagation(); handleRemove(p.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-[hsl(0,80%,60%)] transition-all p-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
