"use client";

import React, { memo, useMemo, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { tilt3d } from "./tilt-3d";

type TradeLike = {
  id: number;
  symbol: string;
  action: string;
  entry_price: number;
  current_price: number;
  tp_price: number;
  amount_usd: number;
  status: string;
  created_at: string;
};

type Props = {
  openTrades: TradeLike[];
  tradeHistory: TradeLike[];
  droppedCount: number;
  connected: boolean;
};

type Fill = {
  id: string;
  symbol: string;
  pnl: number;
  pct: number;
  t: number;
  open: boolean;
};

const RANGES = [
  { id: "1h", label: "1H", ms: 3_600_000 },
  { id: "6h", label: "6H", ms: 21_600_000 },
  { id: "24h", label: "24H", ms: 86_400_000 },
  { id: "7d", label: "7D", ms: 604_800_000 },
] as const;

const W = 600;
const H = 160;

function toFill(t: TradeLike, open: boolean): Fill | null {
  const time = Date.parse(t.created_at);
  if (Number.isNaN(time)) return null;
  const entry = Number(t.entry_price);
  const exit = Number(open ? t.current_price : t.current_price || t.tp_price);
  const amount = Number(t.amount_usd) || 0;
  const short = /SELL|SHORT/i.test(String(t.action));
  const pct = entry > 0 && exit > 0 ? ((exit - entry) / entry) * (short ? -1 : 1) : 0;
  return { id: `${open ? "o" : "h"}-${t.id}`, symbol: t.symbol, pnl: pct * amount, pct, t: time, open };
}

function money(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function ago(t: number, now: number) {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="tilt3d pop3d rounded-xl border border-border bg-secondary px-3 py-2.5" {...tilt3d(7)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-base font-bold ${
          tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TraderPnl({ openTrades, tradeHistory, droppedCount, connected }: Props) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("24h");
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    const ms = RANGES.find((r) => r.id === range)!.ms;
    const start = now - ms;
    const fills = [
      ...tradeHistory.map((t) => toFill(t, false)),
      ...openTrades.map((t) => toFill(t, true)),
    ]
      .filter((f): f is Fill => f !== null && f.t >= start)
      .sort((a, b) => a.t - b.t);

    const realized = fills.filter((f) => !f.open).reduce((s, f) => s + f.pnl, 0);
    const unrealized = fills.filter((f) => f.open).reduce((s, f) => s + f.pnl, 0);
    const total = realized + unrealized;
    const invested = fills.reduce((s, f) => {
      const trade = [...tradeHistory, ...openTrades].find((x) => `${f.open ? "o" : "h"}-${x.id}` === f.id);
      return s + (Number(trade?.amount_usd) || 0);
    }, 0);
    const closed = fills.filter((f) => !f.open);
    const wins = closed.filter((f) => f.pnl > 0).length;

    let run = 0;
    const points = [{ t: start, v: 0 }, ...fills.map((f) => ({ t: f.t, v: (run += f.pnl) })), { t: now, v: total }];
    return { now, start, fills, realized, unrealized, total, invested, closed: closed.length, wins, points };
  }, [range, openTrades, tradeHistory]);

  const { fills, points, start, now, total } = data;
  const hasData = fills.length > 0;
  const up = total >= 0;

  const geometry = useMemo(() => {
    const values = points.map((p) => p.v);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (max - min < 0.01) {
      max += 1;
      min -= 1;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const x = (t: number) => ((t - start) / (now - start)) * W;
    const y = (v: number) => H - ((v - min) / (max - min)) * H;
    let d = `M ${x(points[0].t)} ${y(points[0].v)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${x(points[i].t)} ${y(points[i - 1].v)} L ${x(points[i].t)} ${y(points[i].v)}`;
    }
    const area = `${d} L ${W} ${y(0)} L 0 ${y(0)} Z`;
    return { d, area, x, y, zeroY: y(0), min, max };
  }, [points, start, now]);

  const hoverPoint = useMemo(() => {
    if (hover === null || !hasData) return null;
    const t = start + hover * (now - start);
    let idx = 0;
    for (let i = 0; i < points.length; i++) if (points[i].t <= t) idx = i;
    return { ...points[idx], t, xPct: hover * 100, yPct: (geometry.y(points[idx].v) / H) * 100 };
  }, [hover, hasData, points, start, now, geometry]);

  const color = up ? "text-emerald-400" : "text-rose-400";
  const stroke = up ? "hsl(160 84% 45%)" : "hsl(350 89% 60%)";
  const pctReturn = data.invested > 0 ? (total / data.invested) * 100 : 0;
  const recent = [...fills].reverse().slice(0, 5);

  return (
    <section aria-label="Profit and loss" className="tilt3d rounded-2xl border border-border bg-card p-4" {...tilt3d(1.5)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Profit &amp; loss, last {RANGES.find((r) => r.id === range)!.label}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span key={total.toFixed(2)} className={`tr-tick font-mono text-3xl font-semibold tracking-tight ${hasData ? color : "text-foreground"}`}>
              {hasData ? money(total) : "$0.00"}
            </span>
            {hasData && (
              <span className={`inline-flex items-center gap-1 font-mono text-xs ${color}`}>
                {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {pctReturn >= 0 ? "+" : ""}
                {pctReturn.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div role="group" aria-label="Time range" className="flex gap-2 pb-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`tilt3d pop3d rounded-lg border px-3 py-1.5 text-sm font-bold ${
                range === r.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              {...tilt3d(10)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Closed trades" value={hasData ? money(data.realized) : "$0.00"} tone={hasData ? (data.realized >= 0 ? "up" : "down") : undefined} />
        <Stat label="Still open" value={hasData ? money(data.unrealized) : "$0.00"} tone={hasData ? (data.unrealized >= 0 ? "up" : "down") : undefined} />
        <Stat label="Win rate" value={data.closed > 0 ? `${Math.round((data.wins / data.closed) * 100)}%` : "--"} />
        <Stat label="Trades / skipped" value={`${fills.length} / ${droppedCount}`} />
      </div>

      <div className="relative mt-3 h-40 select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full touch-none"
          role="img"
          aria-label={hasData ? `Cumulative profit and loss chart, currently ${money(total)}` : "Empty profit and loss chart"}
          onPointerMove={(e) => {
            if (!hasData) return;
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="currentColor" className="text-border" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={geometry.zeroY} y2={geometry.zeroY} stroke="currentColor" className="text-muted-foreground/50" vectorEffect="non-scaling-stroke" />
          {hasData && (
            <g key={`${range}-${fills.length}`}>
              <path d={geometry.area} fill="url(#pnl-fill)" className="tr-pop" />
              <path
                d={geometry.d}
                fill="none"
                stroke={stroke}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                vectorEffect="non-scaling-stroke"
                className="tr-draw"
              />
            </g>
          )}
        </svg>

        {hasData && (
          <>
            <span className="pointer-events-none absolute left-1 text-[10px] font-mono text-muted-foreground" style={{ top: `${(geometry.zeroY / H) * 100}%`, transform: "translateY(-120%)" }}>
              $0
            </span>
            {fills.map((f) => {
              const v = points.find((p) => p.t === f.t)?.v ?? 0;
              return (
                <span
                  key={f.id}
                  title={`${f.symbol} ${money(f.pnl)}`}
                  className={`pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-card ${f.pnl >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                  style={{ left: `${(geometry.x(f.t) / W) * 100}%`, top: `${(geometry.y(v) / H) * 100}%` }}
                />
              );
            })}
          </>
        )}

        {hoverPoint && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-primary/50" style={{ left: `${hoverPoint.xPct}%` }} />
            <span
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 font-mono text-[11px] text-foreground shadow-lg"
              style={{ left: `${Math.min(88, Math.max(12, hoverPoint.xPct))}%`, top: 0 }}
            >
              <span className={hoverPoint.v >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(hoverPoint.v)}</span>
              <span className="text-muted-foreground"> &middot; {new Date(hoverPoint.t).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</span>
            </span>
          </>
        )}

        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-center">
            <span className="tr-sweep absolute inset-y-4 left-0 w-1/3 bg-primary/10 blur-xl" aria-hidden />
            <p className="relative text-sm font-medium text-foreground">
              {connected ? "Waiting for the first trade" : "Connect your wallet to track profit"}
            </p>
            <p className="relative max-w-xs text-xs text-muted-foreground text-pretty">
              {connected
                ? `No trades in the last ${RANGES.find((r) => r.id === range)!.label}. The line draws itself here as soon as the agent trades.`
                : "Once connected, every trade the agent makes shows up here."}
            </p>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Latest trades">
          {recent.map((f) => (
            <li
              key={f.id}
              className="tilt3d pop3d flex shrink-0 items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-sm"
              {...tilt3d(8)}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${f.pnl >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
              <span className="font-semibold text-foreground">{f.symbol}</span>
              <span className={`font-mono ${f.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(f.pnl)}</span>
              <span className="text-muted-foreground">{f.open ? "open" : ago(f.t, data.now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(TraderPnl);
