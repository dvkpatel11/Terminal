import { chat, chatStream, MODEL_IDS, type ModelId } from "../openai/client.js";

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

export interface TechnicalIndicators {
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number };
  sma20?: number;
  sma50?: number;
  sma200?: number;
  bollinger?: { upper: number; middle: number; lower: number };
  atr?: number;
}

export interface NewsSentiment {
  title: string;
  source: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  publishedAt: string;
}

export interface TradingSignal {
  symbol: string;
  action: "buy" | "sell" | "hold";
  confidence: number;
  reasoning: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  timeframe: "scalp" | "day" | "swing" | "position";
  riskLevel: "low" | "medium" | "high";
  indicators: TechnicalIndicators;
  sentiment?: NewsSentiment[];
  timestamp: number;
}

const SYSTEM_PROMPT = `You are an expert quantitative trading analyst. Analyze market data, technical indicators, and news sentiment to generate actionable trading signals.

Output format (JSON only):
{
  "symbol": "AAPL",
  "action": "buy|sell|hold",
  "confidence": 0.85,
  "reasoning": "Detailed reasoning...",
  "entryPrice": 150.25,
  "stopLoss": 145.00,
  "takeProfit": 160.00,
  "timeframe": "swing",
  "riskLevel": "medium"
}`;

export async function generateTradingSignal(
  symbol: string,
  marketData: MarketData,
  indicators: TechnicalIndicators,
  news?: NewsSentiment[],
  modelId: string = MODEL_IDS.GPT_OSS_120B
): Promise<TradingSignal> {
  const prompt = buildSignalPrompt(symbol, marketData, indicators, news);
  
  const response = await chat(prompt, {
    model: modelId,
    maxTokens: 2048,
    temperature: 0.3,
    systemPrompt: SYSTEM_PROMPT,
  });

  return parseSignalResponse(symbol, response, marketData, indicators, news);
}

export async function generateTradingSignalStream(
  symbol: string,
  marketData: MarketData,
  indicators: TechnicalIndicators,
  news: NewsSentiment[] | undefined,
  onChunk: (chunk: string) => void,
  modelId: string = MODEL_IDS.GPT_OSS_120B
) {
  const prompt = buildSignalPrompt(symbol, marketData, indicators, news);
  await chatStream(prompt, { model: modelId, maxTokens: 2048, temperature: 0.3, systemPrompt: SYSTEM_PROMPT }, onChunk);
}

function buildSignalPrompt(
  symbol: string,
  marketData: MarketData,
  indicators: TechnicalIndicators,
  news?: NewsSentiment[]
): string {
  const newsText = news?.length
    ? `\n\nRecent News:\n${news.map(n => `- ${n.title} (${n.sentiment}, score: ${n.score})`).join("\n")}`
    : "";

  return `Analyze ${symbol}:
Current Price: $${marketData.price} (${marketData.changePercent > 0 ? "+" : ""}${marketData.changePercent.toFixed(2)}%)
Volume: ${marketData.volume.toLocaleString()}
Day Range: $${marketData.low} - $${marketData.high}

Technical Indicators:
${formatIndicators(indicators)}
${newsText}

Generate trading signal as JSON.`;
}

function formatIndicators(i: TechnicalIndicators): string {
  return [
    i.rsi !== undefined ? `RSI(14): ${i.rsi.toFixed(2)}` : null,
    i.macd ? `MACD: ${i.macd.macd.toFixed(4)} | Signal: ${i.macd.signal.toFixed(4)} | Hist: ${i.macd.histogram.toFixed(4)}` : null,
    i.sma20 !== undefined ? `SMA20: ${i.sma20.toFixed(2)}` : null,
    i.sma50 !== undefined ? `SMA50: ${i.sma50.toFixed(2)}` : null,
    i.sma200 !== undefined ? `SMA200: ${i.sma200.toFixed(2)}` : null,
    i.bollinger ? `BB: Upper ${i.bollinger.upper.toFixed(2)} | Mid ${i.bollinger.middle.toFixed(2)} | Lower ${i.bollinger.lower.toFixed(2)}` : null,
    i.atr !== undefined ? `ATR(14): ${i.atr.toFixed(2)}` : null,
  ].filter(Boolean).join("\n");
}

function parseSignalResponse(
  symbol: string,
  response: string,
  marketData: MarketData,
  indicators: TechnicalIndicators,
  news?: NewsSentiment[]
): TradingSignal {
  try {
    const parsed = JSON.parse(response);
    return {
      symbol,
      action: parsed.action,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      entryPrice: parsed.entryPrice ?? marketData.price,
      stopLoss: parsed.stopLoss,
      takeProfit: parsed.takeProfit,
      timeframe: parsed.timeframe,
      riskLevel: parsed.riskLevel,
      indicators,
      sentiment: news,
      timestamp: Date.now(),
    };
  } catch {
    return {
      symbol,
      action: "hold",
      confidence: 0.5,
      reasoning: "Failed to parse model response",
      timeframe: "swing",
      riskLevel: "medium",
      indicators,
      sentiment: news,
      timestamp: Date.now(),
    };
  }
}

export async function analyzeMarketSentiment(
  news: NewsSentiment[],
  modelId: string = MODEL_IDS.GPT_OSS_20B
): Promise<{ overall: "bullish" | "bearish" | "neutral"; summary: string; keyThemes: string[] }> {
  const prompt = `Analyze market sentiment from these news items:\n${news.map(n => `- ${n.title} (${n.sentiment}: ${n.score})`).join("\n")}\n\nReturn JSON: { "overall": "bullish|bearish|neutral", "summary": "...", "keyThemes": ["..."] }`;

  const response = await chat(prompt, { model: modelId, maxTokens: 1024, temperature: 0.3 });
  
  try {
    return JSON.parse(response);
  } catch {
    return { overall: "neutral", summary: "Failed to parse", keyThemes: [] };
  }
}
