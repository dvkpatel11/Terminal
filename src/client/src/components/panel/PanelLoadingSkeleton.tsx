import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  rows?: number;
  hasHeader?: boolean;
  className?: string;
}

export default function PanelLoadingSkeleton({ rows = 8, hasHeader = true, className }: Props) {
  return (
    <div className={`p-4 space-y-3 ${className ?? ""}`}>
      {hasHeader && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 bg-border" />
          <Skeleton className="h-4 w-32 bg-border" />
        </div>
      )}
      <div className="space-y-2">
        {Array(rows)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-8 w-full bg-border" />
          ))}
      </div>
    </div>
  );
}
