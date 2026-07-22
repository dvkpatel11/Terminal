import type { ReactNode } from "react";
import type { Signal } from "@/lib/signals";
import { tally } from "@/lib/signals";
import PanelSection from "./PanelSection";
import SignalRow from "./SignalRow";

interface Props {
  title: string;
  signals: Signal[];
  extra?: ReactNode;
}

export default function SignalGroup({ title, signals, extra }: Props) {
  const t = tally(signals);
  return (
    <PanelSection
      title={title}
      badge={
        <div className="flex items-center gap-1 font-mono text-[9px]">
          <span className="text-green-400">{t.bull}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-cyan-300">{t.neutral}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-red-400">{t.bear}</span>
        </div>
      }
    >
      {signals.map((s, i) => (
        <SignalRow key={i} signal={s} />
      ))}
      {extra}
    </PanelSection>
  );
}
