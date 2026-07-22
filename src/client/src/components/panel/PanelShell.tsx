import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  extra?: string;
  className?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}

export default function PanelShell({ label, extra, className, children, headerRight }: Props) {
  return (
    <div className={cn("panel-shell", className)}>
      <header className="panel-header">
        <span className="panel-label">{label}</span>
        {extra && <span className="ml-2 text-data-xs text-muted-foreground">{extra}</span>}
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
