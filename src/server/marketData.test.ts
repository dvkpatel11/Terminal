import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuoteFromStooq,
  parseNewsFeed,
  parseStooqCurrent,
  parseStooqHistory,
} from "./marketData";

test("parseStooqCurrent parses current quote csv rows", () => {
  const current = parseStooqCurrent("AAPL.US,20260316,210017,252.105,253.885,249.88,252.82,32074210,");

  assert.deepEqual(current, {
    open: 252.105,
    high: 253.885,
    low: 249.88,
    close: 252.82,
    volume: 32074210,
    date: "2026-03-16",
    time: "21:00:17",
  });
});

test("parseStooqCurrent treats N/D volume as zero", () => {
  const current = parseStooqCurrent("^SPX,20260316,230000,6674.37,6729.79,6674.37,6699.38,N/D,");

  assert.equal(current.volume, 0);
});

test("parseStooqCurrent rejects non-csv payloads", () => {
  assert.throws(() => parseStooqCurrent("</html>"), /No current quote data|Malformed current quote row/);
});

test("parseStooqHistory returns ordered OHLCV bars", () => {
  const bars = parseStooqHistory([
    "Date,Open,High,Low,Close,Volume",
    "2026-03-13,241.25,244.91,240.10,242.84,51000000",
    "2026-03-14,243.10,246.12,242.90,245.18,49800000",
  ].join("\n"));

  assert.deepEqual(bars, [
    { date: "2026-03-13", open: 241.25, high: 244.91, low: 240.1, close: 242.84, volume: 51000000 },
    { date: "2026-03-14", open: 243.1, high: 246.12, low: 242.9, close: 245.18, volume: 49800000 },
  ]);
});

test("parseStooqHistory normalizes unavailable volume to zero", () => {
  const bars = parseStooqHistory([
    "Date,Open,High,Low,Close,Volume",
    "2026-03-13,17.24,17.24,17.24,17.24,N/D",
  ].join("\n"));

  assert.deepEqual(bars, [
    { date: "2026-03-13", open: 17.24, high: 17.24, low: 17.24, close: 17.24, volume: 0 },
  ]);
});

test("buildQuoteFromStooq derives previous close, ranges, and reference fundamentals", () => {
  const quote = buildQuoteFromStooq({
    symbol: "AAPL",
    provider: "Stooq",
    profile: {
      name: "Apple Inc.",
      exchange: "NASDAQ",
      sector: "Technology",
      marketCap: 3_400_000_000_000,
      referencePrice: 242,
      eps: 6.5,
    },
    current: {
      open: 252.105,
      high: 253.885,
      low: 249.88,
      close: 252.82,
      volume: 32074210,
      date: "2026-03-16",
      time: "21:00:17",
    },
    history: [
      { date: "2026-03-13", open: 241.25, high: 244.91, low: 240.1, close: 242.84, volume: 51000000 },
      { date: "2026-03-14", open: 243.1, high: 246.12, low: 242.9, close: 245.18, volume: 49800000 },
      { date: "2026-03-16", open: 252.11, high: 253.89, low: 249.88, close: 252.82, volume: 32074210 },
    ],
  });

  assert.equal(quote.symbol, "AAPL");
  assert.equal(quote.name, "Apple Inc.");
  assert.equal(quote.exchange, "NASDAQ");
  assert.equal(quote.sector, "Technology");
  assert.equal(quote.previousClose, 245.18);
  assert.equal(quote.change, 7.64);
  assert.equal(quote.changePercent, 3.12);
  assert.equal(quote.dayHigh, 253.885);
  assert.equal(quote.dayLow, 249.88);
  assert.equal(quote.avgVolume, 44291403);
  assert.equal(quote.high52, 253.89);
  assert.equal(quote.low52, 240.1);
  assert.equal(quote.eps, 6.5);
  assert.equal(quote.pe, 38.9);
  assert.equal(quote.marketCap, 3552016528925.62);
  assert.equal(quote.quoteSource, "Stooq");
  assert.equal(quote.isLive, true);
});

test("parseNewsFeed normalizes rss items and infers sentiment", () => {
  const items = parseNewsFeed(`<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Apple jumps after earnings beat - Reuters</title>
          <description>Shares rally as revenue tops expectations and guidance improves.</description>
          <link>https://example.com/apple</link>
          <pubDate>Mon, 17 Mar 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Oil falls as recession fears grow</title>
          <description>Demand concerns pressure crude lower in early trading.</description>
          <link>https://example.com/oil</link>
          <pubDate>Mon, 17 Mar 2026 09:00:00 GMT</pubDate>
          <source url="https://www.cnbc.com">CNBC</source>
        </item>
      </channel>
    </rss>`, "Google News");

  assert.deepEqual(items, [
    {
      title: "Apple jumps after earnings beat",
      summary: "Shares rally as revenue tops expectations and guidance improves.",
      url: "https://example.com/apple",
      source: "Reuters",
      publishedAt: "2026-03-17T10:00:00.000Z",
      sentiment: "positive",
    },
    {
      title: "Oil falls as recession fears grow",
      summary: "Demand concerns pressure crude lower in early trading.",
      url: "https://example.com/oil",
      source: "CNBC",
      publishedAt: "2026-03-17T09:00:00.000Z",
      sentiment: "negative",
    },
  ]);
});
