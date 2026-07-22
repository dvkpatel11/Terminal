import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PANEL_REGISTRY, PANELS_BY_CATEGORY } from "@/lib/panelRegistry";
import type { ViewMode } from "@/lib/terminalTypes";

interface Props {
  onNav: (v: ViewMode) => void;
}

const CATEGORIES = [
  { label: "SECURITY", views: PANELS_BY_CATEGORY["symbol"] },
  { label: "MARKETS", views: PANELS_BY_CATEGORY["market"] },
  { label: "MACRO", views: PANELS_BY_CATEGORY["macro"] },
  { label: "SYSTEM", views: PANELS_BY_CATEGORY["system"] },
];

export default function HelpPanel({ onNav }: Props) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 font-terminal text-xs">
        <div className="border-b border-border/50 pb-3">
          <h1 className="text-lg font-bold text-cyan-300 tracking-widest">FUNCTION DIRECTORY</h1>
          <p className="text-muted-foreground text-[10px] mt-1">Click a function or use the command bar to navigate</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => (
            <Card key={cat.label} className="bg-[#060606] border-border/50">
              <CardHeader className="pb-2">
                <span className="font-terminal text-[10px] text-cyan-300 tracking-widest">{cat.label}</span>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {cat.views.map((view) => {
                  const p = PANEL_REGISTRY[view];
                  if (!p) return null;
                  const Icon = p.icon;
                  return (
                    <button
                      key={view}
                      onClick={() => onNav(view)}
                      className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-left group"
                    >
                      <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-cyan-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-bold">{p.code}</span>
                          <span className="text-muted-foreground">{p.label}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground/60 mt-0.5">
                          Aliases: {p.aliases.join(", ")}
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground border border-border/30 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        [{p.kbd}]
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-[#060606] border-border/50">
          <CardHeader className="pb-2">
            <span className="font-terminal text-[10px] text-cyan-300 tracking-widest">COMMAND SYNTAX</span>
          </CardHeader>
          <CardContent className="pt-0 space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <div><span className="text-foreground">AAPL INTEL</span> <span className="text-muted-foreground">— Open INTEL for AAPL</span></div>
              <div><span className="text-foreground">AAPL GP</span> <span className="text-muted-foreground">— Open chart for AAPL</span></div>
              <div><span className="text-foreground">INTEL</span> <span className="text-muted-foreground">— Open INTEL (last symbol)</span></div>
              <div><span className="text-foreground">CC</span> <span className="text-muted-foreground">— Market overview</span></div>
              <div><span className="text-foreground">AAPL</span> <span className="text-muted-foreground">— Open INTEL for AAPL</span></div>
              <div><span className="text-foreground">/</span> <span className="text-muted-foreground">— Open command bar</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#060606] border-border/50">
          <CardHeader className="pb-2">
            <span className="font-terminal text-[10px] text-cyan-300 tracking-widest">KEYBOARD SHORTCUTS</span>
          </CardHeader>
          <CardContent className="pt-0 space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <div><span className="text-foreground">/</span> <span className="text-muted-foreground">— Open command bar</span></div>
              <div><span className="text-foreground">Esc</span> <span className="text-muted-foreground">— Close command bar</span></div>
              <div><span className="text-foreground">Up/Down</span> <span className="text-muted-foreground">— Navigate command history</span></div>
              <div><span className="text-foreground">F1-F12</span> <span className="text-muted-foreground">— Quick function keys</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
