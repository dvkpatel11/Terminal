import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

export default function StatusBar() {
  const { data: health } = useApiHealth();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <footer className="flex items-center justify-between h-6 px-3 bg-gradient-to-b from-[#0a0a0a] to-[#070707] border-t border-border/40 shrink-0 font-terminal text-[9px] tracking-[0.12em] shadow-[0_-1px_2px_rgba(0,0,0,0.3)] relative z-10">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${health?.ok ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]"}`} />
          <span className={health?.ok ? "text-green-400/90" : "text-red-400/90"}>
            {health?.ok ? "LIVE" : "DOWN"}
          </span>
        </div>

        {health?.latency != null && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <span className="text-muted-foreground/40 tabular-nums shrink-0">{health.latency}ms</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="text-muted-foreground/60 tabular-nums tracking-wide shrink-0 ml-1">{timeStr}</div>
      </div>
    </footer>
  );
}
