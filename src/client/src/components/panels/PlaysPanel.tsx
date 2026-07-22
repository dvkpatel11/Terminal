import { useState } from "react";
import { Target, Plus, Trash2, TrendingUp, TrendingDown, X, Check, Clock, AlertTriangle } from "lucide-react";
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

const ACCENT = "hsl(186,45%,55%)";

export default function PlaysPanel({ onSymbol }: Props) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [filter, setFilter] = useState<"all" | "planned" | "active" | "closed">("all");

  // Form state
  const [formSym, setFormSym] = useState("");
  const [formDirection, setFormDirection] = useState<"long" | "short">("long");
  const [formEntry, setFormEntry] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formThesis, setFormThesis] = useState("");

  const filteredPlays = plays.filter(p => filter === "all" || p.status === filter);
  const activePlays = plays.filter(p => p.status === "active");
  const winPlays = plays.filter(p => p.outcome === "win").length;
  const lossPlays = plays.filter(p => p.outcome === "loss").length;
  const winRate = winPlays + lossPlays > 0 ? (winPlays / (winPlays + lossPlays)) * 100 : 0;

  const handleAddPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSym.trim() || !formEntry || !formTarget || !formStop) return;

    const newPlay: Play = {
      id: Date.now(),
      symbol: formSym.trim().toUpperCase(),
      direction: formDirection,
      entryPrice: parseFloat(formEntry),
      targetPrice: parseFloat(formTarget),
      stopLoss: parseFloat(formStop),
      thesis: formThesis.trim(),
      status: "planned",
      createdAt: new Date(),
    };

    setPlays([...plays, newPlay]);
    resetForm();
  };

  const resetForm = () => {
    setFormSym("");
    setFormDirection("long");
    setFormEntry("");
    setFormTarget("");
    setFormStop("");
    setFormThesis("");
    setShowForm(false);
  };

  const handleActivatePlay = (id: number) => {
    setPlays(plays.map(p =>
      p.id === id ? { ...p, status: "active", actualEntry: p.entryPrice } : p
    ));
  };

  const handleClosePlay = (id: number, outcome: "win" | "loss" | "breakeven", exitPrice: number) => {
    setPlays(plays.map(p =>
      p.id === id ? { ...p, status: "closed", outcome, actualExit: exitPrice, closedAt: new Date() } : p
    ));
    setSelectedPlay(null);
  };

  const handleCancelPlay = (id: number) => {
    setPlays(plays.map(p =>
      p.id === id ? { ...p, status: "cancelled" } : p
    ));
  };

  const handleDeletePlay = (id: number) => {
    setPlays(plays.filter(p => p.id !== id));
    if (selectedPlay?.id === id) setSelectedPlay(null);
  };

  const calculatePnL = (play: Play) => {
    if (!play.actualEntry || !play.actualExit) return null;
    const multiplier = play.direction === "long" ? 1 : -1;
    return (play.actualExit - play.actualEntry) * multiplier;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="panel-label">TRADE PLAYS</span>
          <span className="font-terminal text-[9px] text-muted-foreground ml-2">{plays.length} PLAYS</span>
        </div>
        <div className="flex items-center gap-3">
          {plays.length > 0 && (
            <span className="font-terminal text-[9px] tabular-nums">
              <span className="text-[hsl(142,71%,45%)]">WIN {winRate.toFixed(0)}%</span>
              <span className="text-muted-foreground mx-1">|</span>
              <span className="text-muted-foreground">{winPlays}W-{lossPlays}L</span>
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-2 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] hover:bg-[hsl(186,45%,50%)/25%] transition-colors"
            style={{ color: ACCENT }}
          >
            <Plus className="w-3 h-3" /> NEW PLAY
          </button>
        </div>
      </div>

      {/* Create play form */}
      {showForm && (
        <form onSubmit={handleAddPlay} className="px-4 py-3 border-b border-border bg-[#070707] shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-terminal text-[9px] text-muted-foreground shrink-0">SYMBOL</span>
            <input
              value={formSym}
              onChange={e => setFormSym(e.target.value.toUpperCase())}
              placeholder="TICKER"
              className="w-20 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
            />
            <select
              value={formDirection}
              onChange={e => setFormDirection(e.target.value as "long" | "short")}
              className="bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none"
            >
              <option value="long">LONG</option>
              <option value="short">SHORT</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-terminal text-[9px] text-muted-foreground shrink-0">ENTRY</span>
            <input
              type="number"
              value={formEntry}
              onChange={e => setFormEntry(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-24 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
            />
            <span className="font-terminal text-[9px] text-muted-foreground shrink-0">TARGET</span>
            <input
              type="number"
              value={formTarget}
              onChange={e => setFormTarget(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-24 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
            />
            <span className="font-terminal text-[9px] text-muted-foreground shrink-0">STOP</span>
            <input
              type="number"
              value={formStop}
              onChange={e => setFormStop(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-24 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-terminal text-[9px] text-muted-foreground shrink-0">THESIS</span>
            <input
              value={formThesis}
              onChange={e => setFormThesis(e.target.value)}
              placeholder="Trade rationale..."
              className="flex-1 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-[10px] focus:outline-none focus:border-[hsl(186,45%,50%)/50%]"
            />
            <button
              type="submit"
              disabled={!formSym.trim() || !formEntry || !formTarget || !formStop}
              className="flex items-center gap-1.5 px-3 py-1 bg-[hsl(186,45%,50%)/15%] border border-[hsl(186,45%,50%)/40%] font-terminal text-[10px] hover:bg-[hsl(186,45%,50%)/25%] disabled:opacity-40 transition-colors"
              style={{ color: ACCENT }}
            >
              <Plus className="w-3 h-3" /> ADD
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1 border border-border font-terminal text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              CANCEL
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["all", "planned", "active", "closed"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 px-3 py-2 font-terminal text-[9px] tracking-widest transition-colors border-r border-border last:border-r-0 ${
              filter === tab
                ? "bg-[hsl(186,45%,50%)/10] border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={filter === tab ? { color: ACCENT, borderBottomColor: ACCENT } : {}}
          >
            {tab.toUpperCase()} {tab !== "all" && `(${plays.filter(p => p.status === tab).length})`}
          </button>
        ))}
      </div>

      {/* Plays list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {plays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Target className="w-8 h-8 text-muted-foreground/30" />
            <span className="font-terminal text-xs text-muted-foreground">NO PLAYS TRACKED</span>
            <span className="font-terminal text-[9px] text-muted-foreground/60">Click "NEW PLAY" to add your first trade idea</span>
          </div>
        ) : filteredPlays.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="font-terminal text-[10px] text-muted-foreground">No {filter} plays</span>
          </div>
        ) : (
          filteredPlays.map(play => (
            <div
              key={play.id}
              className={`border-b border-border/50 hover:bg-white/[0.03] transition-colors ${
                selectedPlay?.id === play.id ? "bg-[hsl(186,45%,50%)/5]" : ""
              }`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer group"
                onClick={() => setSelectedPlay(selectedPlay?.id === play.id ? null : play)}
              >
                {/* Direction indicator */}
                <div className={`w-1.5 h-8 rounded-full shrink-0 ${
                  play.direction === "long" ? "bg-[hsl(142,71%,45%)]" : "bg-[hsl(0,80%,55%)]"
                }`} />

                {/* Symbol and thesis */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); onSymbol(play.symbol); }}
                      className="font-terminal text-[11px] font-bold hover:underline"
                      style={{ color: ACCENT }}
                    >
                      {play.symbol}
                    </button>
                    <span className={`font-terminal text-[8px] px-1.5 py-0.5 ${
                      play.direction === "long"
                        ? "text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)/10]"
                        : "text-[hsl(0,80%,55%)] bg-[hsl(0,80%,55%)/10]"
                    }`}>
                      {play.direction.toUpperCase()}
                    </span>
                    <StatusBadge status={play.status} />
                    {play.outcome && <OutcomeBadge outcome={play.outcome} />}
                  </div>
                  {play.thesis && (
                    <p className="font-terminal text-[9px] text-muted-foreground mt-1 truncate">{play.thesis}</p>
                  )}
                </div>

                {/* Prices */}
                <div className="flex items-center gap-4 text-right shrink-0">
                  <div>
                    <div className="font-terminal text-[8px] text-muted-foreground">ENTRY</div>
                    <div className="font-terminal text-[10px] tabular-nums">${play.entryPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-terminal text-[8px] text-[hsl(142,71%,45%)]">TARGET</div>
                    <div className="font-terminal text-[10px] tabular-nums text-[hsl(142,71%,45%)]">${play.targetPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-terminal text-[8px] text-[hsl(0,80%,55%)]">STOP</div>
                    <div className="font-terminal text-[10px] tabular-nums text-[hsl(0,80%,55%)]">${play.stopLoss.toFixed(2)}</div>
                  </div>
                  {play.outcome && (
                    <div>
                      <div className="font-terminal text-[8px] text-muted-foreground">P&L</div>
                      <div className={`font-terminal text-[10px] tabular-nums font-semibold ${
                        calculatePnL(play) !== null && calculatePnL(play)! >= 0 ? "text-[hsl(142,71%,45%)]" : "text-[hsl(0,80%,55%)]"
                      }`}>
                        {calculatePnL(play) !== null ? `$${calculatePnL(play)!.toFixed(2)}` : "—"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {play.status === "planned" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleActivatePlay(play.id); }}
                      className="p-1 text-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,45%)/10] transition-colors"
                      title="Activate play"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {play.status === "active" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleClosePlay(play.id, "win", play.targetPrice); }}
                      className="p-1 text-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,45%)/10] transition-colors"
                      title="Close as win"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {play.status !== "closed" && play.status !== "cancelled" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleCancelPlay(play.id); }}
                      className="p-1 text-muted-foreground hover:text-[hsl(0,80%,55%)] transition-colors"
                      title="Cancel play"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDeletePlay(play.id); }}
                    className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-[hsl(0,80%,60%)] transition-all"
                    title="Delete play"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-terminal text-[8px] text-muted-foreground">
            <span className="text-[hsl(142,71%,45%)]">● {activePlays.length} ACTIVE</span>
            <span className="text-muted-foreground mx-1">|</span>
            <span className="text-muted-foreground">{plays.filter(p => p.status === "planned").length} PLANNED</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {plays.length > 0 && (
            <span className="font-terminal text-[8px] text-muted-foreground tabular-nums">
              AVG R:R {(plays.reduce((sum, p) => {
                const risk = Math.abs(p.entryPrice - p.stopLoss);
                const reward = Math.abs(p.targetPrice - p.entryPrice);
                return sum + (risk > 0 ? reward / risk : 0);
              }, 0) / plays.length).toFixed(1)}
            </span>
          )}
          <span className="font-terminal text-[8px] text-muted-foreground">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Play["status"] }) {
  const styles = {
    planned: "text-[hsl(38,30%,55%)] bg-[hsl(38,30%,55%)/10]",
    active: "text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)/10]",
    closed: "text-muted-foreground bg-muted-foreground/10",
    cancelled: "text-[hsl(0,80%,55%)] bg-[hsl(0,80%,55%)/10]",
  };

  const icons = {
    planned: <Clock className="w-2.5 h-2.5" />,
    active: <AlertTriangle className="w-2.5 h-2.5" />,
    closed: <Check className="w-2.5 h-2.5" />,
    cancelled: <X className="w-2.5 h-2.5" />,
  };

  return (
    <span className={`flex items-center gap-1 font-terminal text-[8px] px-1.5 py-0.5 ${styles[status]}`}>
      {icons[status]}
      {status.toUpperCase()}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: Play["outcome"] }) {
  if (!outcome) return null;

  const styles = {
    win: "text-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)/10]",
    loss: "text-[hsl(0,80%,55%)] bg-[hsl(0,80%,55%)/10]",
    breakeven: "text-muted-foreground bg-muted-foreground/10",
  };

  return (
    <span className={`font-terminal text-[8px] px-1.5 py-0.5 ${styles[outcome]}`}>
      {outcome.toUpperCase()}
    </span>
  );
}