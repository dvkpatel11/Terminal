import { useEconomics } from "@/lib/useFinance";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// Simulated historical yield curve data
const YIELD_CURVE = [
  { term: "1M", yield: 5.28 },
  { term: "3M", yield: 5.32 },
  { term: "6M", yield: 5.25 },
  { term: "1Y", yield: 5.09 },
  { term: "2Y", yield: 4.89 },
  { term: "3Y", yield: 4.76 },
  { term: "5Y", yield: 4.65 },
  { term: "7Y", yield: 4.60 },
  { term: "10Y", yield: 4.52 },
  { term: "20Y", yield: 4.68 },
  { term: "30Y", yield: 4.72 },
];

function EconCard({ label, value, prev, unit }: { label: string; value: number; prev: number; unit: string }) {
  const chg = value - prev;
  const isUp = chg > 0;
  return (
    <div className="bg-[#080808] border border-border p-3 hover:border-[hsl(38,95%,50%)/40%] transition-colors">
      <div className="font-terminal text-[9px] tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className="font-terminal text-xl font-bold tabular-nums text-foreground">
        {unit === "$" ? `$${value.toFixed(2)}` : `${value.toFixed(2)}${unit}`}
      </div>
      <div className={`font-terminal text-[10px] tabular-nums mt-0.5 ${isUp ? "text-up" : "text-down"}`}>
        {isUp ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}{unit} vs prior
      </div>
    </div>
  );
}

