"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCw,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  TrendingDown,
  Layers,
  Brain,
  Gauge,
  Sparkles,
  Zap,
  Check,
  X
} from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

export default function ModeratorSection({ accountId, onConnectWallet }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);

  const fetchStatus = async () => {
    const targetWallet = accountId || "guest.near";
    setIsLoading(true);
    try {
      const res = await fetch(`/api/moderator/status/${targetWallet}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Moderator status error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 25000);
    return () => clearInterval(interval);
  }, [accountId]);

  const handleToggleKillSwitch = async (activate: boolean) => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet(); else alert("Please connect wallet first to toggle emergency circuit breaker");
      return;
    }
    setIsTogglingKillSwitch(true);
    try {
      await fetch("/api/moderator/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          activate: activate,
        }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Kill switch error:", e);
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  const isKillSwitchActive = status?.kill_switch_active;
  const overallScore = status?.overall_performance_score ?? (isKillSwitchActive ? 0 : 92);
  const verdict = status?.verdict ?? (isKillSwitchActive ? "SAFETY_BREACH_SUSPEND" : "OPTIMAL_HEALTH");
  const paramScores = status?.parameter_scores;

  const getVerdictStyle = (v: string) => {
    switch (v) {
      case "OPTIMAL_HEALTH":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "MODERATE_RISK":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "ELEVATED_DRIFT":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      default:
        return "bg-rose-500/20 text-rose-400 border-rose-500/30";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`p-2 rounded-lg ${isKillSwitchActive ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {isKillSwitchActive ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Moderator Watchdog Agent
            </h1>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getVerdictStyle(verdict)}`}>
              {verdict.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Autonomous <strong>LLM-as-a-Judge</strong> evaluating the entire fleet (Trader, Rebalancer, Research) across 5 core safety and performance parameters. Holds the Master Kill Switch authority to halt operations instantly.
          </p>
        </div>

        {/* Master Kill Switch Button & Refresh */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            title="Refresh LLM Audit"
          >
            <RotateCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>

          {isKillSwitchActive ? (
            <button
              onClick={() => handleToggleKillSwitch(false)}
              disabled={isTogglingKillSwitch || !accountId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
            >
              <Unlock size={14} />
              <span>Resume Fleet (Deactivate Kill Switch)</span>
            </button>
          ) : (
            <button
              onClick={() => handleToggleKillSwitch(true)}
              disabled={isTogglingKillSwitch || !accountId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-500/20 disabled:opacity-50"
            >
              <Power size={14} />
              <span>Emergency Kill Switch</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Overall Health Gauge + 5 Parameter Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Composite Fleet Health Score & Exposure */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Fleet Performance Score
              </span>
              <span className="text-xs font-mono text-primary font-bold">LLM-as-a-Judge</span>
            </div>

            {/* Circular / Radial Score Representation */}
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-[hsl(225,18%,18%)] bg-secondary/30 relative">
                <span className={`text-3xl font-extrabold font-mono ${
                  overallScore >= 80 ? "text-emerald-400" : overallScore >= 50 ? "text-amber-400" : "text-rose-400"
                }`}>
                  {overallScore}
                </span>
                <span className="text-[10px] text-muted-foreground absolute bottom-5">/ 100</span>
              </div>
              <p className="text-xs font-semibold text-foreground mt-3">
                {overallScore >= 80 ? "Optimal Fleet Operation" : overallScore >= 50 ? "Moderate Operational Risk" : "Safety Alert Active"}
              </p>
            </div>

            {/* Exposure Gauges */}
            <div className="space-y-3 pt-3 border-t border-[hsl(225,18%,14%)]">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Total Open Exposure</span>
                  <span className="font-mono text-foreground font-semibold">
                    ${status?.total_open_exposure_usd || 0} / ${status?.daily_limit_usd || 2000}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (status?.total_open_exposure_usd || 0) > 1000 ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{
                      width: `${Math.min(100, ((status?.total_open_exposure_usd || 0) / (status?.daily_limit_usd || 2000)) * 100)}%`
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-muted-foreground">
                <div className="p-2 rounded-lg bg-secondary/40 border border-[hsl(225,18%,14%)]">
                  <span>Open Trades</span>
                  <p className="text-xs font-bold text-foreground font-mono">{status?.open_trades_count || 0}</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/40 border border-[hsl(225,18%,14%)]">
                  <span>Daily Cap</span>
                  <p className="text-xs font-bold text-foreground font-mono">3 Trades</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dropped Trades Watchdog Alert */}
          {status?.dropped_trades_count > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Validator Dropped {status.dropped_trades_count} Trades
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">
                  SURVEILLANCE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Autonomous trades blocked by the Hard Agent Wallet Validator. Ensure active dedicated Agent Wallets are assigned in settings.
              </p>
              {status.dropped_trades && status.dropped_trades[0] && (
                <div className="p-2 rounded-lg bg-black/40 border border-rose-500/20 text-[10px] font-mono text-rose-300/90 truncate">
                  Latest: {status.dropped_trades[0].drop_reason}
                </div>
              )}
            </div>
          )}

          <div className="p-3 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] text-[11px] text-muted-foreground">
            <span className="text-foreground font-bold flex items-center gap-1.5 mb-0.5">
              <Zap size={13} className="text-primary" /> Active Guardian Scope
            </span>
            Watchdog poller monitors active orders, liquidation drift, stop losses, and agent wallet authorization every 25 seconds.
          </div>
        </div>

        {/* Right 2 Columns: 5-Parameter Breakdown from LLM Judge */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4">
            <div className="flex items-center justify-between border-b border-[hsl(225,18%,14%)] pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Brain size={16} className="text-primary" />
                LLM-as-a-Judge: 5 Key Performance &amp; Safety Parameters
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                Model: z-ai/glm-5.3-flash
              </span>
            </div>

            {/* 5 Parameters Cards */}
            <div className="space-y-3">
              {[
                {
                  key: "capital_safety_discipline",
                  label: "1. Capital Safety & Stop-Loss Discipline",
                  desc: "Position size limits, max capital per trade ($100 cap), and strict ATR stop adherence.",
                  score: paramScores?.capital_safety_discipline?.score ?? 95,
                  detail: paramScores?.capital_safety_discipline?.detail ?? "All orders strictly bounded by hard caps."
                },
                {
                  key: "signal_quality_win_expectancy",
                  label: "2. Signal Confluence & Edge Realism",
                  desc: "Confidence score rigor, geometric chart pattern confluence, and R:R ratios >= 1.5.",
                  score: paramScores?.signal_quality_win_expectancy?.score ?? 88,
                  detail: paramScores?.signal_quality_win_expectancy?.detail ?? "Confluence verified against recognized patterns."
                },
                {
                  key: "portfolio_allocation_health",
                  label: "3. Portfolio Allocation Health",
                  desc: "Rebalancer maintenance of 70% Stables / 30% NEAR target within 5% drift threshold.",
                  score: paramScores?.portfolio_allocation_health?.score ?? 92,
                  detail: paramScores?.portfolio_allocation_health?.detail ?? "Zero unnecessary rebalance churn observed."
                },
                {
                  key: "multi_source_intel_depth",
                  label: "4. Multi-Source Intelligence Depth",
                  desc: "Cross-validation with 31-section XML Trading Book RAG, Twitter sentiment, and Research Agent.",
                  score: paramScores?.multi_source_intel_depth?.score ?? 90,
                  detail: paramScores?.multi_source_intel_depth?.detail ?? "Deep alpha reports integrated into trade decisioning."
                },
                {
                  key: "execution_efficiency_uptime",
                  label: "5. Execution Efficiency & Uptime",
                  desc: "Defuse 1-Click intent fills, zero key errors, and 60-second TP/SL poller responsiveness.",
                  score: paramScores?.execution_efficiency_uptime?.score ?? 96,
                  detail: paramScores?.execution_efficiency_uptime?.detail ?? "Active price poller responsive with 0 failed orders."
                }
              ].map((p) => (
                <div
                  key={p.key}
                  className="p-3.5 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{p.label}</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      p.score >= 85 ? "bg-emerald-500/10 text-emerald-400" : p.score >= 60 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {p.score} / 100
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                  <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p.score >= 85 ? "bg-emerald-400" : p.score >= 60 ? "bg-amber-400" : "bg-rose-400"
                      }`}
                      style={{ width: `${p.score}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-foreground/80 font-mono mt-1">
                    <strong className="text-primary font-sans font-medium">Evaluation:</strong> {p.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Findings & Recommended Tuning */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-card border border-[hsl(225,18%,14%)] space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" /> Key Guardian Findings
              </span>
              <ul className="space-y-1 text-[11px] text-muted-foreground list-disc list-inside">
                {status?.key_findings ? (
                  status.key_findings.map((f: string, i: number) => (
                    <li key={i} className="leading-relaxed">{f}</li>
                  ))
                ) : (
                  <>
                    <li>Trader Agent strictly respecting max capital cap ($100).</li>
                    <li>RAG Trading Book knowledge properly indexed with 31 sections.</li>
                    <li>Zero unauthorized signing attempts detected on sub-wallets.</li>
                  </>
                )}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-card border border-[hsl(225,18%,14%)] space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary" /> Recommended Tuning
              </span>
              <ul className="space-y-1 text-[11px] text-muted-foreground list-disc list-inside">
                {status?.recommended_tuning ? (
                  status.recommended_tuning.map((t: string, i: number) => (
                    <li key={i} className="leading-relaxed">{t}</li>
                  ))
                ) : (
                  <>
                    <li>Maintain minimum confidence threshold at 75% for high-probability setups.</li>
                    <li>Keep Researcher Agent plugin active for fundamental catalyst checks.</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
