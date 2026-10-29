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
  Sparkles,
  Users,
  Coins,
  Percent,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  XCircle,
  UserCheck
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";

type Props = {
  accountId: string | null;
  onSelectAgentTab?: (tab: string) => void;
  onConnectWallet?: () => void;
};

interface MarketplaceAgent {
  id: number;
  listing_id: string;
  creator_wallet: string;
  agent_type: string;
  name: string;
  description: string;
  pricing_type: string;
  pricing_value: number;
  fee_display: string;
  config_snapshot: Record<string, any>;
  win_rate_pct: number;
  sharpe_ratio: number;
  total_subscribers: number;
  created_at: string;
}

interface HiredAgent {
  hire_id: string;
  listing_id: string;
  agent_type: string;
  creator_wallet: string;
  subscriber_wallet: string;
  pricing_type: string;
  pricing_value: number;
  status: string;
  hired_at: string;
  agent_name: string;
  description: string;
  win_rate_pct: number;
  sharpe_ratio: number;
  config_snapshot: Record<string, any>;
}

export default function AgentMarketplace({ accountId, onSelectAgentTab, onConnectWallet }: Props) {
  const [activeTab, setActiveTab] = useState<"browse" | "hired">("browse");
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [myHires, setMyHires] = useState<HiredAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHiringId, setIsHiringId] = useState<string | null>(null);
  const [hireSuccessMsg, setHireSuccessMsg] = useState<string | null>(null);

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/marketplace/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
      if (accountId) {
        const hireRes = await fetch(`/api/marketplace/hires/${accountId}`);
        if (hireRes.ok) {
          const hireData = await hireRes.json();
          setMyHires(hireData.my_hires || []);
        }
      } else {
        setMyHires([]);
      }
    } catch (err) {
      console.error("Marketplace fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [accountId]);

  const handleHire = async (listingId: string) => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect your wallet first to hire an agent.");
      return;
    }

    setIsHiringId(listingId);
    setHireSuccessMsg(null);
    try {
      const res = await fetch("/api/marketplace/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_wallet: accountId,
          listing_id: listingId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to hire agent.");
      }

      setHireSuccessMsg(data.message || "Agent hired! Actions will now be mirrored to your wallet.");
      await fetchListings();
      setTimeout(() => setHireSuccessMsg(null), 6000);
    } catch (e: any) {
      alert(e.message || "Error hiring agent");
    } finally {
      setIsHiringId(null);
    }
  };

  const handleCancelHire = async (hireId: string) => {
    if (!accountId) return;
    if (!confirm("Are you sure you want to stop mirroring this agent's actions?")) return;

    try {
      const res = await fetch("/api/marketplace/hire/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_wallet: accountId,
          hire_id: hireId
        })
      });
      if (res.ok) {
        await fetchListings();
      }
    } catch (e) {
      console.error("Error cancelling hire:", e);
    }
  };

  const isAlreadyHired = (listingId: string) => {
    return myHires.some((h) => h.listing_id === listingId && h.status === "active");
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-3xl border border-border bg-gradient-to-r from-card/90 via-secondary/30 to-card/90 p-6 md:p-8 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold tracking-wider uppercase border border-primary/25">
                Decentralized Marketplace
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground text-[11px] font-mono">
                NEAR TESTNET
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              Neptune Agent Marketplace
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground max-w-2xl mt-1 leading-relaxed">
              Hire proven AI trading and research agents built by top community creators. When a creator’s agent executes a trade or research report, the exact same action is automatically mirrored to your wallet.
            </p>
          </div>

          {onSelectAgentTab && (
            <button
              onClick={() => onSelectAgentTab("agent-suite")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/20 shrink-0 self-start md:self-auto active:scale-95"
            >
              <PlusCircle size={15} />
              <span>Share Your Agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Switcher: Browse vs My Hires */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("browse")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "browse"
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Store size={14} />
            <span>Available Agents</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/30 font-mono">
              {agents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("hired")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "hired"
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <UserCheck size={14} />
            <span>My Hired Agents</span>
            {myHires.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-bold">
                {myHires.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={fetchListings}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Refresh listings"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Hire Success Notification */}
      {hireSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in-0">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="font-medium">{hireSuccessMsg}</span>
          </div>
          <button
            onClick={() => setHireSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* ─── TAB 1: BROWSE AGENTS ─── */}
      {activeTab === "browse" && (
        <>
          {isLoading && agents.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground font-mono">Loading active marketplace listings...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="p-10 rounded-2xl bg-card border border-border text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-primary mx-auto">
                <Store size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">No Agents Listed Yet</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Be the first creator to share your agent! Go to the <strong>Neptune Agent Suite</strong>, open your Trader, Rebalancer, or Research agent, and click <strong>Share to Marketplace</strong> to set your terms and earn fees.
                </p>
              </div>
              {onSelectAgentTab && (
                <button
                  onClick={() => onSelectAgentTab("agent-suite")}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                >
                  Open Agent Suite
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {agents.map((agent) => {
                const isCreator = accountId && agent.creator_wallet.toLowerCase() === accountId.toLowerCase();
                const isHired = isAlreadyHired(agent.listing_id);
                const isHiring = isHiringId === agent.listing_id;

                return (
                  <div
                    key={agent.listing_id}
                    className="p-6 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all shadow-md shadow-black/10 group"
                  >
                    <div className="space-y-3.5">
                      {/* Top Bar: Avatar, Title, Creator, Category */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-secondary/80 border border-border flex items-center justify-center p-1 shadow-sm">
                            <AgentAvatar agentId={agent.agent_type} size={30} />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                              {agent.name}
                            </h3>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              Creator: <span className="text-foreground font-semibold">{agent.creator_wallet}</span>
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-secondary border border-border text-primary">
                          {agent.agent_type}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {agent.description}
                      </p>

                      {/* Performance Stats */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-secondary/30 border border-border text-center">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Sharpe Ratio</span>
                          <p className="text-sm font-mono font-bold text-emerald-400">
                            {agent.sharpe_ratio}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Win Rate</span>
                          <p className="text-sm font-mono font-bold text-primary">
                            {agent.win_rate_pct}%
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Subscribers</span>
                          <p className="text-sm font-mono font-bold text-foreground">
                            {agent.total_subscribers}
                          </p>
                        </div>
                      </div>

                      {/* Public Strategy Parameters Snapshot */}
                      {agent.config_snapshot && Object.keys(agent.config_snapshot).length > 0 && (
                        <div className="space-y-1.5 text-xs">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Active Parameters &amp; Strategy
                          </span>
                          <div className="p-2.5 rounded-lg bg-secondary/20 border border-border font-mono text-[11px] space-y-1 max-h-24 overflow-y-auto">
                            {Object.entries(agent.config_snapshot).map(([k, v]) => (
                              <div key={k} className="flex justify-between text-muted-foreground">
                                <span className="capitalize">{k.replace(/_/g, " ")}:</span>
                                <span className="text-foreground font-semibold truncate max-w-[200px]">
                                  {Array.isArray(v) ? v.join(", ") : String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action & Fee Footer */}
                    <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                          Monetization Terms
                        </span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">
                          {agent.fee_display}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCreator ? (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground border border-border">
                            Your Agent
                          </span>
                        ) : isHired ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Hired (Copying)</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleHire(agent.listing_id)}
                            disabled={isHiring}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-all shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50"
                          >
                            {isHiring ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <UserCheck size={13} />
                            )}
                            <span>Hire &amp; Mirror</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: MY HIRED AGENTS ─── */}
      {activeTab === "hired" && (
        <div className="space-y-4">
          {!accountId ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <p className="text-xs text-muted-foreground">Please connect your wallet to view and manage your hired agents.</p>
              <button
                onClick={onConnectWallet}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20"
              >
                Connect Wallet
              </button>
            </div>
          ) : myHires.length === 0 ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground mx-auto">
                <UserCheck size={20} />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Hired Agents Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You haven’t hired any agents yet. Browse the marketplace and hire a top community agent to mirror their trades automatically!
              </p>
              <button
                onClick={() => setActiveTab("browse")}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20"
              >
                Browse Available Agents
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myHires.map((hire) => (
                <div
                  key={hire.hire_id}
                  className="p-5 rounded-2xl bg-card border border-emerald-500/25 space-y-3 shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center p-1">
                        <AgentAvatar agentId={hire.agent_type} size={28} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{hire.agent_name}</h4>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Creator: <span className="text-foreground">{hire.creator_wallet}</span>
                        </p>
                      </div>
                    </div>

                    <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>MIRRORING ACTIVE</span>
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {hire.description}
                  </p>

                  <div className="p-3 rounded-xl bg-secondary/30 border border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Agreed Terms:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {hire.pricing_type === "profit_share"
                        ? `${hire.pricing_value}% Profit Share`
                        : `${hire.pricing_value} NEAR / Trade`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Hired: {new Date(hire.hired_at).toLocaleDateString()}
                    </span>

                    <button
                      onClick={() => handleCancelHire(hire.hire_id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all"
                    >
                      Cancel Mirroring
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
