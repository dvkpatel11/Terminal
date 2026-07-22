import { spawn, type ChildProcess } from "child_process";
import { buildDataStatus } from "./dataStatus";

const OPENBB_PORT = 6901;
const OPENBB_BASE = `http://127.0.0.1:${OPENBB_PORT}`;
let openbbProcess: ChildProcess | null = null;
let openbbReady = false;
let openbbReadyResolve: (() => void) | null = null;
const openbbReadyPromise: Promise<void> = new Promise((resolve) => {
  openbbReadyResolve = resolve;
});

// ─── Server lifecycle ──────────────────────────────────────────────────────

export function startOpenBBServer(): void {
  if (openbbProcess) return;

  const bin = `${process.env.HOME}/.local/bin/openbb-api`;
  try {
    openbbProcess = spawn(bin, ["--host", "127.0.0.1", "--port", String(OPENBB_PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
        UVICORN_LOG_LEVEL: "warning",
        OPENBB_CLI_LOGGING_COMMAND_HANDLER: "1",
      },
    });
  } catch (e: any) {
    console.warn(`[openbb] could not spawn: ${e.message}`);
    openbbProcess = null;
    return;
  }

  openbbProcess.on("error", (err: NodeJS.ErrnoException) => {
    console.warn(`[openbb] spawn error: ${err.message}`);
    openbbProcess = null;
  });

  openbbProcess.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().trim().split(/\r?\n/);
    for (const line of lines) {
      const stripped = line.trim();
      if (!stripped || /INFO|WARNING|Application startup|Started server|Waiting for|Uvicorn running/.test(stripped)) continue;
      if (stripped.includes("██")) continue;
      console.error(`[openbb] ${stripped}`);
    }
  });

  openbbProcess.on("exit", (code) => {
    console.log(`[openbb] process exited with code ${code}`);
    openbbProcess = null;
    openbbReady = false;
    // Auto-restart after a delay
    setTimeout(startOpenBBServer, 5000);
  });

  // Poll until the server responds to health checks
  pollOpenBBReady();
}

async function pollOpenBBReady(): Promise<void> {
  const maxAttempts = 120; // 2 minutes
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${OPENBB_BASE}/docs`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        openbbReady = true;
        console.log(`[openbb] API server ready on :${OPENBB_PORT}`);
        openbbReadyResolve?.();
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`[openbb] API server did not become ready within ${maxAttempts}s`);
}

export function isOpenBBReady(): boolean {
  return openbbReady;
}

async function waitForOpenBB(timeout = 120_000): Promise<void> {
  if (openbbReady) return;
  const timeoutPromise = new Promise<void>((_, reject) => setTimeout(() => reject(new Error("OpenBB server not ready within timeout")), timeout));
  await Promise.race([openbbReadyPromise, timeoutPromise]);
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

export async function openbbFetch(path: string, timeout = 30_000): Promise<any> {
  await waitForOpenBB();
  const url = `${OPENBB_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenBB ${res.status}: ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractResults(data: any): any[] {
  const r = data?.results;
  if (Array.isArray(r)) return r;
  return [];
}

function extractFirst(data: any): Record<string, any> {
  const arr = extractResults(data);
  return arr[0] ?? {};
}

// ─── Fundamentals ──────────────────────────────────────────────────────────

export interface OpenBBFundamentalResponse {
  income_statement?: Array<Record<string, any>>;
  metrics?: Record<string, any>;
  consensus?: Record<string, any>;
  dividends?: Array<Record<string, any>>;
  profile?: Record<string, any>;
}

export async function fetchOpenBBFundamentals(symbol: string): Promise<OpenBBFundamentalResponse> {
  const sym = symbol.toUpperCase();
  const base = `/api/v1`;
  const q = `symbol=${sym}&provider=yfinance`;

  const [income, metrics, consensus, dividends, profile] = await Promise.allSettled([
    openbbFetch(`${base}/equity/fundamental/income?${q}&period=annual&limit=5`),
    openbbFetch(`${base}/equity/fundamental/metrics?${q}`),
    openbbFetch(`${base}/equity/estimates/consensus?${q}`),
    openbbFetch(`${base}/equity/fundamental/dividends?${q}`),
    openbbFetch(`${base}/equity/profile?${q}`),
  ]);

  return {
    income_statement: income.status === "fulfilled" ? extractResults(income.value) : [],
    metrics: metrics.status === "fulfilled" ? extractFirst(metrics.value) : {},
    consensus: consensus.status === "fulfilled" ? extractFirst(consensus.value) : {},
    dividends: dividends.status === "fulfilled" ? extractResults(dividends.value) : [],
    profile: profile.status === "fulfilled" ? extractFirst(profile.value) : {},
  };
}

// ─── Options ───────────────────────────────────────────────────────────────

export interface OpenBBOptionsResponse {
  underlying_price?: number;
  contracts: Array<Record<string, any>>;
}

export async function fetchOpenBBOptions(symbol: string): Promise<OpenBBOptionsResponse> {
  const sym = symbol.toUpperCase();
  const data = await openbbFetch(`/api/v1/derivatives/options/chains?symbol=${sym}&provider=yfinance`);
  const raw = extractResults(data);

  // The options API returns a single object with contract arrays, or flat dicts
  let contracts: any[];
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]?.contracts)) {
    contracts = raw[0].contracts;
  } else if (Array.isArray(raw)) {
    contracts = raw;
  } else {
    contracts = [];
  }

  const underlyingPrice = contracts[0]?.underlying_price ?? undefined;

  return {
    underlying_price: underlyingPrice,
    contracts: contracts.map((c) => ({
      symbol: c.contract_symbol,
      expiration: c.expiration,
      strike: c.strike,
      option_type: c.option_type,
      bid: c.bid,
      ask: c.ask,
      last_price: c.last_trade_price,
      change: c.change,
      change_percent: c.change_percent,
      volume: c.volume,
      open_interest: c.open_interest,
      implied_volatility: c.implied_volatility,
      in_the_money: c.in_the_money,
    })),
  };
}

// ─── Yield Curve ───────────────────────────────────────────────────────────

export async function fetchOpenBBYieldCurve(): Promise<Array<Record<string, any>>> {
  const data = await openbbFetch(`/api/v1/fixedincome/government/treasury_rates?provider=federal_reserve`);
  return extractResults(data);
}
