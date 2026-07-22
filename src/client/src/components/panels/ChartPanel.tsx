import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  CandlestickChart,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
  Plus,
  X,
  Minus,
  Ruler,
  Crosshair,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { formatPrice, pctClass } from "@/lib/finance";
import {
  getAllowedIntervals,
  normalizeComparisonSeries,
  supportsIntradayCharts,
  type ChartInterval,
} from "@/lib/chartSeries";
import { useOHLCV, useQuote } from "@/lib/useFinance";
import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeMACD,
  computeBollingerBands,
  computeVWAP,
  computePivots,
  findSwingPoints,
  CHART_COLORS,
  type OHLCVBar,
  type TimeValue,
} from "@/lib/chartCalculations";

interface Props {
  symbol: string;
  onSymbol: (sym: string) => void;
}

interface EventMarker {
  date: string;
  type: "earnings" | "dividend" | "split";
  label: string;
}

interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema20?: number | null;
  ema50?: number | null;
  bbUpper?: number | null;
  bbLower?: number | null;
  vwap?: number | null;
  rsi?: number | null;
  macd?: number | null;
  signal?: number | null;
  histogram?: number | null;
}

interface MeasureState {
  startTime: number;
  startPrice: number;
  startX: number;
  startY: number;
  endTime: number;
  endPrice: number;
  endX: number;
  endY: number;
}

const RANGES = ["1D", "5D", "1M", "3M", "6M", "1Y", "2Y"] as const;
const CHART_TYPES = ["CANDLE", "LINE", "AREA"] as const;
const PIVOT_PERIODS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = [
  "hsl(0,0%,50%)", "hsl(142,71%,45%)", "hsl(38,70%,50%)",
  "hsl(0,80%,55%)", "hsl(38,70%,50%)", "hsl(142,71%,45%)", "hsl(0,0%,50%)",
];

const OVERLAY_KEYS = ["SMA20", "SMA50", "SMA200", "EMA20", "EMA50", "BB", "VWAP"] as const;
const INDICATOR_KEYS = ["RSI", "MACD"] as const;

function getAllowedRanges(interval: ChartInterval): ReadonlyArray<(typeof RANGES)[number]> {
  if (interval === "5m" || interval === "15m") return ["1D"];
  if (interval === "1h") return ["1D", "5D", "1M", "3M"];
  return [...RANGES];
}

