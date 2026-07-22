import { ChevronRight } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import { SIDEBAR_NAV } from "@/lib/panelRegistry";

interface Props {
  view: ViewMode;
  onNav: (v: ViewMode) => void;
}

export default function Sidebar({ view, onNav }: Props) {
  return (
    <aside className="w-12 bg-[#060606] border-r border-border flex flex-col shrink-0 overflow-y-auto scrollbar-thin" aria-label="Navigation">
      {SIDEBAR_NAV.map(({ id, icon: Icon, label, kbd }) => (
        <button
          key={id}
          data-testid={`sidebar-${id}`}
          onClick={() => onNav(id)}
          title={`${label}  [${kbd}]`}
          aria-label={`${label} (${kbd})`}
          aria-current={view === id ? "page" : undefined}
          className={`group relative flex flex-col items-center justify-center w-full py-3 border-b border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-inset ${
            view === id
              ? "bg-[hsl(186,45%,50%)/12%] text-[hsl(186,45%,55%)]"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          {view === id && (
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[hsl(186,45%,55%)]" />
          )}
          <Icon className="w-4 h-4" strokeWidth={view === id ? 2 : 1.5} />
          <span className="font-terminal text-[8px] mt-1 tracking-widest leading-none">
            {kbd}
          </span>
        </button>
      ))}
    </aside>
  );
}
