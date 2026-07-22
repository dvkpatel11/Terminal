import { lazy, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, LineChart, Newspaper,
  Bot, Filter, Star, BellRing, Globe2, Briefcase,
  Brain, CandlestickChart, HelpCircle, Table2,
  FileText, CircleDollarSign, Activity, BarChart3, TrendingUp,
  ChartLine, Banknote, Bitcoin, MessageCircle, Scan,
  BarChart, PieChart, Target,
} from "lucide-react";
import type { ViewMode, PanelProps } from "./terminalTypes";

/**
 * Logical grouping used to build the TopBar nav, the symbol dropdown, the
 * command palette and the context strip from a single source of truth.
 * `market`/`macro`/`intel` are the global TopBar groups; `symbol` views are
 * shown in the active-symbol dropdown; `system` holds non-data utilities.
 */
export type PanelCategory = "market" | "macro" | "intel" | "symbol" | "system";

export const CATEGORY_ORDER: PanelCategory[] = ["market", "macro", "intel", "symbol", "system"];

// ── Lazy-loaded panel components ──────────────────────────────────────────
// Each panel is code-split — only loaded when first rendered.

const MarketOverview = lazy(() => import("@/components/panels/MarketOverview"));
const ChartPanel = lazy(() => import("@/components/panels/ChartPanel"));
const NewsPanel = lazy(() => import("@/components/panels/NewsPanel"));
const AgentPanel = lazy(() => import("@/components/panels/AgentPanel"));
const ScreenerPanel = lazy(() => import("@/components/panels/ScreenerPanel"));
const WatchlistPanel = lazy(() => import("@/components/panels/WatchlistPanel"));
const AlertsPanel = lazy(() => import("@/components/panels/AlertsPanel"));
const EconomicsPanel = lazy(() => import("@/components/panels/EconomicsPanel"));
const PortfolioPanel = lazy(() => import("@/components/panels/PortfolioPanel"));
const IntelPanel = lazy(() => import("@/components/panels/IntelPanel"));
const OptionsPanel = lazy(() => import("@/components/panels/OptionsPanel"));
const HelpPanel = lazy(() => import("@/components/panels/HelpPanel"));
const HistoricalPricesPanel = lazy(() => import("@/components/panels/HistoricalPricesPanel"));
const FinancialsPanel = lazy(() => import("@/components/panels/FinancialsPanel"));
const DividendsPanel = lazy(() => import("@/components/panels/DividendsPanel"));
const EstimatesPanel = lazy(() => import("@/components/panels/EstimatesPanel"));
const KeyRatiosPanel = lazy(() => import("@/components/panels/KeyRatiosPanel"));
const YieldCurvePanel = lazy(() => import("@/components/panels/YieldCurvePanel"));
const FxDashboardPanel = lazy(() => import("@/components/panels/FxDashboardPanel"));
const CryptoPanel = lazy(() => import("@/components/panels/CryptoPanel"));
const SentimentPanel = lazy(() => import("@/components/panels/SentimentPanel"));
const OptionsFlowPanel = lazy(() => import("@/components/panels/OptionsFlowPanel"));
const OnChainPanel = lazy(() => import("@/components/panels/OnChainPanel"));
const ScorecardPanel = lazy(() => import("@/components/panels/ScorecardPanel"));
const SectorPanel = lazy(() => import("@/components/panels/SectorPanel"));
const SocialFeedPanel = lazy(() => import("@/components/panels/SocialFeedPanel"));
const PlaysPanel = lazy(() => import("@/components/panels/PlaysPanel"));

// ─── Panel definition ──────────────────────────────────────────────────────

