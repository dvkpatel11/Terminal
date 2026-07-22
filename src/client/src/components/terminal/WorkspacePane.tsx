import type { ReactNode } from "react";
import { Focus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaneId, PaneState, ViewMode } from "@/lib/terminalTypes";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import TabStrip from "./TabStrip";

interface Props {
  paneId: PaneId;
  pane: PaneState;
  focused: boolean;
  canClose: boolean;
  onFocus: () => void;
  onClose?: () => void;
  children: ReactNode;
}

export default function WorkspacePane({ paneId, pane, focused, canClose, onFocus, onClose, children }: Props) {
  const paneKey = paneId as "primary" | "secondary";
  const tabs = useWorkspaceStore((s) => paneKey === "primary" ? s.primary.tabs : s.secondary?.tabs ?? []);
  const activeTabId = useWorkspaceStore((s) => paneKey === "primary" ? s.primary.activeTabId : s.secondary?.activeTabId ?? "");
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);

  const showControls = (!focused && onFocus) || (canClose && onClose);
  if (!showControls) return null;

  return (
    <section
      className={cn(
        "h-full flex flex-col bg-background border-l border-border/50",
        focused && "ring-1 ring-inset ring-[hsl(186,45%,50%)]/25 shadow-[inset_0_0_20px_rgba(0,188,212,0.02)]",
      )}
      onMouseDown={onFocus}
      data-testid={`workspace-pane-${paneId}`}
    >
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(tabId) => setActiveTab(paneKey, tabId)}
        onClose={(tabId) => closeTab(paneKey, tabId)}
      />
      <div
        className="shrink-0 flex items-center justify-end gap-1.5 px-2 py-0.5 border-b border-border/40 bg-gradient-to-b from-[#0a0a0a] to-[#070707]"
      >
        {!focused && (
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onFocus(); }}
            className="flex items-center gap-1 px-1.5 py-0.5 font-terminal text-[8px] tracking-[0.12em] text-muted-foreground/60 hover:text-foreground/80 border border-border/50 rounded-sm transition-colors duration-150"
            data-testid={`workspace-focus-${paneId}`}
          >
            <Focus className="w-2.5 h-2.5" /> FOCUS
          </button>
        )}
        {canClose && onClose && (
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onClose(); }}
            className="flex items-center gap-1 px-1.5 py-0.5 font-terminal text-[8px] tracking-[0.12em] text-muted-foreground/60 hover:text-[hsl(0,80%,60%)] border border-border/50 rounded-sm transition-colors duration-150"
            data-testid={`workspace-close-${paneId}`}
          >
            <X className="w-2.5 h-2.5" /> CLOSE
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </section>
  );
}
