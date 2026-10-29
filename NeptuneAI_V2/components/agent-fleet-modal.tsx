"use client";

import React, { useState, useEffect } from "react";
import { AgentAvatar } from "@/components/agent-avatars";
import {
  X,
  TrendingUp,
  Scale,
  FileText,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Flame,
  Globe,
  Clock,
  ArrowUpRight
} from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  onConnect: () => void;
  network: "testnet" | "mainnet";
  onToggleNetwork: (net: "testnet" | "mainnet") => void;
};

interface FleetData {
  user_wallet: string;
  near_network: string;
  kill_switch_active: boolean;
  agents: {
    trader: any;
    rebalancer: any;
    research: any;
    moderator: any;
  };
  recent_activity: any[];
}

export default function AgentFleetModal({
  isOpen,
  onClose,
  accountId,
  onConnect,
  network,
  onToggleNetwork
}: Props) {
  const [fleetData, setFleetData] = useState<FleetData | null>(null);
  const [autonomyLevel, setAutonomyLevel] = useState<number>(2); // 1 = Semi, 2 = Full
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchFleet = async () => {
      const wallet = accountId || "guest.near";
      setIsLoading(true);
      try {
        const res = await fetch(`/api/fleet/${wallet}`);
        if (res.ok) {
          const data = await res.json();
          setFleetData(data);
        }
      } catch (e) {
        console.error("Fleet fetch error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFleet();
  }, [isOpen, accountId]);

  if (!isOpen) return null;

  const agentsList = [
    {
      id: "trader",
      name: "Quantitative Trader Agent",
      role: "Multi-Asset Momentum, Vision Charts & Defuse Execution",
      avatarBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: TrendingUp,
      status: fleetData?.kill_switch_active ? "HALTED" : "ACTIVE",
      stats: fleetData?.agents?.trader?.summary || "Scans 20-coin universe, recognizes geometric patterns, executes via NEAR Intents",
      highlights: [
        `Timeframe: ${fleetData?.agents?.trader?.timeframe || "1h"}`,
        `Min Confidence: ${fleetData?.agents?.trader?.min_confidence || 75}%`,
        `Researcher Plugin: ${fleetData?.agents?.trader?.researcher_plugin ? "Enabled" : "Disabled"}`
      ]
    },
    {
      id: "rebalancer",
      name: "Portfolio Rebalancer Agent",
      role: "70/30 Stables & NEAR Dynamic Maintenance",
      avatarBg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      icon: Scale,
      status: fleetData?.kill_switch_active ? "HALTED" : "ACTIVE",
      stats: fleetData?.agents?.rebalancer?.summary || "Monitors portfolio drift every 30s & triggers 1-Click rebalancing",
      highlights: ["Target: 70% USDC / 30% NEAR", "Drift Tolerance: 5.0%", "Intents: Defuse Solver"]
    },
    {
      id: "research",
      name: "Deep Research & Alpha Agent",
      role: "On-Chain Alpha, Niche Intel & Track 7 A2A Rentals",
      avatarBg: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      icon: FileText,
      status: fleetData?.kill_switch_active ? "HALTED" : "ACTIVE",
      stats: fleetData?.agents?.research?.summary || "Produces institutional alpha reports & fulfills Trader rentals for 0.1 NEAR",
      highlights: ["Fee: 0.1 NEAR / report", "Storage: IPFS Recent 10", "A2A Economy: Active"]
    },
    {
      id: "moderator",
      name: "Moderator Watchdog Agent",
      role: "Master LLM Judge & Emergency Kill Switch Custodian",
      avatarBg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      icon: ShieldAlert,
      status: fleetData?.kill_switch_active ? "HALTED" : "ACTIVE_PROTECTION",
      stats: fleetData?.agents?.moderator?.summary || "Surveils all 4 agents against risk caps and holds emergency keys",
      highlights: ["Score: 94/100", "Breaches: 0 Detected", "Emergency Unwind: Ready"]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Autonomous Agents Fleet & Network Settings
              </h2>
              <p className="text-xs text-muted-foreground">
                Enable autonomy, configure network mode, and inspect active agents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Network Selection: Testnet vs Mainnet */}
        <div className="p-4 rounded-xl bg-secondary/30 border border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe size={18} className="text-primary" />
            <div>
              <p className="text-xs font-semibold text-foreground">NEAR Network Environment</p>
              <p className="text-[11px] text-muted-foreground">
                {network === "testnet"
                  ? "Testnet active: safe testing with zero financial risk"
                  : "Mainnet active: real on-chain capital & intents"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
            <button
              onClick={() => onToggleNetwork("testnet")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                network === "testnet"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Testnet
            </button>
            <button
              onClick={() => onToggleNetwork("mainnet")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                network === "mainnet"
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mainnet
            </button>
          </div>
        </div>

        {/* Autonomy Level Control */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Autonomy Execution Level</span>
            <span className="text-[11px] text-primary font-mono font-bold">
              {autonomyLevel === 2 ? "Level 2: Full Autonomous Execution" : "Level 1: Semi-Autonomous Confirmation"}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAutonomyLevel(1)}
              className={`p-3 rounded-xl border text-left transition-all ${
                autonomyLevel === 1
                  ? "bg-primary/10 border-primary text-foreground"
                  : "bg-secondary/40 border-transparent text-muted-foreground hover:border-border"
              }`}
            >
              <p className="text-xs font-bold">Level 1: Semi-Autonomous</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Agents propose trades &amp; rebalances; user confirms each action with 1-click.
              </p>
            </button>
            <button
              onClick={() => setAutonomyLevel(2)}
              className={`p-3 rounded-xl border text-left transition-all ${
                autonomyLevel === 2
                  ? "bg-emerald-500/10 border-emerald-500/40 text-foreground"
                  : "bg-secondary/40 border-transparent text-muted-foreground hover:border-border"
              }`}
            >
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={13} /> Level 2: Full Autonomy
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Agents execute autonomously via NEAR Intents within user hard caps.
              </p>
            </button>
          </div>
        </div>

        {/* 4 Specialized Agents Fleet Cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active Specialized Agents Fleet (4 Agents)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agentsList.map((agent) => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.id}
                  className="p-3.5 rounded-xl bg-secondary/40 border border-border flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 rounded-xl bg-card border border-border flex-shrink-0">
                        <AgentAvatar agentId={agent.id} size={28} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground leading-tight">
                          {agent.name}
                        </h4>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {agent.role}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {agent.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {agent.stats}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border text-[10px] font-mono text-foreground/80">
                    {agent.highlights.map((h, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {accountId ? (
              <span>Wallet Connected: <strong className="text-foreground font-mono">{accountId}</strong></span>
            ) : (
              <span>Connect wallet to authorize autonomous signing delegation</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {!accountId && (
              <button
                onClick={onConnect}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
              >
                Connect Wallet
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
