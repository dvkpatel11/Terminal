import { useState, useMemo } from "react";
import { useOHLCV, useQuote } from "@/lib/useFinance";
import { formatPrice, pctClass } from "@/lib/finance";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  symbol: string;
  onSymbol: (sym: string) => void;
}

const RANGES = ["1D","5D","1M","3M","6M","1Y","2Y"] as const;

function computeSMA(data: any[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, d) => s + d.close, 0) / period;
  });
}

function computeRSI(data: any[], period = 14): (number | null)[] {
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const d = data[i].close - data[i - 1].close;
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const result: (number | null)[] = [null];
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#0d0d0d] border border-border p-2 font-terminal text-[9px] space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground">O: {formatPrice(d.open)} H: {formatPrice(d.high)}</div>
      <div className="text-foreground">L: {formatPrice(d.low)} C: <span className="font-bold">{formatPrice(d.close)}</span></div>
      <div className="text-muted-foreground">VOL: {(d.volume / 1e6).toFixed(1)}M</div>
    </div>
  );
};

export default function ChartPanel({ symbol, onSymbol }: Props) {
  const [range, setRange] = useState<typeof RANGES[number]>("1Y");
  const [indicator, setIndicator] = useState<"SMA20" | "SMA50" | "RSI" | "MACD" | "none">("SMA20");
  const [symInput, setSymInput] = useState(symbol);

  const { data: raw, isLoading } = useOHLCV(symbol, range);
  const { data: q } = useQuote(symbol);

  const chartData = useMemo(() => {
    if (!raw) return [];
    const sma20 = computeSMA(raw, 20);
    const sma50 = computeSMA(raw, 50);
    const rsi = computeRSI(raw, 14);
    return raw.map((d, i) => ({
      ...d,
      sma20: sma20[i],
      sma50: sma50[i],
      rsi: rsi[i],
      color: d.close >= d.open ? "hsl(142,71%,45%)" : "hsl(0,80%,50%)",
    }));
  }, [raw]);

  const handleSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (symInput.trim()) onSymbol(symInput.trim().toUpperCase());
  };

  const priceMin = chartData.length ? Math.min(...chartData.map(d => d.low)) * 0.995 : 0;
  const priceMax = chartData.length ? Math.max(...chartData.map(d => d.high)) * 1.005 : 0;

  const showRSI = indicator === "RSI";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <form onSubmit={handleSymbol} className="flex items-center gap-2">
          <input
            value={symInput}
            onChange={e => setSymInput(e.target.value.toUpperCase())}
            className="bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-xs text-[hsl(38,95%,55%)] focus:outline-none focus:border-[hsl(38,95%,50%)/60%] w-20"
            data-testid="chart-symbol-input"
          />
          <button type="submit" className="font-terminal text-[9px] text-muted-foreground border border-border px-2 py-1 hover:border-[hsl(38,95%,50%)/50%] hover:text-[hsl(38,95%,55%)]">GO</button>
        </form>

        {q && (
          <div className="flex items-center gap-3">
            <span className="font-terminal text-sm font-bold tabular-nums">{formatPrice(q.price)}</span>
            <span className={`font-terminal text-xs tabular-nums ${pctClass(q.changePercent)}`}>
              {q.changePercent >= 0 ? "▲" : "▼"} {Math.abs(q.changePercent).toFixed(2)}%
            </span>
          </div>
        )}

        <div className="flex items-center gap-px ml-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-1 font-terminal text-[9px] transition-colors ${range === r ? "bg-[hsl(38,95%,50%)/20%] text-[hsl(38,95%,55%)]" : "text-muted-foreground hover:text-foreground"}`}>
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-px ml-2">
          {(["none","SMA20","SMA50","RSI"] as const).map(ind => (
            <button key={ind} onClick={() => setIndicator(ind)}
              className={`px-2 py-1 font-terminal text-[9px] transition-colors ${indicator === ind ? "bg-[hsl(186,80%,50%)/20%] text-[hsl(186,80%,55%)]" : "text-muted-foreground hover:text-foreground"}`}>
              {ind === "none" ? "NONE" : ind}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 p-6">
          <Skeleton className="w-full h-full bg-border" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden p-2 gap-px">
          {/* Price chart */}
          <div className={showRSI ? "flex-1" : "flex-1"} style={{ minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 52 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(0,0%,12%)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(chartData.length / 8)}
                />
                <YAxis
                  domain={[priceMin, priceMax]}
                  tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => formatPrice(v)}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Candle approximation using bars */}
                <Bar
                  dataKey="close"
                  fill="hsl(142,71%,45%)"
                  stroke="none"
                  maxBarSize={8}
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    const isUp = payload.close >= payload.open;
                    return <rect x={x} y={y} width={width} height={height} fill={isUp ? "hsl(142,71%,38%)" : "hsl(0,80%,45%)"} stroke="none" />;
                  }}
                />
                {(indicator === "SMA20" || indicator === "SMA50") && (
                  <Line type="monotone" dataKey="sma20" stroke="hsl(38,95%,55%)" strokeWidth={1.5} dot={false} connectNulls />
                )}
                {indicator === "SMA50" && (
                  <Line type="monotone" dataKey="sma50" stroke="hsl(265,70%,65%)" strokeWidth={1.5} dot={false} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* RSI sub-chart */}
          {showRSI && (
            <div className="h-28 shrink-0">
              <div className="panel-label px-2 py-1 text-[hsl(186,80%,55%)]">RSI (14)</div>
              <ResponsiveContainer width="100%" height="80%">
                <ComposedChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 52 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(0,0%,12%)" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} ticks={[30, 50, 70]} width={50} />
                  <ReferenceLine y={70} stroke="hsl(0,80%,50%)" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={30} stroke="hsl(142,71%,45%)" strokeDasharray="3 3" strokeWidth={1} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const value = payload[0].value;
                    return <div className="bg-[#0d0d0d] border border-border p-1 font-terminal text-[9px]">RSI: {typeof value === "number" ? value.toFixed(1) : "—"}</div>;
                  }} />
                  <Line type="monotone" dataKey="rsi" stroke="hsl(186,80%,55%)" strokeWidth={1.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Volume sub-chart */}
          <div className="h-20 shrink-0">
            <div className="panel-label px-2 py-1">VOLUME</div>
            <ResponsiveContainer width="100%" height="70%">
              <ComposedChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 52 }}>
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} width={50} />
                <Bar dataKey="volume" maxBarSize={8}
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    const isUp = payload.close >= payload.open;
                    return <rect x={x} y={y} width={width} height={height} fill={isUp ? "hsl(142,71%,38%)/0.6" : "hsl(0,80%,45%)/0.6"} opacity={0.6} />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
