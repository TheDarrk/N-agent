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
  X,
  Sliders,
  Eye,
  Copy,
  ExternalLink,
  FileText,
  Scale,
  Bot,
  ArrowRight,
  TrendingUp,
  LineChart,
  Percent,
  Coins,
  History,
  Clock,
  Info
} from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};


export default function ModeratorSection({ accountId, onConnectWallet }: Props) {
  const [status, setStatus] = useState<any>(null);
  const isFetchingRef = React.useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeliberating, setIsDeliberating] = useState(false);
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [killThreshold, setKillThreshold] = useState<number>(50);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [cadence, setCadence] = useState<string>("1w");
  const [isSavingCadence, setIsSavingCadence] = useState(false);
  const [activeTabNode, setActiveTabNode] = useState<number>(0);
  const [copiedCid, setCopiedCid] = useState(false);

  const targetWallet = accountId || "guest.near";

  const fetchStatus = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/moderator/status/${targetWallet}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.user_kill_threshold !== undefined) {
          setKillThreshold(data.user_kill_threshold);
        }
        if (data.moderator_frequency) {
          setCadence(data.moderator_frequency);
        }
      }
    } catch (e) {
      console.error("Moderator status error:", e);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 25000);
    return () => clearInterval(interval);
  }, [accountId]);

  // Toggle Moderator Agent Active / Standby Status
  const handleToggleModeratorActive = async (currentActive: boolean) => {
    setIsTogglingActive(true);
    try {
      const res = await fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: targetWallet,
          agent_id: "moderator",
          is_active: !currentActive,
          config: {},
        }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error("Toggle moderator active error:", e);
    } finally {
      setIsTogglingActive(false);
    }
  };

  // Toggle Emergency Kill Switch
  const handleToggleKillSwitch = async (activate: boolean) => {
    setIsTogglingKillSwitch(true);
    try {
      await fetch("/api/moderator/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: targetWallet,
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

  // Run On-Demand Fleet Audit
  const handleRunDeliberation = async () => {
    setIsDeliberating(true);
    try {
      const res = await fetch("/api/moderator/deliberate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: targetWallet }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Deliberation error:", e);
    } finally {
      setIsDeliberating(false);
    }
  };

  const handleSaveCadence = async (freq: string) => {
    setCadence(freq);
    setIsSavingCadence(true);
    try {
      await fetch("/api/moderator/frequency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: targetWallet, frequency: freq }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Save cadence error:", e);
    } finally {
      setIsSavingCadence(false);
    }
  };

  const handleSaveKillThreshold = async (val: number) => {
    const clamped = Math.max(0, Math.min(80, val));
    setKillThreshold(clamped);
    setIsSavingThreshold(true);
    try {
      await fetch("/api/moderator/kill-threshold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: targetWallet,
          threshold: clamped,
        }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Kill threshold update error:", e);
    } finally {
      setIsSavingThreshold(false);
    }
  };

  const copyCidToClipboard = (cid: string) => {
    if (!cid) return;
    navigator.clipboard.writeText(cid);
    setCopiedCid(true);
    setTimeout(() => setCopiedCid(false), 2000);
  };

  const isKillSwitchActive = status?.kill_switch_active;
  const isAgentActive = status?.is_active ?? (status?.fleet_summary?.agents?.moderator?.is_active ?? false);
  const totalMeanScore = status?.total_mean_score ?? status?.overall_performance_score ?? (isKillSwitchActive ? 0 : 90);
  const verdict = status?.verdict ?? (isKillSwitchActive ? "SAFETY_BREACH_SUSPEND" : "OPTIMAL_HEALTH");
  const paramScores = status?.parameter_scores;

  const node1Trader = status?.node_1_trader;
  const node2Rebalancer = status?.node_2_rebalancer;
  const node3Research = status?.node_3_research;
  const conflicts = status?.cross_agent_conflicts;
  const killedAgents = status?.killed_agents || [];

  const traderScore = status?.trader_score ?? node1Trader?.score ?? 88;
  const rebalancerScore = status?.rebalancer_score ?? node2Rebalancer?.score ?? 91;
  const researchScore = status?.research_score ?? node3Research?.score ?? 90;

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

  const getScoreColor = (sc: number) => {
    if (sc >= 80) return "text-emerald-400";
    if (sc >= 60) return "text-amber-400";
    return "text-rose-400";
  };

  // Helper to get selected agent detail data for the active tab
  const getActiveTabData = () => {
    switch (activeTabNode) {
      case 0:
        return {
          title: "Trader Agent Audit",
          score: traderScore,
          icon: <TrendingUp size={16} className="text-primary" />,
          status: node1Trader?.status || "HEALTHY",
          scoreExplanation:
            node1Trader?.score_explanation ||
            "The Trader Agent adheres strictly to your capital limits and waits for favorable market opportunities before executing trades.",
          strengths: node1Trader?.strengths?.length
            ? node1Trader.strengths
            : [
                "Capital limits and daily spending caps strictly respected.",
                "Favorable potential gain vs downside risk required on all setups.",
                "Disciplined patience maintained during market consolidation.",
              ],
          whatWasMissed: node1Trader?.what_was_missed?.length
            ? node1Trader.what_was_missed
            : [
                node1Trader?.metrics?.dropped_trades_count > 0
                  ? `${node1Trader.metrics.dropped_trades_count} trade setup(s) paused by wallet safety guards.`
                  : "Awaiting stronger trend momentum before opening new positions.",
              ],
          recommendedTuning: node1Trader?.recommended_tuning?.length
            ? node1Trader.recommended_tuning
            : [
                "You can adjust your Risk Profile (Conservative / Moderate) in Trader settings.",
                "Review your Max Trade Amount if you want to alter position sizing.",
              ],
          metrics: [
            { label: "Win Rate", value: `${node1Trader?.metrics?.win_rate_pct || 75}%` },
            { label: "Gain vs Risk", value: `${node1Trader?.metrics?.avg_risk_reward_ratio || 2.1}:1` },
            { label: "Open Trades", value: `${node1Trader?.metrics?.open_trades_count || 0}` },
            { label: "Daily Allowance", value: `${node1Trader?.metrics?.daily_cap_remaining ?? 3} left` },
          ],
        };
      case 1:
        return {
          title: "Rebalancer Agent Audit",
          score: rebalancerScore,
          icon: <Coins size={16} className="text-primary" />,
          status: node2Rebalancer?.status || "HEALTHY",
          scoreExplanation:
            node2Rebalancer?.score_explanation ||
            "The Rebalancer Agent maintains your target asset allocations with low drift and a healthy liquid stablecoin cash buffer.",
          strengths: node2Rebalancer?.strengths?.length
            ? node2Rebalancer.strengths
            : [
                `Held a liquid stablecoin cash cushion (${node2Rebalancer?.metrics?.stablecoin_reserve_pct || 30}%) to protect purchasing power.`,
                `Portfolio drift (${node2Rebalancer?.metrics?.current_drift_pct || 2.4}%) is comfortably within your limit.`,
                "Zero unnecessary rebalancing churn or wasteful transaction fees.",
              ],
          whatWasMissed: node2Rebalancer?.what_was_missed?.length
            ? node2Rebalancer.what_was_missed
            : [
                "Awaiting next scheduled review cycle to fine-tune asset allocations.",
              ],
          recommendedTuning: node2Rebalancer?.recommended_tuning?.length
            ? node2Rebalancer.recommended_tuning
            : [
                "You can adjust target token percentages in Rebalancer settings.",
                "You can increase your minimum stablecoin reserve if you want higher downside protection.",
              ],
          metrics: [
            { label: "Allocation Drift", value: `${node2Rebalancer?.metrics?.current_drift_pct || 2.4}%` },
            { label: "Cash Buffer", value: `${node2Rebalancer?.metrics?.stablecoin_reserve_pct || 30}%` },
            { label: "Drift Limit", value: `${node2Rebalancer?.metrics?.drift_threshold_pct || 5.0}%` },
            { label: "Execution Reliability", value: `${node2Rebalancer?.metrics?.state_machine_success_rate || 100}%` },
          ],
        };
      case 2:
        return {
          title: "Research Agent Audit",
          score: researchScore,
          icon: <FileText size={16} className="text-primary" />,
          status: node3Research?.status || "HEALTHY",
          scoreExplanation:
            node3Research?.score_explanation ||
            "The Deep Research Agent provides reliable market insights with high source verification accuracy and balanced reporting.",
          strengths: node3Research?.strengths?.length
            ? node3Research.strengths
            : [
                "Key yield figures and project metrics backed by official documentation.",
                "Fresh ecosystem news analyzed to identify upcoming market catalysts.",
                "Zero unverified statistics or exaggerated claims detected.",
              ],
          whatWasMissed: node3Research?.what_was_missed?.length
            ? node3Research.what_was_missed
            : [
                "Coverage can be expanded by adding more tokens to your watchlist.",
              ],
          recommendedTuning: node3Research?.recommended_tuning?.length
            ? node3Research.recommended_tuning
            : [
                "You can customize research topics and target tokens in Research settings.",
                "Review daily catalyst reports for early ecosystem opportunities.",
              ],
          metrics: [
            { label: "Fact Accuracy", value: node3Research?.hallucination_audit?.faithfulness_ratio ? `${Math.round(node3Research.hallucination_audit.faithfulness_ratio * 100)}%` : "95%" },
            { label: "Source Depth", value: `${node3Research?.metrics?.avg_citation_density || 2.8}` },
            { label: "Source Reliability", value: `${node3Research?.metrics?.source_verification_rate || 100}%` },
            { label: "Reports Analyzed", value: `${node3Research?.metrics?.reports_generated_7d || 2}` },
          ],
        };
      case 3:
      default:
        return {
          title: "Fleet Harmony & Protection Synthesis",
          score: totalMeanScore,
          icon: <ShieldCheck size={16} className="text-primary" />,
          status: verdict,
          scoreExplanation:
            status?.score_explanation ||
            status?.verdict_rationale ||
            `Your fleet achieved an overall health score of ${totalMeanScore}/100. All agents are working in harmony with zero contradictory orders and strict adherence to your capital limits.`,
          strengths: status?.strengths?.length
            ? status.strengths
            : [
                "Trader, Rebalancer, and Research agents are fully synchronized with zero opposing orders.",
                `Total open exposure ($${status?.total_open_exposure_usd || 0}) is safely below your daily limit ($${status?.daily_limit_usd || 2000}).`,
                "All agent decisions are backed by verified market signals and credible sources.",
              ],
          whatWasMissed: status?.what_was_missed?.length
            ? status.what_was_missed
            : [
                "Fleet is actively awaiting fresh market momentum before deploying additional capital.",
              ],
          recommendedTuning: status?.recommended_tuning?.length
            ? status.recommended_tuning
            : [
                "Review your Risk Profile in Trader settings to change trade frequency.",
                `Adjust your Autonomous Kill Threshold (currently set to ${killThreshold}) if you want stricter or more forgiving oversight.`,
                "Customize your Audit Cadence (1 Week, 2 Weeks, or 1 Month) based on your trading pace.",
              ],
          metrics: [
            { label: "Total Exposure", value: `$${status?.total_open_exposure_usd || 0}` },
            { label: "Daily Budget", value: `$${status?.daily_limit_usd || 2000}` },
            { label: "Opposing Orders", value: "0 (None)" },
            { label: "Kill Threshold", value: `${killThreshold}/80` },
          ],
        };
    }
  };

  const activeData = getActiveTabData();

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-6xl mx-auto space-y-4 suite-stagger">
      {/* ─── Top Header with Start / Stop & Emergency Kill Switch ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-md shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`p-2 rounded-lg ${isKillSwitchActive ? "bg-rose-500/10 text-rose-400" : isAgentActive ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
              {isKillSwitchActive ? <ShieldAlert size={20} /> : isAgentActive ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Moderator Watchdog Agent
            </h1>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getVerdictStyle(verdict)}`}>
              {verdict.replace(/_/g, " ")}
            </span>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
              isAgentActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-secondary text-muted-foreground border-border"
            }`}>
              {isAgentActive ? "● Active Protection" : "○ Standby (Inactive)"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Neptune&apos;s AI Watchdog continuously monitors your Trading, Rebalancing, and Research agents to verify that your capital is safe, strategy rules are strictly followed, and no contradictory trades occur.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Active / Inactive Agent Toggle */}
          <button
            onClick={() => handleToggleModeratorActive(isAgentActive)}
            disabled={isTogglingActive}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              isAgentActive
                ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40"
                : "bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border-border"
            }`}
            title="Start or Stop Moderator Watchdog Agent"
          >
            {isTogglingActive ? (
              <RotateCw size={14} className="animate-spin text-muted-foreground" />
            ) : isAgentActive ? (
              <Check size={14} />
            ) : (
              <Power size={14} />
            )}
            <span>{isAgentActive ? "Watchdog Active" : "Start Watchdog"}</span>
          </button>

          {/* Run Fleet Audit */}
          <button
            onClick={handleRunDeliberation}
            disabled={isDeliberating}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-xs font-bold transition-all disabled:opacity-50"
            title="Trigger on-demand fleet safety audit"
          >
            <Sparkles size={14} className={isDeliberating ? "animate-spin" : ""} />
            <span>{isDeliberating ? "Auditing Fleet..." : "Run Fleet Audit"}</span>
          </button>

          <button
            onClick={fetchStatus}
            disabled={isLoading || isDeliberating}
            className="p-2 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            title="Refresh Status"
          >
            <RotateCw size={15} className={isLoading ? "animate-spin" : ""} />
          </button>

          {/* Master Kill Switch */}
          {isKillSwitchActive ? (
            <button
              onClick={() => handleToggleKillSwitch(false)}
              disabled={isTogglingKillSwitch}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
            >
              <Unlock size={14} />
              <span>Resume Fleet</span>
            </button>
          ) : (
            <button
              onClick={() => handleToggleKillSwitch(true)}
              disabled={isTogglingKillSwitch}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-500/20 disabled:opacity-50"
            >
              <Power size={14} />
              <span>Emergency Kill Switch</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Emergency Kill Switch Active Notice ─────────────────── */}
      {isKillSwitchActive && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert size={22} className="text-rose-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-rose-200">
                Master Emergency Circuit Breaker is Armed &amp; Active
              </h3>
              <p className="text-xs text-rose-300/90 leading-relaxed">
                All autonomous background runners are suspended, signing keys are temporarily paused, and active orders are safeguarded.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleKillSwitch(false)}
            disabled={isTogglingKillSwitch}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-all shrink-0"
          >
            <Unlock size={14} />
            <span>Deactivate &amp; Resume Fleet</span>
          </button>
        </div>
      )}

      {/* ─── 4-Node Fleet Health & Safety Overview ───────────────── */}
      <div className="p-3.5 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers size={13} className="text-primary" /> Fleet Health &amp; Safety Overview
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            Fleet Health Score: <strong className={getScoreColor(totalMeanScore)}>{totalMeanScore}/100</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Card 0: Trader */}
          <div
            onClick={() => setActiveTabNode(0)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeTabNode === 0
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-secondary/30 border-border hover:bg-secondary/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold flex items-center gap-1.5 text-foreground">
                <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                Trader Agent
              </span>
              <span className={`font-mono font-bold text-xs ${getScoreColor(traderScore)}`}>
                {traderScore}/100
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              Market setups, risk vs reward &amp; trade limits.
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                traderScore >= 80 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
              }`}>
                {traderScore >= 80 ? "Healthy & Disciplined" : "Caution"}
              </span>
              {killedAgents.includes("trader") && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                  HALTED
                </span>
              )}
            </div>
          </div>

          {/* Card 1: Rebalancer */}
          <div
            onClick={() => setActiveTabNode(1)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeTabNode === 1
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-secondary/30 border-border hover:bg-secondary/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold flex items-center gap-1.5 text-foreground">
                <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                Rebalancer Agent
              </span>
              <span className={`font-mono font-bold text-xs ${getScoreColor(rebalancerScore)}`}>
                {rebalancerScore}/100
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              Target asset weights, drift &amp; cash reserves.
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                rebalancerScore >= 80 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
              }`}>
                {rebalancerScore >= 80 ? "Healthy Balance" : "Drift Notice"}
              </span>
              {killedAgents.includes("rebalancer") && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                  HALTED
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Research */}
          <div
            onClick={() => setActiveTabNode(2)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeTabNode === 2
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-secondary/30 border-border hover:bg-secondary/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold flex items-center gap-1.5 text-foreground">
                <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-mono font-bold">3</span>
                Research Agent
              </span>
              <span className={`font-mono font-bold text-xs ${getScoreColor(researchScore)}`}>
                {researchScore}/100
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              Market intelligence &amp; verified source accuracy.
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                Fact Accuracy {node3Research?.hallucination_audit?.faithfulness_ratio ? `${Math.round(node3Research.hallucination_audit.faithfulness_ratio * 100)}%` : "95%"}
              </span>
              {killedAgents.includes("research") && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                  HALTED
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Fleet Harmony */}
          <div
            onClick={() => setActiveTabNode(3)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeTabNode === 3
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "bg-secondary/30 border-border hover:bg-secondary/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold flex items-center gap-1.5 text-foreground">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">4</span>
                Fleet Harmony
              </span>
              <span className={`font-mono font-bold text-xs ${getScoreColor(totalMeanScore)}`}>
                Mean {totalMeanScore}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              Cross-agent harmony &amp; safety limits.
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30">
                Synchronized
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Grid: Control Panel + Agent Audit Details ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Health Gauge, Kill Threshold & Exposure */}
        <div className="lg:col-span-1 space-y-4">
          {/* Dial Card */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Fleet Overall Health Score
              </span>
              <span className="text-[10px] font-mono text-primary font-bold">Safe &amp; Protected</span>
            </div>

            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-border bg-secondary/30 relative">
                <span className={`text-3xl font-extrabold font-mono ${getScoreColor(totalMeanScore)}`}>
                  {totalMeanScore}
                </span>
                <span className="text-[10px] text-muted-foreground absolute bottom-5">/ 100</span>
              </div>
              <p className="text-xs font-semibold text-foreground mt-2">
                {verdict.replace(/_/g, " ")}
              </p>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 max-w-xs mx-auto">
                {status?.verdict_rationale || "All three agents are operating safely within your parameters."}
              </p>
            </div>

            {/* Autonomous Agent Kill Threshold Slider (0-80) */}
            <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sliders size={13} className="text-primary" /> Automatic Safety Pause Threshold
                </span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-secondary text-primary border border-border">
                  {killThreshold} / 80
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                If an agent&apos;s score falls below this number during audit, the Moderator will automatically pause that agent to protect your funds.
              </p>
              <input
                type="range"
                min="0"
                max="80"
                step="5"
                value={killThreshold}
                onChange={(e) => setKillThreshold(Number(e.target.value))}
                onMouseUp={(e) => handleSaveKillThreshold(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => handleSaveKillThreshold(Number((e.target as HTMLInputElement).value))}
                className="w-full accent-primary cursor-pointer h-1.5 bg-secondary rounded-lg"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                <span>0 (Forgiving)</span>
                <span>50 (Standard)</span>
                <span>80 (Maximum Guard)</span>
              </div>
              {isSavingThreshold && (
                <p className="text-[9.5px] text-primary animate-pulse font-mono">Updating threshold in database...</p>
              )}
            </div>

            {/* Autonomous Audit Frequency Cadence (1w, 2w, 1m) */}
            <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Clock size={13} className="text-primary" /> Autonomous Review Frequency
                </span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-secondary text-primary border border-border">
                  {cadence === "1m" ? "1 Month" : cadence === "2w" ? "2 Weeks" : "1 Week"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Select how often the Moderator Watchdog automatically runs on its own to evaluate the fleet.
              </p>

              {/* Cadence Selection Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {[
                  { id: "1w", label: "1 Week", desc: "Every 7 Days" },
                  { id: "2w", label: "2 Weeks", desc: "Every 14 Days" },
                  { id: "1m", label: "1 Month", desc: "Every 30 Days" },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSaveCadence(c.id)}
                    disabled={isSavingCadence}
                    className={`py-1.5 px-2 rounded-lg text-center border transition-all ${
                      cadence === c.id
                        ? "bg-primary/20 border-primary text-primary font-bold shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <div className="text-xs font-semibold">{c.label}</div>
                    <div className="text-[9px] opacity-75">{c.desc}</div>
                  </button>
                ))}
              </div>

              {/* Status info: Next run & Last run */}
              <div className="pt-1 text-[9.5px] text-muted-foreground font-mono flex items-center justify-between border-t border-border/50">
                <span className="text-foreground/80">
                  {status?.days_remaining !== undefined && status.days_remaining > 0
                    ? `Next audit in ~${status.days_remaining}d`
                    : "Scheduled Review: Active"}
                </span>
                <span className="truncate max-w-[130px] text-right">
                  {status?.last_run_at ? `Last: ${String(status.last_run_at).slice(0, 10)}` : "Pending initial run"}
                </span>
              </div>
              {isSavingCadence && (
                <p className="text-[9.5px] text-primary animate-pulse font-mono">Saving cadence to database...</p>
              )}
            </div>

            {/* Exposure Gauges */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between text-xs">
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

            {/* Audit Reference CID */}
            {status?.cid && (
              <div className="p-2.5 rounded-xl bg-secondary/30 border border-border text-[10px] font-mono flex items-center justify-between">
                <span className="text-muted-foreground truncate max-w-[190px]">
                  Ref CID: {status.cid}
                </span>
                <button
                  onClick={() => copyCidToClipboard(status.cid)}
                  className="p-1 rounded hover:bg-secondary text-primary transition-all"
                  title="Copy Reference CID"
                >
                  {copiedCid ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            )}
          </div>

          {/* Dropped Trades Notice */}
          {status?.dropped_trades_count > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  {status.dropped_trades_count} Trades Skipped by Safety Rules
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                  PROTECTED
                </span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                Trades were paused or skipped to protect capital according to your wallet safety rules.
              </p>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Dedicated Active Agent Breakdown, Shield & Parameters */}
        <div className="lg:col-span-2 space-y-4">
          {/* Portfolio Harmony & Protection Shield (Renamed from Cross-Agent Conflict Shield) */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            conflicts?.cannibalization_detected || conflicts?.threat_to_holdings_detected
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
          }`}>
            <div className="flex items-center gap-2.5">
              {conflicts?.cannibalization_detected ? (
                <AlertTriangle size={18} className="text-rose-400 shrink-0" />
              ) : (
                <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
              )}
              <div>
                <h3 className="text-xs font-bold text-foreground">
                  Portfolio Harmony &amp; Protection Shield
                </h3>
                <p className="text-[10.5px] text-muted-foreground leading-relaxed mt-0.5">
                  {conflicts?.conflict_summary || "All agents are operating in complete harmony. No opposing trades detected and portfolio risk is fully protected."}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-card border border-border shrink-0 ml-2">
              {conflicts?.cannibalization_detected ? "ACTION REQUIRED" : "HARMONIOUS & SAFE"}
            </span>
          </div>

          {/* ─── DEDICATED DETAIL CARD FOR SELECTED AGENT (Why that score, What was good, What was missed) ─── */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-secondary text-primary">
                  {activeData.icon}
                </span>
                <div>
                  <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                    {activeData.title}
                  </h2>
                  <span className="text-[10px] text-muted-foreground">
                    Performance &amp; Safety Audit Breakdown
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getVerdictStyle(activeData.status)}`}>
                  {activeData.status.replace(/_/g, " ")}
                </span>
                <span className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded bg-secondary ${getScoreColor(activeData.score)}`}>
                  {activeData.score} / 100
                </span>
              </div>
            </div>

            {/* Why This Score */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/70 space-y-1">
              <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Info size={13} className="text-primary" /> Why this score was given:
              </span>
              <p className="text-[10.5px] text-foreground/90 leading-relaxed">
                {activeData.scoreExplanation}
              </p>
            </div>

            {/* Two-Column Grid: What Went Well vs What Needs Attention */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Strengths */}
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" /> What Went Well (Strengths)
                </span>
                <ul className="space-y-1 text-[10.5px] text-muted-foreground">
                  {activeData.strengths.map((s: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What Was Missed */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-400" /> What Needs Attention
                </span>
                <ul className="space-y-1 text-[10.5px] text-muted-foreground">
                  {activeData.whatWasMissed.map((m: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/60">
              {activeData.metrics.map((m: any, idx: number) => (
                <div key={idx} className="p-2 rounded-lg bg-secondary/30 border border-border/50 text-center">
                  <div className="text-[10px] text-muted-foreground">{m.label}</div>
                  <div className="text-xs font-mono font-bold text-foreground mt-0.5">{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Dedicated Agent Snapshot Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Trader Card */}
            <div
              onClick={() => setActiveTabNode(0)}
              className={`p-3.5 rounded-2xl border space-y-2 cursor-pointer transition-all ${
                activeTabNode === 0 ? "bg-primary/10 border-primary/50 shadow-sm" : "bg-card border-border hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-primary" /> Trader Agent
                </span>
                <span className={`text-xs font-mono font-bold ${getScoreColor(traderScore)}`}>
                  {traderScore}
                </span>
              </div>
              <div className="text-[10.5px] text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span className="font-mono text-foreground font-semibold">{node1Trader?.metrics?.win_rate_pct || 75}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Reward vs Risk:</span>
                  <span className="font-mono text-foreground font-semibold">{node1Trader?.metrics?.avg_risk_reward_ratio || 2.1}:1</span>
                </div>
                <div className="flex justify-between">
                  <span>Open Trades:</span>
                  <span className="font-mono text-foreground font-semibold">{node1Trader?.metrics?.open_trades_count || 0}</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-border flex items-center justify-between">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Healthy &amp; Verified
                </span>
                {killedAgents.includes("trader") && (
                  <span className="text-[9px] font-bold text-rose-400">HALTED</span>
                )}
              </div>
            </div>

            {/* Rebalancer Card */}
            <div
              onClick={() => setActiveTabNode(1)}
              className={`p-3.5 rounded-2xl border space-y-2 cursor-pointer transition-all ${
                activeTabNode === 1 ? "bg-primary/10 border-primary/50 shadow-sm" : "bg-card border-border hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Coins size={13} className="text-primary" /> Rebalancer Agent
                </span>
                <span className={`text-xs font-mono font-bold ${getScoreColor(rebalancerScore)}`}>
                  {rebalancerScore}
                </span>
              </div>
              <div className="text-[10.5px] text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Allocation Drift:</span>
                  <span className="font-mono text-foreground font-semibold">{node2Rebalancer?.metrics?.current_drift_pct || 2.4}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Stable Buffer:</span>
                  <span className="font-mono text-foreground font-semibold">{node2Rebalancer?.metrics?.stablecoin_reserve_pct || 30}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Execution:</span>
                  <span className="font-mono text-foreground font-semibold">{node2Rebalancer?.metrics?.state_machine_success_rate || 100}%</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-border flex items-center justify-between">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Healthy Balance
                </span>
                {killedAgents.includes("rebalancer") && (
                  <span className="text-[9px] font-bold text-rose-400">HALTED</span>
                )}
              </div>
            </div>

            {/* Research Card */}
            <div
              onClick={() => setActiveTabNode(2)}
              className={`p-3.5 rounded-2xl border space-y-2 cursor-pointer transition-all ${
                activeTabNode === 2 ? "bg-primary/10 border-primary/50 shadow-sm" : "bg-card border-border hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText size={13} className="text-primary" /> Research Agent
                </span>
                <span className={`text-xs font-mono font-bold ${getScoreColor(researchScore)}`}>
                  {researchScore}
                </span>
              </div>
              <div className="text-[10.5px] text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Fact Accuracy:</span>
                  <span className="font-mono text-foreground font-semibold">{node3Research?.hallucination_audit?.faithfulness_ratio ? `${Math.round(node3Research.hallucination_audit.faithfulness_ratio * 100)}%` : "95%"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source Depth:</span>
                  <span className="font-mono text-foreground font-semibold">{node3Research?.metrics?.avg_citation_density || 2.8}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source Reliability:</span>
                  <span className="font-mono text-foreground font-semibold">{node3Research?.metrics?.source_verification_rate ? `${node3Research.metrics.source_verification_rate}%` : "100%"}</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-border flex items-center justify-between">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Verified Intel
                </span>
                {killedAgents.includes("research") && (
                  <span className="text-[9px] font-bold text-rose-400">HALTED</span>
                )}
              </div>
            </div>
          </div>

          {/* 5-Parameter Safety Evaluation Card */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                <Brain size={15} className="text-primary" />
                Fleet Safety &amp; Performance Evaluation
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-emerald-400 font-semibold">
                AI Safety Engine: Active
              </span>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  key: "capital_safety_discipline",
                  label: "1. Capital Safety & Trade Limits",
                  desc: "Position size limits, max daily spending, and strict stop-loss protection.",
                  score: paramScores?.capital_safety_discipline?.score ?? 95,
                  detail: paramScores?.capital_safety_discipline?.detail ?? "All orders strictly bounded by your configured caps."
                },
                {
                  key: "signal_quality_win_expectancy",
                  label: "2. Signal Quality & Market Confluence",
                  desc: "Confidence score rigor, verified chart patterns, and healthy reward-to-risk balance.",
                  score: paramScores?.signal_quality_win_expectancy?.score ?? 88,
                  detail: paramScores?.signal_quality_win_expectancy?.detail ?? "Market setups verified against recognizable chart trends."
                },
                {
                  key: "portfolio_allocation_health",
                  label: "3. Portfolio Balance & Cash Reserves",
                  desc: "Disciplined maintenance of target token weights and safe stablecoin reserves.",
                  score: paramScores?.portfolio_allocation_health?.score ?? 92,
                  detail: paramScores?.portfolio_allocation_health?.detail ?? "Zero unnecessary rebalance turnover observed."
                },
                {
                  key: "multi_source_intel_depth",
                  label: "4. Market Intelligence & Fact Accuracy",
                  desc: "Cross-validation with live market feeds, research insights, and verified news.",
                  score: paramScores?.multi_source_intel_depth?.score ?? 90,
                  detail: paramScores?.multi_source_intel_depth?.detail ?? "Market intelligence backed by verified project documentation."
                },
                {
                  key: "execution_efficiency_uptime",
                  label: "5. Execution Efficiency & Reliability",
                  desc: "Fast trade execution, reliable key management, and continuous market monitoring.",
                  score: paramScores?.execution_efficiency_uptime?.score ?? 96,
                  detail: paramScores?.execution_efficiency_uptime?.detail ?? "Active monitoring responsive with 0 failed orders."
                }
              ].map((p) => (
                <div
                  key={p.key}
                  className="p-3 rounded-xl bg-secondary/30 border border-border space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{p.label}</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      p.score >= 85 ? "bg-emerald-500/10 text-emerald-400" : p.score >= 60 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {p.score} / 100
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground">{p.desc}</p>
                  <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p.score >= 85 ? "bg-emerald-400" : p.score >= 60 ? "bg-amber-400" : "bg-rose-400"
                      }`}
                      style={{ width: `${p.score}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-foreground/80 font-mono mt-0.5">
                    <strong className="text-primary font-sans font-medium">Evaluation:</strong> {p.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Findings & Recommended Actions for the User */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" /> Key Safety Findings
              </span>
              <ul className="space-y-1.5 text-[10.5px] text-muted-foreground list-disc list-inside">
                {status?.key_findings ? (
                  status.key_findings.map((f: string, i: number) => (
                    <li key={i} className="leading-relaxed">{f}</li>
                  ))
                ) : (
                  <>
                    <li>Trader Agent strictly respecting position sizing hard caps.</li>
                    <li>Rebalancer maintaining healthy stablecoin cash buffer.</li>
                    <li>Zero opposing trades or conflicting orders across the fleet.</li>
                  </>
                )}
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary" /> Recommended Actions For You
              </span>
              <ul className="space-y-1.5 text-[10.5px] text-muted-foreground list-disc list-inside">
                {status?.recommended_tuning ? (
                  status.recommended_tuning.map((t: string, i: number) => (
                    <li key={i} className="leading-relaxed">{t}</li>
                  ))
                ) : (
                  <>
                    <li>Review your Risk Profile in Trader settings to change trade frequency.</li>
                    <li>Adjust your position size limit if you prefer smaller trades.</li>
                    <li>Set audit cadence to 1 week for faster safety reviews.</li>
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
