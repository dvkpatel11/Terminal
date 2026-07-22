import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteBus } from "./quoteBus";
import { parseFinnhubMessage, applyFinnhubMessage } from "./finnhubWs";

test("parseFinnhubMessage parses a trade frame", () => {
  const msg = { type: "trade", data: [{ s: "AAPL", p: 185.23 }] };
  assert.deepEqual(parseFinnhubMessage(msg), [{ symbol: "AAPL", price: 185.23 }]);
});

test("parseFinnhubMessage parses a crypto frame", () => {
  const msg = { type: "crypto", data: [{ s: "BINANCE:BTCUSDT", p: 65000.5 }] };
  assert.deepEqual(parseFinnhubMessage(msg), [{ symbol: "BINANCE:BTCUSDT", price: 65000.5 }]);
});

test("parseFinnhubMessage ignores heartbeats / errors / unknown shapes", () => {
  assert.equal(parseFinnhubMessage({ type: "heartbeat" }), null);
  assert.equal(parseFinnhubMessage({ type: "error", msg: "unauthorized" }), null);
  assert.equal(parseFinnhubMessage(null), null);
  assert.equal(parseFinnhubMessage("garbage"), null);
});

test("parseFinnhubMessage skips ticks with non-finite prices", () => {
  const msg = { type: "trade", data: [{ s: "AAPL", p: NaN }] };
  assert.equal(parseFinnhubMessage(msg), null);
});

test("applyFinnhubMessage passes equity ticks through unchanged", () => {
  const bus = createQuoteBus();
  applyFinnhubMessage(bus, { type: "trade", data: [{ s: "AAPL", p: 190 }] }, {});
  assert.equal(bus.getQuote("AAPL")?.price, 190);
});

test("applyFinnhubMessage maps Finnhub crypto symbols back to app symbols", () => {
  const bus = createQuoteBus();
  applyFinnhubMessage(
    bus,
    { type: "crypto", data: [{ s: "BINANCE:BTCUSDT", p: 64000 }] },
    { "BINANCE:BTCUSDT": "BTC-USD" },
  );
  assert.equal(bus.getQuote("BTC-USD")?.price, 64000);
  assert.equal(bus.getQuote("BINANCE:BTCUSDT"), undefined);
});

test("applyFinnhubMessage is a no-op for non-trade frames", () => {
  const bus = createQuoteBus();
  const update = bus.subscribe(() => assert.fail("should not notify"));
  applyFinnhubMessage(bus, { type: "heartbeat" }, {});
  update();
  assert.equal(bus.getSymbolCount(), 0);
});
