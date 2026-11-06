"use client";

import { memo, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact, fmtPrice, type BookLevel, type FlowResponse } from "@/lib/market/market";

type Tab = "book" | "trades" | "depth";

const TABS: { id: Tab; label: string }[] = [
  { id: "book", label: "Order book" },
  { id: "trades", label: "Live trades" },
  { id: "depth", label: "Depth" },
];

const UP = "#34d399";
const DOWN = "#fb7185";

function withTotals(levels: BookLevel[]) {
  let total = 0;
  return levels.map((l) => {
    total += l.size;
    return { ...l, total };
  });
}

const Book = memo(function Book({ bids, asks }: Pick<FlowResponse, "bids" | "asks">) {
  const rows = 12;
  const askRows = useMemo(() => withTotals(asks.slice(0, rows)).reverse(), [asks]);
  const bidRows = useMemo(() => withTotals(bids.slice(0, rows)), [bids]);
  const max = Math.max(askRows[0]?.total ?? 0, bidRows[bidRows.length - 1]?.total ?? 0, 1);
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : null;
  const spreadPct = spread !== null && bids[0] ? (spread / bids[0].price) * 100 : null;

  const renderRow = (r: BookLevel & { total: number }, color: string, bar: string) => (
    <li key={`${r.price}`} className="relative flex items-center justify-between px-3 py-[3px] font-mono text-xs tabular-nums">
      <span className="absolute inset-y-0 right-0" style={{ width: `${(r.total / max) * 100}%`, background: bar }} aria-hidden="true" />
      <span className="relative font-semibold" style={{ color }}>{fmtPrice(r.price)}</span>
      <span className="relative text-foreground/80">{fmtCompact(r.size)}</span>
      <span className="relative w-16 text-right text-muted-foreground">{fmtCompact(r.total)}</span>
    </li>
  );

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex justify-between px-3 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Price (USD)</span>
        <span>Size</span>
        <span className="w-16 text-right">Total</span>
      </div>
      <ul className="flex flex-col">{askRows.map((r) => renderRow(r, DOWN, "rgba(251,113,133,0.12)"))}</ul>
      <div className="my-1 flex items-center justify-between border-y border-border bg-secondary/40 px-3 py-1.5 font-mono tabular-nums">
        <span className="text-muted-foreground">Spread</span>
        <span className="font-semibold text-foreground">{spread !== null ? `${fmtPrice(spread)} (${spreadPct?.toFixed(3)}%)` : "-"}</span>
      </div>
      <ul className="flex flex-col">{bidRows.map((r) => renderRow(r, UP, "rgba(52,211,153,0.12)"))}</ul>
    </div>
  );
});

const Trades = memo(function Trades({ trades }: Pick<FlowResponse, "trades">) {
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex justify-between px-3 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="w-16">Time</span>
        <span>Price</span>
        <span className="w-16 text-right">Size</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-live="off">
        {trades.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-3 py-[3px] font-mono tabular-nums">
            <span className="w-16 text-muted-foreground">{new Date(t.time).toLocaleTimeString([], { hour12: false })}</span>
            <span className="font-semibold" style={{ color: t.side === "buy" ? UP : DOWN }}>{fmtPrice(t.price)}</span>
            <span className="w-16 text-right text-foreground/80">{fmtCompact(t.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

const Depth = memo(function Depth({ bids, asks }: Pick<FlowResponse, "bids" | "asks">) {
  const data = useMemo(() => {
    const b = withTotals(bids).reverse().map((l) => ({ price: l.price, bid: l.total, ask: null as number | null }));
    const a = withTotals(asks).map((l) => ({ price: l.price, bid: null as number | null, ask: l.total }));
    return [...b, ...a];
  }, [bids, asks]);
  const bidTotal = bids.reduce((s, l) => s + l.size, 0);
  const askTotal = asks.reduce((s, l) => s + l.size, 0);
  const buyShare = bidTotal + askTotal > 0 ? (bidTotal / (bidTotal + askTotal)) * 100 : 50;

  return (
    <div className="flex h-full flex-col gap-3 px-1">
      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtPrice(Number(v))} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={36} />
            <YAxis orientation="right" tickFormatter={(v) => fmtCompact(Number(v))} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={42} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)" }}
              labelFormatter={(v) => `Price ${fmtPrice(Number(v))}`}
              formatter={(v: number, name) => [fmtCompact(v), name === "bid" ? "Bids" : "Asks"]}
            />
            <Area type="stepAfter" dataKey="bid" stroke={UP} fill={UP} fillOpacity={0.18} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
            <Area type="stepBefore" dataKey="ask" stroke={DOWN} fill={DOWN} fillOpacity={0.18} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="px-2 pb-1">
        <div className="mb-1 flex justify-between text-[11px] font-semibold">
          <span className="text-emerald-400">{`Buy pressure ${buyShare.toFixed(0)}%`}</span>
          <span className="text-rose-400">{`${(100 - buyShare).toFixed(0)}% Sell`}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-rose-400/60" role="img" aria-label={`Buy pressure ${buyShare.toFixed(0)} percent of visible depth`}>
          <div className="bg-emerald-400 transition-[width] duration-500" style={{ width: `${buyShare}%` }} />
        </div>
      </div>
    </div>
  );
});

export default function OrderFlow({ flow, loading }: { flow: FlowResponse | undefined; loading: boolean }) {
  const [tab, setTab] = useState<Tab>("book");
  const empty = !flow || (flow.bids.length === 0 && flow.asks.length === 0);

  return (
    <div className="flex h-full min-h-[420px] flex-col xl:h-auto xl:min-h-0 xl:flex-1">
      <div role="tablist" aria-label="Order flow" className="mb-3 grid grid-cols-3 rounded-xl border border-border bg-background p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 xl:overflow-y-auto" role="tabpanel">
        {loading && empty ? (
          <div className="flex flex-col gap-1.5" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-secondary/50" />
            ))}
          </div>
        ) : empty ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No live order flow for this market.</p>
        ) : tab === "book" ? (
          <Book bids={flow.bids} asks={flow.asks} />
        ) : tab === "trades" ? (
          <Trades trades={flow.trades} />
        ) : (
          <Depth bids={flow.bids} asks={flow.asks} />
        )}
      </div>
    </div>
  );
}
