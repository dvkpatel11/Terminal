import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  badge?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

export default function PanelSection({ title, badge, className, contentClassName, children }: Props) {
  return (
    <div className={cn("bg-surface-1 border border-border/50", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <span className="font-terminal text-[10px] text-muted-foreground tracking-wider">{title}</span>
        {badge}
      </div>
      <div className={cn("px-3 py-2 space-y-1", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
