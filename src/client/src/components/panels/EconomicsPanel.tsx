import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

import DataStatusBadge from "@/components/data/DataStatusBadge";
import Sparkline from "@/components/ui/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import type { EconomicCalendarEvent, EconomicsSnapshotMetric } from "@/lib/finance";
import { useEconomicCalendar, useEconomicEventDetail, useEconomics, useYieldCurve, useOHLCV } from "@/lib/useFinance";

function formatMetricValue(metric: EconomicsSnapshotMetric) {
  if (metric.unit === "%") return `${metric.value.toFixed(2)}%`;
  if (Math.abs(metric.value) < 10) return metric.value.toFixed(4);
  return metric.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDelta(metric: EconomicsSnapshotMetric) {
  const delta = metric.value - metric.prev;
  const sign = delta >= 0 ? "+" : "";
  return `Δ ${sign}${delta.toFixed(metric.unit === "%" ? 2 : Math.abs(delta) < 10 ? 4 : 2)}${metric.unit}`;
}

function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).toUpperCase();
}

function categoryLabel(category: EconomicCalendarEvent["category"]) {
  const labels: Record<EconomicCalendarEvent["category"], string> = {
    inflation: "INFLATION",
    labor: "LABOR",
    growth: "GROWTH",
    policy: "POLICY",
    consumption: "CONSUMPTION",
    activity: "ACTIVITY",
    housing: "HOUSING",
  };

  return labels[category];
}

function snapshotRows(metrics: Array<{ key: string; metric: EconomicsSnapshotMetric }>) {
  return metrics.map(({ key, metric }) => {
    const delta = metric.value - metric.prev;
    return (
      <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-border/50 hover:bg-white/5">
        <span className="font-terminal text-[10px] text-foreground">{metric.label.toUpperCase()}</span>
        <span className="font-terminal text-[10px] tabular-nums text-right text-foreground">{formatMetricValue(metric)}</span>
        <span className={`font-terminal text-[10px] tabular-nums text-right ${delta >= 0 ? "text-up" : "text-down"}`}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(metric.unit === "%" ? 2 : Math.abs(delta) < 10 ? 4 : 2)}
        </span>
      </div>
    );
  });
}

function EconCard({ metric }: { metric: EconomicsSnapshotMetric }) {
  return (
    <div className="bg-[#080808] border border-border p-3 hover:border-[hsl(186,45%,50%)/40%] transition-colors">
      <div className="font-terminal text-[9px] tracking-widest text-muted-foreground mb-1">{metric.label}</div>
      <div className="font-terminal text-xl font-bold tabular-nums text-foreground">{formatMetricValue(metric)}</div>
      <div className="font-terminal text-[10px] tabular-nums mt-1 text-muted-foreground">{formatDelta(metric)} vs prior</div>
    </div>
  );
}

