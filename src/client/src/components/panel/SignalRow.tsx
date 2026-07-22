import { cn } from "@/lib/utils";
import type { Signal } from "@/lib/signals";
import SignalDot from "./SignalDot";

interface Props {
  signal: Signal;
  className?: string;
}

const levelText: Record<string, string> = {
  bull: "text-green-400",
  bear: "text-red-400",
  neutral: "text-cyan-300",
  na: "text-muted-foreground",
};

export default function SignalRow({ signal, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2 py-1", className)}>
      <SignalDot level={signal.level} />
      <span className={cn("flex-1 text-xs", levelText[signal.level])}>
        {signal.label}
      </span>
      {signal.detail && (
        <span className="text-xs text-muted-foreground font-mono tabular-nums">{signal.detail}</span>
      )}
    </div>
  );
}
