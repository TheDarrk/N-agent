"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtPrice, type Ticker } from "@/lib/market/market";

type Props = {
  tickers: Ticker[];
  selected: string;
  onSelect: (symbol: string) => void;
};

export default function MarketMovers({ tickers, selected, onSelect }: Props) {
  const data = useMemo(
    () => [...tickers].sort((a, b) => b.changePct - a.changePct).map((t) => ({ symbol: t.symbol, change: Number(t.changePct.toFixed(2)), price: t.price, volume: t.quoteVolume })),
    [tickers],
  );
  const advancers = data.filter((d) => d.change > 0).length;
  const breadth = data.length > 0 ? (advancers / data.length) * 100 : 50;

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Waiting for live prices...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)" }}
              formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}%`, "24h"]}
              labelFormatter={(label, items) => {
                const p = items?.[0]?.payload as { price: number; volume: number } | undefined;
                return p ? `${label}  ${fmtPrice(p.price)}  · Vol ${fmtCompact(p.volume)}` : String(label);
              }}
            />
            <Bar dataKey="change" radius={[4, 4, 4, 4]} onClick={(d) => onSelect((d as unknown as { symbol: string }).symbol)} cursor="pointer" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.symbol} fill={d.change >= 0 ? "#34d399" : "#fb7185"} fillOpacity={d.symbol === selected ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs font-semibold">
          <span className="text-emerald-400">{`${advancers} up`}</span>
          <span className="text-muted-foreground">Market breadth</span>
          <span className="text-rose-400">{`${data.length - advancers} down`}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-rose-400/60" role="img" aria-label={`${advancers} of ${data.length} watched markets are up`}>
          <div className="bg-emerald-400 transition-[width] duration-500" style={{ width: `${breadth}%` }} />
        </div>
      </div>
    </div>
  );
}
