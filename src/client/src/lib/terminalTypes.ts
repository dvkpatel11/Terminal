export type ViewMode =
  | "market"
  | "chart"
  | "news"
  | "agent"
  | "screener"
  | "watchlist"
  | "alerts"
  | "economics"
  | "portfolio"
  | "intel"
  | "options"
  | "sentiment"
  | "optflow"
  | "onchain"
  | "help"
  | "hp"
  | "fa"
  | "dvd"
  | "key"
  | "ee"
  | "curv"
  | "fxc"
  | "crypto"
  | "scorecard"
  | "sectors"
  | "social"
  | "plays";

export type PaneId = "primary" | "secondary";

/** Default symbol used when navigating to a symbol view with no active symbol context. */
export const DEFAULT_SYMBOL = "AAPL";

export interface PaneState {
  view: ViewMode;
  symbol: string;
}

export interface WorkspaceState {
  primary: PaneState;
  secondary: PaneState | null;
  focusedPane: PaneId;
}

// ── Panel prop interfaces (used by panelRegistry typing) ──────────────────

/** Props for panels that display data for a specific symbol (e.g., IntelPanel, ChartPanel). */
export interface SymbolPanelProps {
  symbol: string;
  onNav?: (view: ViewMode) => void;
  onSymbol?: (sym: string) => void;
}

/** Props for panels that show market-level data and navigate to symbols (e.g., MarketOverview, ScreenerPanel). */
export interface MarketPanelProps {
  onSymbol: (sym: string) => void;
  onNav?: (view: ViewMode) => void;
}

/** Props for panels with no symbol context (e.g., EconomicsPanel, HelpPanel). */
export interface NeutralPanelProps {
  onNav?: (view: ViewMode) => void;
  onSymbol?: (sym: string) => void;
}

/** Union of all panel prop types. */
export type PanelProps = SymbolPanelProps | MarketPanelProps | NeutralPanelProps;
