"use client";

import React, { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Gauge, GraduationCap, Info, RefreshCw, X, XCircle } from "lucide-react";
import { ModeratorAgentAvatar } from "@/components/agent-avatars";
import BeginnerView from "@/components/dashboard/beginner-view";
import TraderView from "@/components/dashboard/trader-view";
import ModeratorHelp from "@/components/dashboard/moderator-help";
import CommandCenter from "@/components/dashboard/command-center";
import ActivityFeed from "@/components/dashboard/activity-feed";
import RiskControls from "@/components/dashboard/risk-controls";
import MarketTerminal from "@/components/market/market-terminal";
import { SafetyBlocks, TraderBrain, TraderSetup } from "@/components/dashboard/intelligence-panels";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { computeStats, fmtUsd, type AgentKey, type HelpTopic } from "@/components/dashboard/dashboard-types";

type Mode = "beginner" | "trader";

type Props = {
  accountId: string | null;
  onSelectAgentTab: (agentId: string) => void;
};

const MODES: { id: Mode; label: string; hint: string; Icon: typeof Gauge }[] = [
  { id: "beginner", label: "Beginner", hint: "Learn as you go", Icon: GraduationCap },
  { id: "trader", label: "Trader", hint: "Pro terminal", Icon: Gauge },
];

function initialMode(): Mode {
  if (typeof window === "undefined") return "beginner";
  return new URLSearchParams(window.location.search).get("mode") === "trader" ? "trader" : "beginner";
}

export default function AgentDashboard({ accountId, onSelectAgentTab }: Props) {
  const { data, loading, offline, updatedAt, refresh, runDeliberation, deliberating, actions } = useDashboardData(accountId);
  const stats = useMemo(() => computeStats(data.trades), [data.trades]);
  const killed = Boolean(data.fleet?.kill_switch_active);
  const activeAgents = Object.values(data.fleet?.agents ?? {}).filter((a) => a?.is_active).length;
  const notice = actions.notice;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [helpOpen, setHelpOpen] = useState(false);
  const [topic, setTopic] = useState<HelpTopic>("overview");

  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const ask = useCallback((t: HelpTopic) => {
    setTopic(t);
    setHelpOpen(true);
  }, []);

  const openAgent = useCallback((agent: AgentKey) => onSelectAgentTab(agent), [onSelectAgentTab]);
  const isTrader = mode === "trader";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`mx-auto space-y-5 px-4 py-6 md:px-8 ${isTrader ? "max-w-[1500px]" : "max-w-6xl"}`}>
        <header className="rise-in relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-xl md:p-7">
          <div className="dash-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground text-balance md:text-3xl">Dashboard</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    killed ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${killed ? "bg-rose-400" : "animate-pulse bg-emerald-400"}`} aria-hidden="true" />
                  {killed ? "Stopped" : `${activeAgents} of 4 agents active`}
                </span>
              </div>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
                {isTrader
                  ? "Every trade, signal and verdict from all four agents in one place."
                  : "See what your agents are doing, learn what the charts mean, and ask the Moderator anything."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => ask("overview")}
                  className="key3d inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-3.5 py-2 text-sm font-semibold text-primary"
                >
                  <ModeratorAgentAvatar size={22} />
                  Ask Moderator for help
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="key3d inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground"
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
                {updatedAt && <span className="text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
              </div>
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Net P/L</dt>
                  <dd className={`font-mono text-lg font-semibold tabular-nums ${stats.totalPnl > 0 ? "text-emerald-400" : stats.totalPnl < 0 ? "text-rose-400" : "text-foreground"}`}>
                    {fmtUsd(stats.totalPnl)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Open trades</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-foreground">{data.trades?.open_trades?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Win rate</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums text-foreground">
                    {stats.winRate === null ? "n/a" : `${stats.winRate.toFixed(0)}%`}
                  </dd>
                </div>
              </dl>
            </div>

            <div
              role="radiogroup"
              aria-label="Dashboard style"
              className="relative grid shrink-0 grid-cols-2 rounded-2xl border border-border bg-background p-1.5 shadow-inner"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl bg-primary shadow-lg shadow-primary/30 transition-transform duration-300 ease-out"
                style={{ transform: isTrader ? "translateX(100%)" : "translateX(0)" }}
              />
              {MODES.map(({ id, label, hint, Icon }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => changeMode(id)}
                    className={`relative z-10 flex min-w-36 items-center gap-2.5 rounded-xl px-4 py-2.5 text-left transition-colors ${
                      active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-bold leading-tight">{label}</span>
                      <span className="block text-xs leading-tight opacity-80">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {!accountId && (
          <p className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            You are viewing guest data. Connect your wallet to see your own agents and trades.
          </p>
        )}
        {offline && !loading && (
          <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            The agents backend did not respond, so numbers may be empty or out of date. We will keep retrying.
          </p>
        )}

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`rise-in flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              notice.tone === "good"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : notice.tone === "bad"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-primary/30 bg-primary/10 text-foreground"
            }`}
          >
            {notice.tone === "good" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : notice.tone === "bad" ? <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <p className="flex-1 leading-relaxed">{notice.text}</p>
            <button type="button" onClick={actions.dismissNotice} aria-label="Dismiss message" className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="rise-in" style={{ animationDelay: "60ms" }}>
          <CommandCenter data={data} actions={actions} deliberating={deliberating} onReview={runDeliberation} onOpenAgent={openAgent} />
        </div>

        <div className="rise-in" style={{ animationDelay: "90ms" }}>
          <MarketTerminal data={data} />
        </div>

        <div className="rise-in" style={{ animationDelay: "120ms" }}>
          {isTrader ? (
            <TraderView data={data} onAsk={ask} onOpenAgent={openAgent} />
          ) : (
            <BeginnerView data={data} loading={loading} onAsk={ask} onOpenAgent={openAgent} />
          )}
        </div>

        <div className="rise-in grid grid-cols-1 gap-4 xl:grid-cols-2" style={{ animationDelay: "180ms" }}>
          <ActivityFeed items={data.activity} />
          <RiskControls data={data} actions={actions} />
        </div>

        {isTrader && (
          <div className="rise-in flex flex-col gap-4" style={{ animationDelay: "220ms" }}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TraderBrain data={data} />
              <SafetyBlocks data={data} />
            </div>
            <TraderSetup data={data} />
          </div>
        )}
      </div>

      <ModeratorHelp
        open={helpOpen}
        topic={topic}
        data={data}
        running={deliberating}
        onTopic={setTopic}
        onOpenChange={setHelpOpen}
        onRun={runDeliberation}
        onOpenModerator={() => {
          setHelpOpen(false);
          onSelectAgentTab("moderator");
        }}
      />
    </div>
  );
}
