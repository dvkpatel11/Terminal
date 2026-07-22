import { cn } from "@/lib/utils";
import type { SignalLevel } from "@/lib/signals";

interface Props {
  level: SignalLevel;
  className?: string;
}

const dotColor: Record<SignalLevel, string> = {
  bull: "bg-green-500",
  bear: "bg-red-500",
  neutral: "bg-amber-500",
  na: "bg-muted",
};

export default function SignalDot({ level, className }: Props) {
  return <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor[level], className)} />;
}
