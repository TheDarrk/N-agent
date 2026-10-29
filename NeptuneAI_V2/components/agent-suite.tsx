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
  History,
  ChevronDown
} from "lucide-react";
import FullScreenHistoryModal from "@/components/fullscreen-history-modal";
import AgentWalletManagerModal from "@/components/agent-wallet-manager-modal";
import TraderSection from "@/components/agent-sections/trader-section";
import ModeratorSection from "@/components/agent-sections/moderator-section";
import ResearchSection from "@/components/agent-sections/research-section";
import RebalancerSection from "@/components/agent-sections/rebalancer-section";
import { AgentAvatar } from "@/components/agent-avatars";
import { AgentCardScene } from "@/components/agent-card-scene";
import { tilt3d } from "@/components/agent-sections/trader/tilt-3d";
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 sm:px-5 py-2.5 border-b border-border bg-card/70 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => onSelectAgentSubView(null)}
              aria-label="Back to Agent Suite"
              className="suite-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold border border-border transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
              <span className="hidden sm:inline">Back to Agent Suite</span>
            </button>
            <div className="h-4 w-px bg-secondary" />
            <div className="flex items-center gap-2 min-w-0">
              <AgentAvatar agentId={currentAgent?.id || "trader"} size={26} />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground leading-tight truncate">
                  {currentAgent?.name}
                </h3>
                <p className="text-[10px] text-muted-foreground truncate">{currentAgent?.role}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {saveSuccessMsg && (
              <span
                role="status"
                className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 animate-fade-in"
              >
                {saveSuccessMsg}
              </span>
            )}
            <button
              onClick={() => setIsFullScreenHistoryOpen(true)}
              className="suite-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-foreground border border-border hover:border-primary/40 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              title="View Full Screen History & Audit Log"
              aria-label="History and Audit"
            >
              <History size={13} className="text-primary" />
              <span className="hidden md:inline">History & Audit</span>
            </button>
            <button
              onClick={() => setIsAgentWalletModalOpen(true)}
              className="suite-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-foreground border border-border hover:border-primary/40 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              title="Manage Agent Execution Wallets"
              aria-label="Agent Wallets"
            >
              <Key size={13} className="text-primary" />
              <span className="hidden md:inline">Agent Wallets</span>
            </button>
            {activeAgentSubView !== "moderator" && (
              <button
                onClick={() => setShareModalAgent(activeAgentSubView as any)}
                className="suite-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                title="Share to Marketplace"
                aria-label="Share to Marketplace"
              >
                <Store size={13} />
                <span className="hidden md:inline">Share to Marketplace</span>
              </button>
            )}
            {/* Active Toggle */}
            <button
              onClick={() => handleToggleAgentActive(activeAgentSubView, agentActive)}
              disabled={isUpdating === activeAgentSubView}
              aria-pressed={agentActive}
              className={`suite-press flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                agentActive
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                  : "bg-secondary border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${agentActive ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/60"}`} />
              <span>{agentActive ? "AGENT ACTIVE" : "AGENT INACTIVE"}</span>
            </button>
          </div>
        </div>

        {/* Sandbox Notice if No Wallet Connected */}
        {!accountId && (
          <div className="suite-rise mx-3 sm:mx-5 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Wallet size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Sandbox Configuration Mode (No Wallet Connected)</p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  You can freely test and adjust all parameters. To save this configuration into the database and activate autonomous background execution, please connect a wallet.
                </p>
              </div>
            </div>
            <button
              onClick={onConnectWallet}
              className="suite-press px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold text-xs shrink-0 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <Wallet size={13} />
              <span>Connect Wallet to Save</span>
            </button>
          </div>
        )}

        {/* Configuration Component Content */}
        <div key={activeAgentSubView} className="suite-fade flex-1 overflow-y-auto">
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
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-6xl mx-auto w-full space-y-4">
      {/* Suite Header */}
      <header
        {...tilt3d(1.5)}
        className="tilt3d rounded-2xl border border-border bg-gradient-to-r from-card/90 via-secondary/30 to-card/90 px-4 py-4 sm:px-6 sm:py-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold tracking-wider uppercase border border-primary/25">
                Autonomous AI Infrastructure
              </span>
              <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-mono">
                {fleetData?.near_network?.toUpperCase() || "TESTNET"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight text-balance">
              Neptune Agent Suite
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed text-pretty">
              Institutional-grade multi-agent fleet running natively on NEAR Protocol. Deploy, configure, and supervise specialized trading, risk auditing, fundamental research, and portfolio rebalancing agents.
            </p>
          </div>

          {/* Quick Metrics Bar & Agent Wallets Action */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAgentWalletModalOpen(true)}
              {...tilt3d(6)}
              className="tilt3d pop3d flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary text-foreground border border-border hover:border-primary/50 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Key size={16} className="text-primary" />
              <span>Agent Wallets (0-4)</span>
            </button>
            <div
              {...tilt3d(5)}
              className="tilt3d pop3d flex items-center bg-card py-2 rounded-xl border border-border"
            >
              <div className="text-center px-4 border-r border-border">
                <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Active Fleet</p>
                <p className="text-lg font-mono font-extrabold text-foreground leading-tight">{activeCount}/4</p>
              </div>
              <div className="text-center px-4">
                <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Protection</p>
                <p className="text-base font-bold text-emerald-400 flex items-center gap-1 justify-center leading-tight">
                  <CheckCircle2 size={13} /> Armed
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {saveSuccessMsg && (
        <div
          role="status"
          className="animate-fade-in px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2"
        >
          <CheckCircle2 size={15} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* 4 Agent Cards Grid */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-14 pb-6 pt-12 md:grid-cols-2">
        {agentCards.map((agent, index) => (
          <AgentOverviewCard
            key={agent.id}
            agent={agent}
            index={index + 1}
            isActive={(fleetData?.agents as any)?.[agent.id]?.is_active ?? false}
            onShare={() => setShareModalAgent(agent.id as any)}
            onConfigure={() => onSelectAgentSubView(agent.id)}
          />
        ))}
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

type OverviewAgent = {
  id: string;
  name: string;
  role: string;
  color: string;
  borderColor: string;
  accentColor: string;
  badgeColor: string;
  description: string;
  tags: string[];
  stats: string;
};

const AGENT_THEME: Record<string, { glow: string; summary: string }> = {
  trader: {
    glow: "190 95% 55%",
    summary: "Watches the crypto market for you and makes trades, but only inside the limits you set."
  },
  moderator: {
    glow: "262 85% 70%",
    summary: "A safety guard for your other agents. It checks every move and hits pause if things look risky."
  },
  research: {
    glow: "160 70% 50%",
    summary: "Studies any token and writes you a simple report on whether it looks promising."
  },
  rebalancer: {
    glow: "38 95% 58%",
    summary: "Keeps your money split the way you want between stable coins and crypto, automatically."
  }
};

function AgentOverviewCard({
  agent,
  index,
  isActive,
  onShare,
  onConfigure
}: {
  agent: OverviewAgent;
  index: number;
  isActive: boolean;
  onShare: () => void;
  onConfigure: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = React.useRef<HTMLElement>(null);
  const panelId = `agent-capabilities-${agent.id}`;
  const theme = AGENT_THEME[agent.id] ?? AGENT_THEME.trader;

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const el = cardRef.current;
    el.style.setProperty("--ry", `${((px - 0.5) * 10).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - py) * 8).toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      className="agent3d-scene suite-rise"
      style={{ "--i": index, "--glow": theme.glow } as React.CSSProperties}
    >
      <article
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        data-active={isActive}
        className="agent3d-card group flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="agent3d-bg" aria-hidden="true">
          <span className="agent3d-shine" />
        </div>

        {/* Pop-up avatar + status */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="agent3d-avatar -mt-10 flex h-[76px] w-[76px] shrink-0 items-center justify-center">
            <span className="agent3d-orbit" aria-hidden="true" />
            <AgentAvatar agentId={agent.id} size={52} />
          </div>
          <span
            className={`agent3d-pop mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${
              isActive
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                : "border-border bg-secondary text-secondary-foreground"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? "animate-glow bg-emerald-400" : "bg-muted-foreground"
              }`}
            />
            {isActive ? "Running" : "Standby"}
          </span>
        </div>

        {/* Name + plain-language summary */}
        <div className="relative space-y-1.5">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight text-foreground text-balance">
            {agent.name}
          </h2>
          <p className="agent3d-role text-sm font-semibold">
            {agent.role}
          </p>
          <p className="pt-1 text-[15px] leading-relaxed text-foreground/85 text-pretty">
            {theme.summary}
          </p>
        </div>

        <AgentCardScene agentId={agent.id} isActive={isActive} />

        {/* Details */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="suite-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            style={{ backgroundColor: `hsl(${theme.glow} / 0.12)` }}
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
            <span>{expanded ? "Hide details" : "What can it do?"}</span>
          </button>
          <div id={panelId} className="suite-collapse" data-open={expanded}>
            <div>
              <div className="space-y-3 pt-3">
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {agent.description}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {agent.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border px-3 py-1 text-sm font-medium text-foreground/90"
                      style={{
                        borderColor: `hsl(${theme.glow} / 0.3)`,
                        backgroundColor: `hsl(${theme.glow} / 0.1)`
                      }}
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: status + actions */}
        <div className="relative mt-auto flex flex-col gap-3 border-t border-border/70 pt-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</p>
            <p className="text-sm font-medium text-foreground text-pretty">{agent.stats}</p>
          </div>
          <div className="agent3d-pop flex flex-wrap items-center gap-2.5">
            <button
              onClick={onConfigure}
              className="agent3d-btn agent3d-btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span>Set it up</span>
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            {agent.id !== "moderator" && (
              <button
                onClick={onShare}
                className="agent3d-btn inline-flex h-11 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                title="Share this agent to the decentralized marketplace"
              >
                <Store size={16} className="text-primary" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
