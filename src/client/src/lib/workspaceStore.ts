import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewMode } from "./terminalTypes";

/** Max tabs per pane. Beyond this, the least-recently-used tab is evicted. */
export const TAB_CAP = 12;

export interface Tab {
  id: string;
  view: ViewMode;
  symbol: string;
}

interface PaneTabs {
  tabs: Tab[];
  activeTabId: string;
}

interface WorkspaceStore {
  primary: PaneTabs;
  secondary: PaneTabs | null;
  focusedPane: "primary" | "secondary";
  secondarySymbol: string;
  globalSymbol: string | null;

  openView: (view: ViewMode, symbol?: string, pane?: "primary" | "secondary") => void;
  closeTab: (pane: "primary" | "secondary", tabId: string) => void;
  setActiveTab: (pane: "primary" | "secondary", tabId: string) => void;
  setSecondarySymbol: (symbol: string) => void;
  setGlobalSymbol: (symbol: string | null) => void;
  getActiveView: (pane: "primary" | "secondary") => Tab;
  ensureSecondary: () => void;
  closeSecondary: () => void;

}

function makeTabId(view: ViewMode, symbol: string): string {
  return `${view}:${symbol}`;
}

function createDefaultPane(): PaneTabs {
  const id = makeTabId("market", "");
  return {
    tabs: [{ id, view: "market", symbol: "" }],
    activeTabId: id,
  };
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      primary: createDefaultPane(),
      secondary: null,
      focusedPane: "primary",
      secondarySymbol: "AAPL",
      globalSymbol: null,

      openView: (view, symbol = "", pane) => {
        const targetPane = pane ?? get().focusedPane;
        const sym = symbol.toUpperCase();
        const id = makeTabId(view, sym);

        set((state) => {
          const paneState = targetPane === "primary" ? state.primary : state.secondary;
          if (!paneState) return state;

          const existing = paneState.tabs.find((t) => t.id === id);
          let newTabs = existing
            ? paneState.tabs
            : [...paneState.tabs, { id, view, symbol: sym }];

          // LRU eviction: drop the oldest tab that isn't the active or the new one.
          if (newTabs.length > TAB_CAP) {
            const protectedIds = new Set([paneState.activeTabId, id]);
            const evictIndex = newTabs.findIndex((t) => !protectedIds.has(t.id));
            if (evictIndex !== -1) newTabs = newTabs.filter((_, i) => i !== evictIndex);
          }

          const update = targetPane === "primary" ? { primary: { tabs: newTabs, activeTabId: id } } : { secondary: { tabs: newTabs, activeTabId: id } };

          return {
            ...state,
            ...update,
            focusedPane: targetPane,
            secondarySymbol: targetPane === "secondary" ? sym : state.secondarySymbol,
          };
        });
      },

      closeTab: (pane, tabId) => {
        set((state) => {
          const paneState = pane === "primary" ? state.primary : state.secondary;
          if (!paneState) return state;

          const newTabs = paneState.tabs.filter((t) => t.id !== tabId);
          if (newTabs.length === 0) {
            const fallback = makeTabId("market", "");
            newTabs.push({ id: fallback, view: "market", symbol: "" });
          }

          const newActive = paneState.activeTabId === tabId
            ? newTabs[newTabs.length - 1].id
            : paneState.activeTabId;

          const update = pane === "primary"
            ? { primary: { tabs: newTabs, activeTabId: newActive } }
            : { secondary: { tabs: newTabs, activeTabId: newActive } };

          return { ...state, ...update };
        });
      },

      setActiveTab: (pane, tabId) => {
        set((state) => {
          const update = pane === "primary"
            ? { primary: { ...state.primary, activeTabId: tabId } }
            : { secondary: { ...state.secondary!, activeTabId: tabId } };
          return { ...state, ...update, focusedPane: pane };
        });
      },

      setSecondarySymbol: (symbol) => {
        set({ secondarySymbol: symbol.toUpperCase() });
      },

      setGlobalSymbol: (symbol) => {
        set({ globalSymbol: symbol ? symbol.toUpperCase() : null });
      },

      getActiveView: (pane) => {
        const state = get();
        const paneState = pane === "primary" ? state.primary : state.secondary;
        if (!paneState) return { id: "market:", view: "market" as ViewMode, symbol: "" };
        return paneState.tabs.find((t) => t.id === paneState.activeTabId) ?? paneState.tabs[0];
      },

      ensureSecondary: () => {
        set((state) => {
          if (state.secondary) return state;
          const sym = state.secondarySymbol;
          const id = makeTabId("intel", sym);
          return {
            secondary: {
              tabs: [{ id, view: "intel", symbol: sym }],
              activeTabId: id,
            },
          };
        });
      },

      closeSecondary: () => {
        set({ secondary: null });
      },
    }),
    {
      name: "blmtrm-workspace",
      partialize: (state) => ({
        primary: state.primary,
        secondary: state.secondary,
        secondarySymbol: state.secondarySymbol,
        globalSymbol: state.globalSymbol,
      }),
      merge: (persisted: unknown, current: WorkspaceStore) => {
        const stored = persisted as Record<string, unknown> | null;
        if (!stored || typeof stored !== "object") return current;

        // Validate primary has the expected shape
        const p = stored.primary as { tabs?: unknown[]; activeTabId?: string } | undefined;
        if (!p || !Array.isArray(p.tabs) || p.tabs.length === 0 || !p.activeTabId) {
          return current;
        }

        return { ...current, ...stored } as WorkspaceStore;
      },
    }
  )
);
