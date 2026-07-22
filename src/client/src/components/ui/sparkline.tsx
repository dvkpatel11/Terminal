interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Sparkline({ data, width = 60, height = 20, color, strokeWidth = 1.5 }: Props) {
  if (!data.length) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  const last = data[data.length - 1];
  const first = data[0];
  const isUp = last >= first;
  const isFlat = last === first;
  const strokeColor = color ?? (isFlat ? "hsl(186,45%,50%)" : isUp ? "hsl(142,71%,45%)" : "hsl(0,80%,55%)");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        points={points}
      />
    </svg>
  );
}
