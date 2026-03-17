import type { DataStatus } from "@/lib/finance";

interface Props {
  status: DataStatus;
  compact?: boolean;
  showAsOf?: boolean;
}

function getStatusClass(status: DataStatus) {
  switch (status.freshness) {
    case "current":
      return "text-up border-[hsl(142,71%,45%)]/30";
    case "reference":
      return "text-muted-foreground border-border";
    case "feed":
    case "schedule":
    case "snapshot":
      return "text-[hsl(38,95%,55%)] border-[hsl(38,95%,55%)]/30";
    case "daily":
    case "delayed":
    default:
      return "text-[hsl(38,95%,55%)] border-[hsl(38,95%,55%)]/30";
  }
}

function getFreshnessLabel(status: DataStatus) {
  switch (status.freshness) {
    case "current":
      return "CURRENT";
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
      return "SNAPSHOT";
    default:
      return status.delayLabel.toUpperCase();
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

export default function DataStatusBadge({ status, compact = false, showAsOf = false }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`font-terminal border px-1.5 py-0.5 ${compact ? "text-[8px]" : "text-[9px]"} ${getStatusClass(status)}`}>
        {getFreshnessLabel(status)} · {status.provider.toUpperCase()}
      </span>
      {showAsOf && status.asOf && (
        <span className={`font-terminal text-muted-foreground ${compact ? "text-[8px]" : "text-[9px]"}`}>
          AS OF {formatAsOf(status.asOf)}
        </span>
      )}
      {compact && !showAsOf && (
        <span className="font-terminal text-[8px] text-muted-foreground">{status.delayLabel.toUpperCase()}</span>
      )}
    </div>
  );
}
