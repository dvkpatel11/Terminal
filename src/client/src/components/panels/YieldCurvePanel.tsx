import { useYieldCurve, type YieldCurvePoint } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const TENORS: Array<{ key: keyof YieldCurvePoint; label: string }> = [
  { key: "month_1", label: "1M" },
  { key: "month_3", label: "3M" },
  { key: "month_6", label: "6M" },
  { key: "year_1", label: "1Y" },
  { key: "year_2", label: "2Y" },
  { key: "year_3", label: "3Y" },
  { key: "year_5", label: "5Y" },
  { key: "year_7", label: "7Y" },
  { key: "year_10", label: "10Y" },
  { key: "year_20", label: "20Y" },
  { key: "year_30", label: "30Y" },
];

function getYield(point: YieldCurvePoint, key: keyof YieldCurvePoint): number | undefined {
  const v = point[key];
  return typeof v === "number" ? v : undefined;
}

function formatBpsChange(a: number | undefined, b: number | undefined): string {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const diff = (a - b) * 100;
  return (diff >= 0 ? "+" : "") + diff.toFixed(1) + "bp";
}

export default function YieldCurvePanel() {
  const { data, isLoading } = useYieldCurve();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-[240px] w-full" />
        <Skeleton className="h-[120px] w-full" />
      </div>
    );
  }

  const points = (data ?? []).filter((p) => p.date);
  const current = points[points.length - 1];
  const prior = points.length >= 2 ? points[points.length - 2] : undefined;

  if (!current) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground font-terminal text-xs">
        No yield curve data available
      </div>
    );
  }

  const yields = TENORS.map((t) => getYield(current, t.key)).filter((y): y is number => y != null && Number.isFinite(y));
  const priorYields = prior ? TENORS.map((t) => getYield(prior, t.key)).filter((y): y is number => y != null && Number.isFinite(y)) : [];

  const allYields = [...yields, ...priorYields];
  const minY = Math.floor(Math.min(...allYields) * 10) / 10 - 0.2;
  const maxY = Math.ceil(Math.max(...allYields) * 10) / 10 + 0.2;
  const range = maxY - minY || 1;

  const W = 600, H = 240;
  const PAD = { top: 24, right: 16, bottom: 36, left: 52 };
  const CX = W - PAD.left - PAD.right;
  const CY = H - PAD.top - PAD.bottom;

  const xPos = (i: number) => PAD.left + (i / (TENORS.length - 1)) * CX;
  const yPos = (v: number) => PAD.top + CY - ((v - minY) / range) * CY;

  const gridLines = 5;

  const linePath = (pts: number[], dashed: boolean) => {
    const segments = pts.map((v, i) => {
      const x = xPos(i);
      const y = yPos(v);
      const cmd = i === 0 ? "M" : "L";
      return `${cmd}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return segments.join(" ");
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 font-terminal text-xs space-y-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[260px]" preserveAspectRatio="xMidYMid meet">
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = PAD.top + (i / gridLines) * CY;
            const val = (maxY - (i / gridLines) * range).toFixed(2);
            return (
              <g key={`grid-${i}`}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9" fontFamily="monospace">{val}%</text>
              </g>
            );
          })}

          {TENORS.map((t, i) => (
            <text key={t.key} x={xPos(i)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-muted-foreground" fontSize="9" fontFamily="monospace">{t.label}</text>
          ))}

          {priorYields.length === yields.length && priorYields.length > 0 && (
            <path d={linePath(priorYields, true)} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="4,3" />
          )}

          <path d={linePath(yields, false)} fill="none" className="stroke-[hsl(186,45%,55%)]" strokeWidth={2} strokeLinejoin="round" />

          {yields.map((v, i) => (
            <circle key={i} cx={xPos(i)} cy={yPos(v)} r="3" className="fill-[hsl(186,45%,55%)]" stroke="#0d0d0d" strokeWidth={1} />
          ))}
        </svg>

        <div className="border border-border/50">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-bold tracking-wider">TENOR</th>
                <th className="text-right px-3 py-1.5 font-bold tracking-wider">YIELD</th>
                <th className="text-right px-3 py-1.5 font-bold tracking-wider">CHANGE</th>
              </tr>
            </thead>
            <tbody>
              {TENORS.map((t) => {
                const y = getYield(current, t.key);
                const p = prior ? getYield(prior, t.key) : undefined;
                const bps = formatBpsChange(y, p);
                const isUp = bps.startsWith("+");
                const isDown = bps.startsWith("-");
                return (
                  <tr key={t.key} className="border-b border-border/30 hover:bg-white/5">
                    <td className="px-3 py-1.5 text-muted-foreground font-bold">{t.label}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${y != null ? "text-foreground" : "text-muted-foreground"}`}>
                      {y != null ? y.toFixed(2) + "%" : "—"}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-bold ${isUp ? "text-up" : isDown ? "text-down" : "text-muted-foreground"}`}>
                      {bps}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-[9px] text-muted-foreground flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-px bg-[hsl(186,45%,55%)] inline-block" />
            Current
          </span>
          {prior && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px border-t border-dashed border-current inline-block opacity-50" />
              Prior
            </span>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
