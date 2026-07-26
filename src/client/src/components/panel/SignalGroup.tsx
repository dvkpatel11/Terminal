import type { ReactNode } from "react";
import type { Signal } from "@shared/signals";
import { tally } from "@shared/signals";
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
        <div className="flex items-center gap-1 font-terminal text-data-xs">
          <span className="text-positive">{t.bull}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-market">{t.neutral}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-negative">{t.bear}</span>
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