export interface PanelDefinition {
  /** Display label in header/sidebar */
  label: string;
  /** Short code shown in pane header */
  code: string;
  /** Sidebar icon */
  icon: LucideIcon;
  /** Keyboard shortcut key in sidebar */
  kbd: string;
  /** Whether this view requires a ticker symbol */
  needsSymbol: boolean;
  /** Whether this is a symbol-context view that opens in a pane split */
  isSecurityView: boolean;
  /** Whether to show in the top bar navigation */
  showInTopBar: boolean;
  /** Logical group used to derive all navigation surfaces */
  category: PanelCategory;
  /** Show in the flat QuickBar quick-access strip (optional, defaults to false) */
  quickAccess?: boolean;
  /** Top bar label (if shown) */
  topBarLabel?: string;
  /** Bloomberg-style command aliases that map to this view */
  aliases: string[];
  /** Panel component — lazy-loaded, props mapped by renderPaneContent in Terminal.tsx */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const PANEL_REGISTRY: Record<ViewMode, PanelDefinition> = {
  market: {
    label: "MARKET OVERVIEW",
    code: "MRKT",
    icon: LayoutDashboard,
    kbd: "M",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    quickAccess: true,
    topBarLabel: "MRKT",
    aliases: ["MRKT", "MARKET", "CC", "WEI", "MOV"],
    component: MarketOverview,
  },
  chart: {
    label: "CHART",
    code: "GP",
    icon: LineChart,
    kbd: "G",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: true,
    category: "symbol",
    quickAccess: true,
    topBarLabel: "CHRT",
    aliases: ["GP", "CHRT", "CHART"],
    component: ChartPanel,
  },
  news: {
    label: "NEWS",
    code: "NEWS",
    icon: Newspaper,
    kbd: "N",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: true,
    category: "symbol",
    quickAccess: true,
    topBarLabel: "NEWS",
    aliases: ["NEWS", "N", "NI"],
    component: NewsPanel,
  },
  agent: {
    label: "AI AGENT",
    code: "AI",
    icon: Bot,
    kbd: "A",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "system",
    topBarLabel: "AI",
    aliases: ["AI", "AGENT"],
    component: AgentPanel,
  },
  screener: {
    label: "SCREENER",
    code: "EQS",
    icon: Filter,
    kbd: "S",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    topBarLabel: "SCRN",
    aliases: ["EQS", "SCRN", "SCREENER"],
    component: ScreenerPanel,
  },
  watchlist: {
    label: "WATCHLIST",
    code: "WLT",
    icon: Star,
    kbd: "W",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "market",
    aliases: ["WATCH", "WLT", "WATCHLIST"],
    component: WatchlistPanel,
  },
  alerts: {
    label: "ALERT MONITOR",
    code: "MON",
    icon: BellRing,
    kbd: "!",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "market",
    aliases: ["ALRT", "MON", "ALERTS"],
    component: AlertsPanel,
  },
  economics: {
    label: "ECONOMICS",
    code: "ECST",
    icon: Globe2,
    kbd: "E",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "macro",
    quickAccess: true,
    topBarLabel: "ECON",
    aliases: ["ECON", "ECST", "ECONOMICS"],
    component: EconomicsPanel,
  },
  portfolio: {
    label: "PORTFOLIO",
    code: "PRTU",
    icon: Briefcase,
    kbd: "P",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    quickAccess: true,
    topBarLabel: "PORT",
    aliases: ["PORT", "PRTU", "PORTFOLIO"],
    component: PortfolioPanel,
  },
  // `intel` is the merged single-name intelligence/quote view (formerly `quote` + `intel`).
  intel: {
    label: "INTELLIGENCE",
    code: "INTL",
    icon: Brain,
    kbd: "I",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: true,
    category: "symbol",
    quickAccess: true,
    topBarLabel: "INTL",
    aliases: ["INTEL", "DES", "QUOTE", "QR"],
    component: IntelPanel,
  },
  options: {
    label: "OPTIONS CHAIN",
    code: "OMON",
    icon: CandlestickChart,
    kbd: "O",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: true,
    category: "symbol",
    quickAccess: true,
    topBarLabel: "OMON",
    aliases: ["OMON"],
    component: OptionsPanel,
  },
  sentiment: {
    label: "SOCIAL SENTIMENT",
    code: "SENT",
    icon: MessageCircle,
    kbd: "6",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "intel",
    topBarLabel: "SENT",
    aliases: ["SENT"],
    component: SentimentPanel,
  },
  optflow: {
    label: "OPTIONS FLOW",
    code: "OPTF",
    icon: TrendingUp,
    kbd: "7",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "intel",
    topBarLabel: "OPTF",
    aliases: ["OPTF", "FLOW", "OPTIONSFLOW"],
    component: OptionsFlowPanel,
  },
  onchain: {
    label: "ON-CHAIN",
    code: "ONCH",
    icon: Scan,
    kbd: "8",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "intel",
    topBarLabel: "ONCH",
    aliases: ["ONCH", "CHAIN", "WHALE"],
    component: OnChainPanel,
  },
  help: {
    label: "FUNCTION DIRECTORY",
    code: "HELP",
    icon: HelpCircle,
    kbd: "?",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "system",
    aliases: ["HELP", "?"],
    component: HelpPanel,
  },
  hp: {
    label: "HISTORICAL PRICES",
    code: "HP",
    icon: Table2,
    kbd: "H",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: false,
    category: "symbol",
    aliases: ["HP", "HIST"],
    component: HistoricalPricesPanel,
  },
  fa: {
    label: "FINANCIALS",
    code: "FA",
    icon: FileText,
    kbd: "F",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: false,
    category: "symbol",
    aliases: ["FA"],
    component: FinancialsPanel,
  },
  dvd: {
    label: "DIVIDENDS",
    code: "DVD",
    icon: CircleDollarSign,
    kbd: "D",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: false,
    category: "symbol",
    aliases: ["DVD"],
    component: DividendsPanel,
  },
  key: {
    label: "KEY RATIOS & METRICS",
    code: "KEY",
    icon: BarChart3,
    kbd: "K",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: false,
    category: "symbol",
    aliases: ["KEY"],
    component: KeyRatiosPanel,
  },
  ee: {
    label: "ANALYST ESTIMATES",
    code: "EE",
    icon: TrendingUp,
    kbd: "9",
    needsSymbol: true,
    isSecurityView: true,
    showInTopBar: false,
    category: "symbol",
    aliases: ["EE", "EST"],
    component: EstimatesPanel,
  },
  curv: {
    label: "YIELD CURVE",
    code: "CURV",
    icon: ChartLine,
    kbd: "C",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "macro",
    aliases: ["CURV", "YC", "YIELD"],
    component: YieldCurvePanel,
  },
  fxc: {
    label: "FX DASHBOARD",
    code: "FXC",
    icon: Banknote,
    kbd: "X",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "macro",
    aliases: ["FXC", "FX", "FOREX"],
    component: FxDashboardPanel,
  },
  crypto: {
    label: "CRYPTO",
    code: "CRYPTO",
    icon: Bitcoin,
    kbd: "B",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: false,
    category: "market",
    aliases: ["CRYPTO", "COIN", "BTC"],
    component: CryptoPanel,
  },
  scorecard: {
    label: "MARKET SCORECARD",
    code: "CARD",
    icon: BarChart,
    kbd: "0",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    topBarLabel: "CARD",
    aliases: ["CARD", "SCORE", "SCORECARD"],
    component: ScorecardPanel,
  },
  sectors: {
    label: "SECTOR PERFORMANCE",
    code: "SECT",
    icon: PieChart,
    kbd: "T",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    topBarLabel: "SECT",
    aliases: ["SECT", "SECTOR", "SECTORS"],
    component: SectorPanel,
  },
  social: {
    label: "SOCIAL FEED",
    code: "SCFL",
    icon: MessageCircle,
    kbd: "J",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "intel",
    topBarLabel: "SCFL",
    aliases: ["SCFL", "SOCIAL", "SOC"],
    component: SocialFeedPanel,
  },
  plays: {
    label: "TRADE PLAYS",
    code: "PLAY",
    icon: Target,
    kbd: "L",
    needsSymbol: false,
    isSecurityView: false,
    showInTopBar: true,
    category: "market",
    topBarLabel: "PLAY",
    aliases: ["PLAY", "PLAYS", "TRADE"],
    component: PlaysPanel,
  },
};

// ─── Derived helpers ───────────────────────────────────────────────────────

/** All ViewMode keys — use as the authoritative source for the union type */
export const ALL_VIEW_MODES = Object.keys(PANEL_REGISTRY) as ViewMode[];

/** Views that require a ticker symbol context */
export const SECURITY_VIEWS: ViewMode[] = ALL_VIEW_MODES.filter(
  (v) => PANEL_REGISTRY[v].isSecurityView,
);

/**
 * Flat map of all command aliases → ViewMode (for terminal command parsing).
 * Built with uniqueness validation so a duplicate alias fails loudly at startup
 * instead of silently overwriting (the old behaviour hid the `QR`/`quote` clash).
 */
function buildViewAliases(): Record<string, ViewMode> {
  const map: Record<string, ViewMode> = {};
  const duplicates: string[] = [];
  for (const view of ALL_VIEW_MODES) {
    for (const alias of PANEL_REGISTRY[view].aliases) {
      const key = alias.toUpperCase();
      if (map[key] !== undefined && map[key] !== view) {
        duplicates.push(`"${key}" -> "${map[key]}" and "${view}"`);
      }
      map[key] = view;
    }
  }
  if (duplicates.length) {
    const message = `panelRegistry: duplicate command aliases detected:\n  ${duplicates.join("\n  ")}`;
    if (import.meta.env?.DEV) {
      throw new Error(message);
    }
    console.error(message);
  }
  return map;
}

export const VIEW_ALIASES: Record<string, ViewMode> = buildViewAliases();

/** Views grouped by category — the single source for TopBar, command palette, context strip. */
export const PANELS_BY_CATEGORY: Record<PanelCategory, ViewMode[]> = (() => {
  const groups = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, [] as ViewMode[]])) as Record<
    PanelCategory,
    ViewMode[]
  >;
  for (const view of ALL_VIEW_MODES) {
    groups[PANEL_REGISTRY[view].category].push(view);
  }
  return groups;
})();

