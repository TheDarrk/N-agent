"use client";

import React, { useState, useEffect } from "react";
import { AgentAvatar } from "@/components/agent-avatars";
import {
  Sparkles,
  Shield,
  ArrowRight,
  Wallet,
  CheckCircle2,
  Sliders,
  ChevronRight,
  Activity
} from "lucide-react";

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
    const interval = setInterval(fetchFleet, 12000);
    return () => clearInterval(interval);
  }, [accountId]);

  const agents = [
    {
      id: "trader",
      name: "Quantitative Trader",
      role: "Momentum & Vision AI",
      active: fleet?.agents?.trader?.is_active ?? false,
      metricLabel: fleet?.agents?.trader?.metric_label || "Daily Capacity",
      metricValue: fleet?.agents?.trader?.metric_value || (fleet?.agents?.trader?.is_active ? `${fleet?.agents?.trader?.today_trades || 0}/${fleet?.agents?.trader?.max_trades_day || 3} Today` : "Inactive"),
      metricSub: fleet?.agents?.trader?.metric_sub || `${fleet?.agents?.trader?.trades_remaining_today ?? 3} Remaining`,
      summary: fleet?.agents?.trader?.summary || "Standby (Inactive)"
    },
    {
      id: "moderator",
      name: "Moderator Watchdog",
      role: "LLM Judge Fleet Audit",
      active: fleet?.agents?.moderator?.is_active ?? false,
      metricLabel: fleet?.agents?.moderator?.metric_label || "Fleet Risk",
      metricValue: fleet?.agents?.moderator?.metric_value || (fleet?.agents?.moderator?.is_active ? `${fleet?.agents?.moderator?.health_score || 94}/100 Health` : "Inactive"),
      metricSub: fleet?.agents?.moderator?.metric_sub || "0 Violations • Armed",
      summary: fleet?.agents?.moderator?.summary || "Standby (Inactive)"
    },
    {
      id: "research",
      name: "Deep Research & Alpha",
      role: "On-Chain Alpha & A2A",
      active: fleet?.agents?.research?.is_active ?? false,
      metricLabel: fleet?.agents?.research?.metric_label || "Alpha Intel",
      metricValue: fleet?.agents?.research?.metric_value || (fleet?.agents?.research?.is_active ? "Active Intel Feed" : "Inactive"),
      metricSub: fleet?.agents?.research?.metric_sub || "0.1 NEAR A2A Fee",
      summary: fleet?.agents?.research?.summary || "Standby (Inactive)"
    },
    {
      id: "rebalancer",
      name: "Portfolio Rebalancer",
      role: "70/30 Drift Maintenance",
      active: fleet?.agents?.rebalancer?.is_active ?? false,
      metricLabel: fleet?.agents?.rebalancer?.metric_label || "Drift",
      metricValue: fleet?.agents?.rebalancer?.metric_value || (fleet?.agents?.rebalancer?.is_active ? "2.4% (Threshold: 5%)" : "Inactive"),
      metricSub: fleet?.agents?.rebalancer?.metric_sub || "70% USDC / 30% NEAR",
      summary: fleet?.agents?.rebalancer?.summary || "Standby (Inactive)"
    },
  ];

  const activeCount = agents.filter((a) => a.active).length;

  if (!accountId) {
    return (
      <div className="mx-1 mt-3 rounded-2xl border border-dashed border-[hsl(225,18%,18%)] bg-gradient-to-b from-secondary/40 to-secondary/10 p-4 text-center shadow-lg select-none">
        <div className="flex items-center justify-center gap-1.5 mb-2.5">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Autonomous Fleet
          </span>
        </div>

        {/* 4 Agent Avatars preview */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {agents.map((ag) => (
            <div
              key={ag.id}
              className="relative w-8 h-8 rounded-xl bg-card/80 border border-[hsl(225,18%,16%)] flex items-center justify-center p-1 opacity-70 shadow-inner"
              title={`${ag.name} (Standby)`}
            >
              <AgentAvatar agentId={ag.id} size={22} />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-zinc-600 border border-background" />
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug mb-3">
          Connect wallet to deploy &amp; supervise your autonomous AI agent fleet
        </p>

        <button
          onClick={onConnectWallet}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
        >
          <Wallet size={13} />
          <span>Connect Wallet</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-1 mt-3 rounded-2xl border border-[hsl(225,18%,18%)] bg-gradient-to-b from-secondary/50 via-card/50 to-secondary/20 p-3.5 shadow-xl transition-all select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[hsl(225,18%,14%)]">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-primary animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Agent Fleet Status
          </span>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
            activeCount > 0
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-zinc-800/80 text-zinc-400 border-zinc-700/50"
          }`}
        >
          {activeCount}/4 Active
        </span>
      </div>

      {/* Stacked 4 Agent Cards with Activity Bars (No Side-by-Side Truncation) */}
      <div className="flex flex-col gap-2 mb-3">
        {agents.map((ag) => (
          <button
            key={ag.id}
            onClick={() => {
              if (onSelectAgent) {
                onSelectAgent(ag.id);
              } else {
                onOpenAgentSuite();
              }
            }}
            className="w-full p-2.5 rounded-xl border border-[hsl(225,18%,14%)] bg-card/60 hover:bg-card hover:border-primary/40 transition-all text-left group"
          >
            {/* Top Row: Avatar, Name, Status Pill */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-7 h-7 rounded-lg bg-secondary/80 flex items-center justify-center p-0.5 flex-shrink-0">
                  <AgentAvatar agentId={ag.id} size={22} />
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                      ag.active ? "bg-emerald-400 animate-ping" : "bg-zinc-600"
                    }`}
                  />
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                      ag.active ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {ag.name}
                  </p>
                  <p className="text-[9px] text-muted-foreground truncate leading-tight">
                    {ag.summary}
                  </p>
                </div>
              </div>

              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 ${
                  ag.active
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                }`}
              >
                {ag.active ? "ACTIVE" : "STANDBY"}
              </span>
            </div>

            {/* Bottom Row: Meaningful Operational Metric for User */}
            <div className="pt-1.5 border-t border-[hsl(225,18%,12%)] flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1 text-muted-foreground font-medium">
                <Activity size={10} className={ag.active ? "text-primary" : "text-muted-foreground"} />
                <span>{ag.metricLabel}:</span>
              </div>
              <span className={`font-mono font-semibold ${ag.active ? "text-foreground" : "text-muted-foreground"}`}>
                {ag.metricValue}
              </span>
            </div>
            {ag.metricSub && (
              <div className="text-[9px] text-muted-foreground font-mono flex justify-between pt-0.5">
                <span className="truncate">{ag.metricSub}</span>
                {ag.active && (
                  <span className="text-emerald-400 font-semibold shrink-0">Online</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-1.5">
        <button
          onClick={onOpenAgentSuite}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-all group"
        >
          <span className="flex items-center gap-1.5">
            <Sliders size={12} />
            Neptune Agent Suite
          </span>
          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={onOpenFleetModal}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Shield size={11} />
          <span>Full Fleet Telemetry &amp; Autonomy</span>
        </button>
      </div>
    </div>
  );
}
