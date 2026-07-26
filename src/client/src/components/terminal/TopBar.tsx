import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Terminal, ChevronDown, LineChart, Newspaper, Bot, Filter, Star, BellRing, Globe2, Briefcase, LayoutDashboard, Brain, CandlestickChart, FileText, CircleDollarSign, Activity, BarChart3, TrendingUp, ChartLine, Banknote, Bitcoin, MessageCircle, Scan, Settings } from "lucide-react";
import ConfigModal from "./ConfigModal";
import AlertConfigModal from "./AlertConfigModal";
import type { LucideIcon } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import type { ParsedTerminalCommand } from "@/lib/terminalCommands";
import { getMarketStatus } from "@/lib/terminalChrome";
import { useAlerts } from "@/lib/useAlerts";
import { PANEL_REGISTRY, PANELS_BY_CATEGORY, type PanelCategory } from "@/lib/panelRegistry";
import { useWorkspaceStore } from "@/lib/workspaceStore";


interface Props {
  activeSymbol: string;
  view: ViewMode;
  onNav: (v: ViewMode) => void;
  onSymbol: (sym: string) => void;
  onExecute: (command: ParsedTerminalCommand) => void;
  onCommandBarOpen: () => void;
  configOpen: boolean;
  onConfigOpenChange: (open: boolean) => void;
}

interface NavTab {
  code: string;
  view: ViewMode;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  label: string;
  color: string;
  restingBg: string;
  activeBg: string;
  activeBorder: string;
  glow: string;
  tabs: NavTab[];
}

const CATEGORY_THEME: Record<PanelCategory, { label: string; color: string; restingBg: string; activeBg: string; activeBorder: string; glow: string }> = {
  market: {
    label: "MARKET",
    color: "text-emerald-400",
    restingBg: "bg-emerald-400/5",
    activeBg: "bg-emerald-400/10",
    activeBorder: "border-b-emerald-400",
    glow: "shadow-[0_1px_0_rgba(52,211,153,0.5)]",
  },
  macro: {
    label: "MACRO",
    color: "text-amber-400",
    restingBg: "bg-amber-400/5",
    activeBg: "bg-amber-400/10",
    activeBorder: "border-b-amber-400",
    glow: "shadow-[0_1px_0_rgba(251,191,36,0.5)]",
  },
  intel: {
    label: "INTEL",
    color: "text-cyan-400",
    restingBg: "bg-cyan-400/5",
    activeBg: "bg-cyan-400/10",
    activeBorder: "border-b-cyan-400",
    glow: "shadow-[0_1px_0_rgba(34,211,238,0.5)]",
  },
  symbol: {
    label: "SYMBOL",
    color: "text-teal-400",
    restingBg: "bg-teal-400/5",
    activeBg: "bg-teal-400/10",
    activeBorder: "border-b-teal-400",
    glow: "shadow-[0_1px_0_rgba(45,212,191,0.5)]",
  },
  system: {
    label: "SYSTEM",
    color: "text-blue-400",
    restingBg: "bg-blue-400/5",
    activeBg: "bg-blue-400/10",
    activeBorder: "border-b-blue-400",
    glow: "shadow-[0_1px_0_rgba(96,165,250,0.5)]",
  },
};

const TOPBAR_CATEGORIES: PanelCategory[] = ["market", "macro", "intel"];

const NAV_GROUPS: NavGroup[] = TOPBAR_CATEGORIES.map((cat) => {
  const theme = CATEGORY_THEME[cat];
  const tabs = PANELS_BY_CATEGORY[cat]
    .filter((v) => PANEL_REGISTRY[v].showInTopBar)
    .map((v) => ({ code: PANEL_REGISTRY[v].code, view: v, icon: PANEL_REGISTRY[v].icon, label: PANEL_REGISTRY[v].label }));
  return {
    label: theme.label,
    color: theme.color,
    restingBg: theme.restingBg,
    activeBg: theme.activeBg,
    activeBorder: theme.activeBorder,
    glow: theme.glow,
    tabs,
  };
}).filter((g) => g.tabs.length > 0);