export default function ChartPanel({ symbol, onSymbol }: Props) {
  const symbolIsCrypto = symbol.toUpperCase().endsWith("-USD");
  const [range, setRange] = useState<(typeof RANGES)[number]>(symbolIsCrypto ? "1D" : "1Y");
  const [interval, setInterval] = useState<ChartInterval>(symbolIsCrypto ? "5m" : "1d");
  const [chartType, setChartType] = useState<(typeof CHART_TYPES)[number]>("CANDLE");
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["SMA20"]));
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["RSI", "MACD"]));
  const [showFib, setShowFib] = useState(false);
  const [showPivots, setShowPivots] = useState(false);
  const [pivotPeriod, setPivotPeriod] = useState<(typeof PIVOT_PERIODS)[number]>("DAILY");
  const [symInput, setSymInput] = useState(symbol);
  const [compareInput, setCompareInput] = useState("");
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [crosshair, setCrosshair] = useState<CrosshairData | null>(null);
  const [drawMode, setDrawMode] = useState<"none" | "horizontal">("none");
  const [drawings, setDrawings] = useState<Array<{ id: string; price: number }>>([]);
  const [drawingId, setDrawingId] = useState(0);
  const [events, setEvents] = useState<EventMarker[]>([]);

  // Measure tool — right-click drag (like Windows drag-select)
  const isMeasuringRef = useRef(false);
  const measureRef = useRef<MeasureState | null>(null);
  const [measure, setMeasure] = useState<MeasureState | null>(null);

  // Crosshair data in ref for measure tool
  const crosshairRef = useRef<CrosshairData | null>(null);
  const crosshairPixelRef = useRef<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { data: quote } = useQuote(symbol);
  const isCryptoActive = quote?.exchange === "CRYPTO" || symbolIsCrypto;
  const supportsIntraday = supportsIntradayCharts(quote?.status.freshness ?? null, isCryptoActive);
  const allowedIntervals = getAllowedIntervals(supportsIntraday);
  const effectiveInterval = supportsIntraday ? interval : "1d";
  const effectiveRange = !supportsIntraday && range === "1D" ? "1M" : range;

  useEffect(() => {
    setSymInput(symbol);
    setCompareSymbols((c) => c.filter((e) => e !== symbol));
  }, [symbol]);
  useEffect(() => {
    if (!allowedIntervals.includes(interval)) setInterval(allowedIntervals[0]);
  }, [allowedIntervals, interval]);
  useEffect(() => {
    const allowed = getAllowedRanges(effectiveInterval);
    if (!allowed.includes(effectiveRange)) setRange(allowed[allowed.length - 1]);
  }, [effectiveInterval, effectiveRange]);

  const { data: series, isLoading } = useOHLCV(symbol, effectiveRange, effectiveInterval);
  const raw = series?.bars ?? [];

  const ohlcvBars: OHLCVBar[] = useMemo(
    () =>
      raw.map((b: any) => ({
        time: Math.floor(new Date(b.date).getTime() / 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
    [raw]
  );

  const comparisonQueries = useQueries({
    queries: compareSymbols.map((entry) => ({
      queryKey: ["/api/finance/ohlcv", entry, effectiveRange, effectiveInterval],
      queryFn: async (): Promise<Array<{ date: string; close: number }>> => {
        const params = new URLSearchParams({ symbol: entry, range: effectiveRange, interval: effectiveInterval });
        const res = await fetch(`/api/finance/ohlcv?${params.toString()}`);
        if (!res.ok) return [];
        const p = (await res.json()) as { bars: Array<{ date: string; close: number }> };
        return p.bars;
      },
      staleTime: 60_000,
      enabled: Boolean(entry),
    })),
  });

  const indicatorData = useMemo(() => {
    if (!ohlcvBars.length)
      return {
        sma20: [], sma50: [], sma200: [], ema20: [], ema50: [],
        bb: { upper: [] as TimeValue[], middle: [] as TimeValue[], lower: [] as TimeValue[] },
        vwap: [], rsi: [],
        macd: { macd: [], signal: [], histogram: [] },
      };
    return {
      sma20: computeSMA(ohlcvBars, 20),
      sma50: computeSMA(ohlcvBars, 50),
      sma200: computeSMA(ohlcvBars, 200),
      ema20: computeEMA(ohlcvBars, 20),
      ema50: computeEMA(ohlcvBars, 50),
      bb: computeBollingerBands(ohlcvBars, 20, 2),
      vwap: computeVWAP(ohlcvBars),
      rsi: computeRSI(ohlcvBars, 14),
      macd: computeMACD(ohlcvBars),
    };
  }, [ohlcvBars]);

  const allowedRanges = getAllowedRanges(effectiveInterval);

  const fibLevels = useMemo(() => {
    if (!ohlcvBars.length || !showFib) return [];
    const sw = findSwingPoints(ohlcvBars, Math.max(3, Math.floor(ohlcvBars.length / 20)));
    if (sw.length < 2) return [];
    const h = sw.filter((s) => s.type === "high").sort((a, b) => b.index - a.index)[0];
    const l = sw.filter((s) => s.type === "low").sort((a, b) => b.index - a.index)[0];
    if (!h || !l) return [];
    const hi = Math.max(h.price, l.price);
    const lo = Math.min(h.price, l.price);
    const rng = hi - lo;
    const up = l.index < h.index;
    return FIB_LEVELS.map((lv, i) => ({
      level: lv,
      price: up ? hi - rng * lv : lo + rng * lv,
      color: FIB_COLORS[i],
    }));
  }, [ohlcvBars, showFib]);

  const pivotData = useMemo(() => {
    if (!ohlcvBars.length || !showPivots) return null;
    const lb = pivotPeriod === "DAILY" ? 1 : pivotPeriod === "WEEKLY" ? 5 : 22;
    const s = ohlcvBars.slice(-Math.max(lb + 1, 2));
    const prev = s[s.length - 2] ?? s[s.length - 1];
    return computePivots(prev.high, prev.low, prev.close);
  }, [ohlcvBars, showPivots, pivotPeriod]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/finance/events?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  }, [symbol]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") {
        measureRef.current = null;
        setMeasure(null);
        setDrawMode("none");
      }
      // Alt+H for horizontal line (TradingView shortcut)
      if (e.altKey && e.key === "h") {
        e.preventDefault();
        setDrawMode(drawMode === "horizontal" ? "none" : "horizontal");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawMode]);

  const seriesStatus = series?.status ?? quote?.status ?? null;

  const toggleOverlay = useCallback((key: string) => {
    setActiveOverlays((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const toggleIndicator = useCallback((key: string) => {
    setActiveIndicators((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  // ── Measure stats ──
  const measureStats = useMemo(() => {
    if (!measure) return null;
    const diff = measure.endPrice - measure.startPrice;
    const pct = measure.startPrice > 0 ? (diff / measure.startPrice) * 100 : 0;
    const startTime = Math.min(measure.startTime, measure.endTime);
    const endTime = Math.max(measure.startTime, measure.endTime);
    const slice = ohlcvBars.filter((b) => b.time >= startTime && b.time <= endTime);
    return {
      priceDiff: diff,
      pctChange: pct,
      bars: slice.length,
      high: slice.length ? Math.max(...slice.map((d) => d.high)) : 0,
      low: slice.length ? Math.min(...slice.map((d) => d.low)) : 0,
    };
  }, [measure, ohlcvBars]);

  // Chart refs
  const chartApiRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const overlaySeriesRef = useRef<Map<string, any>>(new Map());
  const rsiSeriesRef = useRef<any>(null);
  const macdLineSeriesRef = useRef<any>(null);
  const macdSignalSeriesRef = useRef<any>(null);
  const macdHistSeriesRef = useRef<any>(null);

  // ── Chart lifecycle ──
  useEffect(() => {
    if (!chartContainerRef.current || !ohlcvBars.length) return;
    let destroyed = false;

    const init = async () => {
      const {
        createChart, CandlestickSeries, LineSeries, AreaSeries,
        HistogramSeries, CrosshairMode, ColorType,
      } = await import("lightweight-charts");

      if (chartApiRef.current) {
        chartApiRef.current.remove();
        chartApiRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        overlaySeriesRef.current.clear();
        rsiSeriesRef.current = null;
        macdLineSeriesRef.current = null;
        macdSignalSeriesRef.current = null;
        macdHistSeriesRef.current = null;
      }
      if (destroyed) return;

      const chart = createChart(chartContainerRef.current!, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: CHART_COLORS.text,
          panes: {
            enableResize: true,
            separatorColor: "rgba(255,255,255,0.08)",
            separatorHoverColor: "rgba(255,255,255,0.15)",
          },
        },
        grid: { vertLines: { color: CHART_COLORS.grid }, horzLines: { color: CHART_COLORS.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: {
          timeVisible: ["5m", "15m", "1h"].includes(effectiveInterval),
          secondsVisible: false, rightOffset: 5, barSpacing: 8,
        },
        rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.05 } },
        width: chartContainerRef.current!.clientWidth,
        height: chartContainerRef.current!.clientHeight,
      });

      if (destroyed) { chart.remove(); return; }
      chartApiRef.current = chart;

      // Pane 0: Main series
      let mainSeries: any;
      if (chartType === "CANDLE") {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: CHART_COLORS.candleUp, downColor: CHART_COLORS.candleDown,
          borderUpColor: CHART_COLORS.candleUp, borderDownColor: CHART_COLORS.candleDown,
          wickUpColor: CHART_COLORS.wickUp, wickDownColor: CHART_COLORS.wickDown,
        });
        mainSeries.setData(ohlcvBars as any);
      } else if (chartType === "AREA") {
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: "hsl(186,45%,55%)", topColor: "hsl(186,45%,50%,0.3)",
          bottomColor: "hsl(186,45%,50%,0.05)", lineWidth: 2,
        });
        mainSeries.setData(ohlcvBars.map((b) => ({ time: b.time, value: b.close })) as any);
      } else {
        mainSeries = chart.addSeries(LineSeries, { color: "hsl(186,45%,55%)", lineWidth: 2 });
        mainSeries.setData(ohlcvBars.map((b) => ({ time: b.time, value: b.close })) as any);
      }
      candleSeriesRef.current = mainSeries;

      // Volume overlay
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: CHART_COLORS.volumeUp, priceFormat: { type: "volume" }, priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volumeSeries.setData(
        ohlcvBars.map((b) => ({
          time: b.time, value: b.volume,
          color: b.close >= b.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
        })) as any
      );
      volumeSeriesRef.current = volumeSeries;

      // Overlays
      const addOverlay = (key: string, data: TimeValue[], color: string, dashed?: boolean) => {
        if (destroyed) return;
        const s = chart.addSeries(LineSeries, {
          color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
          ...(dashed ? { lineStyle: 2 as any } : {}),
        });
        s.setData(data as any);
        overlaySeriesRef.current.set(key, s);
      };

      if (activeOverlays.has("SMA20")) addOverlay("SMA20", indicatorData.sma20, CHART_COLORS.sma20);
      if (activeOverlays.has("SMA50")) addOverlay("SMA50", indicatorData.sma50, CHART_COLORS.sma50);
      if (activeOverlays.has("SMA200")) addOverlay("SMA200", indicatorData.sma200, CHART_COLORS.sma200);
      if (activeOverlays.has("EMA20")) addOverlay("EMA20", indicatorData.ema20, CHART_COLORS.ema20);
      if (activeOverlays.has("EMA50")) addOverlay("EMA50", indicatorData.ema50, CHART_COLORS.ema50);
      if (activeOverlays.has("VWAP")) addOverlay("VWAP", indicatorData.vwap, CHART_COLORS.vwap, true);
      if (activeOverlays.has("BB")) {
        addOverlay("BB_Upper", indicatorData.bb.upper, CHART_COLORS.bb, true);
        addOverlay("BB_Middle", indicatorData.bb.middle, CHART_COLORS.bb);
        addOverlay("BB_Lower", indicatorData.bb.lower, CHART_COLORS.bb, true);
      }

      // Fibonacci levels
      if (showFib && fibLevels.length > 0) {
        fibLevels.forEach((fib) => {
          if (destroyed) return;
          const fibData = ohlcvBars.map((b) => ({ time: b.time, value: fib.price }));
          const s = chart.addSeries(LineSeries, {
            color: fib.color,
            lineWidth: 1,
            lineStyle: fib.level === 0.5 ? 0 : 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(fibData as any);
          overlaySeriesRef.current.set(`FIB_${fib.level}`, s);
        });
      }

      // Pivot levels
      if (showPivots && pivotData) {
        const pivotLines = [
          { key: "PP", price: pivotData.pp, color: CHART_COLORS.pivotPP, dash: false },
          { key: "R1", price: pivotData.r1, color: CHART_COLORS.pivotR, dash: true },
          { key: "R2", price: pivotData.r2, color: CHART_COLORS.pivotR, dash: true },
          { key: "R3", price: pivotData.r3, color: CHART_COLORS.pivotR, dash: true },
          { key: "S1", price: pivotData.s1, color: CHART_COLORS.pivotS, dash: true },
          { key: "S2", price: pivotData.s2, color: CHART_COLORS.pivotS, dash: true },
          { key: "S3", price: pivotData.s3, color: CHART_COLORS.pivotS, dash: true },
        ];
        pivotLines.forEach((p) => {
          if (destroyed) return;
          const pData = ohlcvBars.map((b) => ({ time: b.time, value: p.price }));
          const s = chart.addSeries(LineSeries, {
            color: p.color,
            lineWidth: 1,
            lineStyle: p.dash ? 2 : 0,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(pData as any);
          overlaySeriesRef.current.set(`PIV_${p.key}`, s);
        });
      }

      // RSI pane (compact, below main)
      if (activeIndicators.has("RSI")) {
        const rsiPane = chart.addPane();
        rsiPane.setHeight(60);
        const rsiSeries = rsiPane.addSeries(LineSeries, {
          color: CHART_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          priceScaleId: "rsi",
        });
        rsiSeries.setData(indicatorData.rsi as any);
        rsiSeriesRef.current = rsiSeries;

        // RSI reference lines (30, 50, 70)
        const addRsiRefLine = (value: number, color: string, dashed: boolean) => {
          const refData = ohlcvBars.map((b) => ({ time: b.time, value }));
          const s = rsiPane.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: dashed ? 2 : 0,
            priceLineVisible: false,
            lastValueVisible: false,
            priceScaleId: "rsi",
          });
          s.setData(refData as any);
        };
        addRsiRefLine(30, "hsl(142,71%,45%)", true);  // Oversold - green dashed
        addRsiRefLine(70, "hsl(0,80%,55%)", true);    // Overbought - red dashed
        addRsiRefLine(50, "hsl(0,0%,55%)", false);    // Midline - gray solid

        // Configure RSI price scale
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
          autoScale: true,
        });
      }

      // MACD pane (compact, below RSI)
      if (activeIndicators.has("MACD")) {
        const macdPane = chart.addPane();
        macdPane.setHeight(60);

        const macdLine = macdPane.addSeries(LineSeries, {
          color: CHART_COLORS.macdLine,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          priceScaleId: "macd",
        });
        macdLine.setData(indicatorData.macd.macd as any);
        macdLineSeriesRef.current = macdLine;

        const macdSignal = macdPane.addSeries(LineSeries, {
          color: CHART_COLORS.macdSignal,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          priceScaleId: "macd",
        });
        macdSignal.setData(indicatorData.macd.signal as any);
        macdSignalSeriesRef.current = macdSignal;

        const macdHist = macdPane.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "macd",
        });
        macdHist.setData(
          indicatorData.macd.histogram.map((h) => ({
            time: h.time,
            value: h.value,
            color: h.value >= 0 ? CHART_COLORS.macdHistogramUp : CHART_COLORS.macdHistogramDown,
          })) as any
        );
        macdHistSeriesRef.current = macdHist;

        // MACD zero reference line
        const zeroData = ohlcvBars.map((b) => ({ time: b.time, value: 0 }));
        const zeroLine = macdPane.addSeries(LineSeries, {
          color: "hsl(0,0%,55%)",
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "macd",
        });
        zeroLine.setData(zeroData as any);

        // Configure MACD price scale
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
          autoScale: true,
        });
      }

      chart.timeScale().fitContent();

      // Crosshair handler — also tracks pixel position for measure tool
      chart.subscribeCrosshairMove((param: any) => {
        // Track pixel position for measure tool
        if (param.point) {
          crosshairPixelRef.current = { x: param.point.x, y: param.point.y };
        }

        if (!param.time) { setCrosshair(null); return; }

        const candleData = param.seriesData.get(mainSeries);
        const volData = param.seriesData.get(volumeSeries);
        const cd: CrosshairData = {
          time: param.time,
          open: candleData?.open ?? 0, high: candleData?.high ?? 0,
          low: candleData?.low ?? 0, close: candleData?.close ?? 0,
          volume: volData?.value ?? 0,
        };

        const findVal = (arr: TimeValue[]) => arr.find((v) => v.time === param.time)?.value ?? null;
        if (activeOverlays.has("SMA20")) cd.sma20 = findVal(indicatorData.sma20);
        if (activeOverlays.has("SMA50")) cd.sma50 = findVal(indicatorData.sma50);
        if (activeOverlays.has("SMA200")) cd.sma200 = findVal(indicatorData.sma200);
        if (activeOverlays.has("EMA20")) cd.ema20 = findVal(indicatorData.ema20);
        if (activeOverlays.has("EMA50")) cd.ema50 = findVal(indicatorData.ema50);
        if (activeOverlays.has("BB")) { cd.bbUpper = findVal(indicatorData.bb.upper); cd.bbLower = findVal(indicatorData.bb.lower); }
        if (activeOverlays.has("VWAP")) cd.vwap = findVal(indicatorData.vwap);
        if (activeIndicators.has("RSI")) cd.rsi = findVal(indicatorData.rsi);
        if (activeIndicators.has("MACD")) {
          cd.macd = findVal(indicatorData.macd.macd);
          cd.signal = findVal(indicatorData.macd.signal);
          cd.histogram = findVal(indicatorData.macd.histogram);
        }
        setCrosshair(cd);
        crosshairRef.current = cd;
      });

      // Click handler for drawing
      chart.subscribeClick((param: any) => {
        if (!param.point || !param.time) return;
        const seriesData = param.seriesData.get(mainSeries);
        if (!seriesData) return;
        if (drawMode === "horizontal") {
          setDrawings((prev) => [...prev, { id: `d-${drawingId}`, price: seriesData.close }]);
          setDrawingId((c) => c + 1);
        }
      });

      // Resize
      const ro = new ResizeObserver(() => {
        if (chartContainerRef.current && chartApiRef.current) {
          chartApiRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      });
      ro.observe(chartContainerRef.current!);
      return () => { ro.disconnect(); };
    };

    let cleanupFn: (() => void) | undefined;
    init().then((fn) => { cleanupFn = fn; });
    return () => {
      destroyed = true;
      cleanupFn?.();
      if (chartApiRef.current) { chartApiRef.current.remove(); chartApiRef.current = null; }
    };
  }, [ohlcvBars, chartType, activeOverlays, activeIndicators, effectiveInterval, drawMode, drawingId, indicatorData]);

  // ── Measure tool: Shift+click drag (TradingView style) ──
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey) return; // Shift+click only
      const pixel = crosshairPixelRef.current;
      const ch = crosshairRef.current;
      if (!pixel || !ch) return;

      e.preventDefault();
      const state: MeasureState = {
        startTime: ch.time, startPrice: ch.close,
        startX: pixel.x, startY: pixel.y,
        endTime: ch.time, endPrice: ch.close,
        endX: pixel.x, endY: pixel.y,
      };
      measureRef.current = state;
      isMeasuringRef.current = true;
      setMeasure({ ...state });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMeasuringRef.current) return;
      const pixel = crosshairPixelRef.current;
      const ch = crosshairRef.current;
      if (!pixel || !ch) return;

      const updated: MeasureState = {
        ...measureRef.current!,
        endTime: ch.time, endPrice: ch.close,
        endX: pixel.x, endY: pixel.y,
      };
      measureRef.current = updated;
      setMeasure({ ...updated });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (isMeasuringRef.current) {
        isMeasuringRef.current = false;
      }
    };

    // Dismiss on left-click (without shift)
    const onClick = (e: MouseEvent) => {
      if (!e.shiftKey && measureRef.current && !isMeasuringRef.current) {
        measureRef.current = null;
        setMeasure(null);
      }
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("click", onClick);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* ── Toolbar Row 1: Symbol + Price ── */}
      <div className="shrink-0 border-b border-border bg-[#070707]">
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/50">
          <form onSubmit={(e) => { e.preventDefault(); if (symInput.trim()) onSymbol(symInput.trim().toUpperCase()); }} className="flex items-center gap-1.5">
            <input value={symInput} onChange={(e) => setSymInput(e.target.value.toUpperCase())}
              className="bg-[#0d0d0d] border border-border px-2 py-0.5 font-terminal text-xs text-[hsl(186,45%,55%)] focus:outline-none w-20" />
            <button type="submit" className="font-terminal text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 hover:text-[hsl(186,45%,55%)]">GO</button>
          </form>
          {quote && (
            <div className="flex items-center gap-3">
              <span className="font-terminal text-sm font-bold tabular-nums">{formatPrice(quote.price)}</span>
              <span className={`font-terminal text-xs tabular-nums ${pctClass(quote.changePercent)}`}>
                {quote.changePercent >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
          {seriesStatus && <DataStatusBadge status={seriesStatus} compact showAsOf />}
        </div>

        {/* ── Toolbar Row 2 ── */}
        <div className="flex items-center gap-1 px-3 py-1 flex-wrap">
          <div className="flex items-center border border-border/40 rounded-sm overflow-hidden mr-2">
            {CHART_TYPES.map((ct) => (
              <button key={ct} onClick={() => setChartType(ct)}
                className={`px-2 py-1 font-terminal text-[9px] transition-colors ${chartType === ct ? "bg-[hsl(186,45%,50%)/15%] text-[hsl(186,45%,55%)]" : "text-muted-foreground/60 hover:text-foreground"}`}>
                {ct === "CANDLE" ? <CandlestickChart className="w-3 h-3 inline" /> : ct === "LINE" ? <LineChartIcon className="w-3 h-3 inline" /> : <AreaChartIcon className="w-3 h-3 inline" />}
              </button>
            ))}
          </div>
          <div className="flex items-center border border-border/40 rounded-sm overflow-hidden mr-2">
            {RANGES.map((e) => {
              const on = allowedRanges.includes(e);
              return <button key={e} onClick={() => on && setRange(e)} disabled={!on}
                className={`px-2 py-1 font-terminal text-[9px] transition-colors ${effectiveRange === e ? "bg-[hsl(186,45%,50%)/15%] text-[hsl(186,45%,55%)]" : "text-muted-foreground/60 hover:text-foreground"} ${!on ? "opacity-25 cursor-not-allowed" : ""}`}>{e}</button>;
            })}
          </div>
          <div className="flex items-center border border-border/40 rounded-sm overflow-hidden mr-2">
            {allowedIntervals.map((e) => (
              <button key={e} onClick={() => setInterval(e)}
                className={`px-2 py-1 font-terminal text-[9px] transition-colors uppercase ${interval === e ? "bg-[hsl(38,30%,50%)/15%] text-[hsl(38,30%,55%)]" : "text-muted-foreground/60 hover:text-foreground"}`}>{e}</button>
            ))}
          </div>
          <div className="w-px h-5 bg-border/40 mx-1" />
          <button onClick={() => setShowFib(!showFib)} className={`px-2 py-1 font-terminal text-[9px] rounded-sm transition-colors ${showFib ? "bg-[hsl(38,70%,50%)/15%] text-[hsl(38,70%,55%)]" : "text-muted-foreground/60 hover:text-foreground"}`}>FIB</button>
          <button onClick={() => setShowPivots(!showPivots)} className={`px-2 py-1 font-terminal text-[9px] rounded-sm transition-colors ${showPivots ? "bg-[hsl(142,71%,45%)/15%] text-[hsl(142,71%,55%)]" : "text-muted-foreground/60 hover:text-foreground"}`}>PIV</button>
          {showPivots && PIVOT_PERIODS.map((p) => (
            <button key={p} onClick={() => setPivotPeriod(p)} className={`px-1.5 py-1 font-terminal text-[8px] transition-colors ${pivotPeriod === p ? "text-[hsl(142,71%,55%)]" : "text-muted-foreground/40"}`}>{p}</button>
          ))}
          <div className="w-px h-4 bg-border/30 mx-1" />
          <button onClick={() => setDrawMode(drawMode === "horizontal" ? "none" : "horizontal")}
            className={`px-1.5 py-1 transition-colors ${drawMode === "horizontal" ? "text-[hsl(186,45%,55%)]" : "text-muted-foreground/50 hover:text-foreground"}`} title="Horizontal Line (Alt+H)">
            <Minus className="w-3 h-3" />
          </button>
          {drawings.length > 0 && <button onClick={() => setDrawings([])} className="px-1.5 py-1 font-terminal text-[8px] text-[hsl(0,80%,55%)]">CLR</button>}
          <div className="w-px h-4 bg-border/30 mx-1" />
          <button onClick={() => { /* Measure tool is activated by Shift+click drag */ }}
            className="px-1.5 py-1 text-muted-foreground/50 hover:text-foreground transition-colors" title="Measure (Shift+click drag)">
            <Ruler className="w-3 h-3" />
          </button>
          <form onSubmit={(e) => { e.preventDefault(); const n = compareInput.trim().toUpperCase(); if (!n || n === symbol || compareSymbols.includes(n) || compareSymbols.length >= 2) return; setCompareSymbols((c) => [...c, n]); setCompareInput(""); }}
            className="flex items-center gap-1.5 ml-auto">
            <input value={compareInput} onChange={(e) => setCompareInput(e.target.value.toUpperCase())} placeholder="COMPARE"
              className="bg-[#0d0d0d] border border-border px-2 py-0.5 font-terminal text-[9px] text-[hsl(38,30%,55%)] focus:outline-none w-20 uppercase" />
            <button type="submit" className="flex items-center gap-1 px-1.5 py-0.5 font-terminal text-[9px] border border-border text-muted-foreground/60 hover:text-foreground"><Plus className="w-3 h-3" /></button>
          </form>
        </div>
      </div>

      {/* ── Indicators Bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1 border-b border-border/50 bg-[#060606] overflow-x-auto scrollbar-thin">
        <span className="font-terminal text-[8px] tracking-[0.15em] text-muted-foreground/50 mr-1 shrink-0">INDICATORS</span>
        {[...OVERLAY_KEYS, ...INDICATOR_KEYS].map((key) => {
          const isOverlay = (OVERLAY_KEYS as readonly string[]).includes(key);
          const active = isOverlay ? activeOverlays.has(key) : activeIndicators.has(key);
          return (
            <button key={key} onClick={() => isOverlay ? toggleOverlay(key) : toggleIndicator(key)}
              className={`px-2 py-0.5 font-terminal text-[8px] rounded-sm transition-colors border shrink-0 ${
                active
                  ? "bg-[hsl(186,45%,50%)/12%] border-[hsl(186,45%,50%)/30%] text-[hsl(186,45%,55%)]"
                  : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/70"
              }`}>
              {key}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex-1 p-6"><Skeleton className="w-full h-full bg-border" /></div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative" ref={containerRef}>
          {/* Legend - Fixed top-left */}
          <div className="absolute top-2 left-3 z-20 pointer-events-none font-terminal text-[9px] space-y-0.5">
            {/* Symbol + OHLCV */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-[10px]">{symbol}</span>
              {crosshair ? (
                <>
                  <span className="text-muted-foreground">O<span className="text-foreground ml-0.5">{formatPrice(crosshair.open)}</span></span>
                  <span className="text-muted-foreground">H<span className="text-foreground ml-0.5">{formatPrice(crosshair.high)}</span></span>
                  <span className="text-muted-foreground">L<span className="text-foreground ml-0.5">{formatPrice(crosshair.low)}</span></span>
                  <span className="text-muted-foreground">C<span className="text-foreground ml-0.5 font-bold">{formatPrice(crosshair.close)}</span></span>
                  <span className="text-muted-foreground">V<span className="text-foreground ml-0.5">{crosshair.volume >= 1e6 ? `${(crosshair.volume / 1e6).toFixed(1)}M` : `${(crosshair.volume / 1e3).toFixed(0)}K`}</span></span>
                </>
              ) : quote && (
                <>
                  <span className="text-muted-foreground">O<span className="text-foreground ml-0.5">{formatPrice(quote.open)}</span></span>
                  <span className="text-muted-foreground">H<span className="text-foreground ml-0.5">{formatPrice(quote.dayHigh)}</span></span>
                  <span className="text-muted-foreground">L<span className="text-foreground ml-0.5">{formatPrice(quote.dayLow)}</span></span>
                  <span className="text-muted-foreground">C<span className="text-foreground ml-0.5 font-bold">{formatPrice(quote.price)}</span></span>
                </>
              )}
            </div>
            {/* Indicator readings */}
            {crosshair && (
              <div className="flex items-center gap-3 flex-wrap">
                {crosshair.sma20 != null && (
                  <span style={{ color: CHART_COLORS.sma20 }}>● SMA20 {formatPrice(crosshair.sma20)}</span>
                )}
                {crosshair.sma50 != null && (
                  <span style={{ color: CHART_COLORS.sma50 }}>● SMA50 {formatPrice(crosshair.sma50)}</span>
                )}
                {crosshair.sma200 != null && (
                  <span style={{ color: CHART_COLORS.sma200 }}>● SMA200 {formatPrice(crosshair.sma200)}</span>
                )}
                {crosshair.ema20 != null && (
                  <span style={{ color: CHART_COLORS.ema20 }}>● EMA20 {formatPrice(crosshair.ema20)}</span>
                )}
                {crosshair.ema50 != null && (
                  <span style={{ color: CHART_COLORS.ema50 }}>● EMA50 {formatPrice(crosshair.ema50)}</span>
                )}
                {crosshair.bbUpper != null && (
                  <span style={{ color: CHART_COLORS.bb }}>● BB {formatPrice(crosshair.bbUpper)} / {formatPrice(crosshair.bbLower!)}</span>
                )}
                {crosshair.vwap != null && (
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>● VWAP {formatPrice(crosshair.vwap)}</span>
                )}
                {crosshair.rsi != null && (
                  <span style={{ color: CHART_COLORS.rsi }}>● RSI(14) {crosshair.rsi.toFixed(1)}</span>
                )}
                {crosshair.macd != null && (
                  <span style={{ color: CHART_COLORS.macdLine }}>● MACD {crosshair.macd.toFixed(3)}</span>
                )}
                {crosshair.signal != null && (
                  <span style={{ color: CHART_COLORS.macdSignal }}>Signal {crosshair.signal.toFixed(3)}</span>
                )}
                {crosshair.histogram != null && (
                  <span style={{ color: crosshair.histogram >= 0 ? CHART_COLORS.macdHistogramUp : CHART_COLORS.macdHistogramDown }}>
                    Hist {crosshair.histogram >= 0 ? "+" : ""}{crosshair.histogram.toFixed(3)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Floating crosshair tooltip - follows cursor */}
          {crosshair && crosshairPixelRef.current && (
            <div
              className="absolute z-20 pointer-events-none font-terminal text-[9px] bg-[#0a0a0a]/90 border border-border/50 px-2 py-1.5 rounded shadow-lg"
              style={{
                left: Math.min(crosshairPixelRef.current.x + 12, (chartContainerRef.current?.clientWidth ?? 0) - 200),
                top: Math.max(crosshairPixelRef.current.y - 60, 8),
              }}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{symbol}</span>
                  <span className="text-muted-foreground">C<span className="text-foreground ml-0.5 font-bold">{formatPrice(crosshair.close)}</span></span>
                  <span className={`text-[8px] ${crosshair.close >= crosshair.open ? "text-green-400" : "text-red-400"}`}>
                    {crosshair.close >= crosshair.open ? "▲" : "▼"} {((crosshair.close - crosshair.open) / crosshair.open * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>O {formatPrice(crosshair.open)}</span>
                  <span>H {formatPrice(crosshair.high)}</span>
                  <span>L {formatPrice(crosshair.low)}</span>
                  <span>V {crosshair.volume >= 1e6 ? `${(crosshair.volume / 1e6).toFixed(1)}M` : `${(crosshair.volume / 1e3).toFixed(0)}K`}</span>
                </div>
                {crosshair.rsi != null && (
                  <div style={{ color: CHART_COLORS.rsi }}>RSI(14) {crosshair.rsi.toFixed(1)}</div>
                )}
                {crosshair.macd != null && (
                  <div style={{ color: CHART_COLORS.macdLine }}>MACD {crosshair.macd.toFixed(3)} Signal {crosshair.signal?.toFixed(3)}</div>
                )}
              </div>
            </div>
          )}

          {drawMode === "horizontal" && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[hsl(265,70%,65%)]/15 border border-[hsl(265,70%,65%)]/40 px-3 py-1 font-terminal text-[9px] text-[hsl(265,70%,80%)] z-30">
              CLICK TO PLACE LINE
            </div>
          )}

          {/* Chart */}
          <div ref={chartContainerRef} className="flex-1 min-h-0" />

          {/* Measure overlay */}
          {measure && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <line x1={measure.startX} y1={measure.startY} x2={measure.endX} y2={measure.endY}
                stroke="hsl(186,45%,55%)" strokeWidth={1.5} strokeDasharray="4 3" />
              <rect
                x={Math.min(measure.startX, measure.endX)} y={Math.min(measure.startY, measure.endY)}
                width={Math.abs(measure.endX - measure.startX)} height={Math.abs(measure.endY - measure.startY)}
                fill="hsl(186,45%,50%,0.08)" stroke="hsl(186,45%,50%,0.4)" strokeWidth={1} strokeDasharray="4 3" />
              <circle cx={measure.startX} cy={measure.startY} r={4} fill="hsl(186,45%,55%)" stroke="#050505" strokeWidth={1.5} />
              <circle cx={measure.endX} cy={measure.endY} r={4} fill="hsl(186,45%,55%)" stroke="#050505" strokeWidth={1.5} />
            </svg>
          )}

          {/* Measure stats box */}
          {measureStats && measure && (() => {
            const boxX = Math.min(measure.startX, measure.endX) + Math.abs(measure.endX - measure.startX) / 2;
            const boxY = Math.min(measure.startY, measure.endY);
            const isUp = measureStats.priceDiff >= 0;
            return (
              <div className="absolute z-30 pointer-events-auto" style={{ left: boxX, top: boxY - 8, transform: "translate(-50%, -100%)" }}>
                <div className="bg-[#0a0a0a] border border-[hsl(186,45%,50%)]/40 rounded px-3 py-2 font-terminal backdrop-blur-sm shadow-lg shadow-black/50">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-[hsl(186,45%,55%)] font-bold text-[10px] tracking-wider">MEASURE</span>
                    <span className="text-muted-foreground/50 text-[8px]">{measureStats.bars} bars</span>
                  </div>
                  <div className={`font-bold text-[11px] mb-1 ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{formatPrice(measureStats.priceDiff)}
                    <span className="text-[9px] ml-1.5">({isUp ? "+" : ""}{measureStats.pctChange.toFixed(2)}%)</span>
                  </div>
                  <div className="flex items-center gap-3 text-[8px] text-muted-foreground/70">
                    <span>H {formatPrice(measureStats.high)}</span>
                    <span>L {formatPrice(measureStats.low)}</span>
                  </div>
                  <button onClick={() => { measureRef.current = null; setMeasure(null); }}
                    className="mt-1.5 text-[8px] text-[hsl(0,80%,55%)] hover:text-[hsl(0,80%,65%)] transition-colors">
                    ESC to dismiss
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Drawing lines with price labels */}
          {drawings.map((d) => {
            if (!ohlcvBars.length) return null;
            const priceMin = Math.min(...ohlcvBars.map((b) => b.low));
            const priceMax = Math.max(...ohlcvBars.map((b) => b.high));
            const rng = priceMax - priceMin;
            if (rng <= 0) return null;
            const yPos = ((d.price - priceMin) / rng) * 100;
            return (
              <div key={d.id} className="absolute left-0 right-0 pointer-events-none z-10" style={{ bottom: `${yPos}%` }}>
                {/* Horizontal line */}
                <div className="h-px bg-[hsl(186,45%,55%)] w-full" />
                {/* Price label on right axis */}
                <div className="absolute right-0 top-0 translate-y-[-50%] bg-[hsl(186,45%,55%)] px-1.5 py-0.5 font-terminal text-[8px] text-black font-bold">
                  {formatPrice(d.price)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
