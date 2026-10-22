"use client";

import React, { useState, useEffect } from "react";
import {
  Store,
  Award,
  TrendingUp,
  Shield,
  FileText,
  Scale,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles
} from "lucide-react";

type Props = {
  accountId: string | null;
  onSelectAgentTab?: (tab: string) => void;
};

interface AgentListing {
  id: string;
  name: string;
  category: string;
  creator: string;
  description: string;
  fee_model: string;
  sharpe_ratio: number;
  win_rate_pct: number;
  cadence: string;
  mandate: Record<string, any>;
}

export default function AgentMarketplace({ accountId, onSelectAgentTab }: Props) {
  const [agents, setAgents] = useState<AgentListing[]>([]);
  const [hiredAgentId, setHiredAgentId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/agents")
      .then((res) => res.json())
      .then((data) => setAgents(data.agents || []))
      .catch((err) => console.error("Marketplace fetch error:", err));
  }, []);

  const handleHire = (agentId: string) => {
    if (!accountId) {
      alert("Please connect wallet first");
      return;
    }
    setHiredAgentId(agentId);
    setTimeout(() => {
      alert(`Agent ${agentId} successfully hired into your sub-account! Trade-only function-call keys granted.`);
    }, 500);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Trader":
        return <TrendingUp size={18} className="text-emerald-400" />;
      case "Rebalancer":
        return <Scale size={18} className="text-blue-400" />;
      case "Research":
        return <FileText size={18} className="text-purple-400" />;
      case "Moderator":
        return <Shield size={18} className="text-rose-400" />;
      default:
        return <Sparkles size={18} className="text-primary" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <Store size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Agent Marketplace
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/20 text-primary border border-primary/30">
              Track 7 Agent Economy
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            A decentralized marketplace of user-built AI trading and research agents. Internal logic stays protected while verified track records and fees live on-chain on NEAR. Rent an agent into a dedicated sub-account with limited trade keys.
          </p>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {agents.map((agent) => {
          const isHired = hiredAgentId === agent.id;
          return (
            <div
              key={agent.id}
              className="p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all shadow-md shadow-black/10 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-secondary/80 border border-[hsl(225,18%,14%)]">
                      {getCategoryIcon(agent.category)}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {agent.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Creator: <span className="text-foreground">{agent.creator}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary text-foreground border border-[hsl(225,18%,14%)]">
                    {agent.category}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {agent.description}
                </p>

                {/* Performance Stats */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] text-center">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">Sharpe Ratio</span>
                    <p className="text-sm font-mono font-bold text-emerald-400">
                      {agent.sharpe_ratio}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">Win Rate</span>
                    <p className="text-sm font-mono font-bold text-primary">
                      {agent.win_rate_pct}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">Cadence</span>
                    <p className="text-sm font-mono font-bold text-foreground">
                      {agent.cadence}
                    </p>
                  </div>
                </div>

                {/* Public Mandate Snapshot */}
                <div className="space-y-1.5 text-xs">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Public Mandate & Guardrails
                  </span>
                  <div className="p-2.5 rounded-lg bg-secondary/20 border border-[hsl(225,18%,14%)] font-mono text-[11px] space-y-1">
                    {Object.entries(agent.mandate).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-muted-foreground">
                        <span>{k.replace(/_/g, " ")}:</span>
                        <span className="text-foreground font-semibold">
                          {Array.isArray(v) ? v.join(", ") : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action & Fee Footer */}
              <div className="pt-3 border-t border-[hsl(225,18%,14%)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] text-muted-foreground block">Fee Model</span>
                  <span className="text-xs font-semibold text-emerald-400 truncate block">
                    {agent.fee_model}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectAgentTab && (
                    <button
                      onClick={() => onSelectAgentTab(agent.category.toLowerCase())}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary transition-all"
                    >
                      Open Section
                    </button>
                  )}
                  <button
                    onClick={() => handleHire(agent.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                      isHired
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
                    }`}
                  >
                    {isHired ? "Hired Active" : "Rent Agent"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
