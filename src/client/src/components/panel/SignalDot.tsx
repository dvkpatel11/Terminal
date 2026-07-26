import { cn } from "@/lib/utils";
import type { SignalLevel } from "@shared/signals";

interface Props {
  level: SignalLevel;
  className?: string;
}

const dotColor: Record<SignalLevel, string> = {
  bull: "bg-positive",
  bear: "bg-negative",
  neutral: "bg-market",
  na: "bg-muted",
};

export default function SignalDot({ level, className }: Props) {
  return <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor[level], className)} />;
}
