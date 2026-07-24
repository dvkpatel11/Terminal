# AI Agent Upgrade — Context, Tools, Skills

> **Date:** 2026-07-23
> **Status:** Ready for implementation

---

## Executive Summary

The AI agent has three structural gaps:

1. **Incomplete context** — AgentPanel sends `symbol` and `view` but NOT `quote` or `technicals`, so the agent can't see live prices or indicators
2. **No tool access** — The agent is a chatbot. It can't fetch data, run calculations, or access terminal APIs. It hallucinates data from training
3. **Static skills** — 4 hardcoded skills in `prompts.json`. User can't create custom skills without editing JSON manually

This plan fixes the context gap, adds tool-calling capability, and makes skills user-configurable. We keep Claude for thesis generation (structured output quality matters) and NVIDIA for chat (free, streaming).

---

## Part 1: Fix Context Gap

### Problem

`AgentPanel.tsx:153-158` sends:
```typescript
body: JSON.stringify({
  message: msg,
  skill: activeSkill,
  symbol: symbol ?? undefined,
  view: view ?? undefined,
  // quote and technicals are MISSING
})
```

The server accepts `quote` and `technicals` (`routes.ts:493-499`) and injects them into the system prompt via `buildSystemPrompt()`, but the client never sends them.

### Solution

AgentPanel already imports from `useFinance`. Add `useQuote` and fetch live data, then send it in the request body.

**File:** `src/client/src/components/panels/AgentPanel.tsx`

```typescript
// Add imports
import { useQuote } from "@/lib/useFinance";

// Inside AgentPanel component:
const { data: liveQuote } = useQuote(symbol);

// In sendMessage(), include quote and technicals:
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: msg,
    skill: activeSkill,
    symbol: symbol ?? undefined,
    view: view ?? undefined,
    quote: liveQuote ? {
      price: liveQuote.price,
      changePercent: liveQuote.previousClose
        ? ((liveQuote.price - liveQuote.previousClose) / liveQuote.previousClose) * 100
        : 0,
      volume: liveQuote.volume,
    } : undefined,
    technicals: liveQuote ? {
      rsi14: liveQuote.rsi_14 ?? null,
      macd: liveQuote.macd ?? null,
      vwap: liveQuote.vwap ?? null,
      support: liveQuote.support ?? null,
      resistance: liveQuote.resistance ?? null,
    } : undefined,
  }),
});
```

### What the agent sees after this change

```
--- CURRENT SESSION CONTEXT ---
The user is currently viewing: NVDA
Active panel: Chart (chart)
Current price: $124.50 | Change: 2.15% | Volume: 52,340,100
Technicals: RSI=72.1 | MACD=0.820 | VWAP=123.45 | Support=$118.00 | Resistance=$130.00
--- END CONTEXT ---
```

### File changes

| File | Change |
|------|--------|
| `src/client/src/components/panels/AgentPanel.tsx` | Import `useQuote`, send `quote` + `technicals` in request body |

---

## Part 2: Tool-Calling Architecture

### Problem

The agent generates text but can't actually DO anything. When you ask "what's the P/E of AAPL?", it either hallucinates or says "I don't have access to that data."

### Solution: Function Calling via NVIDIA API

NVIDIA's `minimaxai/minimax-m3` supports OpenAI-compatible function calling. We define tools the agent can invoke, and the server executes them.

### Tool Definitions

```typescript
// server/agentTools.ts

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_quote",
    description: "Get current price, volume, and key metrics for a stock or crypto symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, e.g. AAPL, BTC-USD" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_fundamentals",
    description: "Get fundamental data: P/E, EV/EBITDA, revenue growth, margins, analyst consensus",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_technicals",
    description: "Get technical indicators: RSI, MACD, Bollinger Bands, support/resistance, moving averages",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        period: { type: "string", description: "Lookback period", enum: ["1M", "3M", "6M", "1Y"] },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_news",
    description: "Get recent news headlines for a symbol or the market",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol (omit for market news)" },
        query: { type: "string", description: "Search filter" },
      },
      required: [],
    },
  },
  {
    name: "get_social_sentiment",
    description: "Get social media sentiment from Reddit/Discord for a symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_macro",
    description: "Get macro snapshot: CPI, Fed Funds Rate, unemployment, yield curve, VIX",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_sector_performance",
    description: "Get GICS sector ETF performance (1D, week, month, YTD)",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_scorecard",
    description: "Get market scorecard: S&P 500, Nasdaq, Russell, DXY, Gold, Oil, BTC, VIX",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];
```

### Tool Execution

