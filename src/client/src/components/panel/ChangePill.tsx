import { cn } from "@/lib/utils";
import { formatPrice, formatPct, formatChange, pctClass } from "@/lib/finance";

interface Props {
  change: number;
  changePercent: number;
  showAbsolute?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function ChangePill({ change, changePercent, showAbsolute = false, size = "md", className }: Props) {
  const cls = pctClass(changePercent);
  const sizes = {
    sm: "text-[9px]",
    md: "text-[10px]",
    lg: "text-sm",
  };

  return (
    <span className={cn("font-terminal tabular-nums inline-flex items-center gap-1", sizes[size], cls, className)}>
      {showAbsolute ? (
        <>{formatChange(change)} ({formatPct(changePercent)})</>
      ) : (
        <>{formatPct(changePercent)}</>
      )}
    </span>
  );
}
