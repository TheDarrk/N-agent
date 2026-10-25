"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Scale,
  FileText,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Shield,
  Sliders,
  Power,
  RefreshCw,
  Cpu,
  Layers,
  Zap,
  Lock,
  Wallet,
  Store,
  Key,
  Maximize2,
  History
} from "lucide-react";
import FullScreenHistoryModal from "@/components/fullscreen-history-modal";
import AgentWalletManagerModal from "@/components/agent-wallet-manager-modal";
import TraderSection from "@/components/agent-sections/trader-section";
import ModeratorSection from "@/components/agent-sections/moderator-section";
import ResearchSection from "@/components/agent-sections/research-section";
import RebalancerSection from "@/components/agent-sections/rebalancer-section";
import { AgentAvatar } from "@/components/agent-avatars";
import ShareAgentModal from "@/components/share-agent-modal";

type Props = {
  accountId: string | null;
  activeAgentSubView: string | null; // "trader" | "moderator" | "research" | "rebalancer" | null
  onSelectAgentSubView: (view: string | null) => void;
  onConnectWallet: () => void;
};

interface AgentStatus {
  name: string;
  role: string;
  status: string;
  is_active: boolean;
  summary: string;
  [key: string]: any;
}

interface FleetData {
  user_wallet: string;
  near_network: string;
  kill_switch_active: boolean;
  agents: {
    trader: AgentStatus;
    rebalancer: AgentStatus;
    research: AgentStatus;
    moderator: AgentStatus;
  };
}

