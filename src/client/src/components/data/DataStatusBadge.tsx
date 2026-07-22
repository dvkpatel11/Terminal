import { useEffect, useState } from "react";
import type { DataStatus } from "@/lib/finance";

interface Props {
  status: DataStatus;
  compact?: boolean;
  showAsOf?: boolean;
  /** Show a relative "updated Xs ago" stamp instead of the absolute timestamp. */
  relative?: boolean;
}

function getLedColor(freshness: DataStatus["freshness"]) {
  switch (freshness) {
    case "current":
      return "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]";
    case "delayed":
    case "daily":
      return "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]";
    case "feed":
    case "schedule":
    case "snapshot":
      return "bg-cyan-500 shadow-[0_0_4px_rgba(6,182,212,0.5)]";
    case "reference":
    default:
      return "bg-muted-foreground/40";
  }
}

function getLabel(freshness: DataStatus["freshness"]) {
  switch (freshness) {
    case "current":
      return "LIVE";
    case "delayed":
      return "DELAYED";
    case "daily":
      return "DAILY";
    case "reference":
      return "REF";
    case "feed":
      return "FEED";
    case "schedule":
      return "SCHEDULE";
    case "snapshot":
      return "SNAP";
    default:
      return String(freshness).toUpperCase();
  }
}

function formatAsOf(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function useRelativeAsOf(iso?: string): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DataStatusBadge({ status, compact = false, showAsOf = false, relative = false }: Props) {
  const ledSize = compact ? "w-1.5 h-1.5" : "w-2 h-2";
  const textSize = compact ? "text-[8px]" : "text-[9px]";

  const relativeText = useRelativeAsOf(relative ? status.asOf ?? undefined : undefined);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-1">
        <span className={`${ledSize} rounded-full shrink-0 ${getLedColor(status.freshness)}`} />
        <span className={`font-terminal text-muted-foreground/70 ${textSize}`}>
          {getLabel(status.freshness)}
        </span>
        <span className={`font-terminal text-muted-foreground/40 ${textSize}`}>
          {status.provider.toUpperCase()}
        </span>
      </div>
      {relative && relativeText && (
        <span className={`font-terminal text-muted-foreground/50 ${textSize}`}>
          {relativeText}
        </span>
      )}
      {showAsOf && !relative && status.asOf && (
        <span className={`font-terminal text-muted-foreground/50 ${textSize}`}>
          {formatAsOf(status.asOf)}
        </span>
      )}
    </div>
  );
}
