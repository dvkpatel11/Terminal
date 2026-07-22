import { useState, useRef, useEffect, useMemo } from "react";
import { Search, History, TerminalSquare, Brain } from "lucide-react";
import { getCommandAliasView, parseTerminalCommand, type ParsedTerminalCommand } from "@/lib/terminalCommands";
import type { ViewMode } from "@/lib/terminalTypes";
import { PANEL_REGISTRY } from "@/lib/panelRegistry";

interface Props {
  currentSymbol: string;
  currentView: ViewMode;
  onExecute: (command: ParsedTerminalCommand) => void;
}

const RECENTS_KEY = "terminal-command-recents";
const POPULAR_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META", "JPM", "BTC-USD", "ETH-USD", "GC=F", "SPY"];

function loadRecentCommands(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RECENTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentCommands(next: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export default function TerminalCommandBar({ currentSymbol, currentView, onExecute }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>(() => loadRecentCommands());
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const currentReg = PANEL_REGISTRY[currentView];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && e.target !== inputRef.current) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && focused) {
        setInput("");
        setFocused(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused]);

  const parsedCmd = useMemo(() => parseTerminalCommand(input), [input]);

  const quickCommands = useMemo(() => {
    return Object.entries(PANEL_REGISTRY).map(([key, def]) => ({
      label: def.label,
      view: key as ViewMode,
      icon: def.icon,
      aliases: def.aliases,
    }));
  }, []);

  const filteredCommands = useMemo(() => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return [];
    return quickCommands.filter((cmd) => {
      if (cmd.label.includes(trimmed)) return true;
      return cmd.aliases.some((a) => a.includes(trimmed));
    });
  }, [input, quickCommands]);

  const filteredTickers = useMemo(() => {
    if (!input.trim()) return [];
    return POPULAR_TICKERS.filter((t) => t.includes(input.trim().toUpperCase())).slice(0, 8);
  }, [input]);

  const recentResults = useMemo(() => {
    if (input.trim()) return [];
    return recentCommands
      .map((raw) => parseTerminalCommand(raw))
      .filter((cmd): cmd is ParsedTerminalCommand => Boolean(cmd))
      .map((cmd) => ({
        type: "recent" as const,
        label: cmd.symbol ? `${cmd.symbol} · ${PANEL_REGISTRY[cmd.view]?.label ?? cmd.view}` : PANEL_REGISTRY[cmd.view]?.label ?? cmd.view,
        command: cmd,
        meta: cmd.raw,
      }));
  }, [recentCommands, input]);

  const commandPreview = useMemo(() => {
    if (!parsedCmd || !input.trim()) return [];
    return [{
      type: "parsed" as const,
      label: parsedCmd.symbol
        ? `${parsedCmd.symbol} · ${PANEL_REGISTRY[parsedCmd.view]?.label ?? parsedCmd.view}`
        : PANEL_REGISTRY[parsedCmd.view]?.label ?? parsedCmd.view,
      command: parsedCmd,
      meta: parsedCmd.symbol ? parsedCmd.raw : `GO ${parsedCmd.raw}`,
    }];
  }, [parsedCmd, input]);

  const tickerResults = useMemo(() => {
    return filteredTickers.map((t) => ({
      type: "ticker" as const,
      label: t,
      command: { raw: t, symbol: t, view: "intel" as ViewMode },
      meta: "QUOTE",
    }));
  }, [filteredTickers]);

  const quickResults = useMemo(() => {
    return filteredCommands.map((cmd) => ({
      type: "quick" as const,
      label: cmd.label,
      command: { raw: cmd.aliases[0], view: cmd.view as ViewMode },
      meta: cmd.aliases.join(" · "),
    }));
  }, [filteredCommands]);

  const allResults = [...commandPreview, ...recentResults, ...quickResults, ...tickerResults];

  const execute = (cmd: ParsedTerminalCommand) => {
    const nextRecents = [cmd.raw, ...recentCommands.filter((item) => item !== cmd.raw)].slice(0, 8);
    setRecentCommands(nextRecents);
    saveRecentCommands(nextRecents);
    setInput("");
    setFocused(false);
    inputRef.current?.blur();
    onExecute(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, allResults.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (allResults[selected]) {
        execute(allResults[selected].command);
        return;
      }
      if (parsedCmd) {
        execute(parsedCmd);
      }
    }
    if (e.key === "Escape") {
      setInput("");
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={barRef} className="relative shrink-0">
      <div className="flex items-center h-9 bg-[#0d0d0d] border-b border-[hsl(186,45%,50%)]/15 px-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-fit">
          <span className="font-terminal text-[11px] text-[hsl(186,45%,55%)] font-bold">&#9656;</span>
          <span className="font-terminal text-[11px] text-foreground font-bold tracking-wider">
            {currentSymbol || "\u2014"}
          </span>
        </div>

        <div className="flex-1 flex items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value.toUpperCase()); setSelected(0); }}
            onFocus={() => setFocused(true)}
            onBlur={() => { if (!input) setFocused(false); }}
            onKeyDown={handleKeyDown}
            placeholder="type ticker or command..."
            className="w-full bg-transparent font-terminal text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none tracking-wide"
          />
        </div>

        {currentReg && (
          <div className="flex items-center gap-2 min-w-fit ml-2">
            <span className="font-terminal text-[10px] text-[hsl(186,45%,55%)] font-bold tracking-widest">
              {currentReg.code}
            </span>
            <span className="font-terminal text-[9px] text-muted-foreground hidden sm:inline">
              {currentReg.label}
            </span>
            <span className="font-terminal text-[9px] text-muted-foreground/40">&#8999;</span>
          </div>
        )}
      </div>

      {focused && input.trim() && allResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 bg-[#0d0d0d] border border-[hsl(186,45%,50%)]/20 border-t-0 shadow-2xl max-h-80 overflow-y-auto">
          {allResults.map((item, index) => {
            const isSelected = index === selected;
            const Icon = item.type === "recent" ? History : item.type === "ticker" ? Brain : item.type === "parsed" ? TerminalSquare : PANEL_REGISTRY[item.command.view]?.icon ?? TerminalSquare;
            const aliasView = getCommandAliasView(item.command.raw);
            return (
              <button
                key={`${item.type}-${item.command.raw}-${index}`}
                onMouseDown={(e) => { e.preventDefault(); execute(item.command); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/50 text-left transition-colors ${
                  isSelected ? "bg-[hsl(186,45%,50%)/10%] text-foreground" : "hover:bg-white/5 text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-terminal text-xs truncate">{item.label}</div>
                  <div className="font-terminal text-[8px] tracking-widest text-muted-foreground truncate">{item.meta}</div>
                </div>
                {"symbol" in item.command && item.command.symbol && (
                  <span className="font-terminal text-[8px] text-[hsl(186,45%,55%)] tracking-widest shrink-0">
                    {PANEL_REGISTRY[item.command.view]?.label ?? item.command.view}
                  </span>
                )}
                {!("symbol" in item.command && item.command.symbol) && aliasView && (
                  <span className="font-terminal text-[8px] text-[hsl(186,45%,55%)] tracking-widest shrink-0">GO</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
