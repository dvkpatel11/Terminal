import { RefreshCw } from "lucide-react";

interface Props {
  title?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export default function PanelErrorFallback({ title = "Something went wrong", error, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
        <span className="text-destructive text-lg">!</span>
      </div>
      <h3 className="font-terminal text-sm font-semibold text-foreground/80 tracking-wider">{title}</h3>
      {error?.message && (
        <p className="mt-1.5 font-terminal text-[10px] text-muted-foreground/60 max-w-[300px]">
          {error.message}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 font-terminal text-[10px] tracking-wider text-[hsl(186,45%,55%)] border border-[hsl(186,45%,55%)]/30 hover:bg-[hsl(186,45%,50%)]/10 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          RETRY
        </button>
      )}
    </div>
  );
}