/** Sidebar navigation items (ordered by registry insertion order) */
export const SIDEBAR_NAV = ALL_VIEW_MODES.map((v) => {
  const p = PANEL_REGISTRY[v];
  return { id: v, icon: p.icon, label: p.label, kbd: p.kbd };
});

/** Top bar navigation items (only panels with showInTopBar) */
export const TOPBAR_NAV: Array<{ view: ViewMode; label: string }> = ALL_VIEW_MODES
  .filter((v) => PANEL_REGISTRY[v].showInTopBar)
  .map((v) => ({ view: v, label: PANEL_REGISTRY[v].topBarLabel ?? PANEL_REGISTRY[v].label }));

/** Pane header metadata (label, code, needsSymbol) */
export const VIEW_META: Record<ViewMode, { label: string; code: string; needsSymbol: boolean }> =
  Object.fromEntries(
    ALL_VIEW_MODES.map((v) => {
      const p = PANEL_REGISTRY[v];
      return [v, { label: p.label, code: p.code, needsSymbol: p.needsSymbol }];
    }),
  ) as Record<ViewMode, { label: string; code: string; needsSymbol: boolean }>;

/** Get the panel component for a given ViewMode */
export function getPanelComponent(view: ViewMode) {
  return PANEL_REGISTRY[view].component;
}
