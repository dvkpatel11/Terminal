// ─── Cache helpers ──────────────────────────────────────────────────────────

export function getCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

// ─── Rate Limiter (token bucket per provider) ───────────────────────────────

interface BucketState {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, BucketState>();

export interface RateLimitConfig {
  /** Maximum burst size (token bucket capacity). */
  maxTokens: number;
  /** Tokens refilled per second. */
  refillRate: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  yahoo:     { maxTokens: 10, refillRate: 10 },
  coingecko: { maxTokens: 5,  refillRate: 5 },
  reddit:    { maxTokens: 3,  refillRate: 1 },
  stooq:     { maxTokens: 4,  refillRate: 2 },
  fred:      { maxTokens: 4,  refillRate: 2 },
  discord:   { maxTokens: 10, refillRate: 5 },
  twitter:   { maxTokens: 4,  refillRate: 2 },
  finnhub:   { maxTokens: 5,  refillRate: 5 },
  openbb:    { maxTokens: 10, refillRate: 10 },
};

function getBucket(provider: string): BucketState {
  let bucket = buckets.get(provider);
  if (!bucket) {
    bucket = { tokens: (DEFAULT_LIMITS[provider] ?? DEFAULT_LIMITS.yahoo).maxTokens, lastRefill: Date.now() };
    buckets.set(provider, bucket);
  }
  return bucket;
}

function refillBucket(bucket: BucketState, config: RateLimitConfig): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + elapsed * config.refillRate);
  bucket.lastRefill = now;
}

/**
 * Acquire a token from the provider's bucket. If none available, sleeps
 * until the next token is refilled. Returns the wait time in ms (0 if
 * no wait was needed).
 */
export async function acquireToken(provider: string): Promise<number> {
  const config = DEFAULT_LIMITS[provider] ?? DEFAULT_LIMITS.yahoo;
  const bucket = getBucket(provider);
  refillBucket(bucket, config);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return 0;
  }

  const waitMs = Math.ceil(((1 - bucket.tokens) / config.refillRate) * 1000);
  await sleep(waitMs);
  refillBucket(bucket, config);
  bucket.tokens -= 1;
  return waitMs;
}

// ─── Retry with Retry-After parsing ─────────────────────────────────────────

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  // HTTP-date format: "Wed, 21 Oct 2015 07:28:00 GMT"
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function jitter(baseMs: number): number {
  const jitterRange = baseMs * 0.2;
  return baseMs + (Math.random() * 2 - 1) * jitterRange;
}

export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Status codes eligible for retry. Default: 429 + 5xx. */
  retryableStatuses?: Set<number>;
  /** If true, also retries on network errors (ECONNREFUSED, etc.). */
  retryNetworkErrors?: boolean;
}

const DEFAULT_RETRY: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  retryableStatuses: new Set([429, 500, 502, 503, 504]),
  retryNetworkErrors: true,
};

export interface RetryError extends Error {
  status: number;
  attempts: number;
}

/**
 * Fetch with exponential backoff, Retry-After header parsing, and jitter.
 * Returns the Response on success. Throws RetryError after exhausting attempts.
 */
