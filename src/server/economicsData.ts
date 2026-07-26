import { buildDataStatus, type DataStatus } from "./dataStatus";
import { fetchText, getCached, setCached, resilientFetch } from "./providerUtils";
import { extendedStorage } from "./storage";

export type EconomicEventCategory = "inflation" | "labor" | "growth" | "policy" | "consumption" | "activity" | "housing";
export type EconomicEventImportance = "high" | "medium";

// ─── Live Macro Snapshot (FRED) ───────────────────────────────────────────────

const FRED_API_BASE = "https://api.stlouisfed.org/fred";
const MACRO_TTL_MS = 4 * 60 * 60_000; // 4 hours — these are monthly/daily releases
// Within ±2h of a high-importance release (CPI, NFP, GDP, FOMC), a 4h cache can
// serve pre-release numbers for hours after the market has repriced. Shrink the
// TTL to 10 minutes inside that window so fresh prints surface quickly.
const MACRO_TTL_RELEASE_WINDOW_MS = 10 * 60_000;
const RELEASE_WINDOW_MS = 2 * 60 * 60_000;

const macroSnapshotCache = new Map<string, { expiresAt: number; value: LiveMacroSnapshot }>();

/**
 * True when `now` is within ±2h of any high-importance release on the
 * economic calendar. Uses the already-cached calendar (15-min TTL) so this
 * adds no extra upstream calls. Fails open (returns false) on any error.
 */
async function isNearHighImportanceRelease(now = new Date()): Promise<boolean> {
  try {
    const events = await getEconomicCalendar(now);
    const nowMs = now.getTime();
    return events.some((event) => {
      if (event.importance !== "high") return false;
      const match = event.timeCt.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)\s+CT$/);
      if (!match) return false;
      const hour24 = (match[3] === "PM" ? (Number(match[1]) % 12) + 12 : Number(match[1]) % 12);
      // CT ≈ UTC-5 (CDT) / UTC-6 (CST); use -5 — an hour of skew is fine for a ±2h window.
      const eventMs = Date.parse(`${event.date}T00:00:00Z`) + (hour24 + 5) * 3_600_000 + Number(match[2]) * 60_000;
      return Math.abs(eventMs - nowMs) <= RELEASE_WINDOW_MS;
    });
  } catch {
    return false;
  }
}

export interface LiveMacroSnapshot {
  gdp: number | null;          // GDPC1  — real GDP growth QoQ annualised (%)
  gdpPrev: number | null;
  cpi: number | null;          // CPIAUCSL — CPI YoY (%)
  cpiPrev: number | null;
  unemployment: number | null; // UNRATE
  unemploymentPrev: number | null;
  fedFunds: number | null;     // FEDFUNDS
  fedFundsPrev: number | null;
  t10y: number | null;         // DGS10
  t10yPrev: number | null;
  t2y: number | null;          // DGS2
  t2yPrev: number | null;
  t30y: number | null;         // DGS30
  t30yPrev: number | null;
  asOf: string | null;         // ISO date of most recent observation
}

