import { RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export default function QueryErrorFallback({ label = "Data", error, onRetry, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full p-6 text-center", className)}>
      <div className="w-9 h-9 rounded-full bg-negative/10 flex items-center justify-center mb-3">
        <AlertTriangle className="w-4 h-4 text-negative" />
      </div>
      <h3 className="font-terminal text-data-sm font-semibold text-foreground/80 tracking-wider">
        {label} unavailable
      </h3>
      <p className="mt-1 font-terminal text-data-xs text-muted-foreground/60 max-w-[280px]">
        {error?.message || "Failed to load data. Check your connection."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 font-terminal text-data-xs tracking-wider text-market border border-market/30 hover:bg-market/10 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          RETRY
        </button>
      )}
    </div>
  );
}
