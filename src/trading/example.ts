import { generateTradingSignal, generateTradingSignalStream, analyzeMarketSentiment, type MarketData, type TechnicalIndicators, type NewsSentiment } from "./signals.js";
import { MODEL_IDS } from "../openai/client.js";

const mockMarketData: MarketData = {
  symbol: "AAPL",
  price: 185.50,
  change: 2.30,
  changePercent: 1.25,
  volume: 52_000_000,
  high: 186.20,
  low: 183.10,
  open: 183.50,
  previousClose: 183.20,
  timestamp: Date.now(),
};

const mockIndicators: TechnicalIndicators = {
  rsi: 58.5,
  macd: { macd: 1.25, signal: 0.95, histogram: 0.30 },
  sma20: 182.40,
  sma50: 178.90,
  sma200: 175.20,
  bollinger: { upper: 188.50, middle: 182.40, lower: 176.30 },
  atr: 2.15,
};

const mockNews: NewsSentiment[] = [
  { title: "Apple reports record Q4 earnings", source: "Reuters", sentiment: "positive", score: 0.85, publishedAt: "2024-01-15T10:00:00Z" },
  { title: "iPhone 16 demand exceeds expectations", source: "Bloomberg", sentiment: "positive", score: 0.72, publishedAt: "2024-01-14T14:30:00Z" },
  { title: "China sales concerns weigh on Apple", source: "CNBC", sentiment: "negative", score: -0.45, publishedAt: "2024-01-13T09:15:00Z" },
];

async function main() {
  console.log("Generating trading signal for AAPL...\n");

  const signal = await generateTradingSignal(
    "AAPL",
    mockMarketData,
    mockIndicators,
    mockNews,
    MODEL_IDS.GPT_OSS_120B
  );

  console.log("=== Trading Signal ===");
  console.log(`Symbol: ${signal.symbol}`);
  console.log(`Action: ${signal.action.toUpperCase()}`);
  console.log(`Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
  console.log(`Timeframe: ${signal.timeframe}`);
  console.log(`Risk Level: ${signal.riskLevel}`);
  console.log(`Entry: $${signal.entryPrice?.toFixed(2) ?? "N/A"}`);
  console.log(`Stop Loss: $${signal.stopLoss?.toFixed(2) ?? "N/A"}`);
  console.log(`Take Profit: $${signal.takeProfit?.toFixed(2) ?? "N/A"}`);
  console.log(`\nReasoning: ${signal.reasoning}`);

  console.log("\n=== Streaming Example ===");
  await generateTradingSignalStream(
    "AAPL",
    mockMarketData,
    mockIndicators,
    mockNews,
    (chunk) => process.stdout.write(chunk),
    MODEL_IDS.GPT_OSS_120B
  );
  console.log("\n");

  console.log("=== Sentiment Analysis ===");
  const sentiment = await analyzeMarketSentiment(mockNews, MODEL_IDS.GPT_OSS_20B);
  console.log(`Overall: ${sentiment.overall}`);
  console.log(`Summary: ${sentiment.summary}`);
  console.log(`Key Themes: ${sentiment.keyThemes.join(", ")}`);
}

main().catch(console.error);