async function fetchFredSeries(seriesId: string, apiKey: string): Promise<{ value: number | null; prev: number | null; date: string | null }> {
  const url = `${FRED_API_BASE}/series/observations?series_id=${seriesId}&api_key=${apiKey}&sort_order=desc&limit=2&file_type=json`;
  try {
    const resp = await resilientFetch(
      { name: "fred", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
      url,
      { headers: { "User-Agent": "blmtrm/1.0" } },
    );
    if (!resp.ok) {
      console.warn(`[fred] ${seriesId} fetch failed: ${resp.status}`);
      return { value: null, prev: null, date: null };
    }
    const data = await resp.json() as { observations?: Array<{ date: string; value: string }> };
    const obs = (data.observations ?? []).filter((o) => o.value !== "." && o.value !== "");
    if (!obs.length) return { value: null, prev: null, date: null };
    const latest = parseFloat(obs[0].value);
    const prev = obs.length >= 2 ? parseFloat(obs[1].value) : null;
    return {
      value: Number.isFinite(latest) ? latest : null,
      prev: Number.isFinite(prev) ? prev : null,
      date: obs[0].date ?? null,
    };
  } catch (err) {
    console.warn(`[fred] ${seriesId} error:`, err instanceof Error ? err.message : err);
    return { value: null, prev: null, date: null };
  }
}

export async function getLiveMacroSnapshot(): Promise<LiveMacroSnapshot> {
  const cacheKey = "live-macro";
  const cached = getCached(macroSnapshotCache, cacheKey);
  if (cached) return cached;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return {
      gdp: null, gdpPrev: null, cpi: null, cpiPrev: null,
      unemployment: null, unemploymentPrev: null, fedFunds: null, fedFundsPrev: null,
      t10y: null, t10yPrev: null, t2y: null, t2yPrev: null, t30y: null, t30yPrev: null,
      asOf: null,
    };
  }

  const [gdpRes, cpiRes, urateRes, ffRes, t10Res, t2Res, t30Res] = await Promise.all([
    fetchFredSeries("GDPC1", apiKey),
    fetchFredSeries("CPIAUCSL", apiKey),
    fetchFredSeries("UNRATE", apiKey),
    fetchFredSeries("FEDFUNDS", apiKey),
    fetchFredSeries("DGS10", apiKey),
    fetchFredSeries("DGS2", apiKey),
    fetchFredSeries("DGS30", apiKey),
  ]);

  // GDPC1 is a level, not a growth rate — compute QoQ annualised % change
  let gdpGrowth: number | null = null;
  let gdpGrowthPrev: number | null = null;
  if (gdpRes.value !== null) {
    const url = `${FRED_API_BASE}/series/observations?series_id=GDPC1&api_key=${apiKey}&sort_order=desc&limit=5&file_type=json`;
    try {
      const resp = await resilientFetch(
        { name: "fred", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
        url,
        { headers: { "User-Agent": "blmtrm/1.0" } },
      );
      if (resp.ok) {
        const data = await resp.json() as { observations?: Array<{ value: string }> };
        const obs = (data.observations ?? []).filter((o) => o.value !== "." && o.value !== "");
        if (obs.length >= 2) {
          const curr = parseFloat(obs[0].value);
          const prev = parseFloat(obs[1].value);
          if (Number.isFinite(curr) && Number.isFinite(prev) && prev > 0) {
            gdpGrowth = Math.round(((Math.pow(curr / prev, 4) - 1) * 100) * 10) / 10;
          }
        }
        if (obs.length >= 4) {
          // Previous quarter growth: use obs[1] vs obs[2]
          const p1 = parseFloat(obs[1].value);
          const p2 = parseFloat(obs[2].value);
          if (Number.isFinite(p1) && Number.isFinite(p2) && p2 > 0) {
            gdpGrowthPrev = Math.round(((Math.pow(p1 / p2, 4) - 1) * 100) * 10) / 10;
          }
        }
      }
    } catch { /* use null */ }
  }

  // CPI: compute YoY % change from 13 observations (current vs 12 months ago)
  let cpiYoy: number | null = null;
  let cpiYoyPrev: number | null = null;
  if (cpiRes.value !== null) {
    const url = `${FRED_API_BASE}/series/observations?series_id=CPIAUCSL&api_key=${apiKey}&sort_order=desc&limit=14&file_type=json`;
    try {
      const resp = await resilientFetch(
        { name: "fred", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
        url,
        { headers: { "User-Agent": "blmtrm/1.0" } },
      );
      if (resp.ok) {
        const data = await resp.json() as { observations?: Array<{ value: string }> };
        const obs = (data.observations ?? []).filter((o) => o.value !== "." && o.value !== "");
        if (obs.length >= 13) {
          const curr = parseFloat(obs[0].value);
          const yearAgo = parseFloat(obs[12].value);
          if (Number.isFinite(curr) && Number.isFinite(yearAgo) && yearAgo > 0) {
            cpiYoy = Math.round(((curr / yearAgo - 1) * 100) * 10) / 10;
          }
        }
        if (obs.length >= 14) {
          // Previous month YoY: obs[1] vs obs[13]
          const p1 = parseFloat(obs[1].value);
          const p1yAgo = parseFloat(obs[13].value);
          if (Number.isFinite(p1) && Number.isFinite(p1yAgo) && p1yAgo > 0) {
            cpiYoyPrev = Math.round(((p1 / p1yAgo - 1) * 100) * 10) / 10;
          }
        }
      }
    } catch { /* use null */ }
  }

  // Use the most recent date across all fetched series as the snapshot asOf
  const dates = [gdpRes.date, cpiRes.date, urateRes.date, ffRes.date, t10Res.date].filter(Boolean) as string[];
  const asOf = dates.length ? dates.sort().at(-1)! : null;

  const snapshot: LiveMacroSnapshot = {
    gdp: gdpGrowth,
    gdpPrev: gdpGrowthPrev,
    cpi: cpiYoy,
    cpiPrev: cpiYoyPrev,
    unemployment: urateRes.value,
    unemploymentPrev: urateRes.prev,
    fedFunds: ffRes.value,
    fedFundsPrev: ffRes.prev,
    t10y: t10Res.value,
    t10yPrev: t10Res.prev,
    t2y: t2Res.value,
    t2yPrev: t2Res.prev,
    t30y: t30Res.value,
    t30yPrev: t30Res.prev,
    asOf,
  };

  // Release-aware TTL: keep macro data on a short leash around scheduled
  // high-importance prints instead of trusting a 4h cache on CPI morning.
  const nearRelease = await isNearHighImportanceRelease();
  const ttl = nearRelease ? MACRO_TTL_RELEASE_WINDOW_MS : MACRO_TTL_MS;
  setCached(macroSnapshotCache, cacheKey, snapshot, ttl);
  console.log(`[fred] macro snapshot refreshed (asOf: ${asOf}, ttl: ${ttl / 60_000}min${nearRelease ? ", release window" : ""})`);
  return snapshot;
}

export interface EconomicCalendarEvent {
  id: string;
  releaseId: number;
  title: string;
  category: EconomicEventCategory;
  importance: EconomicEventImportance;
  date: string;
  timeCt: string;
  releaseUrl: string;
  status: DataStatus;
}

export interface EconomicReleaseTable {
  title: string;
  url: string;
  recordCount: number | null;
}

export interface EconomicReleaseScheduleDate {
  date: string;
  timeCt: string;
}

export interface EconomicEventDetail {
  releaseId: number;
  title: string;
  category: EconomicEventCategory;
  importance: EconomicEventImportance;
  sourceName: string;
  sourceUrl: string | null;
  releaseCalendarUrl: string;
  releaseWebsiteUrl: string | null;
  tables: EconomicReleaseTable[];
  upcomingDates: EconomicReleaseScheduleDate[];
  status: DataStatus;
}

const FRED_BASE_URL = "https://fred.stlouisfed.org";
const CALENDAR_WINDOW_DAYS = 30;
const CALENDAR_TTL_MS = 15 * 60_000;
const DETAIL_TTL_MS = 60 * 60_000;

const calendarCache = new Map<string, { expiresAt: number; value: EconomicCalendarEvent[] }>();
const detailCache = new Map<string, { expiresAt: number; value: EconomicEventDetail }>();

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistEconomicEventsToDb(events: EconomicCalendarEvent[]): Promise<void> {
  if (!extendedStorage || !events.length) return;
  try {
    for (const event of events.slice(0, 20)) {
      await extendedStorage.persistEconomicEvent({
        releaseId: event.releaseId,
        title: event.title,
        category: event.category,
        importance: event.importance,
        date: event.date,
        timeCt: event.timeCt,
        releaseUrl: event.releaseUrl,
      });
    }
  } catch (e) {
    console.error("Failed to persist economic events:", e);
  }
}

const TRACKED_RELEASES: Array<{
  pattern: RegExp;
  category: EconomicEventCategory;
  importance: EconomicEventImportance;
}> = [
  { pattern: /consumer price index/i, category: "inflation", importance: "high" },
  { pattern: /producer price index/i, category: "inflation", importance: "medium" },
  { pattern: /employment situation/i, category: "labor", importance: "high" },
  { pattern: /gross domestic product/i, category: "growth", importance: "high" },
  { pattern: /personal income and outlays/i, category: "growth", importance: "medium" },
  { pattern: /advance monthly sales for retail and food services/i, category: "consumption", importance: "medium" },
  { pattern: /industrial production and capacity utilization/i, category: "activity", importance: "medium" },
  { pattern: /housing starts/i, category: "housing", importance: "medium" },
  { pattern: /new residential sales/i, category: "housing", importance: "medium" },
  { pattern: /fomc press release/i, category: "policy", importance: "high" },
  { pattern: /summary of economic projections/i, category: "policy", importance: "high" },
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function toAbsoluteFredUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return decodeHtml(path);
  return `${FRED_BASE_URL}${decodeHtml(path)}`;
}

function classifyRelease(title: string) {
  return TRACKED_RELEASES.find((entry) => entry.pattern.test(title)) ?? null;
}

function normalizeCtTime(raw: string) {
  const value = stripTags(raw).toUpperCase();
  if (!value || value === "N/A") return null;
  return `${value.replace(/\s+/g, " ")} CT`;
}

function parseMinutes(timeCt: string) {
  const match = timeCt.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)\s+CT$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];
  const hour24 = meridiem === "PM"
    ? (hour12 % 12) + 12
    : hour12 % 12;
  return hour24 * 60 + minute;
}

