import type { ViewMode } from "@/lib/terminalTypes";
import { PANEL_REGISTRY, ALL_VIEW_MODES } from "@/lib/panelRegistry";
import { Search } from "lucide-react";

interface Props {
  activeView: ViewMode;
  onNav: (view: ViewMode) => void;
  onOpenCmd: () => void;
}

// Quick-access strip derived from the registry's `quickAccess` flag.
const QUICK_VIEWS: ViewMode[] = ALL_VIEW_MODES.filter((v) => PANEL_REGISTRY[v].quickAccess);

export default function QuickBar({ activeView, onNav, onOpenCmd }: Props) {
  return (
    <div className="flex items-center h-7 bg-[#060606] border-b border-border px-2 gap-px shrink-0">
      <button
        onClick={onOpenCmd}
        className="flex items-center gap-1.5 px-2 py-1 font-terminal text-[9px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        data-testid="quickbar-cmd"
      >
        <Search className="w-3 h-3" />
        <span>CMD</span>
      </button>
      <div className="w-px h-3 bg-border/60 mx-1" />
      {QUICK_VIEWS.map((view) => {
        const def = PANEL_REGISTRY[view];
        const isActive = activeView === view;
        return (
          <button
            key={view}
            onClick={() => onNav(view)}
            className={`px-2 py-1 font-terminal text-[9px] tracking-wider transition-colors ${
              isActive
                ? "bg-[hsl(186,45%,50%)/15%] text-[hsl(186,45%,55%)] border-b border-[hsl(186,45%,50%)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
            data-testid={`quickbar-${view}`}
          >
            {def.code}
          </button>
        );
      })}
    </div>
  );
}
