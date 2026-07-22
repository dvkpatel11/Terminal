import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAlerts, alertsQueryKey } from "@/lib/useAlerts";
import { X, BellRing, Trash2, Bell, Plus } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigateToAlerts?: () => void;
}

function formatRelativeTime(value: string | Date | null) {
  if (!value) return "";
  const iso = typeof value === "string" ? value : value.toISOString();
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function AlertConfigModal({ open, onClose, onNavigateToAlerts }: Props) {
  const [sym, setSym] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice] = useState("");
  const [showTriggered, setShowTriggered] = useState(false);
  const qc = useQueryClient();

  const { data: alerts = [] } = useAlerts();

  const addMut = useMutation({
    mutationFn: async (data: { symbol: string; condition: string; price: number }) => {
      await apiRequest("POST", "/api/alerts", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: alertsQueryKey });
      setSym("");
      setPrice("");
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: alertsQueryKey }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sym.trim() || !price) return;
    addMut.mutate({ symbol: sym.trim().toUpperCase(), condition, price: parseFloat(price) });
  };

  const active = alerts.filter((a) => !a.triggered);
  const triggered = alerts.filter((a) => a.triggered);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-[#0d0d0d] border border-[hsl(186_45%_50%/0.4)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[hsl(186_45%_55%)]" />
            <span className="font-terminal text-[11px] tracking-[0.15em] text-foreground/90">ALERT CONFIGURATION</span>
            <span className="font-terminal text-[9px] text-[hsl(142,71%,45%)]">{active.length} ACTIVE</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create form */}
        <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0 bg-[#0a0a0a]">
          <span className="font-terminal text-[9px] text-muted-foreground shrink-0">WHEN</span>
          <input
            value={sym}
            onChange={(e) => setSym(e.target.value.toUpperCase())}
            placeholder="TICKER"
            className="w-20 bg-[#0d0d0d] border border-border/50 px-2 py-1.5 font-terminal text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
          />
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as "above" | "below")}
            className="bg-[#0d0d0d] border border-border/50 px-2 py-1.5 font-terminal text-[10px] text-foreground/80 focus:outline-none rounded-sm"
          >
            <option value="above">CROSSES ABOVE</option>
            <option value="below">DROPS BELOW</option>
          </select>
          <span className="font-terminal text-[9px] text-muted-foreground">$</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            step="0.01"
            className="w-24 bg-[#0d0d0d] border border-border/50 px-2 py-1.5 font-terminal text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
          />
          <button
            type="submit"
            disabled={!sym.trim() || !price || addMut.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[hsl(186_45%_50%/0.12)] hover:bg-[hsl(186_45%_50%/0.2)] border border-[hsl(186_45%_50%/0.3)] font-terminal text-[9px] tracking-wider text-[hsl(186_45%_60%)] rounded-sm transition-colors disabled:opacity-40 disabled:cursor-default shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>ADD</span>
          </button>
        </form>

        {/* Alert list */}
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {active.length === 0 && triggered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <Bell className="w-6 h-6 text-muted-foreground/30 mb-2" />
              <span className="font-terminal text-[10px] text-muted-foreground/50 tracking-wider">NO ALERTS CONFIGURED</span>
              <span className="font-terminal text-[8px] text-muted-foreground/30 mt-1">Add an alert above to get started</span>
            </div>
          )}

          {active.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-[#0a0a0a] border-b border-border/30">
                <span className="font-terminal text-[8px] tracking-[0.15em] text-muted-foreground/50">ACTIVE ({active.length})</span>
              </div>
              {active.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-white/[0.02] transition-colors group"
                >
                  <span className="font-terminal text-[10px] font-bold text-[hsl(186_45%_60%)]">{alert.symbol}</span>
                  <span className={`font-terminal text-[9px] font-semibold ${alert.condition === "above" ? "text-up" : "text-down"}`}>
                    {alert.condition === "above" ? "▲ ABOVE" : "▼ BELOW"}
                  </span>
                  <span className="font-terminal text-[10px] text-foreground/80 tabular-nums">${alert.price.toFixed(2)}</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => delMut.mutate(alert.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/40 hover:text-red-400/80 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {triggered.length > 0 && (
            <div>
              <button
                onClick={() => setShowTriggered(!showTriggered)}
                className="w-full px-4 py-2 bg-[#0a0a0a] border-b border-border/30 flex items-center gap-2 hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-terminal text-[8px] tracking-[0.15em] text-muted-foreground/50">TRIGGERED ({triggered.length})</span>
                <span className={`font-terminal text-[8px] text-muted-foreground/30 transition-transform ${showTriggered ? "rotate-90" : ""}`}>▶</span>
              </button>
              {showTriggered &&
                triggered.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-white/[0.02] transition-colors group"
                  >
                    <span className="font-terminal text-[10px] font-bold text-[hsl(186_45%_60%)]">{alert.symbol}</span>
                    <span className={`font-terminal text-[9px] font-semibold ${alert.condition === "above" ? "text-up" : "text-down"}`}>
                      {alert.condition === "above" ? "▲ ABOVE" : "▼ BELOW"}
                    </span>
                    <span className="font-terminal text-[10px] text-foreground/80 tabular-nums">${alert.price.toFixed(2)}</span>
                    {alert.triggerPrice !== null && (
                      <span className="font-terminal text-[8px] text-muted-foreground/50 tabular-nums">LAST ${alert.triggerPrice.toFixed(2)}</span>
                    )}
                    <span className="font-terminal text-[8px] text-muted-foreground/40">{formatRelativeTime(alert.triggeredAt)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => delMut.mutate(alert.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/40 hover:text-red-400/80 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/40 bg-gradient-to-b from-[#0c0c0c] to-[#0a0a0a] shrink-0">
          <button
            onClick={() => { onClose(); onNavigateToAlerts?.(); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 font-terminal text-[8px] tracking-[0.15em] text-[hsl(186_45%_55%)] hover:text-[hsl(186_45%_70%)] hover:bg-[hsl(186_45%_50%/0.06)] rounded-sm transition-colors"
          >
            <BellRing className="w-3 h-3" />
            <span>OPEN ALERTS PANEL</span>
          </button>
        </div>
      </div>
    </div>
  );
}
