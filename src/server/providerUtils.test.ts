import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireToken,
  fetchWithRetry,
  withCircuitBreaker,
  resilientFetch,
  getBreakerState,
  resetBreaker,
} from "./providerUtils";

// ─── Rate Limiter ───────────────────────────────────────────────────────────

test("acquireToken returns immediately when tokens are available", async () => {
  const wait = await acquireToken("yahoo");
  assert.equal(typeof wait, "number");
  assert.ok(wait >= 0);
});

test("acquireToken waits when bucket is exhausted", async () => {
  // Drain the "stooq" bucket (maxTokens: 4, refillRate: 2/s)
  const drains: number[] = [];
  for (let i = 0; i < 4; i++) {
    drains.push(await acquireToken("stooq"));
  }
  // 5th call should wait
  const start = Date.now();
  const waited = await acquireToken("stooq");
  const elapsed = Date.now() - start;
  assert.ok(waited > 0, `expected wait > 0, got ${waited}`);
  assert.ok(elapsed >= waited * 0.8, `elapsed ${elapsed}ms should be ~${waited}ms`);
});

test("acquireToken refills over time", async () => {
  // Drain the "fred" bucket
  for (let i = 0; i < 4; i++) await acquireToken("fred");
  // Wait 1s for 2 tokens to refill (refillRate: 2/s)
  await new Promise((r) => setTimeout(r, 1100));
  // Should get a token quickly now
  const start = Date.now();
  await acquireToken("fred");
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `refill should make token available quickly, took ${elapsed}ms`);
});

// ─── fetchWithRetry ─────────────────────────────────────────────────────────

