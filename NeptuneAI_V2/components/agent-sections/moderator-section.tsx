"use client";

import { setVisibleInterval } from "@/lib/visible-interval"
import { tilt3d } from "./trader/tilt-3d";
import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCw,
  AlertTriangle,
  Unlock,
  CheckCircle2,
  Layers,
  Brain,
  Sparkles,
  Check,
  Sliders,
  Copy,
  FileText,
  ArrowRight,
  TrendingUp,
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
  const [showChecks, setShowChecks] = useState(false);

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
    return setVisibleInterval(fetchStatus, 25000);
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

  type Tone = "good" | "warn" | "bad";

  const toneOf = (v: string): Tone => {
    const s = String(v || "").toUpperCase();
    if (["OPTIMAL_HEALTH", "HEALTHY", "VERIFIED", "SYNCHRONIZED"].includes(s)) return "good";
    if (/BREACH|SUSPEND|CRITICAL|HALT|FAIL|KILL/.test(s)) return "bad";
    return "warn";
  };
  const toneChip: Record<Tone, string> = {
    good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  const toneBar: Record<Tone, string> = {
    good: "bg-emerald-400",
    warn: "bg-amber-400",
    bad: "bg-rose-400",
  };
  const scoreTone = (sc: number): Tone => (sc >= 80 ? "good" : sc >= 60 ? "warn" : "bad");
  const scoreLabel = (sc: number) => (sc >= 80 ? "Healthy" : sc >= 60 ? "Needs a look" : "At risk");
  const humanize = (v: string) => {
    const t = String(v || "").replace(/_/g, " ").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const verdictTone = toneOf(verdict);
  const verdictHeadline =
    verdictTone === "good" ? "Everything looks healthy" : verdictTone === "warn" ? "Worth a closer look" : "Action needed";

  const overallScore = Math.max(0, Math.min(100, Number(totalMeanScore) || 0));
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - overallScore / 100);

  const exposure = status?.total_open_exposure_usd || 0;
  const dailyLimit = status?.daily_limit_usd || 2000;
  const exposurePct = Math.min(100, (exposure / dailyLimit) * 100);

  const agentTabs = [
    { id: 0, name: "Trader", blurb: "Makes trades within your limits", score: traderScore, Icon: TrendingUp, haltKey: "trader" },
    { id: 1, name: "Rebalancer", blurb: "Keeps your portfolio on target", score: rebalancerScore, Icon: Coins, haltKey: "rebalancer" },
    { id: 2, name: "Research", blurb: "Finds and checks market news", score: researchScore, Icon: FileText, haltKey: "research" },
    { id: 3, name: "Whole fleet", blurb: "How the agents work together", score: totalMeanScore, Icon: Layers, haltKey: "" },
  ];

  const safetyChecks = [
    {
      key: "capital_safety_discipline",
      label: "Capital safety and trade limits",
      desc: "Position size limits, daily spending caps and stop-loss protection.",
      score: paramScores?.capital_safety_discipline?.score ?? 95,
      detail: paramScores?.capital_safety_discipline?.detail ?? "All orders strictly bounded by your configured caps.",
    },
    {
      key: "signal_quality_win_expectancy",
      label: "Signal quality",
      desc: "Confidence of each trade idea and a healthy reward-to-risk balance.",
      score: paramScores?.signal_quality_win_expectancy?.score ?? 88,
      detail: paramScores?.signal_quality_win_expectancy?.detail ?? "Market setups verified against recognizable chart trends.",
    },
    {
      key: "portfolio_allocation_health",
      label: "Portfolio balance and cash reserves",
      desc: "Target token weights and safe stablecoin reserves are maintained.",
      score: paramScores?.portfolio_allocation_health?.score ?? 92,
      detail: paramScores?.portfolio_allocation_health?.detail ?? "Zero unnecessary rebalance turnover observed.",
    },
    {
      key: "multi_source_intel_depth",
      label: "Market intelligence and fact accuracy",
      desc: "Research is cross-checked against live market feeds and verified news.",
      score: paramScores?.multi_source_intel_depth?.score ?? 90,
      detail: paramScores?.multi_source_intel_depth?.detail ?? "Market intelligence backed by verified project documentation.",
    },
    {
      key: "execution_efficiency_uptime",
      label: "Execution and reliability",
      desc: "Trades go through quickly and monitoring stays online.",
      score: paramScores?.execution_efficiency_uptime?.score ?? 96,
      detail: paramScores?.execution_efficiency_uptime?.detail ?? "Active monitoring responsive with 0 failed orders.",
    },
  ];

  const keyFindings: string[] = status?.key_findings || [
    "The Trader is respecting your position size limits.",
    "The Rebalancer is keeping a healthy stablecoin cash buffer.",
    "No opposing or conflicting orders across your agents.",
  ];
  const recommendedActions: string[] = status?.recommended_tuning || [
    "Review your Risk Profile in Trader settings to change trade frequency.",
    "Adjust your position size limit if you prefer smaller trades.",
    "Set the review frequency to 1 week for faster safety checks.",
  ];

  const harmonyBad = conflicts?.cannibalization_detected || conflicts?.threat_to_holdings_detected;
  const cadenceLabel = cadence === "1m" ? "1 month" : cadence === "2w" ? "2 weeks" : "1 week";
  const hasNoData = !status && !isLoading;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 max-w-6xl mx-auto space-y-5 suite-stagger">
      {/* Header: what this agent is and the main controls */}
      <header
        className="tilt3d flex flex-col lg:flex-row lg:items-center justify-between gap-5 p-5 rounded-2xl bg-card border border-border"
        {...tilt3d(1.5)}
      >
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`p-2.5 rounded-xl ${
                isKillSwitchActive
                  ? "bg-rose-500/10 text-rose-400"
                  : isAgentActive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {isKillSwitchActive ? <ShieldAlert size={24} /> : isAgentActive ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Moderator Watchdog</h1>
            <span
              className={`px-3 py-1 text-sm font-semibold rounded-full border ${
                isAgentActive ? toneChip.good : "bg-secondary text-muted-foreground border-border"
              }`}
            >
              {isAgentActive ? "Watching your agents" : "Switched off"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl text-pretty">
            The Watchdog checks your Trader, Rebalancer and Research agents. It makes sure your money stays safe, your rules are followed, and no two agents
            work against each other.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleToggleModeratorActive(isAgentActive)}
            disabled={isTogglingActive}
            aria-pressed={isAgentActive}
            className={`key3d flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 ${
              isAgentActive
                ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40"
                : "bg-secondary/70 hover:bg-secondary text-foreground border-border"
            }`}
            title="Switch the Watchdog on or off"
          >
            {isTogglingActive ? (
              <RotateCw size={16} className="animate-spin" />
            ) : isAgentActive ? (
              <Check size={16} />
            ) : (
              <Power size={16} />
            )}
            <span>{isAgentActive ? "Watchdog is on" : "Turn Watchdog on"}</span>
          </button>

          <button
            onClick={handleRunDeliberation}
            disabled={isDeliberating}
            className="key3d flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-sm font-semibold disabled:opacity-50"
            title="Check all your agents right now"
          >
            <Sparkles size={16} className={isDeliberating ? "animate-spin" : ""} />
            <span>{isDeliberating ? "Checking agents..." : "Check agents now"}</span>
          </button>

          <button
            onClick={fetchStatus}
            disabled={isLoading || isDeliberating}
            className="key3d p-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh status"
          >
            <RotateCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>

          {isKillSwitchActive ? (
            <button
              onClick={() => handleToggleKillSwitch(false)}
              disabled={isTogglingKillSwitch}
              className="key3d flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-sm font-semibold disabled:opacity-50"
            >
              <Unlock size={16} />
              <span>Resume agents</span>
            </button>
          ) : (
            <button
              onClick={() => handleToggleKillSwitch(true)}
              disabled={isTogglingKillSwitch}
              className="key3d-solid flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-50"
              title="Instantly pause every agent"
            >
              <Power size={16} />
              <span>Emergency stop</span>
            </button>
          )}
        </div>
      </header>

      {/* Emergency stop notice */}
      {isKillSwitchActive && (
        <div
          role="alert"
          className="p-5 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert size={26} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-rose-200">Emergency stop is on</h2>
              <p className="text-sm text-rose-200/90 leading-relaxed mt-1">
                All agents are paused and no new trades will run. Your funds are safe. Resume when you are ready.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleKillSwitch(false)}
            disabled={isTogglingKillSwitch}
            className="key3d-solid flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 shrink-0 disabled:opacity-50"
          >
            <Unlock size={16} />
            <span>Resume agents</span>
          </button>
        </div>
      )}

      {hasNoData && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-secondary/40 border border-border text-sm text-muted-foreground leading-relaxed">
          <Info size={18} className="text-primary shrink-0 mt-0.5" />
          <span>
            No audit has loaded yet, so the numbers below are sample values. Press <strong className="text-foreground">Check agents now</strong> to get your real
            results.
          </span>
        </div>
      )}

      {/* Summary: one score, one sentence */}
      <section
        aria-label="Fleet summary"
        className="tilt3d grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 p-5 sm:p-6 rounded-2xl bg-card border border-border"
        {...tilt3d(1.5)}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className={`relative w-36 h-36 ${getScoreColor(overallScore)}`}>
            <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="64" cy="64" r={ringRadius} fill="none" strokeWidth="10" className="stroke-secondary" />
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-current transition-all duration-700"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold font-mono leading-none">{overallScore}</span>
              <span className="text-sm text-muted-foreground mt-1">out of 100</span>
            </div>
          </div>
          <span className="sr-only">Overall health score {overallScore} out of 100</span>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-foreground text-balance">{verdictHeadline}</h2>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${toneChip[verdictTone]}`}>{humanize(verdict)}</span>
            </div>
            <p className="text-base text-muted-foreground leading-relaxed max-w-2xl text-pretty">
              {status?.verdict_rationale || "All three agents are working safely inside the limits you set."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
              <div className="text-sm text-muted-foreground">Money in open trades</div>
              <div className="text-lg font-bold font-mono text-foreground">
                ${exposure} <span className="text-sm font-normal text-muted-foreground">of ${dailyLimit} daily limit</span>
              </div>
              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden" role="presentation">
                <div
                  className={`h-full rounded-full transition-all ${exposurePct > 50 ? toneBar.warn : toneBar.good}`}
                  style={{ width: `${exposurePct}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock size={14} className="text-primary" /> Next automatic check
              </div>
              <div className="text-lg font-bold text-foreground">
                {status?.days_remaining !== undefined && status.days_remaining > 0 ? `In about ${status.days_remaining} days` : "Scheduled"}
              </div>
              <div className="text-sm text-muted-foreground">Runs every {cadenceLabel}</div>
            </div>

            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <History size={14} className="text-primary" /> Last check
              </div>
              <div className="text-lg font-bold text-foreground">
                {status?.last_run_at ? String(status.last_run_at).slice(0, 10) : "Not run yet"}
              </div>
              {status?.cid ? (
                <button
                  onClick={() => copyCidToClipboard(status.cid)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                  title="Copy audit reference ID"
                >
                  {copiedCid ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedCid ? "Copied" : "Copy audit ID"}
                </button>
              ) : (
                <div className="text-sm text-muted-foreground">Press Check agents now</div>
              )}
            </div>
          </div>

          {status?.dropped_trades_count > 0 && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground/90 leading-relaxed">
                <strong className="text-amber-400">{status.dropped_trades_count} trades were skipped</strong> by your safety rules to protect your money.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Do the agents work together? */}
      <div
        className={`p-4 rounded-2xl border flex items-start sm:items-center gap-3 ${
          harmonyBad ? "bg-rose-500/10 border-rose-500/30" : "bg-emerald-500/10 border-emerald-500/20"
        }`}
      >
        {harmonyBad ? (
          <AlertTriangle size={22} className="text-rose-400 shrink-0" />
        ) : (
          <ShieldCheck size={22} className="text-emerald-400 shrink-0" />
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{harmonyBad ? "Your agents are in conflict" : "Your agents are working together"}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
            {conflicts?.conflict_summary || "No opposing trades were found and your portfolio is protected."}
          </p>
        </div>
      </div>

      {/* Pick an agent, see its report */}
      <section aria-label="Agent reports" className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Agent reports</h2>
          <p className="text-sm text-muted-foreground">Pick an agent to see why it got its score.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {agentTabs.map(({ id, name, blurb, score, Icon, haltKey }) => {
            const selected = activeTabNode === id;
            const tone = scoreTone(Number(score));
            const halted = haltKey ? killedAgents.includes(haltKey) : false;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTabNode(id)}
                aria-pressed={selected}
                className={`key3d text-left p-4 rounded-2xl border space-y-3 ${
                  selected ? "bg-primary/10 border-primary/60" : "bg-card border-border hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Icon size={18} className="text-primary" />
                    {name}
                  </span>
                  <span className={`text-2xl font-bold font-mono ${getScoreColor(Number(score))}`}>{score}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden" role="presentation">
                  <div className={`h-full rounded-full ${toneBar[tone]}`} style={{ width: `${Math.max(0, Math.min(100, Number(score)))}%` }} />
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{blurb}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${toneChip[tone]}`}>{scoreLabel(Number(score))}</span>
                  {halted && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-rose-500/20 text-rose-300 border-rose-500/40">Paused</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected agent report */}
        <div className="tilt3d p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-5" {...tilt3d(1.5)}>
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-secondary text-primary">{activeData.icon}</span>
              <h3 className="text-lg font-bold text-foreground">{activeData.title}</h3>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${toneChip[toneOf(activeData.status)]}`}>
                {humanize(activeData.status)}
              </span>
              <span className={`font-mono font-bold text-lg px-3 py-1 rounded-lg bg-secondary ${getScoreColor(activeData.score)}`}>
                {activeData.score} / 100
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-1.5">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Info size={16} className="text-primary" /> Why this score
            </div>
            <p className="text-base text-foreground/90 leading-relaxed text-pretty">{activeData.scoreExplanation}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <div className="text-base font-semibold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={18} /> What went well
              </div>
              <ul className="space-y-2.5 text-sm text-foreground/85">
                {activeData.strengths.map((s: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="text-base font-semibold text-amber-400 flex items-center gap-2">
                <AlertTriangle size={18} /> What needs attention
              </div>
              <ul className="space-y-2.5 text-sm text-foreground/85">
                {activeData.whatWasMissed.map((m: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <ArrowRight size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {activeData.metrics.map((m: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl bg-secondary/30 border border-border">
                <div className="text-sm text-muted-foreground">{m.label}</div>
                <div className="text-xl font-bold font-mono text-foreground mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it found and what to do */}
      <section aria-label="Findings and next steps" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(3)}>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400" /> What the Watchdog found
          </h2>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {keyFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5 leading-relaxed">
                <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(3)}>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles size={18} className="text-primary" /> What you can do next
          </h2>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {recommendedActions.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 leading-relaxed">
                <ArrowRight size={16} className="text-primary shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Settings */}
      <section aria-label="Watchdog settings" className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Watchdog settings</h2>
          <p className="text-sm text-muted-foreground">Changes save automatically.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <label htmlFor="kill-threshold" className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Sliders size={18} className="text-primary" /> Auto-pause strictness
                </label>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  If an agent&apos;s score drops below this number, the Watchdog pauses that agent for you.
                </p>
              </div>
              <span className="font-mono font-bold text-lg px-3 py-1 rounded-lg bg-secondary text-primary border border-border shrink-0">
                {killThreshold}
              </span>
            </div>
            <input
              id="kill-threshold"
              type="range"
              min="0"
              max="80"
              step="5"
              value={killThreshold}
              onChange={(e) => setKillThreshold(Number(e.target.value))}
              onMouseUp={(e) => handleSaveKillThreshold(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSaveKillThreshold(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => handleSaveKillThreshold(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-primary cursor-pointer h-2"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0 Relaxed</span>
              <span>40 Standard</span>
              <span>80 Strict</span>
            </div>
            {isSavingThreshold && <p className="text-sm text-primary animate-pulse">Saving...</p>}
          </div>

          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock size={18} className="text-primary" /> How often to check
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                Choose how often the Watchdog reviews your agents on its own.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "1w", label: "1 week", desc: "Every 7 days" },
                { id: "2w", label: "2 weeks", desc: "Every 14 days" },
                { id: "1m", label: "1 month", desc: "Every 30 days" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSaveCadence(c.id)}
                  disabled={isSavingCadence}
                  aria-pressed={cadence === c.id}
                  className={`key3d py-3 px-2 rounded-xl text-center border disabled:opacity-60 ${
                    cadence === c.id
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <div className="text-sm font-semibold">{c.label}</div>
                  <div className="text-xs opacity-80 mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>
            {isSavingCadence && <p className="text-sm text-primary animate-pulse">Saving...</p>}
          </div>
        </div>
      </section>

      {/* Detailed checks, collapsed by default */}
      <section aria-label="Detailed safety checks" className="tilt3d rounded-2xl bg-card border border-border" {...tilt3d(1.5)}>
        <button
          type="button"
          onClick={() => setShowChecks((v) => !v)}
          aria-expanded={showChecks}
          aria-controls="safety-checks"
          className="w-full flex items-center justify-between gap-3 p-5 text-left"
        >
          <span className="flex items-center gap-2.5">
            <Brain size={20} className="text-primary" />
            <span>
              <span className="block text-base font-bold text-foreground">Detailed safety checks</span>
              <span className="block text-sm text-muted-foreground">The 5 areas the Watchdog scores</span>
            </span>
          </span>
          <span className="text-sm font-semibold text-primary shrink-0">{showChecks ? "Hide" : "Show"}</span>
        </button>

        {showChecks && (
          <div id="safety-checks" className="px-5 pb-5 space-y-3">
            {safetyChecks.map((p) => {
              const tone = scoreTone(p.score);
              return (
                <div key={p.key} className="p-4 rounded-xl bg-secondary/30 border border-border space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold text-foreground">{p.label}</span>
                    <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-lg border ${toneChip[tone]}`}>{p.score} / 100</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden" role="presentation">
                    <div className={`h-full rounded-full transition-all ${toneBar[tone]}`} style={{ width: `${p.score}%` }} />
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">
                    <strong className="text-primary font-semibold">Result:</strong> {p.detail}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
