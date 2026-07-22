import { Search } from "lucide-react";
import type { ViewMode } from "@/lib/terminalTypes";
import { SIDEBAR_NAV } from "@/lib/panelRegistry";

interface Props {
  view: ViewMode;
  onNav: (v: ViewMode) => void;
  onOpenCommand?: () => void;
}

export default function MobileNav({ view, onNav, onOpenCommand }: Props) {
  return (
    <nav
      className="flex items-center gap-1 h-14 bg-[#060606] border-t border-border shrink-0 md:hidden overflow-x-auto scrollbar-thin px-2"
      aria-label="Mobile navigation"
    >
      {onOpenCommand && (
        <button
          onClick={onOpenCommand}
          aria-label="Search / command"
          className="flex items-center justify-center w-10 h-10 shrink-0 rounded-sm text-muted-foreground hover:text-cyan hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <Search className="w-5 h-5" />
        </button>
      )}

      {SIDEBAR_NAV.map(({ id, icon: Icon, label, kbd }) => (
        <button
          key={id}
          onClick={() => onNav(id)}
          aria-label={label}
          aria-current={view === id ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 shrink-0 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
            view === id ? "text-cyan bg-cyan/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Icon className="w-5 h-5" strokeWidth={view === id ? 2 : 1.5} />
          <span className="font-terminal text-[8px] tracking-wider">{kbd}</span>
        </button>
      ))}
    </nav>
  );
}
