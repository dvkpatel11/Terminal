import { useState, useCallback, useEffect } from "react";
import TopBar from "@/components/terminal/TopBar";
import TickerTape from "@/components/terminal/TickerTape";
import Sidebar from "@/components/terminal/Sidebar";
import MarketOverview from "@/components/panels/MarketOverview";
import QuotePanel from "@/components/panels/QuotePanel";
import ChartPanel from "@/components/panels/ChartPanel";
import NewsPanel from "@/components/panels/NewsPanel";
import AgentPanel from "@/components/panels/AgentPanel";
import ScreenerPanel from "@/components/panels/ScreenerPanel";
import WatchlistPanel from "@/components/panels/WatchlistPanel";
import AlertsPanel from "@/components/panels/AlertsPanel";
import EconomicsPanel from "@/components/panels/EconomicsPanel";
import PortfolioPanel from "@/components/panels/PortfolioPanel";
import CommandBar from "@/components/terminal/CommandBar";
import FunctionBar from "@/components/terminal/FunctionBar";

export type ViewMode =
  | "market"
  | "quote"
  | "chart"
  | "news"
  | "agent"
  | "screener"
  | "watchlist"
  | "alerts"
  | "economics"
  | "portfolio";

export default function Terminal() {
  const [view, setView] = useState<ViewMode>("market");
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [cmdOpen, setCmdOpen] = useState(false);

  const handleSymbol = useCallback((sym: string) => {
    setActiveSymbol(sym.toUpperCase());
    setView("quote");
  }, []);

  const handleNav = useCallback((v: ViewMode) => {
    setView(v);
  }, []);

  // Keyboard shortcut: / to open command bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const renderPanel = () => {
    switch (view) {
      case "market":     return <MarketOverview onSymbol={handleSymbol} onNav={handleNav} />;
      case "quote":      return <QuotePanel symbol={activeSymbol} onNav={handleNav} />;
      case "chart":      return <ChartPanel symbol={activeSymbol} onSymbol={handleSymbol} />;
      case "news":       return <NewsPanel symbol={activeSymbol} />;
      case "agent":      return <AgentPanel onSymbol={handleSymbol} />;
      case "screener":   return <ScreenerPanel onSymbol={handleSymbol} />;
      case "watchlist":  return <WatchlistPanel onSymbol={handleSymbol} />;
      case "alerts":     return <AlertsPanel onSymbol={handleSymbol} />;
      case "economics":  return <EconomicsPanel />;
      case "portfolio":  return <PortfolioPanel onSymbol={handleSymbol} />;
      default:           return <MarketOverview onSymbol={handleSymbol} onNav={handleNav} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
      <TopBar
        activeSymbol={activeSymbol}
        view={view}
        onNav={handleNav}
        onSymbol={handleSymbol}
        onOpenCmd={() => setCmdOpen(true)}
      />

      {/* Ticker tape */}
      <TickerTape onSymbol={handleSymbol} />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar view={view} onNav={handleNav} />
        <main className="flex-1 overflow-auto scrollbar-thin bg-background">
          {renderPanel()}
        </main>
      </div>

      {/* Command bar overlay */}
      {cmdOpen && (
        <CommandBar
          onClose={() => setCmdOpen(false)}
          onSymbol={(sym) => { handleSymbol(sym); setCmdOpen(false); }}
          onNav={(v) => { handleNav(v); setCmdOpen(false); }}
        />
      )}

      {/* Bloomberg-style function key bar */}
      <FunctionBar onNav={handleNav} onOpenCmd={() => setCmdOpen(true)} />

    </div>
  );
}
