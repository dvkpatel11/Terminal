import test from "node:test";
import assert from "node:assert/strict";
import {
  relativeTime,
  sentimentColor,
  sentimentBorderColor,
  classifyThreat,
} from "./newsUtils";

test("relativeTime returns 'just now' for recent timestamps", () => {
  const now = new Date().toISOString();
  assert.equal(relativeTime(now), "just now");
});

test("relativeTime returns minutes ago for timestamps within the hour", () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  assert.equal(relativeTime(fiveMinAgo), "5m ago");
});

test("relativeTime returns hours ago for timestamps within the day", () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  assert.equal(relativeTime(twoHoursAgo), "2h ago");
});

test("relativeTime returns days ago for older timestamps", () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
  assert.equal(relativeTime(threeDaysAgo), "3d ago");
});

test("sentimentColor returns text-up for positive", () => {
  assert.equal(sentimentColor("positive"), "text-up");
});

test("sentimentColor returns text-down for negative", () => {
  assert.equal(sentimentColor("negative"), "text-down");
});

test("sentimentColor returns text-cyan for neutral", () => {
  assert.equal(sentimentColor("neutral"), "text-cyan");
});

test("sentimentColor returns text-cyan for undefined", () => {
  assert.equal(sentimentColor(undefined), "text-cyan");
});

test("sentimentBorderColor returns border-l-up for positive", () => {
  assert.equal(sentimentBorderColor("positive"), "border-l-up");
});

test("sentimentBorderColor returns border-l-down for negative", () => {
  assert.equal(sentimentBorderColor("negative"), "border-l-down");
});

test("sentimentBorderColor returns border-l-cyan for default", () => {
  assert.equal(sentimentBorderColor(undefined), "border-l-cyan");
});

test("classifyThreat returns CRITICAL for crash/collapse keywords", () => {
  assert.equal(classifyThreat("Market crash triggers circuit breaker halt"), "CRITICAL");
});

test("classifyThreat returns HIGH for downgrade/bankrupt keywords", () => {
  assert.equal(classifyThreat("Analysts downgrade stock to underperform"), "HIGH");
});

test("classifyThreat returns MEDIUM for macro data keywords", () => {
  assert.equal(classifyThreat("CPI data shows rising inflation"), "MEDIUM");
});

test("classifyThreat returns LOW for positive keywords", () => {
  assert.equal(classifyThreat("Stock rally on strong earnings"), "LOW");
});

test("classifyThreat returns INFO for neutral content", () => {
  assert.equal(classifyThreat("Company reports quarterly earnings"), "INFO");
});
