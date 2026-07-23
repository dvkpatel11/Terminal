import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRealtime } from "@/lib/realtime";

function useApiHealth() {
  return useQuery<{ ok: boolean; latency: number }>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const start = Date.now();
      try {
        const res = await fetch("/api/finance/tick?symbols=SPY", { signal: AbortSignal.timeout(5000) });
        return { ok: res.ok, latency: Date.now() - start };
      } catch {
        return { ok: false, latency: Date.now() - start };
      }
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

function latencyClass(ms: number) {
  if (ms < 100) return "text-positive";
  if (ms <= 300) return "text-flat";
  return "text-negative";
}

export default function StatusBar() {
  const { data: health } = useApiHealth();
  const { connected } = useRealtime();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const isLive = health?.ok;

  return (
    <footer className="flex items-center justify-between h-6 px-3 bg-gradient-to-b from-surface-2 to-surface-1 border-t border-border/40 shrink-0 text-data-xs font-terminal tabular-nums tracking-wide shadow-[0_-1px_2px_rgba(0,0,0,0.3)] relative z-10">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-positive animate-pulse" : "bg-negative"}`} />
          <span className={isLive ? "text-positive" : "text-negative"}>
            {isLive ? "LIVE" : "DOWN"}
          </span>
        </div>

        {health?.latency != null && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <span className={`${latencyClass(health.latency)} shrink-0`}>{health.latency}ms</span>
          </>
        )}

        <span className="text-muted-foreground/30">|</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-cyan animate-pulse" : "bg-yellow-500"}`} />
          <span className={connected ? "text-cyan" : "text-yellow-500"}>
            {connected ? "WS" : "WS OFF"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="text-muted-foreground/60 shrink-0 ml-1">{timeStr}</div>
      </div>
    </footer>
  );
}
