"use client";

import React, { useEffect, useState } from "react";
import { Activity, Loader2, Power, Radar, Scale, ShieldAlert, Sparkles } from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";
import { AGENT_INFO, AGENT_ORDER, type AgentKey, type DashboardData } from "./dashboard-types";
import type { DashboardActions } from "./use-dashboard-data";
import { Panel } from "./dashboard-ui";

type Props = {
  data: DashboardData;
  actions: DashboardActions;
  deliberating: boolean;
  onReview: () => void;
  onOpenAgent: (agent: AgentKey) => void;
};

function ConfirmButton({
  label,
  confirmLabel,
  busy,
  disabled,
  onConfirm,
  icon,
  tone = "default",
  description,
}: {
  label: string;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  icon: React.ReactNode;
  tone?: "default" | "danger";
  description?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const base =
    tone === "danger"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
      : "border-border bg-secondary text-foreground hover:border-primary/40";

  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={`key3d flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
        armed ? "border-amber-500/60 bg-amber-500/15 text-amber-200" : base
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{armed ? confirmLabel : label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug opacity-80">{armed ? "Click again within 4 seconds" : description}</span>}
      </span>
    </button>
  );
}

function AgentSwitch({
  agent,
  active,
  killed,
  busy,
  onToggle,
  onOpen,
  metric,
}: {
  agent: AgentKey;
  active: boolean;
  killed: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
  metric: string;
}) {
  const label = AGENT_INFO[agent].label;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-2.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${label}`}>
        <AgentAvatar agentId={agent} size={34} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{metric}</span>
        </span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${label} is ${active ? "active" : "on standby"}`}
        disabled={busy || killed}
        onClick={() => onToggle(!active)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          active && !killed ? "border-primary/60 bg-primary" : "border-border bg-secondary"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-foreground shadow transition-transform ${
            active && !killed ? "translate-x-5" : "translate-x-0"
          }`}
          style={{ height: 18, width: 18 }}
        >
          {busy && <Loader2 size={10} className="animate-spin text-background" />}
        </span>
      </button>
    </li>
  );
}

export default function CommandCenter({ data, actions, deliberating, onReview, onOpenAgent }: Props) {
  const killed = Boolean(data.fleet?.kill_switch_active);
  const { pending } = actions;

  return (
    <Panel
      title="Command center"
      subtitle="Control your whole fleet from here. Risky actions ask you to confirm first."
      action={
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            killed ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${killed ? "bg-rose-400" : "animate-pulse bg-emerald-400"}`} aria-hidden="true" />
          {killed ? "Fleet stopped" : "Fleet running"}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents</h3>
          <ul className="flex flex-col gap-2">
            {AGENT_ORDER.map((agent) => {
              const s = data.fleet?.agents?.[agent];
              return (
                <AgentSwitch
                  key={agent}
                  agent={agent}
                  active={Boolean(s?.is_active)}
                  killed={killed}
                  busy={pending === `agent-${agent}`}
                  onToggle={(next) => actions.toggleAgent(agent, next)}
                  onOpen={() => onOpenAgent(agent)}
                  metric={s?.metric_value || s?.summary || "No activity yet"}
                />
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run now</h3>
          <ConfirmButton
            label="Scan the market"
            confirmLabel="Confirm: run Trader scan"
            description="Trader looks for a setup using your saved settings"
            icon={<Radar size={18} aria-hidden="true" />}
            busy={pending === "scan"}
            disabled={killed}
            onConfirm={actions.scanMarket}
          />
          <ConfirmButton
            label="Check drift and rebalance"
            confirmLabel="Confirm: evaluate portfolio"
            description="Rebalances only if drift is above 5%"
            icon={<Scale size={18} aria-hidden="true" />}
            busy={pending === "drift"}
            disabled={killed}
            onConfirm={actions.checkDrift}
          />
          <button
            type="button"
            onClick={onReview}
            disabled={deliberating}
            className="key3d flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-3 text-left text-primary disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
              {deliberating ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{deliberating ? "Moderator is reviewing..." : "Run Moderator review"}</span>
              <span className="mt-0.5 block text-xs leading-snug opacity-80">Scores all agents and checks for conflicts</span>
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Safety</h3>
          <ConfirmButton
            label={killed ? "Release kill switch" : "Emergency stop"}
            confirmLabel={killed ? "Confirm: resume agents" : "Confirm: stop all agents"}
            description={killed ? "Let your agents trade again" : "Pause every agent immediately"}
            icon={<Power size={18} aria-hidden="true" />}
            tone={killed ? "default" : "danger"}
            busy={pending === "kill"}
            onConfirm={() => actions.toggleKillSwitch(!killed)}
          />
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3.5">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              The Moderator can also pause the fleet by itself if the fleet score drops under your auto-pause limit. Tune it in Risk controls below.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3.5">
            <Activity size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              Every action you take here is saved to the activity feed so you always know what changed.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
