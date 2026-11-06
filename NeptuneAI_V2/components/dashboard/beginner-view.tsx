"use client";

import React, { memo, useMemo, useState } from "react";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentAvatar } from "@/components/agent-avatars";
import { tilt3d } from "@/components/agent-sections/trader/tilt-3d";
import {
  AGENT_INFO,
  AGENT_ORDER,
  NEGATIVE,
  POSITIVE,
  PRIMARY,
  WARNING,
  buildCurve,
  computeStats,
  fmtUsd,
  type AgentKey,
  type DashboardData,
  type HelpTopic,
} from "./dashboard-types";
import { AskModeratorButton, chartTooltipStyle, EmptyState, Panel, StatusPill } from "./dashboard-ui";

type Props = {
  data: DashboardData;
  loading: boolean;
  onAsk: (topic: HelpTopic) => void;
  onOpenAgent: (agent: AgentKey) => void;
};

const GLOSSARY = [
  { term: "Drift", text: "How far your holdings have moved from the mix you chose. A small drift is normal." },
  { term: "Take profit", text: "A price where the agent sells to lock in a gain, so you do not give it back." },
  { term: "Stop loss", text: "A price where the agent sells to limit a loss before it grows." },
  { term: "Confidence", text: "How sure the agent is about a signal. Higher means it saw more evidence." },
  { term: "Kill switch", text: "A big stop button. When on, no agent can make a move until you turn it off." },
];

const ALLOCATION_COLORS = [PRIMARY, POSITIVE, WARNING, "hsl(190 80% 55%)", "hsl(280 60% 65%)", "hsl(0 0% 60%)"];

function HowToRead({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <HelpCircle size={15} />
        {open ? "Hide the explanation" : "How do I read this?"}
      </button>
      {open && <p className="mt-2 rounded-xl bg-secondary/50 p-3 text-sm leading-relaxed text-foreground/90 text-pretty">{children}</p>}
    </div>
  );
}

const AgentTile = memo(function AgentTile({
  agent,
  data,
  onOpen,
}: {
  agent: AgentKey;
  data: DashboardData;
  onOpen: (agent: AgentKey) => void;
}) {
  const status = data.fleet?.agents?.[agent];
  const killed = Boolean(data.fleet?.kill_switch_active);
  const info = AGENT_INFO[agent];
  return (
    <div className="tilt3d flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" {...tilt3d(4)}>
      <div className="flex items-center gap-3">
        <AgentAvatar agentId={agent} size={40} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <h3 className="text-base font-semibold text-foreground">{info.label}</h3>
          <StatusPill active={Boolean(status?.is_active)} killed={killed} />
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{info.job}</p>
      <div className="rounded-xl bg-secondary/50 px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{status?.metric_label || "Latest"}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground text-pretty">{status?.metric_value || status?.summary || "No activity yet"}</p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(agent)}
        className="key3d mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
      >
        Open {info.label}
        <ArrowRight size={15} />
      </button>
    </div>
  );
});

