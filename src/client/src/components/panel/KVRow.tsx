import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

export default function KVRow({ label, value, valueClassName }: Props) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className={cn("kv-value", valueClassName)}>{value}</span>
    </div>
  );
}
