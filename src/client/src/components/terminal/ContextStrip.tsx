import { useState, useRef, useEffect } from "react";
import type { ViewMode } from "@/lib/terminalTypes";
import { PANEL_REGISTRY, PANELS_BY_CATEGORY } from "@/lib/panelRegistry";

interface Props {
  currentSymbol: string;
  activeView: ViewMode;
  onNav: (v: ViewMode) => void;
}

const CATEGORIES: Array<{ label: string; views: ViewMode[] }> = [
  { label: "SECURITY", views: PANELS_BY_CATEGORY["symbol"] },
  { label: "MARKETS", views: PANELS_BY_CATEGORY["market"] },
  { label: "MACRO", views: PANELS_BY_CATEGORY["macro"] },
  { label: "SYSTEM", views: PANELS_BY_CATEGORY["system"] },
];

const SECURITY_BUTTONS: ViewMode[] = PANELS_BY_CATEGORY["symbol"];
const MARKET_BUTTONS: ViewMode[] = [...PANELS_BY_CATEGORY["market"], ...PANELS_BY_CATEGORY["macro"]];

export default function ContextStrip({ currentSymbol, activeView, onNav }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].label);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setActiveCategory(CATEGORIES[0].label);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        setActiveCategory(CATEGORIES[0].label);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menuOpen]);

  const hasSymbol = !!currentSymbol;

  const nav = (v: ViewMode) => {
    onNav(v);
    setMenuOpen(false);
    setActiveCategory(CATEGORIES[0].label);
  };

  const catViews = activeCategory
    ? CATEGORIES.find((c) => c.label === activeCategory)?.views ?? []
    : [];

  const renderButton = (v: ViewMode, isDisabled: boolean) => {
    const def = PANEL_REGISTRY[v];
    if (!def) return null;
    const isActive = activeView === v;
    return (
      <button
        key={v}
        onClick={() => !isDisabled && nav(v)}
        className={`px-2.5 py-1 font-terminal text-[9px] tracking-[0.15em] transition-all duration-150 border-b-[1.5px] ${
          isDisabled
            ? "text-muted-foreground/25 border-b-transparent cursor-default"
            : isActive
              ? "text-[hsl(186,45%,60%)] border-b-[hsl(186,45%,50%)] bg-[hsl(186,45%,50%)/[0.06]] shadow-[0_1px_0_hsl(186,45%,50%/0.15)]"
              : "text-muted-foreground/80 hover:text-foreground/90 hover:bg-white/[0.03] border-b-transparent"
        }`}
      >
        {def.code}
      </button>
    );
  };

  return (
    <div className="flex items-center h-7 bg-gradient-to-b from-[#080808] to-[#050505] border-b border-border/40 px-2.5 gap-px shrink-0 overflow-visible">
      {SECURITY_BUTTONS.map((v) => renderButton(v, !hasSymbol))}

      <div className="w-px h-3 bg-gradient-to-b from-transparent via-border/50 to-transparent mx-1.5 shrink-0" />

      {MARKET_BUTTONS.map((v) => renderButton(v, false))}

      <div ref={menuRef} className="relative ml-auto">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1 font-terminal text-[9px] tracking-[0.15em] transition-all duration-150 border-b-[1.5px] ${
            menuOpen
              ? "text-[hsl(186,45%,60%)] border-b-[hsl(186,45%,50%)] bg-[hsl(186,45%,50%)/[0.06]] shadow-[0_1px_0_hsl(186,45%,50%/0.15)]"
              : "text-muted-foreground/80 hover:text-foreground/90 hover:bg-white/[0.03] border-b-transparent"
          }`}
        >
          <span className="text-[10px] opacity-70">&#9776;</span>
          <span>MENU</span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-0 w-[290px] bg-[#0c0c0c] border border-border/70 shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50 rounded-b-sm">
            <div className="flex border-b border-border/50 bg-gradient-to-b from-[#111] to-[#0c0c0c]">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategory(cat.label)}
                  className={`flex-1 px-2 py-2 font-terminal text-[8px] tracking-[0.15em] text-center transition-all duration-150 ${
                    activeCategory === cat.label
                      ? "text-[hsl(186,45%,60%)] bg-[hsl(186,45%,50%)/[0.06]] border-b-2 border-b-[hsl(186,45%,50%)]"
                      : "text-muted-foreground/60 hover:text-foreground/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="py-1">
              {catViews.length > 0 ? (
                catViews.map((v) => {
                  const def = PANEL_REGISTRY[v];
                  if (!def) return null;
                  const Icon = def.icon;
                  const isActive = activeView === v;
                  return (
                    <button
                      key={v}
                      onClick={() => nav(v)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 font-terminal text-[10px] text-left transition-colors duration-150 ${
                        isActive
                          ? "text-[hsl(186,45%,60%)] bg-[hsl(186,45%,50%)/[0.06]]"
                          : "text-muted-foreground/70 hover:text-foreground/90 hover:bg-white/[0.03]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="font-bold tracking-[0.15em] text-[9px] w-12 opacity-90">{def.code}</span>
                      <span className="flex-1">{def.label}</span>
                      {def.needsSymbol && currentSymbol && (
                        <span className="text-[8px] text-[hsl(38,30%,55%)] border border-[hsl(38,30%,55%)]/20 px-1.5 py-0.5 rounded-sm">
                          {currentSymbol}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 font-terminal text-[9px] text-muted-foreground/50 text-center tracking-wider">
                  SELECT A CATEGORY
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