export default function NeptuneAgentSuite({
  accountId,
  activeAgentSubView,
  onSelectAgentSubView,
  onConnectWallet
}: Props) {
  const [fleetData, setFleetData] = useState<FleetData | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [shareModalAgent, setShareModalAgent] = useState<"trader" | "rebalancer" | "research" | null>(null);
  const [isAgentWalletModalOpen, setIsAgentWalletModalOpen] = useState(false);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);

  const fetchFleet = async () => {
    const wallet = accountId || "guest.near";
    try {
      const res = await fetch(`/api/fleet/${wallet}`);
      if (res.ok) {
        const data = await res.json();
        setFleetData(data);
      }
    } catch (e) {
      console.error("Failed to fetch fleet:", e);
    }
  };

  useEffect(() => {
    fetchFleet();
    const interval = setInterval(fetchFleet, 15000);
    return () => clearInterval(interval);
  }, [accountId]);

  const handleToggleAgentActive = async (agentId: string, currentActive: boolean) => {
    if (!accountId) {
      onConnectWallet();
      return;
    }
    setIsUpdating(agentId);
    try {
      const res = await fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          agent_id: agentId,
          is_active: !currentActive,
          config: {}
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setFleetData(updated);
        setSaveSuccessMsg(`Agent ${agentId.toUpperCase()} ${!currentActive ? "Activated" : "Deactivated"}!`);
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (e) {
      console.error("Failed to toggle agent active:", e);
    } finally {
      setIsUpdating(null);
    }
  };

  const agentCards = [
    {
      id: "trader",
      name: "Autonomous Trader Agent",
      role: "Technical Pattern & Momentum Trading",
      color: "from-blue-500/20 via-cyan-500/10 to-transparent",
      borderColor: "border-cyan-500/30",
      accentColor: "text-cyan-400",
      badgeColor: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      description:
        "Scans cryptocurrency markets and user watchlists using an integrated trading knowledge base of chart patterns, technical indicators, and live social sentiment analysis to automatically identify setups and execute trades within your pre-set limits.",
      tags: ["Chart Pattern Recognition", "Trading Knowledge Base", "Social Sentiment Analysis", "Automated Execution", "Custom Risk Limits"],
      stats: fleetData?.agents?.trader?.is_active
        ? `${fleetData.agents.trader.total_trades || 0} Trades Executed (${fleetData.agents.trader.take_profit_hits || 0} at TP)`
        : "Standby — Configure and activate to deploy"
    },
    {
      id: "moderator",
      name: "Moderator Watchdog Agent",
      role: "System Health & Risk Protection",
      color: "from-purple-500/20 via-violet-500/10 to-transparent",
      borderColor: "border-purple-500/30",
      accentColor: "text-purple-400",
      badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
      description:
        "Provides real-time safety surveillance across all active agents, evaluating trade validity, risk exposure, and overall portfolio health. Equipped with an emergency circuit breaker to pause execution and safeguard capital during market volatility.",
      tags: ["Fleet Risk Surveillance", "Portfolio Health Scoring", "Emergency Circuit Breaker", "Continuous Safety Monitoring"],
      stats: fleetData?.agents?.moderator?.is_active
        ? `Health Score: ${fleetData.agents.moderator.health_score || 94}/100 (Optimal)`
        : "Standby — Configure and activate for risk protection"
    },
    {
      id: "research",
      name: "Deep Research & Alpha Agent",
      role: "Market Intelligence & Token Analysis",
      color: "from-emerald-500/20 via-teal-500/10 to-transparent",
      borderColor: "border-emerald-500/30",
      accentColor: "text-emerald-400",
      badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      description:
        "Conducts deep market and fundamental analysis across tokens, synthesizing volume trends, on-chain metrics, and social signals into comprehensive intelligence reports on demand.",
      tags: ["Fundamental Analysis", "On-Chain Market Intelligence", "Token Trend Reports", "Automated Due Diligence"],
      stats: fleetData?.agents?.research?.is_active
        ? `${fleetData.agents.research.reports_generated || 0} Research Reports Generated`
        : "Standby — Configure and activate to generate reports"
    },
    {
      id: "rebalancer",
      name: "Portfolio Rebalancer Agent",
      role: "Dynamic Asset Allocation & Rebalancing",
      color: "from-amber-500/20 via-orange-500/10 to-transparent",
      borderColor: "border-amber-500/30",
      accentColor: "text-amber-400",
      badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      description:
        "Maintains your target balance between stablecoins and cryptocurrencies, continuously monitoring portfolio drift and automatically executing low-slippage rebalancing swaps when thresholds are reached.",
      tags: ["Target Asset Allocation", "Portfolio Drift Monitoring", "Automated Rebalancing", "Low-Slippage Swaps"],
      stats: fleetData?.agents?.rebalancer?.is_active
        ? `Target: 70% Stables / 30% NEAR (${fleetData.agents.rebalancer.drift_threshold || 5}% drift)`
        : "Standby — Configure targets and activate to start"
    }
  ];

    // ── Render Individual Agent Configuration View ──
  if (activeAgentSubView) {
    const currentAgent = agentCards.find((a) => a.id === activeAgentSubView);
    const agentActive = (fleetData?.agents as any)?.[activeAgentSubView]?.is_active ?? false;

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* Sub-view Header & Breadcrumbs */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[hsl(225,18%,14%)] bg-card/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectAgentSubView(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold border border-[hsl(225,18%,16%)] transition-all active:scale-95 group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Agent Suite</span>
            </button>
            <div className="h-4 w-px bg-[hsl(225,18%,20%)]" />
            <div className="flex items-center gap-2">
              <AgentAvatar agentId={currentAgent?.id || "trader"} size={26} />
              <div>
                <h3 className="text-sm font-bold text-foreground leading-tight">
                  {currentAgent?.name}
                </h3>
                <p className="text-[10px] text-muted-foreground">{currentAgent?.role}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveSuccessMsg && (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 animate-fade-in">
                {saveSuccessMsg}
              </span>
            )}
            <button
              onClick={() => setIsFullScreenHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground border border-[hsl(225,18%,16%)] hover:border-primary/40 text-xs font-semibold transition-all active:scale-95"
              title="View Full Screen History & Audit Log"
            >
              <History size={13} className="text-primary" />
              <span>History & Audit</span>
            </button>
            <button
              onClick={() => setIsAgentWalletModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground border border-[hsl(225,18%,16%)] hover:border-primary/40 text-xs font-semibold transition-all active:scale-95"
              title="Manage Agent Execution Wallets"
            >
              <Key size={13} className="text-primary" />
              <span>Agent Wallets</span>
            </button>
            {activeAgentSubView !== "moderator" && (
              <button
                onClick={() => setShareModalAgent(activeAgentSubView as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-semibold transition-all active:scale-95"
              >
                <Store size={13} />
                <span>Share to Marketplace</span>
              </button>
            )}
            {/* Active Toggle */}
            <button
              onClick={() => handleToggleAgentActive(activeAgentSubView, agentActive)}
              disabled={isUpdating === activeAgentSubView}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                agentActive
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                  : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${agentActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              <span>{agentActive ? "AGENT ACTIVE" : "AGENT INACTIVE"}</span>
            </button>
          </div>
        </div>

        {/* Sandbox Notice if No Wallet Connected */}
        {!accountId && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-in fade-in-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Wallet size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Sandbox Configuration Mode (No Wallet Connected)</p>
                <p className="text-[11px] text-muted-foreground">
                  You can freely test and adjust all parameters. To save this configuration into the database and activate autonomous background execution, please connect a wallet.
                </p>
              </div>
            </div>
            <button
              onClick={onConnectWallet}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-amber-950 font-bold text-xs shrink-0 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Wallet size={13} />
              <span>Connect Wallet to Save</span>
            </button>
          </div>
        )}

        {/* Configuration Component Content */}
        <div className="flex-1 overflow-y-auto">
          {activeAgentSubView === "trader" && (
            <TraderSection accountId={accountId} onConnectWallet={onConnectWallet} />
          )}
          {activeAgentSubView === "moderator" && (
            <ModeratorSection accountId={accountId} onConnectWallet={onConnectWallet} />
          )}
          {activeAgentSubView === "research" && (
            <ResearchSection accountId={accountId} onConnectWallet={onConnectWallet} />
          )}
          {activeAgentSubView === "rebalancer" && (
            <RebalancerSection accountId={accountId} onConnectWallet={onConnectWallet} />
          )}
        </div>
        <ShareAgentModal
          isOpen={!!shareModalAgent}
          onClose={() => setShareModalAgent(null)}
          agentId={shareModalAgent || "trader"}
          accountId={accountId}
          onConnectWallet={onConnectWallet}
        />
        <FullScreenHistoryModal
          isOpen={isFullScreenHistoryOpen}
          onClose={() => setIsFullScreenHistoryOpen(false)}
          accountId={accountId}
          onSelectAgent={(aid) => onSelectAgentSubView(aid as any)}
        />
      </div>
    );
  }

  // ── Render Neptune Agent Suite Overview (4 Cards) ──
  const activeCount = Object.values(fleetData?.agents || {}).filter((a: any) => a?.is_active).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto w-full space-y-6">
      {/* Suite Hero Header */}
      <div className="relative rounded-3xl border border-[hsl(225,18%,16%)] bg-gradient-to-r from-card/90 via-secondary/30 to-card/90 p-6 md:p-8 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold tracking-wider uppercase border border-primary/25">
                Autonomous AI Infrastructure
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[11px] font-mono">
                {fleetData?.near_network?.toUpperCase() || "TESTNET"}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              Neptune Agent Suite
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Institutional-grade multi-agent fleet running natively on NEAR Protocol. Deploy, configure, and supervise specialized trading, risk auditing, fundamental research, and portfolio rebalancing agents.
            </p>
          </div>

          {/* Quick Metrics Bar & Agent Wallets Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAgentWalletModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground border border-[hsl(225,18%,16%)] hover:border-primary/40 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Key size={14} className="text-primary" />
              <span>Agent Wallets (0-4)</span>
            </button>
            <div className="flex items-center gap-3 bg-card/80 p-3 rounded-2xl border border-[hsl(225,18%,14%)] shadow-inner">
            <div className="text-center px-3 border-r border-[hsl(225,18%,14%)]">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Active Fleet</p>
              <p className="text-lg font-mono font-bold text-foreground">{activeCount}/4</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Protection</p>
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1 justify-center">
                <CheckCircle2 size={13} /> Armed
              </p>
            </div>
          </div>
          </div>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={15} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* 4 Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {agentCards.map((agent) => {
          const isAgentActive = (fleetData?.agents as any)?.[agent.id]?.is_active ?? false;

          return (
            <div
              key={agent.id}
              className={`relative rounded-3xl border ${
                isAgentActive ? agent.borderColor : "border-[hsl(225,18%,14%)]"
              } bg-gradient-to-br ${agent.color} p-6 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between group`}
            >
              <div>
                {/* Card Top: Avatar, Title, Active Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-card border border-[hsl(225,18%,16%)] flex items-center justify-center p-1.5 shadow-md group-hover:scale-105 transition-transform">
                      <AgentAvatar agentId={agent.id} size={36} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {agent.name}
                      </h2>
                      <p className="text-[11px] text-muted-foreground font-medium">{agent.role}</p>
                    </div>
                  </div>

                  {/* Active / Inactive Status Pill */}
                  <span
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                      isAgentActive
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isAgentActive ? "bg-emerald-400" : "bg-zinc-500"}`} />
                    {isAgentActive ? "ACTIVE" : "STANDBY"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {agent.description}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {agent.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-card/60 border border-[hsl(225,18%,14%)] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer: Live Telemetry + Action Button */}
              <div className="pt-4 border-t border-[hsl(225,18%,14%)]/60 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Telemetry / Status
                  </p>
                  <p className="text-xs font-mono font-medium text-foreground truncate">
                    {agent.stats}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {agent.id !== "moderator" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareModalAgent(agent.id as any);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-semibold border border-[hsl(225,18%,16%)] hover:border-primary/40 transition-all active:scale-95 flex-shrink-0"
                      title="Share this agent to the decentralized marketplace"
                    >
                      <Store size={13} className="text-primary" />
                      <span>Share</span>
                    </button>
                  )}
                  <button
                    onClick={() => onSelectAgentSubView(agent.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-95 flex-shrink-0"
                  >
                    <span>Configure</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ShareAgentModal
        isOpen={!!shareModalAgent}
        onClose={() => setShareModalAgent(null)}
        agentId={shareModalAgent || "trader"}
        accountId={accountId}
        onConnectWallet={onConnectWallet}
      />
      <AgentWalletManagerModal
        isOpen={isAgentWalletModalOpen}
        onClose={() => setIsAgentWalletModalOpen(false)}
        accountId={accountId}
        onConnectWallet={onConnectWallet}
      />
    </div>
  );
}