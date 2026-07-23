import { useWorkspaceStore } from "@/lib/workspaceStore";

export function useLinkedSymbol(fallback?: string) {
  const globalSymbol = useWorkspaceStore((s) => s.globalSymbol);
  const primary = useWorkspaceStore((s) => s.primary);
  const secondary = useWorkspaceStore((s) => s.secondary);
  const focusedPane = useWorkspaceStore((s) => s.focusedPane);

  const pane = focusedPane === "primary" ? primary : secondary;
  const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
  const tabSymbol = activeTab?.symbol;

  return tabSymbol || globalSymbol || fallback;
}
