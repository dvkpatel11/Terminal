import { Suspense, useCallback, useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TopBar from "@/components/terminal/TopBar";
import TickerTape from "@/components/terminal/TickerTape";
import CommandBar from "@/components/terminal/CommandBar";
import WorkspacePane from "@/components/terminal/WorkspacePane";
import StatusBar from "@/components/terminal/StatusBar";
import MobileNav from "@/components/terminal/MobileNav";
import PanelErrorBoundary from "@/components/panel/PanelErrorBoundary";
import PanelLoadingSkeleton from "@/components/panel/PanelLoadingSkeleton";
import { PANEL_REGISTRY } from "@/lib/panelRegistry";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ParsedTerminalCommand } from "@/lib/terminalCommands";
import type { PaneId, ViewMode } from "@/lib/terminalTypes";
import { DEFAULT_SYMBOL } from "@/lib/terminalTypes";

export type { ViewMode } from "@/lib/terminalTypes";

export default function Terminal() {
  const openView = useWorkspaceStore((s) => s.openView);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeSecondary = useWorkspaceStore((s) => s.closeSecondary);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const isMobile = useIsMobile();

  const primary = useWorkspaceStore((s) => s.primary);
  const secondary = useWorkspaceStore((s) => s.secondary);
  const focusedPane = useWorkspaceStore((s) => s.focusedPane);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      switch (e.key) {
        case "1":
          e.preventDefault();
          useWorkspaceStore.setState({ focusedPane: "primary" });
          break;
        case "2":
          e.preventDefault();
          if (secondary) useWorkspaceStore.setState({ focusedPane: "secondary" });
          break;
        case "k":
          e.preventDefault();
          setCommandBarOpen(true);
          break;
        case "w":
          e.preventDefault();
          if (secondary) closeSecondary();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [secondary, closeSecondary]);

  const primaryTab = primary.tabs.find((t) => t.id === primary.activeTabId) ?? primary.tabs[0];
  const secondaryTab = secondary?.tabs.find((t) => t.id === secondary.activeTabId) ?? secondary?.tabs[0];

  const activePane =
    focusedPane === "secondary" && secondaryTab
      ? { view: secondaryTab.view, symbol: secondaryTab.symbol }
      : { view: primaryTab.view, symbol: primaryTab.symbol };

  const handleNav = useCallback(
    (view: ViewMode) => {
      const paneState = focusedPane === "primary" ? primary : secondary;
      if (!paneState) return;

      const registry = PANEL_REGISTRY[view];

      // Market/global views replace the current tab instead of creating new ones
      if (!registry.needsSymbol) {
        const currentTab = paneState.tabs.find((t) => t.id === paneState.activeTabId) ?? paneState.tabs[0];
        if (currentTab && currentTab.view === view) return; // already showing this view

        // Replace the current tab's view
        useWorkspaceStore.setState((s) => {
          const pane = focusedPane === "primary" ? s.primary : s.secondary;
          if (!pane) return {};
          const tab = pane.tabs.find((t) => t.id === pane.activeTabId) ?? pane.tabs[0];
          if (!tab) return {};
          return {
            [focusedPane]: {
              ...pane,
              tabs: pane.tabs.map((t) =>
                t.id === tab.id ? { ...t, view, symbol: "" } : t
              ),
            },
          };
        });
        return;
      }

      // Symbol-specific views create new tabs (or switch to existing)
      const existing = paneState.tabs.find((t) => t.view === view && t.symbol === activePane.symbol);
      if (existing) {
        setActiveTab(focusedPane, existing.id);
      } else {
        const sym = activePane.symbol || DEFAULT_SYMBOL;
        openView(view, sym, focusedPane);
      }
    },
    [openView, setActiveTab, focusedPane, primary, secondary, activePane.symbol],
  );

  const handleSymbol = useCallback(
    (sym: string) => {
      openView("intel", sym, "primary");
    },
    [openView],
  );

  const handlePaneNav = useCallback(
    (paneId: PaneId, view: ViewMode) => {
      const registry = PANEL_REGISTRY[view];
      const pane = paneId === "primary" ? primaryTab : secondaryTab;
      const sym = registry.needsSymbol ? pane?.symbol || DEFAULT_SYMBOL : "";
      openView(view, sym, paneId as "primary" | "secondary");
    },
    [openView, primaryTab, secondaryTab],
  );

  const handlePaneSymbol = useCallback(
    (paneId: PaneId, symbol: string) => {
        openView("intel", symbol, paneId as "primary" | "secondary");
    },
    [openView],
  );

  const handleCommand = useCallback(
    (command: ParsedTerminalCommand) => {
      if (!PANEL_REGISTRY[command.view]) return;
      const sym =
        command.symbol || (PANEL_REGISTRY[command.view].needsSymbol ? activePane.symbol : "");
      openView(command.view, sym, focusedPane);
    },
    [openView, focusedPane, activePane.symbol],
  );

  // ── Simplified panel rendering ──────────────────────────────────────
  // All panels receive the same base shape; the switch only decides which
  // props to pass based on the panel's needsSymbol / isSecurityView flags.

  const renderPaneContent = useCallback(
    (paneId: PaneId) => {
      const pane = paneId === "primary" ? primaryTab : secondaryTab;
      if (!pane) return null;

      const onSymbol = (symbol: string) => handlePaneSymbol(paneId, symbol);
      const onNav = (view: ViewMode) => handlePaneNav(paneId, view);
      const def = PANEL_REGISTRY[pane.view] ?? PANEL_REGISTRY.market;
      const { component: PanelComponent, needsSymbol, label } = def;

      const panelName = `${label} (${pane.symbol || "global"})`;

      return (
        <PanelErrorBoundary key={`${pane.view}:${pane.symbol}`} panelName={panelName}>
          <Suspense fallback={<PanelLoadingSkeleton rows={6} />}>
            {needsSymbol ? (
              <PanelComponent symbol={pane.symbol} onNav={onNav} onSymbol={onSymbol} />
            ) : (
              <PanelComponent onSymbol={onSymbol} onNav={onNav} />
            )}
          </Suspense>
        </PanelErrorBoundary>
      );
    },
    [primaryTab, secondaryTab, handlePaneNav, handlePaneSymbol],
  );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar
        activeSymbol={activePane.symbol}
        view={activePane.view}
        onNav={handleNav}
        onSymbol={handleSymbol}
        onExecute={handleCommand}
        onCommandBarOpen={() => setCommandBarOpen(true)}
        configOpen={configOpen}
        onConfigOpenChange={setConfigOpen}
      />

      <TickerTape onSymbol={handleSymbol} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 min-w-0 overflow-hidden bg-background">
          {secondary ? (
            <PanelGroup
              direction="horizontal"
              autoSaveId="terminal-workspace-layout"
              className="h-full"
            >
              <Panel defaultSize={55} minSize={35}>
                <WorkspacePane
                  paneId="primary"
                  pane={{ view: primaryTab.view, symbol: primaryTab.symbol }}
                  focused={focusedPane === "primary"}
                  canClose={false}
                  onFocus={() => useWorkspaceStore.setState({ focusedPane: "primary" })}
                >
                  {renderPaneContent("primary")}
                </WorkspacePane>
              </Panel>
              <PanelResizeHandle className="w-px bg-gradient-to-b from-transparent via-border/60 to-transparent hover:via-[hsl(186_45%_50%)]/40 transition-colors duration-200" />
              <Panel defaultSize={45} minSize={30}>
                <WorkspacePane
                  paneId="secondary"
                  pane={{
                    view: secondaryTab?.view ?? "intel",
                    symbol: secondaryTab?.symbol ?? "",
                  }}
                  focused={focusedPane === "secondary"}
                  canClose={true}
                  onFocus={() => useWorkspaceStore.setState({ focusedPane: "secondary" })}
                  onClose={() => closeSecondary()}
                >
                  {renderPaneContent("secondary")}
                </WorkspacePane>
              </Panel>
            </PanelGroup>
          ) : (
            <WorkspacePane
              paneId="primary"
              pane={{ view: primaryTab.view, symbol: primaryTab.symbol }}
              focused={true}
              canClose={false}
              onFocus={() => useWorkspaceStore.setState({ focusedPane: "primary" })}
            >
              {renderPaneContent("primary")}
            </WorkspacePane>
          )}
        </main>
      </div>

      <StatusBar />
      {isMobile && (
        <MobileNav
          view={activePane.view}
          onNav={handleNav}
          onOpenCommand={() => setCommandBarOpen(true)}
        />
      )}

      {commandBarOpen && (
        <CommandBar
          onClose={() => setCommandBarOpen(false)}
          onExecute={(cmd) => {
            setCommandBarOpen(false);
            handleCommand(cmd);
          }}
          onConfigOpen={() => setConfigOpen(true)}
        />
      )}
    </div>
  );
}
