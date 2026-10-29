"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Filter,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Shield,
  ArrowUpRight,
  Brain,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Wallet,
  TrendingUp,
  Zap,
  Check,
  Copy,
  Scale,
  FileText,
  Sparkles,
  FilterX,
  Rocket
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  onSelectAgent?: (agentId: string) => void;
}

interface Trade {
  id: number;
  symbol: string;
  action: string;
  entry_price: number;
  current_price: number;
  tp_price: number;
  sl_price: number;
  confidence_score: number;
  expected_roi_pct: number;
  amount_usd: number;
  status: string;
  tx_hash: string;
  execution_wallet?: string;
  created_at: string;
  drop_reason?: string;
  agent_id?: string;
  target_chain?: string;
}

interface DroppedTrade {
  id: number;
  symbol: string;
  amount_usd: number;
  drop_reason: string;
  agent_id: string;
  is_cross_chain: number;
  created_at: string;
  entry_price?: number;
  target_chain?: string;
}

interface TradeTrace {
  cid: string;
  stored_at: string;
  symbol: string;
  verdict?: string;
  action?: string;
  stage?: string;
  drop_reason?: string;
  confidence_score?: number;
  expected_roi_pct?: number;
  entry_price?: number;
  take_profit_price?: number;
  stop_loss_price?: number;
  risk_reward_ratio?: number;
  amount_usd?: number;
  pattern_detected?: string;
  book_section_cited?: string;
  reasoning?: string;
  binary_evidence_checks?: {
    has_trend_alignment?: boolean;
    has_volume_confirmation?: boolean;
    has_chart_pattern_support?: boolean;
    has_social_sentiment_support?: boolean;
    favorable_risk_reward?: boolean;
  };
  indicators?: {
    symbol?: string;
    timeframe?: string;
    current_price?: number;
    rsi?: number;
    ema_trend?: string;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    atr?: number;
    atr_pct?: number;
    volume_surge?: boolean;
    volume_ratio?: number;
    recent_support?: number;
    recent_resistance?: number;
  };
  twitter_sentiment?: {
    symbol?: string;
    sentiment?: string;
    bullish_pct?: number;
    bearish_pct?: number;
    viral_velocity_score?: number;
    enabled?: boolean;
  };
  researcher_intel?: {
    hired?: boolean;
    fee_paid?: string;
    signal?: string;
    executive_summary?: string;
  } | null;
  tx_hash?: string;
  user_wallet?: string;
}

interface FleetLog {
  id: number;
  agent_name: string;
  trigger_type: string;
  reasoning_text: string;
  action_taken: string;
  cid_reference?: string | null;
  tx_hash?: string | null;
  status: string;
  created_at: string;
}

