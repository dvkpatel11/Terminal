import { useMemo } from "react";
import { Calendar, AlertTriangle, TrendingUp, TrendingDown, Clock, Building2, Landmark } from "lucide-react";
import { useUnifiedCalendar, type CalendarDay, type UnifiedCalendarEvent } from "@/lib/useFinance";

interface Props {
  onSymbol?: (sym: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  economic: { icon: Landmark, color: "text-blue-400", bg: "bg-blue-500/10" },
  fed: { icon: Landmark, color: "text-purple-400", bg: "bg-purple-500/10" },
  earnings: { icon: Building2, color: "text-green-400", bg: "bg-green-500/10" },
  dividend: { icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  split: { icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/10" },
};

const RISK_COLORS = {
  high: "border-l-red-500 bg-red-500/5",
  medium: "border-l-amber-500 bg-amber-500/5",
  low: "border-l-border bg-transparent",
  none: "border-l-transparent bg-transparent",
};

const RISK_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/30",
  none: "bg-transparent",
};

function EventRow({ event, onSymbol }: { event: UnifiedCalendarEvent; onSymbol?: (s: string) => void }) {
  const config = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.economic;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-white/[0.02] group">
      <div className={`w-5 h-5 flex items-center justify-center rounded ${config.bg}`}>
        <Icon size={10} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.symbol && (
            <button
              onClick={() => onSymbol?.(event.symbol!)}
              className="font-terminal text-[10px] font-bold text-primary hover:underline"
            >
              {event.symbol}
            </button>
          )}
          <span className="font-terminal text-[10px] truncate">{event.title}</span>
        </div>
        {event.previous && (
          <span className="text-[9px] text-muted-foreground/50">Prev: {event.previous}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {event.importance === "high" && (
          <AlertTriangle size={8} className="text-red-400" />
        )}
        <span className={`text-[8px] px-1 py-0.5 rounded ${
          event.importance === "high" ? "bg-red-500/20 text-red-400" :
          event.importance === "medium" ? "bg-amber-500/20 text-amber-400" :
          "bg-muted/20 text-muted-foreground"
        }`}>
          {event.importance.toUpperCase()}
        </span>
        <span className="text-[9px] text-muted-foreground/40">{event.source}</span>
      </div>
    </div>
  );
}

function DayCard({ day, onSymbol }: { day: CalendarDay; onSymbol?: (s: string) => void }) {
  const isToday = day.dayLabel === "Today";
  const isTomorrow = day.dayLabel === "Tomorrow";

  return (
    <div className={`border border-border/50 border-l-2 ${RISK_COLORS[day.riskLevel]} ${
      isToday ? "ring-1 ring-primary/30" : ""
    }`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        <div className={`w-2 h-2 rounded-full ${RISK_DOT[day.riskLevel]}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-terminal text-[11px] font-bold ${isToday ? "text-primary" : isTomorrow ? "text-cyan-400" : "text-foreground"}`}>
              {day.dayLabel}
            </span>
            <span className="text-[9px] text-muted-foreground/40">{day.date}</span>
          </div>
        </div>
        <span className="font-terminal text-[9px] text-muted-foreground/40 tabular-nums">
          {day.events.length} event{day.events.length !== 1 ? "s" : ""}
        </span>
      </div>
      {day.events.length > 0 ? (
        <div className="divide-y divide-border/20">
          {day.events.map(event => (
            <EventRow key={event.id} event={event} onSymbol={onSymbol} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-center text-[9px] text-muted-foreground/30">No events</div>
      )}
    </div>
  );
}

export default function CalendarPanel({ onSymbol }: Props) {
  const { data: calendar, isLoading } = useUnifiedCalendar(14);

  const riskSummary = useMemo(() => {
    if (!calendar) return null;
    const high = calendar.days.filter(d => d.riskLevel === "high").length;
    const medium = calendar.days.filter(d => d.riskLevel === "medium").length;
    return { high, medium };
  }, [calendar]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[hsl(38,30%,55%)]" />
          <span className="panel-label">INVESTMENT CALENDAR</span>
        </div>
        {riskSummary && (
          <div className="flex items-center gap-3 text-[9px] tabular-nums">
            {riskSummary.high > 0 && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle size={9} /> {riskSummary.high} HIGH RISK
              </span>
            )}
            {riskSummary.medium > 0 && (
              <span className="text-amber-400">{riskSummary.medium} MEDIUM</span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
            Loading calendar...
          </div>
        ) : !calendar ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground/50 text-xs">
            No calendar data
          </div>
        ) : (
          calendar.days.map(day => (
            <DayCard key={day.date} day={day} onSymbol={onSymbol} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-[#070707] shrink-0 text-[9px] text-muted-foreground/40">
        <span>{calendar?.days.length ?? 0} days | {calendar?.highRiskDates.length ?? 0} high-risk</span>
        <span className="tabular-nums">{calendar?.days[0]?.date ?? ""} → {calendar?.days[calendar?.days.length ?? 1 - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}
