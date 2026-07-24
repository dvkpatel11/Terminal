import { X, type LucideIcon } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import { PANEL_REGISTRY, ALL_VIEW_MODES, type PanelCategory } from "@/lib/panelRegistry";
import { cn } from "@/lib/utils";

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

const CATEGORY_BORDER: Record<PanelCategory, string> = {
  market: "border-market",
  macro: "border-macro",
  intel: "border-intel",
  symbol: "border-market",
  system: "border-intel",
};

const CATEGORY_TEXT: Record<PanelCategory, string> = {
  market: "text-market",
  macro: "text-macro",
  intel: "text-intel",
  symbol: "text-market",
  system: "text-intel",
};

export default function TabStrip({ tabs, activeTabId, onSelect, onClose }: Props) {
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

  return (
    <div className="flex items-center h-7 min-h-[28px] bg-gradient-to-b from-surface-2 to-surface-1 border-b border-border/40 overflow-x-auto scrollbar-thin shrink-0" role="tablist" aria-label="Panel tabs">
      {sorted.length === 0 ? (
        <span className="px-2.5 text-data-xs font-terminal text-muted-foreground/40 tracking-wide select-none">
          No symbol tabs open
        </span>
      ) : sorted.map((tab) => {
        const meta = PANEL_REGISTRY[tab.view];
        if (!meta) return null;

        const active = tab.id === activeTabId;
        const category: PanelCategory = meta.category;
        const label = tab.symbol || meta.code;
        const Icon = meta.icon as LucideIcon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "group relative flex items-center gap-1 px-2 h-full text-[9px] font-terminal border-r border-border/20 transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-inset",
              active
                ? cn("border-b-2", CATEGORY_BORDER[category], CATEGORY_TEXT[category])
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3 h-3 shrink-0 opacity-70" />
            <span>{label}</span>
            {tab.view !== "market" && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="ml-1 opacity-0 group-hover:opacity-100 text-flat hover:text-negative transition-opacity duration-150"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