```typescript
// server/agentTools.ts

import { getQuotes, getFundamentals, getNews } from "./marketData";
import { getScorecardData, getTechnicalIndicators } from "./marketScorecard";
import { getLiveMacroSnapshot } from "./economicsData";
import { getSocialFeed } from "./socialFeed";

export async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  switch (name) {
    case "get_quote": {
      const quotes = await getQuotes([args.symbol]);
      if (!quotes.length) return `No quote data for ${args.symbol}`;
      const q = quotes[0];
      return JSON.stringify({
        symbol: q.symbol, price: q.price, change: q.change,
        changePercent: q.changePercent, volume: q.volume,
        high52: q.high52, low52: q.low52, marketCap: q.marketCap,
      });
    }
    case "get_fundamentals": {
      const fund = await getFundamentals(args.symbol);
      if (!fund) return `No fundamentals for ${args.symbol}`;
      return JSON.stringify({
        pe: fund.metrics?.pe_ratio,
        forwardPe: fund.metrics?.forward_pe,
        evEbitda: fund.metrics?.enterprise_to_ebitda,
        revenueGrowth: fund.metrics?.revenue_growth,
        operatingMargin: fund.metrics?.operating_margin,
        dividendYield: fund.metrics?.dividend_yield,
        consensus: fund.consensus?.recommendation,
        target: fund.consensus?.target_consensus,
      });
    }
    case "get_technicals": {
      const indicators = await getTechnicalIndicators(args.symbol);
      return JSON.stringify(indicators);
    }
    case "get_news": {
      const items = await getNews(args.symbol, args.query);
      return JSON.stringify(items.slice(0, 5).map(n => ({
        title: n.title, source: n.source, sentiment: n.sentiment,
      })));
    }
    case "get_social_sentiment": {
      const feed = await getSocialFeed(undefined, args.symbol);
      return JSON.stringify({
        sentiment: feed.sentiment,
        mentions: feed.mentions?.slice(0, 10),
      });
    }
    case "get_macro": {
      const macro = await getLiveMacroSnapshot();
      return JSON.stringify(macro);
    }
    case "get_sector_performance": {
      const scorecard = await getScorecardData();
      return JSON.stringify(scorecard);
    }
    case "get_scorecard": {
      const scorecard = await getScorecardData();
      return JSON.stringify(scorecard);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
```

### Server-Side Tool Loop

The chat endpoint runs a tool loop: if the LLM returns a tool call, execute it, feed the result back, and repeat until the LLM produces a final text response.

**File:** `src/server/routes.ts` — modify `POST /api/chat`

```typescript
// After getting the initial response from NVIDIA:
// Check if the response contains tool_calls
// If yes: execute tools, append results, call again
// Max 5 iterations to prevent infinite loops

const MAX_TOOL_ROUNDS = 5;

let messages = [
  { role: "system", content: systemPrompt },
  ...chatMessages,
];

for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const response = await axios.post(NVIDIA_API_URL, {
    model: NVIDIA_MODEL,
    messages,
    tools: AGENT_TOOLS,  // NEW: pass tool definitions
    max_tokens: 8192,
    temperature: 0.7,
    stream: false,        // Non-streaming for tool calls (easier to parse)
  });

  const choice = response.data.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    // No tool calls — this is the final text response
    const text = choice?.message?.content ?? "";
    // Stream it back to client
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
    break;
  }

  // Execute tool calls and build results
  messages.push(choice.message);  // assistant message with tool_calls
  for (const tc of toolCalls) {
    const args = JSON.parse(tc.function.arguments);
    const result = await executeTool(tc.function.name, args);
    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: result,
    });
  }
}
```

### Client-Side: Tool Call UI

Show tool calls in the chat so the user sees what the agent is doing:

```tsx
// In MessageBubble, detect tool call indicators in the content
// Or add a separate ToolCallDisplay component
function ToolCallBadge({ toolName, args }: { toolName: string; args: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-500/5 border border-cyan-500/10 rounded text-[9px] text-cyan-300/70 mb-1">
      <Zap size={10} />
      <span className="font-mono">{toolName}</span>
      <span className="text-muted-foreground/40">({args})</span>
    </div>
  );
}
```

### File changes

| File | Change |
|------|--------|
| **Create:** `src/server/agentTools.ts` | Tool definitions + execution logic |
| `src/server/routes.ts` | Add tool loop to chat endpoint, pass `tools` to NVIDIA |
| `src/client/src/components/panels/AgentPanel.tsx` | Render tool call badges in messages |

---

## Part 3: User-Configurable Skills

### Problem

Skills are hardcoded in `prompts.json`. User can't add a "thesis generator" skill or "portfolio analyzer" skill without editing JSON.

### Solution: Skills in Database + Config UI

### Schema Extension

**File:** `src/shared/schema.ts`