export default function EconomicsPanel() {
  const { data: econ, isLoading: snapshotLoading } = useEconomics();
  const { data: calendar = [], isLoading: calendarLoading } = useEconomicCalendar();
  const { data: ycHistory = [], isLoading: ycLoading } = useYieldCurve();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: eurUsdSeries } = useOHLCV("EURUSD=X", "1M", "1d");
  const { data: gbpUsdSeries } = useOHLCV("GBPUSD=X", "1M", "1d");
  const { data: usdJpySeries } = useOHLCV("JPY=X", "1M", "1d");
  const { data: dxySeries } = useOHLCV("DX-Y.NYB", "1M", "1d");

  useEffect(() => {
    if (!calendar.length) {
      setSelectedEventId(null);
      return;
    }

    if (!selectedEventId || !calendar.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(calendar[0].id);
    }
  }, [calendar, selectedEventId]);

  const selectedEvent = useMemo(
    () => calendar.find((event) => event.id === selectedEventId) ?? null,
    [calendar, selectedEventId],
  );
  const { data: eventDetail, isLoading: detailLoading } = useEconomicEventDetail(selectedEvent?.releaseId);

  const yieldCurve = useMemo(() => {
    const latest = ycHistory[ycHistory.length - 1];
    if (latest) {
      const TENORS: [string, keyof typeof latest][] = [
        ["1M", "month_1"], ["3M", "month_3"], ["6M", "month_6"],
        ["1Y", "year_1"], ["2Y", "year_2"], ["3Y", "year_3"],
        ["5Y", "year_5"], ["7Y", "year_7"], ["10Y", "year_10"],
        ["20Y", "year_20"], ["30Y", "year_30"],
      ];
      return TENORS
        .map(([term, key]) => ({ term, yield: latest[key] as number | undefined }))
        .filter((p): p is { term: string; yield: number } => p.yield != null);
    }
    if (!econ) return [];
    return [
      { term: "2Y", yield: econ.t2y.value },
      { term: "10Y", yield: econ.t10y.value },
      { term: "30Y", yield: econ.t30y.value },
    ];
  }, [econ, ycHistory]);

  const yieldCurveAnalysis = useMemo(() => {
    const y2 = yieldCurve.find(p => p.term === "2Y")?.yield;
    const y10 = yieldCurve.find(p => p.term === "10Y")?.yield;
    const y3m = yieldCurve.find(p => p.term === "3M")?.yield;
    const y30 = yieldCurve.find(p => p.term === "30Y")?.yield;

    if (y2 == null || y10 == null) return null;

    const spread2s10s = (y10 - y2) * 100; // in bps
    const spread3m10y = y3m != null ? (y10 - y3m) * 100 : null;

    let shape: string;
    let shapeColor: string;
    if (spread2s10s < -20) { shape = "INVERTED"; shapeColor = "text-red-400"; }
    else if (spread2s10s < 20) { shape = "FLAT"; shapeColor = "text-cyan-300"; }
    else if (spread2s10s > 100) { shape = "STEEP"; shapeColor = "text-green-400"; }
    else { shape = "NORMAL"; shapeColor = "text-green-400"; }

    return { spread2s10s, spread3m10y, shape, shapeColor, y2, y10, y3m, y30 };
  }, [yieldCurve]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-[#070707]">
        <Globe2 className="w-4 h-4 text-[hsl(186,45%,55%)]" />
        <span className="panel-label">MACRO ECONOMICS</span>
        <span className="font-terminal text-[9px] text-muted-foreground ml-2">US MACRO + EVENT SCHEDULE</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="panel-label">US MACRO INDICATORS</div>
              {econ?.status && <DataStatusBadge status={econ.status} compact /> }
            </div>
            {snapshotLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array(4).fill(0).map((_, index) => <Skeleton key={index} className="h-20 bg-border" />)}
              </div>
            ) : econ ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <EconCard metric={econ.gdp} />
                <EconCard metric={econ.cpi} />
                <EconCard metric={econ.unemployment} />
                <EconCard metric={econ.fedFunds} />
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <section>
              <div className="panel-label mb-3">US TREASURY YIELD CURVE</div>
              <div className="bg-[#080808] border border-border p-4">
                {snapshotLoading || ycLoading ? (
                  <Skeleton className="h-48 bg-border" />
                ) : yieldCurve.length === 0 ? null : (
                  <>
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                      {yieldCurve.filter((_, i) => i === 0 || i === yieldCurve.length - 1 || [4, 8].includes(i)).map((p) => (
                        <div key={p.term} className="font-terminal text-[9px]">
                          <span className="text-muted-foreground">{p.term}: </span>
                          <span className="text-foreground">{p.yield.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                    {yieldCurveAnalysis && (
                      <div className="flex flex-wrap items-center gap-4 mb-3 font-terminal text-[9px]">
                        <div>
                          <span className="text-muted-foreground">2s10s: </span>
                          <span className={yieldCurveAnalysis.spread2s10s < 0 ? "text-red-400" : "text-green-400"}>
                            {yieldCurveAnalysis.spread2s10s >= 0 ? "+" : ""}{yieldCurveAnalysis.spread2s10s.toFixed(0)}bps
                          </span>
                        </div>
                        {yieldCurveAnalysis.spread3m10y != null && (
                          <div>
                            <span className="text-muted-foreground">3M10Y: </span>
                            <span className={yieldCurveAnalysis.spread3m10y < 0 ? "text-red-400" : "text-green-400"}>
                              {yieldCurveAnalysis.spread3m10y >= 0 ? "+" : ""}{yieldCurveAnalysis.spread3m10y.toFixed(0)}bps
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">SHAPE: </span>
                          <span className={yieldCurveAnalysis.shapeColor}>{yieldCurveAnalysis.shape}</span>
                        </div>
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={yieldCurve} margin={{ top: 4, right: 4, bottom: 4, left: 16 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="hsl(0,0%,12%)" />
                        <XAxis dataKey="term" tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value.toFixed(1)}%`} />
                        <Tooltip
                          contentStyle={{ background: "#0d0d0d", border: "1px solid hsl(0,0%,13%)", fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}
                          formatter={(value: number) => [`${value.toFixed(2)}%`, "Yield"]}
                        />
                        <Line type="monotone" dataKey="yield" stroke="hsl(186,45%,55%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(186,45%,55%)", strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section>
                <div className="panel-label mb-3">FX SNAPSHOT</div>
                <div className="bg-[#080808] border border-border">
                  <div className="grid grid-cols-[1fr_auto_50px_auto] px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
                    <span>PAIR</span>
                    <span className="text-right">LAST</span>
                    <span className="text-right">CHART</span>
                    <span className="text-right">Δ</span>
                  </div>
                  {snapshotLoading || !econ ? (
                    <div className="p-3 space-y-2">
                      {Array(4).fill(0).map((_, index) => <Skeleton key={index} className="h-9 bg-border" />)}
                    </div>
                  ) : [
                    { key: "eurusd", metric: econ.eurUsd, series: eurUsdSeries },
                    { key: "gbpusd", metric: econ.gbpUsd, series: gbpUsdSeries },
                    { key: "usdjpy", metric: econ.usdJpy, series: usdJpySeries },
                    { key: "dxy", metric: econ.dolllarIndex, series: dxySeries },
                  ].map(({ key, metric, series }) => {
                    const delta = metric.value - metric.prev;
                    const sparkData = series?.bars?.slice(-30).map((b) => b.close) ?? [];
                    return (
                      <div key={key} className="grid grid-cols-[1fr_auto_50px_auto] items-center px-3 py-2 border-b border-border/50 hover:bg-white/5">
                        <span className="font-terminal text-[10px] text-foreground">{metric.label.toUpperCase()}</span>
                        <span className="font-terminal text-[10px] tabular-nums text-right text-foreground">{formatMetricValue(metric)}</span>
                        <span className="flex justify-end">
                          <Sparkline data={sparkData} width={50} height={16} />
                        </span>
                        <span className={`font-terminal text-[10px] tabular-nums text-right ${delta >= 0 ? "text-up" : "text-down"}`}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(metric.unit === "%" ? 2 : Math.abs(delta) < 10 ? 4 : 2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="panel-label mb-3">COMMODITY SNAPSHOT</div>
                <div className="bg-[#080808] border border-border">
                  <div className="grid grid-cols-[1fr_auto_auto] px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
                    <span>CONTRACT</span>
                    <span className="text-right">LAST</span>
                    <span className="text-right">Δ</span>
                  </div>
                  {snapshotLoading || !econ ? (
                    <div className="p-3 space-y-2">
                      {Array(2).fill(0).map((_, index) => <Skeleton key={index} className="h-9 bg-border" />)}
                    </div>
                  ) : snapshotRows([
                    { key: "gold", metric: econ.gold },
                    { key: "oil", metric: econ.oil },
                  ])}
                </div>
              </section>
            </div>
          </div>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="panel-label">UPCOMING ECONOMIC CALENDAR</div>
              <div className="flex items-center gap-3 flex-wrap">
                {calendar[0]?.status && <DataStatusBadge status={calendar[0].status} compact /> }
                <div className="font-terminal text-[9px] tracking-widest text-muted-foreground">NEXT 30 DAYS · {calendar.length} EVENTS</div>
              </div>
            </div>

            <div className="min-h-[420px] border border-border bg-[#060606] flex overflow-hidden">
              <div className="w-[40%] min-w-[320px] border-r border-border overflow-y-auto scrollbar-thin">
                {calendarLoading ? (
                  <div className="p-4 space-y-3">
                    {Array(6).fill(0).map((_, index) => <Skeleton key={index} className="h-20 bg-border" />)}
                  </div>
                ) : calendar.length === 0 ? (
                  <div className="flex items-center justify-center h-40 font-terminal text-xs text-muted-foreground px-4 text-center">
                    NO TRACKED MAJOR ECONOMIC EVENTS FOUND IN THE CURRENT WINDOW
                  </div>
                ) : (
                  calendar.map((event) => {
                    const active = event.id === selectedEventId;
                    return (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEventId(event.id)}
                        className={`w-full text-left border-b border-border/60 p-4 transition-colors ${active ? "bg-[hsl(186,45%,50%)/8%]" : "hover:bg-white/5"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-terminal text-[8px] tracking-widest text-muted-foreground mb-1">{formatEventDate(event.date)} · {event.timeCt}</div>
                            <div className="font-terminal text-sm text-foreground leading-snug">{event.title}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="font-terminal text-[8px] px-1.5 py-0.5 border border-border text-[hsl(186,45%,55%)]">{categoryLabel(event.category)}</span>
                              <span className={`font-terminal text-[8px] px-1.5 py-0.5 border border-border ${event.importance === "high" ? "text-up" : "text-muted-foreground"}`}>
                                {event.importance === "high" ? "HIGH" : "MEDIUM"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-[#050505]">
                {!selectedEvent ? (
                  <div className="h-full flex items-center justify-center font-terminal text-xs text-muted-foreground">SELECT AN EVENT TO DRILL THROUGH</div>
                ) : detailLoading ? (
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-7 w-2/3 bg-border" />
                    <Skeleton className="h-4 w-40 bg-border" />
                    <Skeleton className="h-24 w-full bg-border" />
                    <Skeleton className="h-20 w-full bg-border" />
                  </div>
                ) : (
                  <article className="p-5">
                    <div className="flex items-start gap-3 justify-between">
                      <div>
                        <div className="panel-label mb-2">EVENT DETAIL</div>
                        <h2 className="font-terminal text-lg text-foreground leading-tight max-w-3xl">{selectedEvent.title}</h2>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="font-terminal text-[9px] px-1.5 py-0.5 border border-border text-[hsl(186,45%,55%)]">{categoryLabel(selectedEvent.category)}</span>
                          <span className="font-terminal text-[9px] text-muted-foreground">{formatEventDate(selectedEvent.date)} · {selectedEvent.timeCt}</span>
                          <span className={`font-terminal text-[9px] ${selectedEvent.importance === "high" ? "text-up" : "text-muted-foreground"}`}>{selectedEvent.importance.toUpperCase()} IMPACT</span>
                          <DataStatusBadge status={eventDetail?.status ?? selectedEvent.status} compact />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={eventDetail?.releaseWebsiteUrl ?? selectedEvent.releaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border hover:border-[hsl(186,45%,50%)]/60 hover:text-[hsl(186,45%,55%)] font-terminal text-[9px] tracking-widest text-muted-foreground transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          OFFICIAL RELEASE
                        </a>
                        <a
                          href={selectedEvent.releaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border hover:border-[hsl(186,45%,50%)]/60 hover:text-[hsl(186,45%,55%)] font-terminal text-[9px] tracking-widest text-muted-foreground transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          FRED PAGE
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 mt-5">
                      <div className="space-y-4">
                        <div className="border border-border bg-[#080808] p-4">
                          <div className="font-terminal text-[9px] tracking-widest text-muted-foreground mb-2">SOURCE</div>
                          <div className="font-terminal text-sm text-foreground">{eventDetail?.sourceName ?? "Federal Reserve Economic Data"}</div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {eventDetail?.sourceUrl && (
                              <a
                                href={eventDetail.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-terminal text-[9px] tracking-widest text-[hsl(186,45%,55%)] hover:underline"
                              >
                                SOURCE PROFILE
                              </a>
                            )}
                            {eventDetail?.releaseCalendarUrl && (
                              <a
                                href={eventDetail.releaseCalendarUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-terminal text-[9px] tracking-widest text-[hsl(186,45%,55%)] hover:underline"
                              >
                                FULL RELEASE CALENDAR
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="border border-border bg-[#080808] p-4">
                          <div className="font-terminal text-[9px] tracking-widest text-muted-foreground mb-2">UPCOMING SCHEDULE</div>
                          <div className="space-y-2">
                            {(eventDetail?.upcomingDates.length ? eventDetail.upcomingDates : [{ date: selectedEvent.date, timeCt: selectedEvent.timeCt }]).map((entry) => (
                              <div key={`${entry.date}-${entry.timeCt}`} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
                                <span className="font-terminal text-[10px] text-foreground">{formatEventDate(entry.date)}</span>
                                <span className="font-terminal text-[10px] text-muted-foreground">{entry.timeCt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="border border-border bg-[#080808] p-4">
                        <div className="font-terminal text-[9px] tracking-widest text-muted-foreground mb-2">RELEASE TABLES</div>
                        {eventDetail?.tables.length ? (
                          <div className="space-y-3">
                            {eventDetail.tables.map((table) => (
                              <a
                                key={table.url}
                                href={table.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block border border-border/60 p-3 hover:border-[hsl(186,45%,50%)]/60 hover:bg-white/5 transition-colors"
                              >
                                <div className="font-terminal text-[11px] text-foreground leading-snug">{table.title}</div>
                                <div className="font-terminal text-[9px] text-muted-foreground mt-1">
                                  {table.recordCount !== null ? `${table.recordCount.toLocaleString()} SERIES / TABLE ROWS` : "OPEN TABLE"}
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="font-terminal text-xs text-muted-foreground">NO TABLE METADATA AVAILABLE FOR THIS RELEASE.</div>
                        )}
                      </div>
                    </div>
                  </article>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
