import { X, type LucideIcon } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import { PANEL_REGISTRY, ALL_VIEW_MODES } from "@/lib/panelRegistry";

interface Tab {
  id: string;
  view: ViewMode;
  symbol: string;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

function isValidView(view: string): view is ViewMode {
  return ALL_VIEW_MODES.includes(view as ViewMode);
}

export default function TabStrip({ tabs, activeTabId, onSelect, onClose }: Props) {
  // Tab strip is for symbol/security panes only. Global views are switched
  // in-place from the TopBar and must not appear as closable tabs here.
  const validTabs = tabs.filter(
    (tab) => isValidView(tab.view) && PANEL_REGISTRY[tab.view]?.isSecurityView,
  );

  const sorted = [...validTabs].sort((a, b) => {
    const aSec = PANEL_REGISTRY[a.view]?.isSecurityView ?? true;
    const bSec = PANEL_REGISTRY[b.view]?.isSecurityView ?? true;
    if (aSec && !bSec) return 1;
    if (!aSec && bSec) return -1;
    return 0;
  });

  if (sorted.length === 0) return null;

  return (
    <div className="flex items-center h-7 bg-gradient-to-b from-[#0c0c0c] to-[#080808] border-b border-border/40 overflow-x-auto scrollbar-thin shrink-0" role="tablist" aria-label="Panel tabs">
      {sorted.map((tab) => {
        const meta = PANEL_REGISTRY[tab.view];
        if (!meta) return null;

        const active = tab.id === activeTabId;
        const isMarket = !meta.isSecurityView;
        const label = tab.symbol ? `${meta.code} ${tab.symbol}` : meta.code;
        const Icon = meta.icon as LucideIcon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3 h-full font-terminal text-[9px] tracking-[0.1em] border-r border-border/30 transition-all duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-inset ${
              active
                ? isMarket
                  ? "bg-gradient-to-b from-[#0e1a28] to-[#0a1220] text-[hsl(195,80%,65%)] border-b-2 border-b-[hsl(195,80%,55%)] shadow-[0_1px_0_hsl(195,80%,55%/0.15)]"
                  : "bg-gradient-to-b from-[#111] to-[#0a0a0a] text-[hsl(186,45%,62%)] border-b-2 border-b-[hsl(186,45%,50%)] shadow-[0_1px_0_hsl(186,45%,50%/0.15)]"
                : isMarket
                  ? "text-[hsl(195,50%,50%)] hover:text-[hsl(195,70%,65%)] hover:bg-white/[0.03]"
                  : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/[0.03]"
            }`}
          >
            <Icon className="w-3 h-3 shrink-0 opacity-70" />
            <span>{label}</span>
            {tab.view !== "market" && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground/80 transition-opacity duration-150"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
