import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteBus } from "./quoteBus";

test("round-trips a quote by uppercased symbol", () => {
  const bus = createQuoteBus();
  bus.updateQuote("aapl", 185.2);
  const quote = bus.getQuote("AAPL");
  assert.equal(quote?.symbol, "AAPL");
  assert.equal(quote?.price, 185.2);
  assert.equal(typeof quote?.ts, "number");
});

test("omits unknown symbols from getQuotes (never NaN)", () => {
  const bus = createQuoteBus();
  bus.updateQuote("MSFT", 400);
  const quotes = bus.getQuotes(["MSFT", "TSLA", "NVDA"]);
  assert.deepEqual(quotes, [{ symbol: "MSFT", price: 400 }]);
});

test("notifies subscribers on update and stops on unsubscribe", () => {
  const bus = createQuoteBus();
  const seen: string[] = [];
  const unsub = bus.subscribe((u) => seen.push(u.symbol));
  bus.updateQuote("AAPL", 1);
  unsub();
  bus.updateQuote("AAPL", 2);
  assert.deepEqual(seen, ["AAPL"]);
});

test("tracks symbol count", () => {
  const bus = createQuoteBus();
  assert.equal(bus.getSymbolCount(), 0);
  bus.updateQuote("AAPL", 1);
  bus.updateQuote("MSFT", 2);
  assert.equal(bus.getSymbolCount(), 2);
});

test("getAllQuotes returns every stored quote", () => {
  const bus = createQuoteBus();
  bus.updateQuote("AAPL", 1);
  bus.updateQuote("MSFT", 2);
  assert.deepEqual(bus.getAllQuotes().sort((a, b) => a.symbol.localeCompare(b.symbol)), [
    { symbol: "AAPL", price: 1 },
    { symbol: "MSFT", price: 2 },
  ]);
});