test("fetchWithRetry succeeds on first attempt", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const resp = await fetchWithRetry("http://test.com/data");
    assert.equal(calls, 1);
    const body = await resp.json();
    assert.deepEqual(body, { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry retries on 429 and succeeds", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) {
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
    }
    return new Response(JSON.stringify({ data: 1 }), { status: 200 });
  };
  try {
    const resp = await fetchWithRetry("http://test.com/rate", undefined, { baseDelayMs: 10 });
    assert.equal(calls, 3);
    assert.equal(resp.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry retries on 5xx and succeeds", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("server error", { status: 503 });
    return new Response("ok", { status: 200 });
  };
  try {
    const resp = await fetchWithRetry("http://test.com/5xx", undefined, { baseDelayMs: 10 });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry throws RetryError after exhausting attempts", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("still broken", { status: 500 });
  };
  try {
    await fetchWithRetry("http://test.com/fail", undefined, { maxAttempts: 2, baseDelayMs: 10 });
    assert.fail("should have thrown");
  } catch (err: any) {
    assert.equal(err.status, 500);
    assert.equal(err.attempts, 2);
    assert.ok(err.message.includes("500"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry does not retry on 400", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("bad request", { status: 400 });
  };
  try {
    await fetchWithRetry("http://test.com/bad", undefined, { maxAttempts: 3, baseDelayMs: 10 });
    assert.fail("should have thrown");
  } catch (err: any) {
    assert.equal(calls, 1);
    assert.equal(err.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry retries on network error when retryNetworkErrors is true", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 2) throw new TypeError("fetch failed");
    return new Response("ok", { status: 200 });
  };
  try {
    const resp = await fetchWithRetry(
      "http://test.com/net",
      undefined,
      { baseDelayMs: 10, retryNetworkErrors: true },
    );
    assert.equal(calls, 2);
    assert.equal(resp.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry respects Retry-After header", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response("limited", {
        status: 429,
        headers: { "Retry-After": "0" },
      });
    }
    return new Response("ok", { status: 200 });
  };
  try {
    const start = Date.now();
    await fetchWithRetry("http://test.com/retry-after", undefined, { baseDelayMs: 10 });
    const elapsed = Date.now() - start;
    // Should have waited at least ~0ms (Retry-After: 0) + jitter
    assert.ok(elapsed >= 0);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Circuit Breaker ────────────────────────────────────────────────────────

test("circuit breaker starts closed and allows requests", async () => {
  resetBreaker("test-cb-1");
  const result = await withCircuitBreaker("test-cb-1", async () => 42, { threshold: 3, cooldownMs: 1000 });
  assert.equal(result, 42);
  assert.equal(getBreakerState("test-cb-1"), "closed");
});

test("circuit breaker opens after threshold failures", async () => {
  resetBreaker("test-cb-2");
  const fail = async () => { throw new Error("boom"); };
  for (let i = 0; i < 3; i++) {
    try { await withCircuitBreaker("test-cb-2", fail, { threshold: 3, cooldownMs: 5000 }); } catch {}
  }
  assert.equal(getBreakerState("test-cb-2"), "open");
});

test("circuit breaker rejects when open without calling fn", async () => {
  resetBreaker("test-cb-3");
  let calls = 0;
  const fail = async () => { calls++; throw new Error("boom"); };
  // Open the breaker
  for (let i = 0; i < 2; i++) {
    try { await withCircuitBreaker("test-cb-3", fail, { threshold: 2, cooldownMs: 5000 }); } catch {}
  }
  assert.equal(getBreakerState("test-cb-3"), "open");
  // Now try again — should reject immediately without calling fn
  const callsBefore = calls;
  try {
    await withCircuitBreaker("test-cb-3", fail, { threshold: 2, cooldownMs: 5000 });
    assert.fail("should have thrown");
  } catch (err: any) {
    assert.ok(err.message.includes("OPEN"));
    assert.equal(calls, callsBefore, "fn should not be called when breaker is open");
  }
});

test("circuit breaker transitions to half-open after cooldown", async () => {
  resetBreaker("test-cb-4");
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls <= 2) throw new Error("fail");
    return "recovered";
  };
  // Open the breaker with 2 failures (threshold: 2)
  for (let i = 0; i < 2; i++) {
    try { await withCircuitBreaker("test-cb-4", flaky, { threshold: 2, cooldownMs: 100 }); } catch {}
  }
  assert.equal(getBreakerState("test-cb-4"), "open");
  // Wait for cooldown
  await new Promise((r) => setTimeout(r, 150));
  // Should now be half-open and allow the request
  const result = await withCircuitBreaker("test-cb-4", flaky, { threshold: 2, cooldownMs: 100 });
  assert.equal(result, "recovered");
  assert.equal(getBreakerState("test-cb-4"), "closed");
});

test("circuit breaker re-opens if half-open request fails", async () => {
  resetBreaker("test-cb-5");
  let calls = 0;
  const alwaysFail = async () => { calls++; throw new Error("still broken"); };
  // Open with threshold 1
  try { await withCircuitBreaker("test-cb-5", alwaysFail, { threshold: 1, cooldownMs: 50 }); } catch {}
  assert.equal(getBreakerState("test-cb-5"), "open");
  await new Promise((r) => setTimeout(r, 60));
  // Half-open request fails → back to open
  try { await withCircuitBreaker("test-cb-5", alwaysFail, { threshold: 1, cooldownMs: 50 }); } catch {}
  assert.equal(getBreakerState("test-cb-5"), "open");
});

test("circuit breaker resets on success", async () => {
  resetBreaker("test-cb-6");
  let calls = 0;
  const fn = async () => { calls++; return "ok"; };
  // 1 success → closed
  await withCircuitBreaker("test-cb-6", fn, { threshold: 3, cooldownMs: 1000 });
  assert.equal(getBreakerState("test-cb-6"), "closed");
});

// ─── resilientFetch (integration) ──────────────────────────────────────────

test("resilientFetch chains rate limiter + retry + circuit breaker", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("limited", { status: 429, headers: { "Retry-After": "0" } });
    return new Response(JSON.stringify({ data: true }), { status: 200 });
  };
  try {
    const resp = await resilientFetch(
      { name: "test-resilient", retry: { baseDelayMs: 10 }, circuitBreaker: { threshold: 5, cooldownMs: 1000 } },
      "http://test.com/resilient",
    );
    const body = await resp.json();
    assert.deepEqual(body, { data: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