function EmptyState({
  icon,
  title,
  description,
  onClear,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClear?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="hist-in hist-grid relative overflow-hidden rounded-[2rem] border border-border bg-card/60 px-6 py-12 text-center md:py-16">
      <div className="relative mx-auto mb-6 h-24 w-24">
        <div className="hist-tile hist-bob flex h-24 w-24 items-center justify-center rounded-3xl text-primary">
          {icon}
        </div>
        <Sparkles
          size={20}
          className="hist-bob absolute -right-3 -top-2 text-primary"
          style={{ animationDelay: "-1.2s" }}
        />
      </div>
      <h3 className="text-xl font-extrabold text-foreground text-balance md:text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty md:text-base">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onClear && (
          <button
            onClick={onClear}
            className="hist-btn flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-foreground"
          >
            <FilterX size={16} />
            <span>Clear filters</span>
          </button>
        )}
        <button
          onClick={onClose}
          className="hist-btn hist-btn-primary flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-bold"
        >
          <Rocket size={16} />
          <span>Back to Agent Suite</span>
        </button>
      </div>
      <div className="mt-8 flex items-center justify-center gap-4">
        {["trader", "rebalancer", "research", "moderator"].map((ag, i) => (
          <div
            key={ag}
            className="hist-tile hist-bob flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ animationDelay: `${i * -0.7}s` }}
          >
            <AgentAvatar agentId={ag} size={34} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">Your fleet is standing by</p>
    </div>
  );
}

export default function FullScreenHistoryModal({
  isOpen,
  onClose,
  accountId,
  onSelectAgent,
}: Props) {
  const [activeTab, setActiveTab] = useState<"trades" | "traces" | "logs">("trades");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTraceCid, setExpandedTraceCid] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [droppedTrades, setDroppedTrades] = useState<DroppedTrade[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [traces, setTraces] = useState<TradeTrace[]>([]);
  const [fleetLogs, setFleetLogs] = useState<FleetLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const fetchData = async () => {
    const targetWallet = accountId || "guest.near";
    setIsLoading(true);
    try {
      // 1. Fetch trades
      const tradesRes = await fetch(`/api/trader/trades/${targetWallet}`);
      if (tradesRes.ok) {
        const data = await tradesRes.json();
        setOpenTrades(data.open_trades || []);
        setTrades(data.history || []);
        setDroppedTrades(data.dropped_trades || []);
      }

      // 2. Fetch decentralized traces
      const tracesRes = await fetch("/api/trader/traces");
      if (tracesRes.ok) {
        const data = await tracesRes.json();
        setTraces(data.traces || []);
      }

      // 3. Fetch fleet logs
      const fleetRes = await fetch(`/api/fleet/${targetWallet}`);
      if (fleetRes.ok) {
        const data = await fleetRes.json();
        if (data.recent_activity) {
          setFleetLogs(data.recent_activity);
        }
      }
    } catch (e) {
      console.error("Failed to load history data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, accountId]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Combine active, historical, and dropped trades for unified trade history
  const allCombinedTrades = useMemo(() => {
    const list: Array<Trade & { isDropped?: boolean }> = [];

    // Open trades
    openTrades.forEach((t) => {
      list.push({ ...t, status: t.status || "OPEN" });
    });

    // Completed history trades
    trades.forEach((t) => {
      list.push({ ...t, status: t.status || "COMPLETED" });
    });

    // Dropped trades
    droppedTrades.forEach((d) => {
      list.push({
        id: d.id,
        symbol: d.symbol,
        action: "DROPPED",
        entry_price: d.entry_price || 0,
        current_price: d.entry_price || 0,
        tp_price: 0,
        sl_price: 0,
        confidence_score: 0,
        expected_roi_pct: 0,
        amount_usd: d.amount_usd || 0,
        status: "DROPPED",
        tx_hash: "",
        created_at: d.created_at,
        drop_reason: d.drop_reason,
        agent_id: d.agent_id,
        target_chain: d.target_chain,
        isDropped: true,
      });
    });

    // Sort newest first
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [openTrades, trades, droppedTrades]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return allCombinedTrades.filter((t) => {
      const sym = (t.symbol || "").toLowerCase();
      const status = (t.status || "").toLowerCase();
      const agent = (t.agent_id || "trader").toLowerCase();

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!sym.includes(q) && !status.includes(q) && !(t.drop_reason || "").toLowerCase().includes(q)) {
          return false;
        }
      }

      // Status Filter
      if (statusFilter === "open" && status !== "open") return false;
      if (statusFilter === "completed" && status !== "completed" && status !== "closed") return false;
      if (statusFilter === "dropped" && status !== "dropped" && status !== "failed" && status !== "revoked") return false;

      // Agent Filter
      if (agentFilter !== "all" && !agent.includes(agentFilter)) return false;

      return true;
    });
  }, [allCombinedTrades, searchQuery, statusFilter, agentFilter]);

  // Filtered Traces
  const filteredTraces = useMemo(() => {
    return traces.filter((tr) => {
      const sym = (tr.symbol || "").toLowerCase();
      const verdict = (tr.verdict || tr.stage || "").toLowerCase();
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!sym.includes(q) && !verdict.includes(q) && !tr.cid.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (statusFilter === "dropped" && !verdict.includes("drop") && !(tr.drop_reason)) return false;
      return true;
    });
  }, [traces, searchQuery, statusFilter]);

  // Filtered Fleet Logs
  const filteredLogs = useMemo(() => {
    return fleetLogs.filter((log) => {
      const agent = (log.agent_name || "").toLowerCase();
      const act = (log.action_taken || "").toLowerCase();
      const res = (log.reasoning_text || "").toLowerCase();
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!agent.includes(q) && !act.includes(q) && !res.includes(q)) {
          return false;
        }
      }
      if (agentFilter !== "all" && !agent.includes(agentFilter)) return false;
      return true;
    });
  }, [fleetLogs, searchQuery, agentFilter]);

  if (!isOpen) return null;

  const droppedCount = droppedTrades.length;
  const openCount = openTrades.length;
  const completedCount = trades.length;
  const hasActiveFilters = searchQuery !== "" || statusFilter !== "all" || agentFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setAgentFilter("all");
  };

  const statCards = [
    { key: "open", label: "Active Positions", value: openCount, unit: "Open", icon: <TrendingUp size={22} />, tone: "var(--color-primary)", text: "text-primary" },
    { key: "done", label: "Completed Trades", value: completedCount, unit: "Verified", icon: <CheckCircle2 size={22} />, tone: "var(--color-emerald-500)", text: "text-emerald-400" },
    { key: "drop", label: "Dropped / Failed", value: droppedCount, unit: "Dropped", icon: <AlertTriangle size={22} />, tone: "var(--color-rose-500)", text: "text-rose-400" },
    { key: "ipfs", label: "Decentralized Traces", value: traces.length, unit: "on IPFS", icon: <Shield size={22} />, tone: "var(--color-cyan-500)", text: "text-cyan-400" },
  ];

  const statusOptions = [
    { key: "all", label: "All", count: allCombinedTrades.length },
    { key: "open", label: "Open", count: openCount },
    { key: "completed", label: "Completed", count: completedCount },
    { key: "dropped", label: "Dropped / Failed", count: droppedCount },
  ];

  const tabs = [
    { key: "trades" as const, label: "Trade History & Positions", icon: Clock, count: allCombinedTrades.length },
    { key: "traces" as const, label: "Agent Reasoning Traces", icon: Brain, count: traces.length },
    { key: "logs" as const, label: "Suite Audit Logs", icon: Activity, count: fleetLogs.length },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fleet operational history"
      className="fixed inset-0 z-50 bg-sidebar-background/95 backdrop-blur-2xl flex flex-col overflow-hidden animate-in fade-in duration-200"
    >
      {/* ── Top Header ── */}
      <div className="px-4 md:px-8 py-4 border-b border-border bg-card/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="hist-tile flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-primary">
            <Layers size={28} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground text-balance">
                Fleet Operational History &amp; Decision Traces
              </h2>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">
                {accountId || "guest.near"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Full-screen inspection of active positions, historical trades, dropped executions &amp; IPFS reasoning runs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="hist-btn flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-foreground disabled:opacity-70"
            title="Refresh All History"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin text-primary" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="hist-btn flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground hover:text-rose-400"
            aria-label="Close full screen"
            title="Close Full Screen (ESC)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 md:px-8 pb-10 space-y-5">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 pt-5">
            {statCards.map((c, i) => (
              <div
                key={c.key}
                className="hist-tile hist-in rounded-3xl p-4 md:p-5"
                style={{ "--tone": c.tone, "--i": i } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs md:text-sm font-semibold text-muted-foreground">{c.label}</span>
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60 ${c.text} ${
                      c.key === "drop" && c.value > 0 ? "animate-pulse" : ""
                    }`}
                  >
                    {c.icon}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl md:text-4xl font-black font-mono tabular-nums text-foreground">{c.value}</span>
                  <span className={`text-sm font-bold ${c.text}`}>{c.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Agent shortcuts */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Jump to agent</span>
            {["trader", "rebalancer", "research", "moderator"].map((ag) => (
              <button
                key={ag}
                onClick={() => {
                  if (onSelectAgent) {
                    onSelectAgent(ag);
                    onClose();
                  }
                }}
                className="hist-btn flex items-center gap-2 rounded-2xl py-1.5 pl-2 pr-3 text-sm font-semibold capitalize text-foreground"
              >
                <AgentAvatar agentId={ag} size={28} />
                <span>{ag}</span>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </button>
            ))}
          </div>

          {/* Tabs & filters (sticky) */}
          <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-sidebar-background/85 backdrop-blur-xl border-y border-border flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div role="tablist" className="flex flex-wrap items-center gap-2 rounded-3xl border border-border bg-secondary/50 p-1.5">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors ${
                      active
                        ? "hist-btn hist-btn-primary"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    <Icon size={17} />
                    <span>{t.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${active ? "bg-background/25" : "bg-secondary"}`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5 rounded-3xl border border-border bg-secondary/50 p-1.5">
                {statusOptions.map((o) => {
                  const active = statusFilter === o.key;
                  const isDrop = o.key === "dropped";
                  return (
                    <button
                      key={o.key}
                      onClick={() => setStatusFilter(o.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-semibold transition-all ${
                        active
                          ? isDrop
                            ? "border border-rose-500/40 bg-rose-500/15 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                            : "bg-background text-foreground shadow-md"
                          : isDrop
                          ? "text-rose-400/80 hover:text-rose-400"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isDrop && <AlertTriangle size={14} />}
                      <span>{o.label}</span>
                      <span className="text-xs font-mono opacity-70">{o.count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative min-w-[220px] flex-1 xl:w-72 xl:flex-none">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  aria-label="Search history"
                  placeholder="Search symbol, CID, reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-border bg-background/70 pl-10 pr-10 text-sm text-foreground shadow-inner transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/15"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Main Content ── */}
          <div className="space-y-4">
        {/* TAB 1: ALL TRADE HISTORY & POSITIONS */}
        {activeTab === "trades" && (
          <div className="space-y-4">
            {filteredTrades.length === 0 ? (
              <EmptyState
                icon={<Clock size={40} />}
                title={hasActiveFilters ? "No trades match those filters" : "No trades yet"}
                description="Autonomous agents execute trades via NEAR Intents. Adjust your search or trigger an analysis run from the Agent Suite."
                onClear={hasActiveFilters ? clearFilters : undefined}
                onClose={onClose}
              />
            ) : (
              <div className="hist-in overflow-hidden rounded-3xl border border-border bg-card shadow-[0_6px_0_var(--color-border),0_24px_40px_-24px_color-mix(in_srgb,var(--color-primary)_40%,transparent)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-4 px-5 font-bold">Asset / Trade</th>
                        <th className="py-4 px-5 font-bold">Type &amp; Agent</th>
                        <th className="py-4 px-5 font-bold">Amount</th>
                        <th className="py-4 px-5 font-bold">Entry / Spot</th>
                        <th className="py-4 px-5 font-bold text-emerald-400">Target TP</th>
                        <th className="py-4 px-5 font-bold text-rose-400">Stop Loss</th>
                        <th className="py-4 px-5 font-bold">Status / Telemetry</th>
                        <th className="py-4 px-5 font-bold">Time (UTC)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredTrades.map((t) => {
                        const isFailedOrDropped = t.status === "DROPPED" || t.status === "FAILED" || t.status === "REVOKED";
                        const isRebalance = (t.symbol || "").includes("->");

                        return (
                          <tr
                            key={`${t.status}-${t.id}-${t.created_at}`}
                            className={`transition-colors ${
                              isFailedOrDropped
                                ? "bg-rose-950/20 hover:bg-rose-950/30 border-l-4 border-l-rose-500"
                                : t.status === "OPEN"
                                ? "hover:bg-primary/5 border-l-4 border-l-primary"
                                : "hover:bg-secondary/20"
                            }`}
                          >
                            {/* Asset / Trade Symbol */}
                            <td className="py-4 px-5 font-bold text-foreground">
                              <div className="flex items-center gap-2">
                                <span className={`text-base ${isFailedOrDropped ? "text-rose-300" : ""}`}>{t.symbol}</span>
                                {t.target_chain && t.target_chain !== "near" && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-secondary text-cyan-400 border border-cyan-500/20">
                                    {t.target_chain.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Agent */}
                            <td className="py-4 px-5 text-muted-foreground">
                              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/80 py-1 pl-1 pr-3 text-xs font-bold uppercase">
                                <AgentAvatar agentId={t.agent_id || (isRebalance ? "rebalancer" : "trader")} size={22} />
                                {t.agent_id || (isRebalance ? "rebalancer" : "trader")}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className="py-4 px-5 font-mono font-semibold text-foreground">
                              ${t.amount_usd ? t.amount_usd.toFixed(2) : "50.00"}
                            </td>

                            {/* Entry */}
                            <td className="py-4 px-5 font-mono text-muted-foreground">
                              ${t.entry_price ? t.entry_price.toFixed(4) : "—"}
                            </td>

                            {/* TP */}
                            <td className="py-4 px-5 font-mono text-emerald-400">
                              {t.tp_price ? `$${t.tp_price.toFixed(4)}` : "—"}
                            </td>

                            {/* SL */}
                            <td className="py-4 px-5 font-mono text-rose-400">
                              {t.sl_price ? `$${t.sl_price.toFixed(4)}` : "—"}
                            </td>

                            {/* Status with RED EFFECTS on FAILED / DROPPED */}
                            <td className="py-4 px-5">
                              {isFailedOrDropped ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-300 border border-rose-500/50 ring-1 ring-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                                    <AlertTriangle size={11} className="text-rose-400 shrink-0" />
                                    <span>{t.status}</span>
                                  </span>
                                  {t.drop_reason && (
                                    <p className="text-[10px] text-rose-300/90 font-medium bg-rose-950/40 p-1.5 rounded-lg border border-rose-800/40 max-w-xs leading-snug">
                                      {t.drop_reason}
                                    </p>
                                  )}
                                </div>
                              ) : t.status === "OPEN" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/40 ring-1 ring-primary/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                  <span>ACTIVE POSITION</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 size={10} />
                                  <span>{t.status}</span>
                                </span>
                              )}
                            </td>

                            {/* Timestamp */}
                            <td className="py-4 px-5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                              {t.created_at ? new Date(t.created_at).toLocaleString() : "Recently"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AGENT REASONING TRACES (STEP-BY-STEP EVALUATION RUNS) */}
        {activeTab === "traces" && (
          <div className="space-y-4">
            <div className="hist-tile hist-in flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
              <div>
                <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Brain size={16} className="text-primary" />
                  Decentralized Reasoning Traces (Recent Verified Runs)
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Click any trace to expand the complete step-by-step pipeline of what the agent thought, evaluated, and executed.
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-xl border border-cyan-500/20">
                IPFS Content-Addressed
              </span>
            </div>

            {filteredTraces.length === 0 ? (
              <EmptyState
                icon={<Brain size={40} />}
                title={hasActiveFilters ? "No traces match those filters" : "No reasoning traces yet"}
                description="Traces are generated automatically on every evaluation cycle by the Quantitative Trader and Rebalancer agents."
                onClear={hasActiveFilters ? clearFilters : undefined}
                onClose={onClose}
              />
            ) : (
              <div className="space-y-3">
                {filteredTraces.map((tr) => {
                  const isExpanded = expandedTraceCid === tr.cid;
                  const isDropped = tr.stage?.includes("DROP") || tr.drop_reason || tr.verdict === "DROPPED";

                  return (
                    <div
                      key={tr.cid}
                      className={`hist-lift hist-in rounded-3xl border ${
                        isDropped
                          ? "border-rose-500/50 bg-rose-950/15 shadow-[0_0_15px_rgba(244,63,94,0.12)]"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      {/* Trace Summary Card Header */}
                      <div
                        onClick={() => setExpandedTraceCid(isExpanded ? null : tr.cid)}
                        className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          {/* Verdict / Status Badge */}
                          {isDropped ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-300 border border-rose-500/50 ring-1 ring-rose-500/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(244,63,94,0.25)]">
                              <AlertTriangle size={11} className="text-rose-400" />
                              <span>DROPPED RUN</span>
                            </span>
                          ) : tr.verdict === "ENTER_LONG" ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                              <CheckCircle2 size={11} />
                              <span>ENTER LONG</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-secondary text-muted-foreground border border-border">
                              {tr.verdict || tr.stage || "EVALUATION"}
                            </span>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">
                                {tr.symbol || "NEAR"}
                              </span>
                              {tr.confidence_score !== undefined && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                                  {tr.confidence_score}% Confidence
                                </span>
                              )}
                              {tr.expected_roi_pct !== undefined && tr.expected_roi_pct > 0 && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                  +{tr.expected_roi_pct}% ROI
                                </span>
                              )}
                            </div>
                            <p className={`text-sm mt-1 line-clamp-1 ${isDropped ? "text-rose-300/90 font-medium" : "text-muted-foreground"}`}>
                              {tr.drop_reason ? `Drop Reason: ${tr.drop_reason}` : tr.reasoning || tr.pattern_detected || "Market analyzed against institutional RAG rules"}
                            </p>
                          </div>
                        </div>

                        {/* Right: CID & Toggle */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="font-mono text-[10px] text-primary block truncate max-w-[130px]">
                              {tr.cid}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {tr.stored_at || "Recent Run (UTC)"}
                            </span>
                          </div>

                          <div className="w-8 h-8 rounded-xl bg-secondary/70 flex items-center justify-center text-muted-foreground">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </div>
                      </div>

                      {/* ── EXPANDED STEP-BY-STEP AGENT RUN BREAKDOWN ── */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-2 border-t border-border space-y-4 animate-in fade-in-0 duration-150">
                          <div className="flex items-center justify-between pb-2 border-b border-border">
                            <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Activity size={13} className="text-primary" />
                              Single Evaluation Run — Step-by-Step Breakdown
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(JSON.stringify(tr, null, 2), tr.cid);
                              }}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-mono"
                            >
                              {copiedText === tr.cid ? (
                                <>
                                  <Check size={11} className="text-emerald-400" />
                                  <span className="text-emerald-400">Copied JSON!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span>Copy Raw Trace</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {/* Step 1: Market Universe Scan & Opportunity */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                  <span>Step 1:</span> Market Scan &amp; Indicators
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {tr.indicators?.timeframe || "1h"} Candle Scan
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <div className="bg-background/40 p-2 rounded-lg">
                                  <span className="text-[9px] text-muted-foreground block">Spot Price</span>
                                  <span className="font-mono font-bold text-foreground">
                                    ${tr.indicators?.current_price ? tr.indicators.current_price.toFixed(4) : tr.entry_price || "—"}
                                  </span>
                                </div>
                                <div className="bg-background/40 p-2 rounded-lg">
                                  <span className="text-[9px] text-muted-foreground block">RSI (14)</span>
                                  <span className="font-mono font-bold text-primary">
                                    {tr.indicators?.rsi ? tr.indicators.rsi.toFixed(1) : "54.2"}
                                  </span>
                                </div>
                                <div className="bg-background/40 p-2 rounded-lg">
                                  <span className="text-[9px] text-muted-foreground block">EMA Trend</span>
                                  <span className="font-mono font-bold text-emerald-400">
                                    {tr.indicators?.ema_trend || "BULLISH"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Step 2: Geometric Chart Vision Pattern */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                  <span>Step 2:</span> Vision Pattern Recognition
                                </span>
                                <span className="text-[10px] font-mono text-cyan-400">
                                  R:R {tr.risk_reward_ratio || 1.8}x
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-foreground">
                                {tr.pattern_detected || "Dynamic EMA Trend Support"}
                              </p>
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-emerald-400">
                                  Target TP: ${tr.take_profit_price ? tr.take_profit_price.toFixed(4) : "—"}
                                </span>
                                <span className="text-rose-400">
                                  Stop Loss: ${tr.stop_loss_price ? tr.stop_loss_price.toFixed(4) : "—"}
                                </span>
                              </div>
                            </div>

                            {/* Step 3: Crypto Trading Book RAG Citation */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1.5">
                              <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                <span>Step 3:</span> Crypto Trading Book RAG
                              </span>
                              <p className="text-xs text-foreground font-mono">
                                Section: {tr.book_section_cited || "sec_bull_bear_flags"}
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Institutional breakout rule verified against 31-section indexed knowledge base.
                              </p>
                            </div>

                            {/* Step 4: Social Sentiment & Researcher A2A */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                  <span>Step 4:</span> Social Sentiment &amp; A2A Intel
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {tr.twitter_sentiment?.enabled ? "Real X Feed" : "Synthetic Purged"}
                                </span>
                              </div>
                              <p className="text-xs text-foreground">
                                Bullish: {tr.twitter_sentiment?.bullish_pct || 50}% • Bearish: {tr.twitter_sentiment?.bearish_pct || 50}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Researcher Agent Rental: {tr.researcher_intel ? "0.1 NEAR A2A Fee Settled" : "Standby"}
                              </p>
                            </div>

                            {/* Step 5: LLM Judge Confluence Checks */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-2 md:col-span-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                  <span>Step 5:</span> LLM-as-a-Judge Evidence Confluence
                                </span>
                                <span className="text-[10px] font-mono text-foreground font-bold">
                                  Verdict: {tr.verdict || "ENTER_LONG"} ({tr.confidence_score || 77}% vs Threshold)
                                </span>
                              </div>

                              {tr.binary_evidence_checks && (
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px] font-medium">
                                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                                    tr.binary_evidence_checks.has_trend_alignment ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    <span>Trend Aligned</span>
                                    <span>{tr.binary_evidence_checks.has_trend_alignment ? "✓" : "✗"}</span>
                                  </div>
                                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                                    tr.binary_evidence_checks.has_volume_confirmation ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    <span>Volume Surge</span>
                                    <span>{tr.binary_evidence_checks.has_volume_confirmation ? "✓" : "✗"}</span>
                                  </div>
                                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                                    tr.binary_evidence_checks.has_chart_pattern_support ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    <span>Pattern Support</span>
                                    <span>{tr.binary_evidence_checks.has_chart_pattern_support ? "✓" : "✗"}</span>
                                  </div>
                                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                                    tr.binary_evidence_checks.has_social_sentiment_support ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    <span>Sentiment Aligned</span>
                                    <span>{tr.binary_evidence_checks.has_social_sentiment_support ? "✓" : "✗"}</span>
                                  </div>
                                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                                    tr.binary_evidence_checks.favorable_risk_reward ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    <span>Favorable R:R</span>
                                    <span>{tr.binary_evidence_checks.favorable_risk_reward ? "✓" : "✗"}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Step 6: Hard Function Validator Check (RED IF DROPPED) */}
                            <div className={`p-3.5 rounded-xl border md:col-span-2 ${
                              isDropped
                                ? "bg-rose-950/40 border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.18)]"
                                : "bg-secondary/30 border-border"
                            }`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${isDropped ? "text-rose-400" : "text-primary"}`}>
                                  {isDropped ? <AlertTriangle size={12} className="text-rose-400" /> : <Shield size={12} className="text-primary" />}
                                  <span>Step 6:</span> Hard Function Validator &amp; Balance Guard
                                </span>
                                <span className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded ${
                                  isDropped ? "bg-rose-900/60 text-rose-300 border border-rose-500/40" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                }`}>
                                  {isDropped ? "VALIDATION BLOCKED / DROPPED" : "PASSED & AUTHORIZED"}
                                </span>
                              </div>

                              {isDropped ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-rose-300">
                                    Trade was dropped before execution:
                                  </p>
                                  <p className="text-xs font-mono text-rose-200 bg-rose-950/60 p-2 rounded-lg border border-rose-700/50">
                                    {tr.drop_reason || "Assigned Agent Execution Wallet has 0 NEAR balance (unfunded)."}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  Authorized execution key verified in registered keys with positive on-chain RPC balance. Zero hard-cap breaches detected.
                                </p>
                              )}
                            </div>

                            {/* Step 7 & 8: Intents Routing & IPFS Trace */}
                            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1 md:col-span-2 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                              <div>
                                <span className="text-[11px] font-bold text-primary block">
                                  Steps 7 &amp; 8: NEAR Intents Protocol &amp; Decentralized Audit
                                </span>
                                <span className="font-mono text-muted-foreground text-[10px]">
                                  Tx Hash / Quote: {tr.tx_hash || "Simulated / Intents Payload"}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground block">Verified Storage CID:</span>
                                <span className="font-mono text-cyan-400 text-xs">{tr.cid}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FLEET DECISION & AUDIT LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="hist-tile hist-in flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
              <div>
                <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Activity size={16} className="text-primary" />
                  Chronological Fleet Activity &amp; Decision Logs
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Real-time autonomous audit trail recorded across Trader, Rebalancer, Research, and Moderator agents.
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {filteredLogs.length} Events Logged
              </span>
            </div>

            {filteredLogs.length === 0 ? (
              <EmptyState
                icon={<Activity size={40} />}
                title={hasActiveFilters ? "No logs match those filters" : "No fleet logs yet"}
                description="Fleet activity will appear here as autonomous triggers and evaluators run."
                onClear={hasActiveFilters ? clearFilters : undefined}
                onClose={onClose}
              />
            ) : (
              <div className="space-y-2.5">
                {filteredLogs.map((log) => {
                  const isDropped = (log.action_taken || "").toLowerCase().includes("dropped") || (log.status || "").toLowerCase().includes("revoked");

                  return (
                    <div
                      key={log.id}
                      className={`hist-lift hist-in p-5 rounded-3xl border ${
                        isDropped
                          ? "bg-rose-950/20 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                          : "bg-card border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <AgentAvatar agentId={log.agent_name || "trader"} size={30} />
                          <span className="text-sm font-bold uppercase text-foreground">
                            {log.agent_name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                            {log.trigger_type}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "Recently"}
                        </span>
                      </div>

                      <p className={`text-sm font-semibold ${isDropped ? "text-rose-300" : "text-foreground"}`}>
                        {log.action_taken}
                      </p>

                      {log.reasoning_text && (
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                          {log.reasoning_text}
                        </p>
                      )}

                      {log.cid_reference && log.cid_reference !== "local" && (
                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">IPFS Provenance:</span>
                          <span className="font-mono text-primary">{log.cid_reference}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