function toIsoDate(label: string) {
  const parsed = new Date(`${label} 12:00 UTC`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse calendar date: ${label}`);
  }
  return parsed.toISOString().slice(0, 10);
}

function parseCalendarRows(html: string, onEvent: (payload: { date: string; timeCt: string | null; releaseId: number; title: string; }) => void) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let currentDate = "";
  let match = rowRegex.exec(html);

  while (match) {
    const row = match[1];
    const dateMatch = row.match(/<span[^>]*font-weight:\s*bold;?[^>]*>([^<]+)<\/span>/i);
    if (dateMatch) {
      currentDate = toIsoDate(dateMatch[1].trim());
      match = rowRegex.exec(html);
      continue;
    }

    const releaseMatch = row.match(/<a[^>]+href="\/release\?rid=(\d+)"[^>]*>([^<]+)<\/a>/i);
    if (releaseMatch && currentDate) {
      const timeMatch = row.match(/<td[^>]*nowrap[^>]*>([\s\S]*?)<\/td>/i);
      onEvent({
        date: currentDate,
        timeCt: normalizeCtTime(timeMatch?.[1] ?? ""),
        releaseId: Number(releaseMatch[1]),
        title: stripTags(releaseMatch[2]),
      });
    }

    match = rowRegex.exec(html);
  }
}

export function parseFredCalendar(html: string): EconomicCalendarEvent[] {
  const events: EconomicCalendarEvent[] = [];

  parseCalendarRows(html, ({ date, timeCt, releaseId, title }) => {
    const meta = classifyRelease(title);
    if (!meta || !timeCt) return;

    events.push({
      id: `${releaseId}:${date}:${timeCt}`,
      releaseId,
      title,
      category: meta.category,
      importance: meta.importance,
      date,
      timeCt,
      releaseUrl: `${FRED_BASE_URL}/release?rid=${releaseId}`,
      status: buildDataStatus({
        provider: "FRED",
        freshness: "schedule",
        delayLabel: "Scheduled release calendar",
      }),
    });
  });

  return events.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return parseMinutes(left.timeCt) - parseMinutes(right.timeCt);
  });
}

export function parseFredReleaseSchedule(html: string, releaseId: number): EconomicReleaseScheduleDate[] {
  const dates: EconomicReleaseScheduleDate[] = [];

  parseCalendarRows(html, ({ date, timeCt, releaseId: candidateReleaseId }) => {
    if (candidateReleaseId !== releaseId || !timeCt) return;
    dates.push({ date, timeCt });
  });

  return dates.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return parseMinutes(left.timeCt) - parseMinutes(right.timeCt);
  });
}

export function filterUpcomingReleaseDates(dates: EconomicReleaseScheduleDate[], now = new Date()) {
  const today = isoDate(now);

  return dates
    .filter((entry) => entry.date >= today)
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.date === entry.date && candidate.timeCt === entry.timeCt) === index)
    .sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return parseMinutes(left.timeCt) - parseMinutes(right.timeCt);
    });
}

export function parseFredReleaseDetail(html: string, releaseId: number): Omit<EconomicEventDetail, "upcomingDates"> {
  const heading = stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const titleTag = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s*\|\s*FRED.*$/i, "");
  const title = heading || titleTag || `Release ${releaseId}`;
  const meta = classifyRelease(title) ?? { category: "activity" as EconomicEventCategory, importance: "medium" as EconomicEventImportance };

  const breadcrumbMatches = Array.from(html.matchAll(/<a[^>]+class="breadcrumb_link"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi));
  const source = breadcrumbMatches.at(-1);

  const releaseCalendarUrl = toAbsoluteFredUrl(html.match(/<a[^>]+href="([^"]*\/releases\/calendar\?rid=[^"]+)"[^>]*>\s*Release Calendar\s*<\/a>/i)?.[1])
    ?? `${FRED_BASE_URL}/releases/calendar?rid=${releaseId}&y=${new Date().getUTCFullYear()}`;
  const releaseWebsiteUrl = toAbsoluteFredUrl(html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Release Website\s*<\/a>/i)?.[1]);

  const tables = Array.from(html.matchAll(/<a[^>]+href="([^"]*\/release\/tables\?rid=[^"]+)"[^>]*>([^<]+)<\/a>&nbsp;\s*<span[^>]*>(?:[^<]*\()?([\d,]+)(?:\)?[^<]*)<\/span>/gi))
    .slice(0, 6)
    .map((match) => ({
      title: stripTags(match[2]),
      url: toAbsoluteFredUrl(match[1]) ?? `${FRED_BASE_URL}/release/tables?rid=${releaseId}`,
      recordCount: Number(match[3].replace(/,/g, "")),
    }));

  return {
    releaseId,
    title,
    category: meta.category,
    importance: meta.importance,
    sourceName: source ? stripTags(source[2]) : "Federal Reserve Economic Data",
    sourceUrl: toAbsoluteFredUrl(source?.[1]),
    releaseCalendarUrl,
    releaseWebsiteUrl,
    tables,
    status: buildDataStatus({
      provider: "FRED",
      freshness: "schedule",
      delayLabel: "Scheduled release detail",
    }),
  };
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getEconomicCalendar(now = new Date()) {
  const start = isoDate(now);
  const end = isoDate(addDays(now, CALENDAR_WINDOW_DAYS));
  const cacheKey = `${start}:${end}`;
  const cached = getCached(calendarCache, cacheKey);
  if (cached) return cached;

  const html = await fetchText(`${FRED_BASE_URL}/releases/calendar?vs=${start}&ve=${end}`);
  const events = parseFredCalendar(html);
  
  // Persist to database (fire and forget)
  persistEconomicEventsToDb(events).catch(() => {});
  
  return setCached(calendarCache, cacheKey, events, CALENDAR_TTL_MS);
}

export async function getEconomicEventDetail(releaseId: number, now = new Date()): Promise<EconomicEventDetail> {
  const cacheKey = String(releaseId);
  const cached = getCached(detailCache, cacheKey);
  if (cached) return cached;

  const year = now.getUTCFullYear();
  const releaseUrl = `${FRED_BASE_URL}/release?rid=${releaseId}`;
  const scheduleUrls = [
    `${FRED_BASE_URL}/releases/calendar?rid=${releaseId}&y=${year}`,
    `${FRED_BASE_URL}/releases/calendar?rid=${releaseId}&y=${year + 1}`,
  ];

  const [detailHtml, ...schedulePages] = await Promise.all([
    fetchText(releaseUrl),
    ...scheduleUrls.map((url) => fetchText(url)),
  ]);

  const detail = parseFredReleaseDetail(detailHtml, releaseId);
  const upcomingDates = filterUpcomingReleaseDates(
    schedulePages.flatMap((page) => parseFredReleaseSchedule(page, releaseId)),
    now,
  ).slice(0, 6);

  return setCached(detailCache, cacheKey, { ...detail, upcomingDates }, DETAIL_TTL_MS);
}
