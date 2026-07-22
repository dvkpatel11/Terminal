import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  extra?: string;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}

export default function PanelShell({ label, extra, className, headerClassName, children, headerRight }: Props) {
  return (
    <div className={cn("panel-shell", className)}>
      <div className={cn("panel-header", headerClassName)}>
        <span className="panel-label">{label}</span>
        {extra && <span className="font-terminal text-[9px] text-muted-foreground">{extra}</span>}
        {headerRight}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