```typescript
export const agentSkills = pgTable("agent_skills", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  defaultPrompts: text("default_prompts").notNull(),  // JSON array
  isBuiltin: boolean("is_builtin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### API Routes

```
GET    /api/chat/skills          — list all skills (builtin + custom)
POST   /api/chat/skills          — create custom skill
PUT    /api/chat/skills/:id      — update custom skill
DELETE /api/chat/skills/:id      — delete custom skill (not builtin)
```

### Skill Editor UI

A small modal/panel where user can:
1. Create new skill with label, description, system prompt, default prompts
2. Edit existing custom skills
3. Duplicate a builtin skill as a starting point
4. Delete custom skills (builtins are immutable)

**File:** `src/client/src/components/panels/AgentPanel.tsx`

Add a "MANAGE SKILLS" button next to the skill selector that opens a skill editor modal.

### Skill Examples

Users could create skills like:

```json
{
  "id": "thesis-generator",
  "label": "THESIS GENERATOR",
  "description": "Generate structured trade theses with bull/bear cases",
  "systemPrompt": "\nTHESIS GENERATOR MODE:\n- Always include: direction (long/short), entry price, invalidation level\n- Bull case with probability estimate\n- Bear case with probability estimate\n- Key catalysts with dates\n- Risk status (low/medium/high/critical)\n- Confidence score (0-1)\n- Use get_fundamentals and get_technicals tools\n- Format output as structured analysis",
  "defaultPrompts": [
    "Generate a long thesis for NVDA at current price",
    "What's the bear case for TSLA?",
    "Evaluate AAPL as a short opportunity"
  ]
}
```

### File changes

| File | Change |
|------|--------|
| `src/shared/schema.ts` | Add `agentSkills` table |
| `src/server/storage.ts` | CRUD for skills |
| `src/server/routes.ts` | Skill API routes |
| `src/server/promptConfig.ts` | Load skills from DB (merge with builtin) |
| `src/client/src/components/panels/AgentPanel.tsx` | Skill editor modal |

---

## Part 4: Prompt Improvements

### Current base prompt issues

The current prompt in `prompts.json` lists "AVAILABLE DATA IN THE TERMINAL" as static text. The agent reads this but can't actually access it. With tools, we change the prompt to instruct the agent to USE tools instead of hallucinating.

### Updated base prompt

```json
{
  "base": "You are BLMTRM AI, an autonomous financial intelligence agent...\n\nYOU HAVE ACCESS TO LIVE MARKET DATA via tools. Always use tools to fetch real data before making recommendations. Never guess or hallucinate prices, P/E ratios, or other metrics.\n\nAvailable tools:\n- get_quote: Current price, volume, 52w range\n- get_fundamentals: P/E, EV/EBITDA, margins, growth, analyst consensus\n- get_technicals: RSI, MACD, Bollinger Bands, support/resistance\n- get_news: Recent headlines for a symbol or market\n- get_social_sentiment: Reddit/Discord sentiment scores\n- get_macro: CPI, Fed Funds, unemployment, yield curve, VIX\n- get_scorecard: Multi-asset market snapshot\n- get_sector_performance: GICS sector ETF performance\n\nWhen asked about a symbol, ALWAYS call get_quote and get_fundamentals first. When asked about technicals, call get_technicals. When asked about macro, call get_macro and get_scorecard.\n\nRespond like a seasoned Goldman/Citadel analyst — precise, direct, data-oriented. Use terminal-style formatting. Format numbers properly: $1.2B, 4.5%, 120bps."
}
```

### File changes

| File | Change |
|------|--------|
| `src/prompts.json` | Update base prompt to reference tools |

---

## Part 5: Implementation Order

| Phase | Tasks | Effort | Depends On |
|-------|-------|--------|------------|
| **Phase 1: Context** | Send quote + technicals from AgentPanel | Small | Nothing |
| **Phase 2: Tools** | Create `agentTools.ts`, tool definitions, execution, tool loop in routes | Medium | Nothing |
| **Phase 3: Tool UI** | Tool call badges in AgentPanel messages | Small | Phase 2 |
| **Phase 4: Skills schema** | `agentSkills` table, storage CRUD, API routes | Medium | Nothing |
| **Phase 5: Skill editor** | UI for creating/editing custom skills | Medium | Phase 4 |
| **Phase 6: Prompt update** | Update base prompt to reference tools | Small | Phase 2 |

Phase 1, 4, 6 can run in parallel. Phase 2 is the critical path. Phase 3 depends on Phase 2. Phase 5 depends on Phase 4.

---

## Part 6: Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `src/server/agentTools.ts` | Tool definitions + execution logic |

### Modified Files
| File | Change |
|------|--------|
| `src/client/src/components/panels/AgentPanel.tsx` | Send quote/technicals, tool call UI, skill editor |
| `src/server/routes.ts` | Tool loop in chat endpoint |
| `src/prompts.json` | Update base prompt to reference tools |
| `src/shared/schema.ts` | Add `agentSkills` table |
| `src/server/storage.ts` | CRUD for skills |
| `src/server/promptConfig.ts` | Merge DB skills with builtin |

---

## Part 7: Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| NVIDIA function calling may be unreliable | Fallback: parse tool calls from text if JSON parsing fails. Log failures for monitoring. |
| Tool calls add latency (extra API round-trips) | Cache tool results for 60s per symbol. Max 5 tool rounds prevents infinite loops. |
| Custom skills could contain harmful prompts | Sanitize system prompt input. Max length limit (2000 chars). No API key injection. |
| Tool execution errors crash the chat endpoint | Wrap each tool call in try/catch. Return error string to agent, let it handle gracefully. |
| Rate limits on NVIDIA with tool calls | Tool calls use the same rate limiter (10/min). Batch tool calls when possible. |
