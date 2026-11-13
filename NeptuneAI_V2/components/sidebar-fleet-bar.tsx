"use client";

import { setVisibleInterval } from "@/lib/visible-interval"
import React, { useState, useEffect } from "react";
import { AgentAvatar } from "@/components/agent-avatars";
import { Wallet, Sliders, ChevronRight, Shield } from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet: () => void;
  onOpenFleetModal: () => void;
  onOpenAgentSuite: () => void;
  onSelectAgent?: (agentId: string) => void;
};

interface AgentStatus {
  name: string;
  role: string;
  status: string;
  is_active: boolean;
  activity_pct?: number;
  summary?: string;
  today_trades?: number;
  max_trades_day?: number;
  trades_remaining_today?: number;
  metric_label?: string;
  metric_value?: string;
  metric_sub?: string;
  health_score?: number;
  dropped_trades_count?: number;
}

interface FleetResponse {
  user_wallet: string;
  kill_switch_active: boolean;
  agents: {
    trader: AgentStatus;
    rebalancer: AgentStatus;
    research: AgentStatus;
    moderator: AgentStatus;
  };
}

export default function SidebarFleetBar({
  accountId,
  onConnectWallet,
  onOpenFleetModal,
  onOpenAgentSuite,
  onSelectAgent
}: Props) {
  const [fleet, setFleet] = useState<FleetResponse | null>(null);

  useEffect(() => {
    const fetchFleet = async () => {
      const wallet = accountId || "guest.near";
      try {
        const res = await fetch(`/api/fleet/${wallet}`);
        if (res.ok) {
          const data = await res.json();
          setFleet(data);
        }
      } catch (e) {
        // silent fail
      }
    };
    fetchFleet();
    return setVisibleInterval(fetchFleet, 12000);
  }, [accountId]);

  const agents = [
    {
      id: "trader",
      name: "Quantitative Trader",
      short: "Trader",
      active: fleet?.agents?.trader?.is_active ?? false,
      metricLabel: fleet?.agents?.trader?.metric_label || "Daily capacity",
      metricValue: fleet?.agents?.trader?.metric_value || (fleet?.agents?.trader?.is_active ? `${fleet?.agents?.trader?.today_trades || 0}/${fleet?.agents?.trader?.max_trades_day || 3} today` : "Inactive"),
      metricSub: fleet?.agents?.trader?.metric_sub || `${fleet?.agents?.trader?.trades_remaining_today ?? 3} remaining`,
      summary: fleet?.agents?.trader?.summary || "Standby"
    },
    {
      id: "moderator",
      name: "Moderator",
      short: "Moderator",
      active: fleet?.agents?.moderator?.is_active ?? false,
      metricLabel: fleet?.agents?.moderator?.metric_label || "Fleet risk",
      metricValue: fleet?.agents?.moderator?.metric_value || (fleet?.agents?.moderator?.is_active ? `${fleet?.agents?.moderator?.health_score || 94}/100 health` : "Inactive"),
      metricSub: fleet?.agents?.moderator?.metric_sub || "0 violations, armed",
      summary: fleet?.agents?.moderator?.summary || "Standby"
    },
    {
      id: "research",
      name: "Deep Research & Alpha",
      short: "Research",
      active: fleet?.agents?.research?.is_active ?? false,
      metricLabel: fleet?.agents?.research?.metric_label || "Alpha intel",
      metricValue: fleet?.agents?.research?.metric_value || (fleet?.agents?.research?.is_active ? "Intel feed live" : "Inactive"),
      metricSub: fleet?.agents?.research?.metric_sub || "Autonomous Alpha",
      summary: fleet?.agents?.research?.summary || "Standby"
    },
    {
      id: "rebalancer",
      name: "Portfolio Rebalancer",
      short: "Rebalancer",
      active: fleet?.agents?.rebalancer?.is_active ?? false,
      metricLabel: fleet?.agents?.rebalancer?.metric_label || "Drift",
      metricValue: fleet?.agents?.rebalancer?.metric_value || (fleet?.agents?.rebalancer?.is_active ? "2.4% (limit 5%)" : "Inactive"),
      metricSub: fleet?.agents?.rebalancer?.metric_sub || "70% USDC / 30% NEAR",
      summary: fleet?.agents?.rebalancer?.summary || "Standby"
    },
  ];

  const activeCount = agents.filter((a) => a.active).length;

  if (!accountId) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="text-[13px] font-semibold text-foreground">Autonomous fleet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Connect a wallet to deploy and supervise four AI agents.
        </p>
        <ul className="my-4 grid grid-cols-2 gap-2">
          {agents.map((ag) => (
            <li
              key={ag.id}
              title={`${ag.name} (standby)`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-1.5 py-1.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary/80 opacity-80">
                <AgentAvatar agentId={ag.id} size={18} />
              </span>
              <span className="min-w-0 text-xs font-medium text-muted-foreground">{ag.short}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={onConnectWallet}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Wallet size={14} />
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="flex items-center justify-between px-1 pb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agent fleet</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              activeCount > 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {activeCount} of 4 active
          </span>
        </div>

        <ul className="overflow-hidden rounded-xl border border-border bg-card/50 divide-y divide-border">
          {agents.map((ag) => (
            <li key={ag.id}>
              <button
                onClick={() => (onSelectAgent ? onSelectAgent(ag.id) : onOpenAgentSuite())}
                title={ag.metricSub}
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/70">
                  <AgentAvatar agentId={ag.id} size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground transition-colors group-hover:text-primary">
                    {ag.short}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {ag.active ? ag.metricValue : "Standby"}
                  </span>
                </span>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    ag.active ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                  role="img"
                  aria-label={ag.active ? "Active" : "Standby"}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        <button
          onClick={onOpenAgentSuite}
          className="group flex w-full items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          <span className="flex items-center gap-2">
            <Sliders size={14} />
            Open Neptune Agent Suite
          </span>
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          onClick={onOpenFleetModal}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Shield size={13} />
          Fleet telemetry &amp; autonomy
        </button>
      </div>
    </div>
  );
}
