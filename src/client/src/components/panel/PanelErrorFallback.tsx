import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export default function PanelErrorFallback({ title = "Something went wrong", error, onRetry, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full p-8 text-center", className)}>
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
        <span className="text-destructive text-lg">!</span>
      </div>
      <h3 className="font-terminal text-sm font-semibold text-foreground/80 tracking-wider">{title}</h3>
      {error?.message && (
        <p className="mt-1.5 font-terminal text-data-xs text-muted-foreground/60 max-w-[300px]">
          {error.message}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 font-terminal text-data-xs tracking-wider text-market border border-market/30 hover:bg-market/10 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          RETRY
        </button>
      )}
    </div>
  );
}
