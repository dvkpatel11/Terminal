import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full p-8 text-center", className)}>
      <div className="mb-3 text-muted-foreground/30">
        {icon ?? <Inbox className="w-10 h-10" />}
      </div>
      <h3 className="font-terminal text-sm font-semibold text-foreground/80 tracking-wider">{title}</h3>
      {description && (
        <p className="mt-1.5 font-terminal text-[11px] text-muted-foreground/60 max-w-[280px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
