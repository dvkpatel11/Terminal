import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteBus } from "./quoteBus";
import { parseBinanceMessage, applyBinanceMessage } from "./binanceWs";

const reverse = { btcusdt: "BTC-USD", ethusdt: "ETH-USD" };

test("parseBinanceMessage extracts app symbol + price from a trade frame", () => {
  const msg = { stream: "btcusdt@trade", data: { e: "trade", s: "BTCUSDT", p: "64000.50" } };
  assert.deepEqual(parseBinanceMessage(msg, reverse), { symbol: "BTC-USD", price: 64000.5 });
});

test("parseBinanceMessage handles numeric price strings", () => {
  const msg = { data: { e: "trade", s: "ETHUSDT", p: 3000 } };
  assert.deepEqual(parseBinanceMessage(msg, reverse), { symbol: "ETH-USD", price: 3000 });
});

test("parseBinanceMessage returns null for non-trade frames", () => {
  assert.equal(parseBinanceMessage({ data: { e: "kline", s: "BTCUSDT" } }, reverse), null);
  assert.equal(parseBinanceMessage({ data: { e: "trade", s: "DOGEUSDT" } }, reverse), null);
  assert.equal(parseBinanceMessage(null, reverse), null);
});

test("applyBinanceMessage writes mapped symbol to the bus", () => {
  const bus = createQuoteBus();
  applyBinanceMessage(bus, { data: { e: "trade", s: "BTCUSDT", p: "65000" } }, reverse);
  assert.equal(bus.getQuote("BTC-USD")?.price, 65000);
  assert.equal(bus.getQuote("BTCUSDT"), undefined);
});
