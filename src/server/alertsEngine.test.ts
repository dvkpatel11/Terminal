import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAlertTrigger, evaluateAlerts } from "./alertsEngine";

test("evaluateAlertTrigger fires above alerts when quote trades through threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "above", price: 200 },
    { symbol: "AAPL", price: 205 },
  );

  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, 205);
});

test("evaluateAlertTrigger fires below alerts when quote falls through threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "below", price: 150 },
    { symbol: "TSLA", price: 148.5 },
  );

  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, 148.5);
});

test("evaluateAlerts returns only newly triggered alerts for matching quotes", () => {
  const result = evaluateAlerts(
    [
      { id: 1, symbol: "AAPL", condition: "above", price: 200, triggered: false },
      { id: 2, symbol: "MSFT", condition: "below", price: 380, triggered: false },
      { id: 3, symbol: "NVDA", condition: "above", price: 900, triggered: true },
    ],
    [
      { symbol: "AAPL", price: 205 },
      { symbol: "MSFT", price: 390 },
      { symbol: "NVDA", price: 950 },
    ],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].triggerPrice, 205);
});

test("evaluateAlertTrigger fires rsi_above when RSI exceeds threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "rsi_above", price: 70 },
    { symbol: "AAPL", price: 195, rsi14: 75 },
  );
  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, 75);
});

test("evaluateAlertTrigger fires rsi_below when RSI drops below threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "rsi_below", price: 30 },
    { symbol: "AAPL", price: 195, rsi14: 25 },
  );
  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, 25);
});

test("evaluateAlertTrigger does not fire rsi_above when RSI is below threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "rsi_above", price: 70 },
    { symbol: "AAPL", price: 195, rsi14: 55 },
  );
  assert.equal(result.triggered, false);
});

test("evaluateAlertTrigger fires volume_above when volume exceeds threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "volume_above", price: 1000000 },
    { symbol: "AAPL", price: 195, volume: 5000000 },
  );
  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, 5000000);
});

test("evaluateAlertTrigger fires macd_below when MACD drops below threshold", () => {
  const result = evaluateAlertTrigger(
    { condition: "macd_below", price: 0 },
    { symbol: "AAPL", price: 195, macd: -0.5 },
  );
  assert.equal(result.triggered, true);
  assert.equal(result.triggerValue, -0.5);
});

test("evaluateAlerts includes triggerValue for non-price alerts", () => {
  const result = evaluateAlerts(
    [{ id: 1, symbol: "AAPL", condition: "rsi_above", price: 70, triggered: false }],
    [{ symbol: "AAPL", price: 195, rsi14: 75 }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].triggerValue, 75);
  assert.equal(result[0].triggerPrice, 195);
});
