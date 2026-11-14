"use client";

import React, { useMemo, useState } from "react";
import { Bar, BarChart, Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentAvatar } from "@/components/agent-avatars";
import {
  AGENT_INFO,
  AGENT_ORDER,
  NEGATIVE,
  POSITIVE,
  PRIMARY,
  buildCurve,
  computeStats,
  fmtPct,
  fmtUsd,
  pickList,
  pickNum,
  pickText,
  scoreToPct,
  tradeFill,
  type AgentKey,
  type DashboardData,
  type HelpTopic,
} from "./dashboard-types";
import { AskModeratorButton, chartTooltipStyle, EmptyState, Panel, StatTile, StatusPill } from "./dashboard-ui";

type Props = {
  data: DashboardData;
  onAsk: (topic: HelpTopic) => void;
  onOpenAgent: (agent: AgentKey) => void;
};

const RANGES = [
  { id: "1h", label: "1H", ms: 3_600_000 },
  { id: "6h", label: "6H", ms: 21_600_000 },
  { id: "24h", label: "24H", ms: 86_400_000 },
  { id: "7d", label: "7D", ms: 604_800_000 },
  { id: "all", label: "All", ms: null },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function pnlColor(n: number) {
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-foreground";
}

export default function TraderView({ data, onAsk, onOpenAgent }: Props) {
  const [range, setRange] = useState<RangeId>("24h");
  const stats = useMemo(() => computeStats(data.trades), [data.trades]);
  const rangeMs = RANGES.find((r) => r.id === range)?.ms ?? null;
  const curve = useMemo(() => buildCurve(stats.fills, rangeMs), [stats.fills, rangeMs]);
  const open = data.trades?.open_trades ?? [];
  const history = useMemo(() => [...(data.trades?.history ?? [])].reverse().slice(0, 12), [data.trades]);
  const mod = data.moderator;
  const exposure = pickNum(mod, "total_open_exposure_usd") ?? stats.exposure;
  const limit = pickNum(mod, "daily_limit_usd");
  const overall = scoreToPct(pickNum(mod, "overall_performance_score") ?? pickNum(mod, "total_mean_score"));
  const drift = data.drift?.max_drift_pct;
  const latestReport = data.reports[0];
  const allocations = Object.entries(data.strategy?.allocations ?? {}).filter(([, v]) => Number(v) > 0);
  const killed = Boolean(data.fleet?.kill_switch_active);
  const conflicts = pickList(mod, "cross_agent_conflicts");
  const verdict = pickText(mod, "verdict");

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Net P/L" value={fmtUsd(stats.totalPnl)} tone={stats.totalPnl > 0 ? "good" : stats.totalPnl < 0 ? "bad" : "neutral"} sub={`${fmtUsd(stats.realizedPnl)} realized`} />
        <StatTile label="Win rate" value={stats.winRate === null ? "n/a" : `${stats.winRate.toFixed(0)}%`} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatTile label="Open exposure" value={fmtUsd(exposure)} sub={limit ? `of ${fmtUsd(limit)} daily limit` : `${open.length} open`} tone={limit && exposure / limit > 0.8 ? "warn" : "neutral"} />
        <StatTile label="Open positions" value={String(open.length)} sub={`${fmtUsd(stats.unrealizedPnl)} unrealized`} />
        <StatTile label="Portfolio drift" value={drift === undefined ? "n/a" : `${drift.toFixed(1)}%`} sub={data.drift?.status || "vs target mix"} tone={drift !== undefined && drift > 10 ? "warn" : "neutral"} />
        <StatTile label="Fleet score" value={overall === null ? "n/a" : `${Math.round(overall)}/100`} sub={killed ? "Kill switch ON" : "Moderator rating"} tone={killed ? "bad" : "neutral"} />
      </section>

      <section aria-label="Performance" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Equity curve"
          subtitle="Cumulative profit and loss"
          className="xl:col-span-2"
          action={
            <div role="radiogroup" aria-label="Time range" className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={range === r.id}
                  onClick={() => setRange(r.id)}
                  className={`key3d rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    range === r.id ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-64">
            {curve.length < 2 ? (
              <EmptyState title="Not enough fills in this range" hint="Try a wider range, or wait for the Trader to place more trades." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={36} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmtUsd(Number(v))} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [fmtUsd(Number(v)), "Cumulative P/L"]} />
                  <Area type="stepAfter" dataKey="value" stroke={PRIMARY} strokeWidth={2} fill="url(#trEquity)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="P/L by symbol" subtitle="Which coins carry your result" action={<AskModeratorButton topic="profit" onAsk={onAsk} label="Why?" />}>
          <div className="h-64">
            {stats.bySymbol.length === 0 ? (
              <EmptyState title="No symbols yet" hint="Symbols appear after the first trade." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.bySymbol.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtUsd(Number(v))} />
                  <YAxis type="category" dataKey="symbol" tick={{ fill: "var(--foreground)", fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [fmtUsd(Number(v)), "P/L"]} cursor={{ fill: "var(--secondary)" }} />
                  <Bar dataKey="pnl" radius={4} isAnimationActive={false}>
                    {stats.bySymbol.slice(0, 8).map((s) => (
                      <Cell key={s.symbol} fill={s.pnl >= 0 ? POSITIVE : NEGATIVE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </section>

      <section aria-label="Positions" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Open positions" subtitle={`${open.length} live`} className="xl:col-span-2" action={<AskModeratorButton topic="trader" onAsk={onAsk} label="Ask" />}>
          {open.length === 0 ? (
            <EmptyState title="No open positions" hint="The Trader opens positions when a setup passes your confidence and safety limits." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Symbol</Th>
                    <Th>Side</Th>
                    <Th right>Size</Th>
                    <Th right>Entry</Th>
                    <Th right>Now</Th>
                    <Th right>P/L</Th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((t) => {
                    const f = tradeFill(t, true);
                    return (
                      <tr key={t.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2.5 font-semibold text-foreground">{t.symbol}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.action}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtUsd(f.amount)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{Number(t.entry_price).toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{Number(t.current_price).toFixed(4)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${pnlColor(f.pnl)}`}>
                          {fmtUsd(f.pnl)} <span className="text-xs">({fmtPct(f.pct)})</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Fleet status" subtitle={killed ? "Kill switch is ON" : "Live agent health"} action={<AskModeratorButton topic="overview" onAsk={onAsk} label="Ask" />}>
          <ul className="flex flex-col gap-3">
            {AGENT_ORDER.map((a) => {
              const s = data.fleet?.agents?.[a];
              const pct = Math.max(0, Math.min(100, s?.activity_pct ?? 0));
              return (
                <li key={a}>
                  <button
                    type="button"
                    onClick={() => onOpenAgent(a)}
                    className="key3d flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3 text-left"
                  >
                    <AgentAvatar agentId={a} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{AGENT_INFO[a].label}</span>
                        <StatusPill active={Boolean(s?.is_active)} killed={killed} />
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {a === "trader" && s?.max_trades_day !== undefined ? `${s.today_trades ?? 0}/${s.max_trades_day} trades today` : s?.metric_value || s?.summary || "No data"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>

      <section aria-label="Intelligence" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Recent closed trades" subtitle="Newest first" className="xl:col-span-1">
          {history.length === 0 ? (
            <EmptyState title="No closed trades" hint="Closed trades are listed here with their result." />
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {history.map((t) => {
                const f = tradeFill(t, false);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{t.symbol}</span>
                      <span className="block text-xs text-muted-foreground">{t.action} · {fmtUsd(f.amount)}</span>
                    </span>
                    <span className={`font-mono text-sm tabular-nums ${pnlColor(f.pnl)}`}>
                      {fmtUsd(f.pnl)} <span className="text-xs">({fmtPct(f.pct)})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Moderator verdict" subtitle="Cross-agent review" action={<AskModeratorButton topic="overview" onAsk={onAsk} label="Ask" />}>
          {verdict || mod ? (
            <div className="flex flex-col gap-3">
              {verdict && <p className="text-lg font-semibold text-foreground">{verdict}</p>}
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{pickText(mod, "verdict_rationale") || pickText(mod, "fleet_summary") || "No written verdict yet."}</p>
              {conflicts.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-amber-400">Conflicts</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {conflicts.slice(0, 3).map((c, i) => (
                      <li key={i} className="text-sm leading-relaxed text-foreground/90">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pickList(mod, "recommended_tuning").slice(0, 3).map((t, i) => (
                <p key={i} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm leading-relaxed text-foreground/90">{t}</p>
              ))}
            </div>
          ) : (
            <EmptyState title="No review yet" hint="Run a review from Ask Moderator to get a verdict." />
          )}
        </Panel>

        <Panel title="Research and allocation" subtitle="Signals feeding your agents" action={<AskModeratorButton topic="research" onAsk={onAsk} label="Ask" />}>
          <div className="flex flex-col gap-4">
            {latestReport ? (
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-foreground text-pretty">{latestReport.title}</p>
                {latestReport.actionable_signal && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {latestReport.actionable_signal.action} {latestReport.actionable_signal.target_asset} · {Math.round(latestReport.actionable_signal.confidence)}% confidence
                  </p>
                )}
                {latestReport.regime && <p className="mt-0.5 text-xs text-muted-foreground">Regime: {latestReport.regime}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No research reports yet.</p>
            )}
            {allocations.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {allocations.map(([name, v]) => (
                  <li key={name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-foreground">{name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{Number(v).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Number(v))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No target allocation set.</p>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
