import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DataStatusBadge from "@/components/data/DataStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatBig } from "@/lib/finance";
import { useOptions } from "@/lib/useFinance";
import type { OptionsContract } from "@/lib/useFinance";
import type { ViewMode } from "@/lib/terminalTypes";

interface Props {
  symbol: string;
  onNav: (v: ViewMode) => void;
}

export default function OptionsPanel({ symbol, onNav }: Props) {
  const { data, isLoading, error } = useOptions(symbol);

  const contracts = data?.contracts ?? [];
  const underlyingPrice = data?.underlyingPrice;

  const expirations = useMemo(
    () => Array.from(new Set(contracts.map((o) => o.expiration))).sort(),
    [contracts]
  );

  const [selectedExp, setSelectedExp] = useState<string | null>(null);
  const expToShow = selectedExp ?? expirations[0];

  const rows = useMemo(() => {
    if (!expToShow) return [];
    return contracts.filter((o) => o.expiration === expToShow);
  }, [contracts, expToShow]);

  const strikes = useMemo(() => {
    const m: Record<number, { call?: OptionsContract; put?: OptionsContract }> = {};
    for (const r of rows) {
      m[r.strike] = m[r.strike] ?? {};
      if (r.optionType === "call") m[r.strike].call = r;
      else m[r.strike].put = r;
    }
    return Object.entries(m)
      .map(([k, v]) => ({ strike: Number(k), ...v }))
      .sort((a, b) => a.strike - b.strike);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="h-full p-6 space-y-4">
        <Skeleton className="h-8 w-64 bg-border" />
        <Skeleton className="h-32 w-full bg-border" />
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-400 font-terminal text-sm">{(error as Error).message}</div>;
  }

  if (!expirations.length) {
    return <div className="p-6 font-terminal text-muted-foreground text-sm">No options data for {symbol}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center gap-3 px-4 py-3 border-b border-border/50 bg-[#060606]">
        <span className="font-terminal text-[10px] text-cyan-300 shrink-0 tracking-wider">EXPIRATION</span>
        <Select value={expToShow} onValueChange={setSelectedExp}>
          <SelectTrigger className="w-[160px] h-8 text-xs bg-[#0a0a0a] border-border/30">
            <SelectValue placeholder="Select expiration" />
          </SelectTrigger>
          <SelectContent>
            {expirations.slice(0, 20).map((e) => (
              <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
          <span>UNDERLYING</span>
          <span className="text-foreground font-bold tabular-nums">${formatPrice(underlyingPrice ?? 0)}</span>
          <span>·</span>
          <span>{strikes.length} strikes</span>
          {data?.status && <DataStatusBadge status={data.status} />}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-auto">
        <ScrollArea className="h-full">
          <table className="w-full text-[10px] font-terminal">
            <thead className="sticky top-0 bg-[#060606] border-b border-border">
              <tr className="border-b border-border/50">
                <th colSpan={5} className="text-center text-green-400 border-l border-border/30 py-1">CALLS</th>
                <th className="text-center text-cyan-300 bg-[#0a0a0a] py-1 font-bold">STRIKE</th>
                <th colSpan={5} className="text-center text-red-400 border-r border-border/30 py-1">PUTS</th>
              </tr>
              <tr className="text-muted-foreground">
                <th className="text-right px-1 py-0.5">OI</th>
                <th className="text-right px-1 py-0.5">VOL</th>
                <th className="text-right px-1 py-0.5">IV</th>
                <th className="text-right px-1 py-0.5">BID</th>
                <th className="text-right px-1 py-0.5">ASK</th>
                <th className="text-center px-1 py-0.5 font-bold">$</th>
                <th className="text-right px-1 py-0.5">BID</th>
                <th className="text-right px-1 py-0.5">ASK</th>
                <th className="text-right px-1 py-0.5">IV</th>
                <th className="text-right px-1 py-0.5">VOL</th>
                <th className="text-right px-1 py-0.5">OI</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map(({ strike, call, put }) => {
                const itmCall = underlyingPrice != null && strike <= underlyingPrice;
                const itmPut = underlyingPrice != null && strike >= underlyingPrice;
                const itmBg = "bg-cyan-600/5";

                return (
                  <tr key={strike} className="border-b border-border/20 hover:bg-white/5">
                    <td className={`text-right px-1 py-0.5 text-muted-foreground ${itmCall ? itmBg : ""}`}>
                      {call?.openInterest != null ? formatBig(call.openInterest) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-muted-foreground ${itmCall ? itmBg : ""}`}>
                      {call?.volume != null ? formatBig(call.volume) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 ${itmCall ? itmBg : ""}`}>
                      {call?.impliedVolatility != null ? `${(call.impliedVolatility * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-green-400 ${itmCall ? itmBg : ""}`}>
                      {call?.bid != null ? formatPrice(call.bid) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-green-400 ${itmCall ? itmBg : ""}`}>
                      {call?.ask != null ? formatPrice(call.ask) : "—"}
                    </td>

                    <td className={`text-center px-1 py-0.5 text-cyan-300 font-bold tabular-nums ${itmCall || itmPut ? itmBg : ""}`}>
                      {formatPrice(strike)}
                    </td>

                    <td className={`text-right px-1 py-0.5 text-red-400 ${itmPut ? itmBg : ""}`}>
                      {put?.bid != null ? formatPrice(put.bid) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-red-400 ${itmPut ? itmBg : ""}`}>
                      {put?.ask != null ? formatPrice(put.ask) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 ${itmPut ? itmBg : ""}`}>
                      {put?.impliedVolatility != null ? `${(put.impliedVolatility * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-muted-foreground ${itmPut ? itmBg : ""}`}>
                      {put?.volume != null ? formatBig(put.volume) : "—"}
                    </td>
                    <td className={`text-right px-1 py-0.5 text-muted-foreground ${itmPut ? itmBg : ""}`}>
                      {put?.openInterest != null ? formatBig(put.openInterest) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>

      <div className="px-4 py-2 border-t border-border/50 bg-[#060606] flex items-center justify-between">
        <span className="font-terminal text-[9px] text-muted-foreground">HIGHLIGHTED ROWS = IN THE MONEY</span>
        <div className="flex gap-2 text-[10px]">
          <button onClick={() => onNav("intel")} className="px-2 py-1 border border-border/50 hover:border-cyan-600 hover:text-cyan-300 text-muted-foreground tracking-wider transition-colors">
            INTEL
          </button>
          <button onClick={() => onNav("chart")} className="px-2 py-1 border border-border/50 hover:border-cyan-600 hover:text-cyan-300 text-muted-foreground tracking-wider transition-colors">
            CHART
          </button>
        </div>
      </div>
    </div>
  );
}