const SYMBOL_VIEWS: { code: string; view: ViewMode; label: string; icon: LucideIcon }[] = PANELS_BY_CATEGORY["symbol"].map((v) => ({
  code: PANEL_REGISTRY[v].code,
  view: v,
  label: PANEL_REGISTRY[v].label,
  icon: PANEL_REGISTRY[v].icon,
}));

function formatRelativeTime(value: string | Date | null) {
  if (!value) return "";
  const iso = typeof value === "string" ? value : value.toISOString();
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function useCompactHeader() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setCompact(mql.matches);
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return compact;
}

export default function TopBar({ activeSymbol, view, onNav, onSymbol, onExecute, onCommandBarOpen, configOpen, onConfigOpenChange }: Props) {
  const [clock, setClock] = useState(() => new Date());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [alertConfigOpen, setAlertConfigOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const symbolDropdownRef = useRef<HTMLDivElement | null>(null);
  const mktStatus = getMarketStatus(clock);
  const { data: alerts = [] } = useAlerts();
  const compact = useCompactHeader();

  const triggeredAlerts = useMemo(() => {
    return alerts
      .filter((alert) => alert.triggered)
      .sort((a, b) => +new Date(b.triggeredAt ?? 0) - +new Date(a.triggeredAt ?? 0))
      .slice(0, 5);
  }, [alerts]);
  const activeAlertCount = alerts.filter((alert) => !alert.triggered).length;

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!symbolDropdownOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (!symbolDropdownRef.current?.contains(event.target as Node)) setSymbolDropdownOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [symbolDropdownOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        onCommandBarOpen();
      }
      if (e.key === "Escape") {
        setSymbolDropdownOpen(false);
        setNotificationsOpen(false);
        setAlertConfigOpen(false);
        onConfigOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCommandBarOpen]);

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = clock.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();

  return (
    <header className="flex flex-col bg-gradient-to-b from-[#0A0A0A] to-[#111111] border-b border-[#222] shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
      {/* Row 1: Branding | Global Nav | Market Status | spacer | Terminal Icon | Bell | Clock */}
      <div className="flex items-center h-10">
        <div className="flex items-center gap-2 px-3 h-full border-r border-[#333] bg-gradient-to-b from-[#1A1A1A] to-[#111] min-w-[120px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
          {!compact && <span className="font-terminal text-data-xs font-bold tracking-[0.2em] text-emerald-400">MONITOR</span>}
        </div>

        {/* Global nav tabs — color coded by category, scrollable */}
        <div className="flex items-center h-full overflow-x-auto scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center h-full">
              <div className="w-px h-3 bg-border/40 mx-0.5 shrink-0" />
              {group.tabs.map((tab) => {
                const isActive = view === tab.view;
                return (
                  <button
                    key={tab.view}
                    onClick={() => onNav(tab.view)}
                    className={`flex items-center gap-1.5 px-3 h-full font-terminal text-data-xs tracking-[0.12em] transition-all duration-150 border-b-[2px] shrink-0 ${
                      isActive
                        ? `${group.color} font-bold ${group.activeBg} border-b-current ${group.glow}`
                        : `${group.color}/60 ${group.restingBg} border-b-transparent hover:bg-white/5`
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5 shrink-0" />
                    {!compact && (
                      <span className="opacity-90">{tab.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* Symbol dropdown trigger */}
        <div ref={symbolDropdownRef} className="relative h-full">
          <button
            onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
            className="flex items-center gap-1.5 px-3 h-full hover:bg-white/5 transition-colors duration-150 border-l border-[#333]"
            data-testid="active-symbol"
          >
            {!compact && <span className="font-terminal text-data-xs tracking-[0.15em] text-[#666]">ACTIVE</span>}
            <span className="font-terminal text-data-md font-bold text-emerald-400">{activeSymbol}</span>
            <ChevronDown className={`w-3 h-3 text-[#666] transition-transform duration-150 ${symbolDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {symbolDropdownOpen && (
            <div className="absolute right-0 top-full mt-0 w-[260px] bg-[#0c0c0c] border border-border/70 shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50 rounded-b-sm">
              <div className="px-3 py-2 border-b border-border/50 bg-gradient-to-b from-[#111] to-[#0c0c0c]">
                <div className="font-terminal text-data-xs tracking-[0.15em] text-market">
                  {activeSymbol ? `${activeSymbol} FUNCTIONS` : "NO SYMBOL SET"}
                </div>
              </div>
              <div className="py-1 max-h-80 overflow-y-auto scrollbar-thin">
                {SYMBOL_VIEWS.map((item) => {
                  const isActive = view === item.view && activeSymbol;
                  return (
                    <button
                      key={item.view}
                      onClick={() => {
                        setSymbolDropdownOpen(false);
                        onNav(item.view);
                      }}
                      disabled={!activeSymbol}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 font-terminal text-data-xs text-left transition-colors duration-150 ${
                        isActive
                          ? "text-market bg-market/6"
                          : activeSymbol
                            ? "text-muted-foreground/70 hover:text-foreground/90 hover:bg-white/[0.03]"
                            : "text-muted-foreground/30 cursor-default"
                      }`}
                    >
                      <item.icon className="w-3 h-3 shrink-0 opacity-70" />
                      <span className="font-bold tracking-[0.12em] text-data-xs opacity-90">{item.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Terminal icon → command palette */}
        <button
          onClick={onCommandBarOpen}
          className="flex items-center justify-center w-10 h-full hover:bg-white/5 text-[#888] hover:text-emerald-400 transition-colors duration-150 border-l border-[#333]"
          title="Command Palette (Ctrl+Space)"
          data-testid="cmd-palette-trigger"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        {/* Notifications — opens alert config */}
        <div ref={notificationsRef} className="relative h-full">
          <button
            onClick={() => setAlertConfigOpen(true)}
            className="relative flex items-center justify-center w-11 h-full hover:bg-white/5 text-[#888] hover:text-emerald-400 transition-colors duration-150"
            data-testid="nav-alerts"
          >
            <Bell className="w-3.5 h-3.5" />
            {triggeredAlerts.length > 0 && (
              <span className="absolute top-2 right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-[7px] leading-[14px] text-white font-terminal text-center shadow-[0_0_6px_rgba(239,68,68,0.4)]">
                {triggeredAlerts.length}
              </span>
            )}
          </button>
        </div>

        {/* Settings gear */}
        <button
          onClick={() => onConfigOpenChange(true)}
          className="flex items-center justify-center w-10 h-full hover:bg-white/5 text-[#888] hover:text-emerald-400 transition-colors duration-150 border-l border-[#333]"
          title="Settings (Ctrl+,)"
          data-testid="settings-gear"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Clock */}
        <div className="flex flex-col items-end justify-center px-3.5 h-full font-terminal border-l border-[#333]">
          <span className="text-data-sm font-terminal tabular-nums text-emerald-400 tracking-wide">{timeStr}</span>
          {!compact && <span className="text-data-xs font-terminal tabular-nums text-[#666] tracking-wider">{dateStr}</span>}
        </div>

        {/* Market status — rightmost */}
        <div className="flex items-center gap-1.5 px-3 h-full border-l border-[#333]">
          {mktStatus.pulse && (
            <div className="relative w-1.5 h-1.5">
              <div className={`absolute inset-0 rounded-full ${mktStatus.color === "text-up" ? "bg-emerald-400" : "bg-red-500"} animate-ping opacity-75`} />
              <div className={`w-1.5 h-1.5 rounded-full ${mktStatus.color === "text-up" ? "bg-emerald-400" : "bg-red-500"}`} />
            </div>
          )}
          <span className={`font-terminal text-data-sm tracking-[0.18em] font-semibold ${mktStatus.color === "text-up" ? "text-emerald-400" : "text-red-400"}`}>{mktStatus.label}</span>
        </div>
      </div>

      <ConfigModal open={configOpen} onClose={() => onConfigOpenChange(false)} onNav={onNav} />
      <AlertConfigModal open={alertConfigOpen} onClose={() => setAlertConfigOpen(false)} />
    </header>
  );
}