export default function BeginnerView({ data, loading, onAsk, onOpenAgent }: Props) {
  const stats = useMemo(() => computeStats(data.trades), [data.trades]);
  const curve = useMemo(() => buildCurve(stats.fills, null), [stats.fills]);
  const allocations = useMemo(
    () =>
      Object.entries(data.strategy?.allocations ?? {})
        .map(([name, value]) => ({ name, value: Number(value) }))
        .filter((a) => Number.isFinite(a.value) && a.value > 0),
    [data.strategy],
  );
  const openCount = data.trades?.open_trades?.length ?? 0;
  const closed = stats.wins + stats.losses;

  const headline =
    stats.fills.length === 0
      ? "Your agents have not placed any trades yet. Once they do, you will see how they are doing here."
      : `Your trades are ${stats.totalPnl >= 0 ? "up" : "down"} ${fmtUsd(Math.abs(stats.totalPnl))} so far, with ${openCount} still open${
          stats.winRate !== null ? ` and ${stats.winRate.toFixed(0)}% of closed trades in profit` : ""
        }.`;

  const winLoss = [
    { name: "Made money", value: stats.wins, color: POSITIVE },
    { name: "Lost money", value: stats.losses, color: NEGATIVE },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Summary" className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">In plain words</p>
        <p className="mt-1.5 text-xl font-semibold leading-snug text-foreground text-balance sm:text-2xl">{headline}</p>
        <div className="mt-4">
          <AskModeratorButton topic="overview" onAsk={onAsk} label="Explain this to me" />
        </div>
      </section>

      <section aria-label="Your agents">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Meet your team</h2>
        <p className="mb-3 text-sm text-muted-foreground">Four agents work together. Open any one to change how it behaves.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AGENT_ORDER.map((a) => (
            <AgentTile key={a} agent={a} data={data} onOpen={onOpenAgent} />
          ))}
        </div>
      </section>

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Is my money growing?"
          subtitle="Total profit or loss, adding up trade by trade."
          action={<AskModeratorButton topic="profit" onAsk={onAsk} />}
          className="lg:col-span-2"
        >
          <div className="h-64">
            {curve.length < 2 ? (
              <EmptyState title="Not enough trades to draw a line" hint="After a couple of trades, your profit line will appear here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bgProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={32} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => fmtUsd(Number(v))} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [fmtUsd(Number(v)), "Total so far"]} />
                  <Area type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2.5} fill="url(#bgProfit)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <HowToRead>
            Each point is your running total after a trade. A line going up means your agents are making money. A line going down means they are losing it. Ups and downs along the way are normal, so look at the overall direction.
          </HowToRead>
        </Panel>

        <Panel
          title="How often do trades win?"
          subtitle="Closed trades that made money compared with ones that lost."
          action={<AskModeratorButton topic="profit" onAsk={onAsk} />}
        >
          <div className="h-56">
            {closed === 0 ? (
              <EmptyState title="No finished trades yet" hint="This fills in once a trade closes at its take-profit or stop-loss." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={winLoss} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none" isAnimationActive={false}>
                    {winLoss.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {closed > 0 && (
            <p className="mt-1 text-center text-sm text-muted-foreground">
              <span className="font-semibold text-emerald-400">{stats.wins} won</span> and <span className="font-semibold text-rose-400">{stats.losses} lost</span>
            </p>
          )}
          <HowToRead>
            Winning more than half the time is nice, but size matters too. A few big wins can beat many small losses, so also check the profit line above.
          </HowToRead>
        </Panel>

        <Panel
          title="Where is my money?"
          subtitle="The mix your Portfolio agent is aiming for."
          action={<AskModeratorButton topic="drift" onAsk={onAsk} />}
        >
          <div className="h-56">
            {allocations.length === 0 ? (
              <EmptyState title="No target mix yet" hint="Open the Portfolio agent and pick your coins to see your mix here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocations} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {allocations.map((a, i) => (
                      <Cell key={a.name} fill={ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(0)}%`, "Share"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {allocations.length > 0 && (
            <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {allocations.map((a, i) => (
                <li key={a.name} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} aria-hidden="true" />
                  {a.name} {a.value.toFixed(0)}%
                </li>
              ))}
            </ul>
          )}
          <HowToRead>
            Spreading money across several coins lowers the damage if one of them drops. When prices move, your real mix drifts from this plan and the Portfolio agent nudges it back.
          </HowToRead>
        </Panel>
      </section>

      <Panel title="Words you will see" subtitle="Tap a word for a one-line meaning.">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {GLOSSARY.map((g) => (
            <details key={g.term} className="group rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">{g.term}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{g.text}</p>
            </details>
          ))}
        </div>
      </Panel>

      {loading && <p className="text-center text-sm text-muted-foreground">Loading your latest data...</p>}
    </div>
  );
}