export async function fetchWithRetry(
  url: string,
  fetchOpts?: RequestInit,
  retryOpts?: RetryConfig,
): Promise<Response> {
  const config = { ...DEFAULT_RETRY, ...retryOpts };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, fetchOpts);
      if (resp.ok) return resp;

      if (!config.retryableStatuses.has(resp.status) || attempt === config.maxAttempts) {
        const err = new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`) as RetryError;
        err.status = resp.status;
        err.attempts = attempt;
        throw err;
      }

      // Parse Retry-After: header first, then response body (Discord puts retry_after in JSON)
      let retryAfter = parseRetryAfter(resp.headers.get("Retry-After"));
      if (retryAfter === null && resp.status === 429) {
        try {
          const cloned = resp.clone();
          const body = await cloned.json() as any;
          if (typeof body?.retry_after === "number") retryAfter = body.retry_after * 1000;
        } catch { /* ignore parse errors */ }
      }
      const baseDelay = retryAfter ?? config.baseDelayMs * Math.pow(2, attempt - 1);
      lastError = new Error(`HTTP ${resp.status} (attempt ${attempt}/${config.maxAttempts})`);
      await sleep(jitter(baseDelay));
    } catch (err: any) {
      if (err instanceof Error && "status" in err) throw err; // RetryError from above
      lastError = err;
      if (!config.retryNetworkErrors || attempt === config.maxAttempts) {
        const wrappedError = new Error(`Network error: ${err.message ?? err} for ${url}`) as RetryError;
        wrappedError.status = 0;
        wrappedError.attempts = attempt;
        throw wrappedError;
      }
      const baseDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(jitter(baseDelay));
    }
  }

  const exhausted = new Error(`Retry exhausted: ${lastError?.message ?? "unknown"}`) as RetryError;
  exhausted.status = 0;
  exhausted.attempts = config.maxAttempts;
  throw exhausted;
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

export type BreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening. Default: 5. */
  threshold: number;
  /** Ms to stay open before trying half-open. Default: 60000. */
  cooldownMs: number;
  /** If true, logs state transitions. Default: true. */
  log?: boolean;
}

interface BreakerEntry {
  state: BreakerState;
  failures: number;
  openedAt: number;
  config: CircuitBreakerConfig;
}

const breakers = new Map<string, BreakerEntry>();

function getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): BreakerEntry {
  let entry = breakers.get(name);
  if (!entry) {
    const cfg: CircuitBreakerConfig = { threshold: 5, cooldownMs: 60_000, log: true, ...config };
    entry = { state: "closed", failures: 0, openedAt: 0, config: cfg };
    breakers.set(name, entry);
  }
  if (config) {
    entry.config = { ...entry.config, ...config };
  }
  return entry;
}

function logStateChange(name: string, from: BreakerState, to: BreakerState): void {
  if (breakers.get(name)?.config.log !== false) {
    console.log(`[circuit-breaker:${name}] ${from} → ${to}`);
  }
}

function checkState(entry: BreakerEntry, name: string): void {
  if (entry.state === "open" && Date.now() - entry.openedAt >= entry.config.cooldownMs) {
    logStateChange(name, "open", "half-open");
    entry.state = "half-open";
  }
}

/**
 * Wraps an async function with circuit breaker protection.
 * Returns the result on success, or throws immediately if the circuit is open.
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>,
): Promise<T> {
  const entry = getBreaker(name, config);
  checkState(entry, name);

  if (entry.state === "open") {
    const err = new Error(`Circuit breaker "${name}" is OPEN — request rejected`);
    (err as any).circuitOpen = true;
    throw err;
  }

  try {
    const result = await fn();
    // Success: reset failures, close circuit
    if (entry.state === "half-open") {
      logStateChange(name, "half-open", "closed");
    }
    entry.failures = 0;
    entry.state = "closed";
    return result;
  } catch (err: any) {
    entry.failures++;
    if (entry.failures >= entry.config.threshold) {
      logStateChange(name, entry.state, "open");
      entry.state = "open";
      entry.openedAt = Date.now();
    }
    throw err;
  }
}

/**
 * Returns the current state of a named circuit breaker (for monitoring/debug).
 */
export function getBreakerState(name: string): BreakerState | undefined {
  return breakers.get(name)?.state;
}

/**
 * Manually reset a circuit breaker to closed (e.g. after a deploy).
 */
export function resetBreaker(name: string): void {
  const entry = breakers.get(name);
  if (entry) {
    entry.state = "closed";
    entry.failures = 0;
    entry.openedAt = 0;
  }
}

// ─── Combined resilient fetch ───────────────────────────────────────────────

export interface ProviderConfig {
  name: string;
  rateLimit?: Partial<RateLimitConfig>;
  retry?: RetryConfig;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
}

/**
 * Fetch with rate limiting + retry + circuit breaker in one call.
 * This is the recommended entry point for all external API calls.
 */
export async function resilientFetch(
  provider: ProviderConfig,
  url: string,
  fetchOpts?: RequestInit,
): Promise<Response> {
  const { name, retry, circuitBreaker } = provider;

  // Acquire rate limit token (waits if necessary)
  await acquireToken(name);

  // Wrap with circuit breaker
  return withCircuitBreaker(
    name,
    () => fetchWithRetry(url, fetchOpts, retry),
    circuitBreaker,
  );
}

/**
 * Convenience: fetch JSON with resilience. Returns parsed body.
 */
export async function resilientFetchJson<T = any>(
  provider: ProviderConfig,
  url: string,
  fetchOpts?: RequestInit,
): Promise<T> {
  const resp = await resilientFetch(provider, url, fetchOpts);
  return resp.json() as Promise<T>;
}

/**
 * Convenience: fetch text with resilience.
 */
export async function resilientFetchText(
  provider: ProviderConfig,
  url: string,
  fetchOpts?: RequestInit,
): Promise<string> {
  const resp = await resilientFetch(provider, url, fetchOpts);
  return resp.text();
}

// ─── Legacy: fetchText now uses resilient fetch internally ──────────────────

export async function fetchText(url: string) {
  const resp = await resilientFetch(
    { name: "generic", retry: { maxAttempts: 2, baseDelayMs: 500 }, circuitBreaker: { threshold: 5, cooldownMs: 30_000 } },
    url,
    {
      headers: {
        "User-Agent": "blmtrm/1.0",
        Accept: "text/plain,text/csv,application/xml,text/xml,application/rss+xml,application/json;q=0.9,*/*;q=0.8",
      },
    },
  );
  return resp.text();
}

// ─── Internal ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