export default function EconomicsPanel() {
  const { data: econ, isLoading } = useEconomics();

  const fxPairs = [
    { pair: "EUR/USD", bid: 1.0820, ask: 1.0822, chg: -0.0130 },
    { pair: "GBP/USD", bid: 1.2648, ask: 1.2650, chg: -0.0132 },
    { pair: "USD/JPY", bid: 149.78, ask: 149.82, chg: 1.60 },
    { pair: "USD/CHF", bid: 0.8890, ask: 0.8892, chg: 0.0050 },
    { pair: "AUD/USD", bid: 0.6520, ask: 0.6522, chg: -0.0038 },
    { pair: "USD/CAD", bid: 1.3620, ask: 1.3622, chg: 0.0080 },
    { pair: "NZD/USD", bid: 0.6040, ask: 0.6042, chg: -0.0025 },
    { pair: "USD/CNY", bid: 7.2480, ask: 7.2490, chg: 0.0120 },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#050505]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[#070707] sticky top-0 z-10">
        <Globe2 className="w-4 h-4 text-[hsl(38,95%,55%)]" />
        <span className="panel-label">MACRO ECONOMICS</span>
        <span className="font-terminal text-[9px] text-muted-foreground ml-2">MARCH 2026</span>
      </div>

      <div className="p-4 space-y-6">
        {/* US Macro Indicators */}
        <section>
          <div className="panel-label mb-3">US MACRO INDICATORS</div>
          {isLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 bg-border" />)}
            </div>
          ) : econ && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <EconCard label={econ.gdp.label} value={econ.gdp.value} prev={econ.gdp.prev} unit="%" />
              <EconCard label={econ.cpi.label} value={econ.cpi.value} prev={econ.cpi.prev} unit="%" />
              <EconCard label={econ.unemployment.label} value={econ.unemployment.value} prev={econ.unemployment.prev} unit="%" />
              <EconCard label={econ.fedFunds.label} value={econ.fedFunds.value} prev={econ.fedFunds.prev} unit="%" />
            </div>
          )}
        </section>

        {/* Yield Curve */}
        <section>
          <div className="panel-label mb-3">US TREASURY YIELD CURVE</div>
          <div className="bg-[#080808] border border-border p-4">
            <div className="flex items-center gap-4 mb-3">
              {econ && (
                <>
                  <div className="font-terminal text-[9px]">
                    <span className="text-muted-foreground">2Y: </span>
                    <span className="text-foreground">{econ.t2y.value}%</span>
                  </div>
                  <div className="font-terminal text-[9px]">
                    <span className="text-muted-foreground">10Y: </span>
                    <span className="text-foreground">{econ.t10y.value}%</span>
                  </div>
                  <div className="font-terminal text-[9px]">
                    <span className="text-muted-foreground">30Y: </span>
                    <span className="text-foreground">{econ.t30y.value}%</span>
                  </div>
                  <div className="font-terminal text-[9px]">
                    <span className="text-muted-foreground">SPREAD (10Y-2Y): </span>
                    <span className={econ.t10y.value - econ.t2y.value < 0 ? "text-down" : "text-up"}>
                      {((econ.t10y.value - econ.t2y.value) * 100).toFixed(0)}bps
                    </span>
                  </div>
                </>
              )}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={YIELD_CURVE} margin={{ top: 4, right: 4, bottom: 4, left: 32 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(0,0%,12%)" />
                <XAxis dataKey="term" tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} />
                <YAxis domain={[4, 5.5]} tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fill: "hsl(0,0%,45%)" }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1) + "%"} />
                <Tooltip
                  contentStyle={{ background: "#0d0d0d", border: "1px solid hsl(0,0%,13%)", fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}
                  formatter={(v: any) => [`${v}%`, "Yield"]}
                />
                <Line type="monotone" dataKey="yield" stroke="hsl(38,95%,55%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(38,95%,55%)", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-6">
          {/* FX Rates */}
          <section>
            <div className="panel-label mb-3">FX RATES</div>
            <div className="bg-[#080808] border border-border">
              <div className="grid grid-cols-4 px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
                <span>PAIR</span><span className="text-right">BID</span><span className="text-right">ASK</span><span className="text-right">CHG</span>
              </div>
              {fxPairs.map(fx => (
                <div key={fx.pair} className="grid grid-cols-4 px-3 py-2 border-b border-border/50 hover:bg-white/5">
                  <span className="font-terminal text-[11px] font-bold text-[hsl(186,80%,55%)]">{fx.pair}</span>
                  <span className="font-terminal text-[10px] tabular-nums text-right">{fx.bid.toFixed(4)}</span>
                  <span className="font-terminal text-[10px] tabular-nums text-right text-muted-foreground">{fx.ask.toFixed(4)}</span>
                  <span className={`font-terminal text-[10px] tabular-nums text-right ${fx.chg >= 0 ? "text-up" : "text-down"}`}>
                    {fx.chg >= 0 ? "+" : ""}{fx.chg.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Commodities */}
          <section>
            <div className="panel-label mb-3">COMMODITIES</div>
            <div className="bg-[#080808] border border-border">
              <div className="grid grid-cols-3 px-3 py-1.5 border-b border-border font-terminal text-[8px] text-muted-foreground">
                <span>COMMODITY</span><span className="text-right">PRICE</span><span className="text-right">CHG%</span>
              </div>
              {[
                { name: "GOLD", price: 2985.50, unit: "$/oz", chg: 0.8 },
                { name: "SILVER", price: 32.40, unit: "$/oz", chg: -0.5 },
                { name: "WTI CRUDE", price: 68.40, unit: "$/bbl", chg: -2.1 },
                { name: "BRENT", price: 72.10, unit: "$/bbl", chg: -1.8 },
                { name: "NAT GAS", price: 2.85, unit: "$/MMBtu", chg: 3.2 },
                { name: "COPPER", price: 4.15, unit: "$/lb", chg: 0.4 },
                { name: "WHEAT", price: 524, unit: "¢/bu", chg: -1.1 },
                { name: "CORN", price: 418, unit: "¢/bu", chg: 0.7 },
              ].map(c => (
                <div key={c.name} className="grid grid-cols-3 px-3 py-2 border-b border-border/50 hover:bg-white/5">
                  <span className="font-terminal text-[11px] font-bold text-[hsl(38,95%,55%)]">{c.name}</span>
                  <span className="font-terminal text-[10px] tabular-nums text-right">{c.price.toLocaleString()}</span>
                  <span className={`font-terminal text-[10px] tabular-nums text-right ${c.chg >= 0 ? "text-up" : "text-down"}`}>
                    {c.chg >= 0 ? "▲" : "▼"}{Math.abs(c.chg)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
