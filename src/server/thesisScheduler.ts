/**
 * Daily thesis scheduler.
 *
 * Generates trade theses for watchlist symbols overnight using DeepSeek.
 * Runs once per day, caches results, and prunes stale theses.
 *
 * Schedule: 06:00 UTC (02:00 ET after market close)
 */

import { generateTradeThesis, getCachedThesisForSymbol, type ThesisInput } from "./thesisGenerator";
import { extendedStorage } from "./storage";
import { logThesisAudit } from "./thesisGenerator";

const SCHEDULE_CRON = "0 6 * * *"; // 06:00 UTC daily
const MAX_THESES_PER_RUN = 20;
const THESIS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

// ─── Core Logic ─────────────────────────────────────────────────────────────

async function generateDailyTheses(): Promise<void> {
  if (isRunning) {
    console.log("[thesis-scheduler] Already running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`[thesis-scheduler] Starting daily thesis generation at ${new Date().toISOString()}`);

  try {
    // Get watchlist symbols
    const watchlistItems = await extendedStorage?.getWatchlist?.() ?? [];
    const symbols = watchlistItems
      .map((item: { symbol: string }) => item.symbol)
      .filter(Boolean)
      .slice(0, MAX_THESES_PER_RUN);

    if (symbols.length === 0) {
      console.log("[thesis-scheduler] No watchlist symbols found, skipping");
      return;
    }

    console.log(`[thesis-scheduler] Generating theses for ${symbols.length} symbols: ${symbols.join(", ")}`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const symbol of symbols) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Check if we have a recent cached thesis
          const cached = getCachedThesisForSymbol(symbol);
          if (cached && Date.now() - new Date(cached.thesis.generated_at).getTime() < THESIS_TTL_MS) {
            console.log(`[thesis-scheduler] ${symbol}: Using cached thesis (${Math.round((Date.now() - new Date(cached.thesis.generated_at).getTime()) / 3600000)}h old)`);
            skipCount++;
            lastError = null;
            break;
          }

          const input: ThesisInput = {
            symbol,
            direction: "long",
          };

          const result = await generateTradeThesis(input, THESIS_TTL_MS, true);
          logThesisAudit(result);
          successCount++;
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_RETRIES) {
            console.warn(`[thesis-scheduler] ${symbol}: Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }
      if (lastError) {
        console.error(`[thesis-scheduler] ${symbol}: Failed after ${MAX_RETRIES + 1} attempts - ${lastError}`);
        errorCount++;
      }
      // Delay between symbols to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[thesis-scheduler] Completed in ${elapsed}s: ${successCount} generated, ${skipCount} cached, ${errorCount} errors`);
  } catch (err) {
    console.error(`[thesis-scheduler] Fatal error: ${err}`);
  } finally {
    isRunning = false;
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

function getNextRunTime(): Date {
  const now = new Date();
  const [hours, minutes] = SCHEDULE_CRON.split(" ").map(Number);
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function scheduleNext(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);

  const nextRun = getNextRunTime();
  const delay = nextRun.getTime() - Date.now();

  console.log(`[thesis-scheduler] Next run at ${nextRun.toISOString()} (in ${Math.round(delay / 60000)} minutes)`);

  schedulerTimer = setTimeout(async () => {
    await generateDailyTheses();
    scheduleNext();
  }, delay);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startThesisScheduler(): void {
  console.log("[thesis-scheduler] Starting scheduler");
  scheduleNext();
}

export function stopThesisScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  console.log("[thesis-scheduler] Stopped");
}

export function triggerThesisGeneration(): Promise<void> {
  return generateDailyTheses();
}
