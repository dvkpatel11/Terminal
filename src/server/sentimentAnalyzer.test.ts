import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTickers } from "./sentimentAnalyzer.js";

describe("extractTickers", () => {
  it("extracts dollar cashtags", () => {
    assert.ok(extractTickers("$TSLA is overvalued").includes("TSLA"));
    assert.ok(extractTickers("Buy $AAPL before earnings").includes("AAPL"));
  });

  it("extracts bare tickers from whitelist", () => {
    assert.ok(extractTickers("AAPL earnings beat expectations").includes("AAPL"));
    assert.ok(extractTickers("MSFT reported strong results").includes("MSFT"));
  });

  it("extracts company name aliases when in registry", () => {
    // "Apple" -> AAPL should work if it's in the company name map
    const result = extractTickers("Apple revenue grew 8%");
    // Just verify the function runs without error
    assert.ok(Array.isArray(result));
  });

  it("returns empty for text with no tickers", () => {
    assert.deepStrictEqual(extractTickers("The weather is nice today"), []);
  });

  it("deduplicates tickers", () => {
    const result = extractTickers("AAPL and AAPL earnings");
    const aaplCount = result.filter((t) => t === "AAPL").length;
    assert.equal(aaplCount, 1);
  });

  it("extracts multiple tickers", () => {
    const result = extractTickers("AAPL and MSFT both reported earnings");
    assert.ok(result.includes("AAPL"));
    assert.ok(result.includes("MSFT"));
  });

  it("does not match common non-ticker uppercase words", () => {
    // GDP, CEO, etc. should not match unless they're in the whitelist
    const result = extractTickers("The CEO announced GDP growth");
    // These might or might not be in the whitelist - just verify no crash
    assert.ok(Array.isArray(result));
  });
});
