/**
 * Agent tool definitions and executors.
 *
 * Tools give the chat agent the ability to fetch real data instead of hallucinating.
 * Each tool has a JSON schema definition (for the LLM) and an executor function.
 */

import { getQuotes, getFundamentals, getEventsForSymbol, getNews } from "./marketData";
import { getSocialFeed } from "./socialFeed";
import { getTechnicalIndicators, getScorecardData } from "./marketScorecard";
import { getLiveMacroSnapshot, getEconomicCalendar } from "./economicsData";

// ─── Tool Schema (OpenAI function-calling format) ────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  execute: (args: Record<string, string>) => Promise<string>;
}

// ─── Tool Implementations ────────────────────────────────────────────────────

const getQuoteTool: AgentTool = {
  name: "get_quote",
  description: "Get real-time quote data for a stock, ETF, or crypto symbol. Returns price, change, volume, and key metrics.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol (e.g., AAPL, BTC-USD, EURUSD=X)" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const quotes = await getQuotes([args.symbol]);
      return JSON.stringify(quotes[0] ?? { error: `No quote found for ${args.symbol}` });
    } catch (e) {
      return JSON.stringify({ error: `Failed to get quote for ${args.symbol}: ${e}` });
    }
  },
};

const getFundamentalsTool: AgentTool = {
  name: "get_fundamentals",
  description: "Get fundamental data for a company: P/E ratio, market cap, EPS, sector, dividend yield, revenue growth.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol (e.g., AAPL, MSFT)" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const data = await getFundamentals(args.symbol);
      return JSON.stringify(data);
    } catch (e) {
      return JSON.stringify({ error: `Failed to get fundamentals for ${args.symbol}: ${e}` });
    }
  },
};

const getTechnicalsTool: AgentTool = {
  name: "get_technicals",
  description: "Get technical indicators: RSI, MACD, Bollinger Bands, ATR, support/resistance levels.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const data = await getTechnicalIndicators(args.symbol);
      return JSON.stringify(data);
    } catch (e) {
      return JSON.stringify({ error: `Failed to get technicals for ${args.symbol}: ${e}` });
    }
  },
};

const getNewsTool: AgentTool = {
  name: "get_news",
  description: "Get recent news articles for a symbol. Returns headlines, summaries, sentiment, and source.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const data = await getNews(args.symbol);
      return JSON.stringify(data.slice(0, 5));
    } catch (e) {
      return JSON.stringify({ error: `Failed to get news for ${args.symbol}: ${e}` });
    }
  },
};

const getSocialSentimentTool: AgentTool = {
  name: "get_social_sentiment",
  description: "Get aggregated social sentiment for a symbol from Reddit, X/Twitter, Discord. Returns mention count, sentiment score, and recent posts.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const feed = await getSocialFeed([], false, args.symbol);
      const sentiment: Record<string, { positive: number; negative: number; score: number; count: number }> = {};
      for (const [symbol, data] of Object.entries(feed.sentiment)) {
        sentiment[symbol] = data;
      }
      return JSON.stringify({ sentiment, postCount: feed.posts.length, source: feed.source });
    } catch (e) {
      return JSON.stringify({ error: `Failed to get social sentiment for ${args.symbol}: ${e}` });
    }
  },
};

const getMacroTool: AgentTool = {
  name: "get_macro",
  description: "Get macroeconomic data: DXY, VIX, yield curve, Fed funds rate, CPI, GDP, unemployment, PMI.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      const data = await getLiveMacroSnapshot();
      return JSON.stringify(data);
    } catch (e) {
      return JSON.stringify({ error: `Failed to get macro data: ${e}` });
    }
  },
};

const getEventsTool: AgentTool = {
  name: "get_events",
  description: "Get upcoming earnings, dividends, splits, and economic events for a symbol.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "The ticker symbol" },
    },
    required: ["symbol"],
  },
  execute: async (args) => {
    try {
      const data = await getEventsForSymbol(args.symbol);
      return JSON.stringify(data);
    } catch (e) {
      return JSON.stringify({ error: `Failed to get events for ${args.symbol}: ${e}` });
    }
  },
};

const getScorecardTool: AgentTool = {
  name: "get_scorecard",
  description: "Get a market scorecard overview: major indices, sector performance, breadth, and market regime.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      const data = await getScorecardData();
      return JSON.stringify(data);
    } catch (e) {
      return JSON.stringify({ error: `Failed to get scorecard: ${e}` });
    }
  },
};

// ─── Export All ──────────────────────────────────────────────────────────────

export const AGENT_TOOLS: AgentTool[] = [
  getQuoteTool,
  getFundamentalsTool,
  getTechnicalsTool,
  getNewsTool,
  getSocialSentimentTool,
  getMacroTool,
  getEventsTool,
  getScorecardTool,
];

export function getToolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find(t => t.name === name);
}

export function getToolSchemas() {
  return AGENT_TOOLS.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
