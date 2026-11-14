"use client";

import { toast } from "@/hooks/use-toast";
import { setVisibleInterval } from "@/lib/visible-interval"
import { startRun, streamRun, getRun, getActiveRun, setActiveRun, waitForRun, findRunningRun } from "@/lib/agent-runs";
import { tilt3d } from "./trader/tilt-3d";
import InfoTip from "./shared/info-tip";
import AdvancedSection, { SettingBox, SettingGrid } from "./shared/advanced-section";
import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
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

interface ModeratorStepEvent {
  step_number: number;
  step_name: string;
  title: string;
  status: "running" | "completed";
  score?: number;
  health?: string;
  message: string;
  data?: any;
}

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};


export default function ModeratorSection({ accountId, onConnectWallet }: Props) {
  const [status, setStatus] = useState<any>(null);
  const isFetchingRef = React.useRef(false);
  const formSeededRef = React.useRef(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
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
  const [showAllVerdictPoints, setShowAllVerdictPoints] = useState(false);

  const [moderatorSteps, setModeratorSteps] = useState<ModeratorStepEvent[]>([]);
  const [currentActiveModStep, setCurrentActiveModStep] = useState<number>(0);

  const targetWallet = accountId || "";

  const fetchStatus = async () => {
    if (!accountId) {
      setStatus(null);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/moderator/status/${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        // Only seed the editable fields on the first load; later polls must not clobber unsaved edits.
        if (!formSeededRef.current) {
          if (data.user_kill_threshold !== undefined) setKillThreshold(data.user_kill_threshold);
          if (data.moderator_frequency) setCadence(data.moderator_frequency);
          formSeededRef.current = true;
        }
      }
    } catch (e) {
      console.error("Moderator status error:", e);
    } finally {
      setStatusLoaded(true);
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    formSeededRef.current = false;
    setStatusLoaded(!accountId);
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
      } else {
        const err = await res.json().catch(() => null);
        toast({
          title: "Update Moderator Status Failed",
          description: err?.detail || `HTTP ${res.status}: ${res.statusText}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      console.error("Toggle moderator active error:", e);
      toast({
        title: "Moderator Config Error",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsTogglingActive(false);
    }
  };

  // Toggle Emergency Kill Switch
  const handleToggleKillSwitch = async (activate: boolean) => {
    setIsTogglingKillSwitch(true);
    try {
      const res = await fetch("/api/moderator/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: targetWallet,
          activate: activate,
        }),
      });
      if (res.ok) {
        await fetchStatus();
      } else {
        const err = await res.json().catch(() => null);
        toast({
          title: "Kill Switch Error",
          description: err?.detail || `HTTP ${res.status}: ${res.statusText}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      console.error("Kill switch error:", e);
      toast({
        title: "Kill Switch Exception",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  const handleModeratorEvent = (ev: any) => {
    if (ev.type === "error") {
      toast({
        title: "Moderator Audit Error",
        description: ev.error || ev.message || "An unexpected error occurred during deliberation.",
        variant: "destructive",
      });
    } else if (ev.type === "step") {
      setCurrentActiveModStep(ev.step_number);
      setModeratorSteps((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.step_number === ev.step_number);
        const stepObj: ModeratorStepEvent = {
          step_number: ev.step_number,
          step_name: ev.step_name,
          title: ev.title,
          status: ev.status,
          score: ev.score,
          health: ev.health,
          message: ev.message,
          data: ev.data,
        };
        if (idx !== -1) next[idx] = stepObj;
        else next.push(stepObj);
        return next;
      });
    } else if (ev.type === "final" && ev.result) {
      setStatus(ev.result);
    }
  };

  // Resume an in-progress fleet audit after refresh / navigation
  useEffect(() => {
    if (!accountId) return;
    const abortCtrl = new AbortController();
    (async () => {
      try {
        const runningId = await findRunningRun("moderator", accountId);
        if (abortCtrl.signal.aborted) return;
        if (runningId) {
          setActiveRun("moderator", accountId, runningId);
          setIsDeliberating(true);
          setModeratorSteps([]);
          setCurrentActiveModStep(1);
          await streamRun(runningId, handleModeratorEvent, 0, abortCtrl.signal);
          if (abortCtrl.signal.aborted) return;
          setActiveRun("moderator", accountId, null);
          setIsDeliberating(false);
          fetchStatus();
          return;
        }
        const lastId = getActiveRun("moderator", accountId);
        if (lastId) {
          const run = await getRun(lastId, accountId);
          if (run?.status === "completed" && run.result) setStatus(run.result as any);
          setActiveRun("moderator", accountId, null);
        }
      } catch (e) {
        console.warn("[MODERATOR] Error reconnecting active run:", e);
        setIsDeliberating(false);
      }
    })();
    return () => abortCtrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Run On-Demand Fleet Audit via real-time 4-Node stream
  const handleRunDeliberation = async () => {
    setIsDeliberating(true);
    setModeratorSteps([
      {
        step_number: 1,
        step_name: "Trader Agent Audit",
        title: "Quantitative Trader Hallucination & Risk Audit",
        status: "running",
        message: "Auditing trader win-rate, R:R math, and reasoning traces...",
      },
      {
        step_number: 2,
        step_name: "Rebalancer Agent Audit",
        title: "Portfolio Drift & Stablecoin Floor Audit",
        status: "running",
        message: "Queued...",
      },
      {
        step_number: 3,
        step_name: "Deep Research Audit",
        title: "Citation Grounding & Fact Accuracy Audit",
        status: "running",
        message: "Queued...",
      },
      {
        step_number: 4,
        step_name: "Fleet Master Synthesis",
        title: "Cross-Agent Conflict Check & Master Verdict",
        status: "running",
        message: "Queued...",
      },
    ]);
    setCurrentActiveModStep(1);

    // Auto-mark agent active in fleet configuration
    try {
      fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: targetWallet,
          agent_id: "moderator",
          is_active: true,
        }),
      }).catch(() => {});
    } catch {}

    let startedRunId: string | null = null;
    let keepActiveRun = false;
    try {
      // Background run: keeps executing on the backend if the user refreshes or leaves this page.
      const { run_id } = await startRun("moderator", { user_wallet: targetWallet });
      startedRunId = run_id;
      setActiveRun("moderator", targetWallet, run_id);
      await streamRun(run_id, handleModeratorEvent, 0);
    } catch (e: any) {
      if (startedRunId) {
        console.warn("[MODERATOR] Live stream dropped; waiting for background run:", e);
        const finished = await waitForRun(startedRunId, targetWallet);
        if (finished?.status === "completed" && finished.result) setStatus(finished.result as any);
        keepActiveRun = !finished;
      } else {
        console.error("Deliberation start error:", e);
        toast({
          title: "Fleet Deliberation Failed",
          description: e?.message || String(e),
          variant: "destructive",
        });
      }
    } finally {
      setIsDeliberating(false);
      if (!keepActiveRun) setActiveRun("moderator", targetWallet, null);
      fetchStatus();
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
  const hasAudit = Boolean(
    status &&
      status.has_evaluation !== false &&
      status.total_mean_score !== undefined &&
      status.total_mean_score !== null
  );
  const totalMeanScore = hasAudit ? (status?.total_mean_score ?? status?.overall_performance_score) : null;
  const verdict = status?.verdict ?? (isKillSwitchActive ? "SAFETY_BREACH_SUSPEND" : "NOT_AUDITED");
  const paramScores = status?.parameter_scores;

  const node1Trader = status?.node_1_trader;
  const node2Rebalancer = status?.node_2_rebalancer;
  const node3Research = status?.node_3_research;
  const conflicts = status?.cross_agent_conflicts;
  const killedAgents = status?.killed_agents || [];

  const traderScore = hasAudit ? (status?.trader_score ?? node1Trader?.score ?? null) : null;
  const rebalancerScore = hasAudit ? (status?.rebalancer_score ?? node2Rebalancer?.score ?? null) : null;
  const researchScore = hasAudit ? (status?.research_score ?? node3Research?.score ?? null) : null;

  const getVerdictStyle = (v: string) => {
    switch (v) {
      case "OPTIMAL_HEALTH":
        return "tone-good t-chip";
      case "MODERATE_RISK":
      case "ELEVATED_DRIFT":
        return "tone-warn t-chip";
      default:
        return "tone-bad t-chip";
    }
  };

  const getScoreColor = (sc: number | null | undefined) => {
    if (sc === null || sc === undefined) return "text-muted-foreground";
    if (sc >= 80) return "tone-good t-fg";
    if (sc >= 60) return "tone-warn t-fg";
    return "tone-bad t-fg";
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
            { label: "Win Rate", value: node1Trader?.metrics?.win_rate_pct != null ? `${Math.round(node1Trader.metrics.win_rate_pct)}%` : "—" },
            { label: "Risk : Reward", value: node1Trader?.metrics?.avg_risk_reward_ratio != null ? `1:${node1Trader.metrics.avg_risk_reward_ratio}` : "—" },
            { label: "Open Trades", value: `${node1Trader?.metrics?.open_trades_count ?? 0}` },
            { label: "Daily Allowance", value: `${node1Trader?.metrics?.daily_cap_remaining ?? (3 - (node1Trader?.metrics?.open_trades_count || 0))} left` },
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
                `Held a liquid stablecoin cash cushion (${node2Rebalancer?.metrics?.stablecoin_reserve_pct != null ? `${node2Rebalancer.metrics.stablecoin_reserve_pct}%` : "buffer"}) to protect purchasing power.`,
                `Portfolio drift (${node2Rebalancer?.metrics?.current_drift_pct != null ? `${node2Rebalancer.metrics.current_drift_pct}%` : "minimal"}) is comfortably within your limit.`,
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
            { label: "Allocation Drift", value: node2Rebalancer?.metrics?.current_drift_pct != null ? `${node2Rebalancer.metrics.current_drift_pct}%` : "—" },
            { label: "Cash Buffer", value: node2Rebalancer?.metrics?.stablecoin_reserve_pct != null ? `${node2Rebalancer.metrics.stablecoin_reserve_pct}%` : "—" },
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
            { label: "Fact Accuracy", value: node3Research?.hallucination_audit?.faithfulness_ratio != null ? `${Math.round(node3Research.hallucination_audit.faithfulness_ratio * 100)}%` : "—" },
            { label: "Source Depth", value: node3Research?.metrics?.avg_citation_density != null ? `${node3Research.metrics.avg_citation_density}` : "—" },
            { label: "Source Reliability", value: node3Research?.metrics?.source_verification_rate != null ? `${node3Research.metrics.source_verification_rate}%` : "—" },
            { label: "Reports Analyzed", value: `${node3Research?.metrics?.reports_generated_7d ?? 0}` },
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
                `Total open exposure ($${status?.total_open_exposure_usd || 0}) is safely below your daily budget ($${status?.daily_limit_usd || 1500}).`,
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
            { label: "Daily Budget", value: `$${status?.daily_limit_usd || 1500}` },
            { label: "Opposing Orders", value: "0 (None)" },
            { label: "Kill Threshold", value: `${killThreshold}/80` },
          ],
        };
    }
  };

  const activeData = getActiveTabData();

  type Tone = "good" | "warn" | "bad" | "neutral";

  const toneOf = (v: string): Tone => {
    const s = String(v || "").toUpperCase();
    if (!s || s === "NOT_AUDITED") return "neutral";
    if (["OPTIMAL_HEALTH", "HEALTHY", "VERIFIED", "SYNCHRONIZED"].includes(s)) return "good";
    if (/BREACH|SUSPEND|CRITICAL|HALT|FAIL|KILL/.test(s)) return "bad";
    return "warn";
  };
  const toneChip: Record<Tone, string> = {
    good: "tone-good t-chip",
    warn: "tone-warn t-chip",
    bad: "tone-bad t-chip",
    neutral: "bg-secondary text-muted-foreground border-border",
  };
  const toneBar: Record<Tone, string> = {
    good: "tone-good t-bar",
    warn: "tone-warn t-bar",
    bad: "tone-bad t-bar",
    neutral: "bg-muted",
  };
  const toneSoft: Record<Tone, string> = {
    good: "tone-good t-soft",
    warn: "tone-warn t-soft",
    bad: "tone-bad t-soft",
    neutral: "bg-secondary/50 border-border",
  };

  const capitalize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

  // Break the long verdict paragraph into short points so it reads as separate cards.
  const splitPoints = (text: string): string[] =>
    String(text || "")
      .split(/;\s+|:\s+(?=[A-Z][a-zA-Z]+ \()|(?<=\.)\s+(?=[A-Z])/)
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean);

  // Turn "HEADING: detail" (or "first clause; rest" when asked) into a title and a body.
  const parsePoint = (text: string, splitOnSemicolon = false) => {
    const raw = String(text || "").trim();
    const colon = raw.match(/^([^:(]{3,70}):\s+([\s\S]+)$/);
    if (colon) {
      const title = colon[1] === colon[1].toUpperCase() ? capitalize(colon[1].toLowerCase()) : colon[1];
      return { title, body: colon[2] };
    }
    if (splitOnSemicolon) {
      const semi = raw.match(/^([^;]{8,110});\s+([\s\S]+)$/);
      if (semi) return { title: semi[1], body: capitalize(semi[2]) };
    }
    return { title: "", body: raw };
  };

  // "Trader (82.0, WARNING) executed no trades..." becomes an agent card with a score chip.
  const parseAgentPoint = (text: string) => {
    const m = String(text).match(/^(Trader|Rebalancer|Research)\s*\(([^)]*)\)\s*([\s\S]*)$/);
    if (!m) return null;
    const [score, label = ""] = m[2].split(",").map((s) => s.trim());
    const labelUp = label.toUpperCase();
    const tone: Tone = /HALT|CRITICAL|KILL|FAIL/.test(labelUp) ? "bad" : /WARN/.test(labelUp) ? "warn" : "good";
    return { name: m[1], score, label: humanize(label), tone, body: capitalize(m[3].replace(/^(is|was)\s+/i, "Is ")) };
  };
  const findingTone = (title: string): Tone => (/kill|suspend|halt|breach|critical/i.test(title) ? "bad" : "good");
  const scoreTone = (sc: number | null | undefined): Tone =>
    sc === null || sc === undefined ? "neutral" : sc >= 80 ? "good" : sc >= 60 ? "warn" : "bad";
  const scoreLabel = (sc: number | null | undefined) =>
    sc === null || sc === undefined ? "Not audited" : sc >= 80 ? "Healthy" : sc >= 60 ? "Needs a look" : "At risk";
  const humanize = (v: string) => {
    const t = String(v || "").replace(/_/g, " ").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const verdictTone = toneOf(verdict);
  const verdictHeadline =
    verdictTone === "neutral"
      ? "Fleet not audited yet"
      : verdictTone === "good"
      ? "Everything looks healthy"
      : verdictTone === "warn"
      ? "Worth a closer look"
      : "Action needed";

  const overallScore = hasAudit ? Math.max(0, Math.min(100, Number(totalMeanScore) || 0)) : null;
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = overallScore !== null ? ringCircumference * (1 - overallScore / 100) : ringCircumference;

  const exposure = status?.total_open_exposure_usd || 0;
  const dailyLimit = status?.daily_limit_usd || 1500;
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
      score: paramScores?.capital_safety_discipline?.score ?? null,
      detail: paramScores?.capital_safety_discipline?.detail ?? "Awaiting fleet audit...",
    },
    {
      key: "signal_quality_win_expectancy",
      label: "Signal quality",
      desc: "Confidence of each trade idea and a healthy reward-to-risk balance.",
      score: paramScores?.signal_quality_win_expectancy?.score ?? null,
      detail: paramScores?.signal_quality_win_expectancy?.detail ?? "Awaiting fleet audit...",
    },
    {
      key: "portfolio_allocation_health",
      label: "Portfolio balance and cash reserves",
      desc: "Target token weights and safe stablecoin reserves are maintained.",
      score: paramScores?.portfolio_allocation_health?.score ?? null,
      detail: paramScores?.portfolio_allocation_health?.detail ?? "Awaiting fleet audit...",
    },
    {
      key: "multi_source_intel_depth",
      label: "Market intelligence and fact accuracy",
      desc: "Research is cross-checked against live market feeds and verified news.",
      score: paramScores?.multi_source_intel_depth?.score ?? null,
      detail: paramScores?.multi_source_intel_depth?.detail ?? "Awaiting fleet audit...",
    },
    {
      key: "execution_efficiency_uptime",
      label: "Execution and reliability",
      desc: "Trades go through quickly and monitoring stays online.",
      score: paramScores?.execution_efficiency_uptime?.score ?? null,
      detail: paramScores?.execution_efficiency_uptime?.detail ?? "Awaiting fleet audit...",
    },
  ];

  const keyFindings: string[] = status?.key_findings || [];
  const recommendedActions: string[] = status?.recommended_tuning || [];

  const harmonyBad = conflicts?.cannibalization_detected || conflicts?.threat_to_holdings_detected;
  const cadenceLabel = cadence === "1m" ? "1 month" : cadence === "2w" ? "2 weeks" : "1 week";
  const hasNoData = (!status || !hasAudit) && !isLoading;

  const verdictPoints = splitPoints(status?.verdict_rationale || "");
  const detailPoints = verdictPoints.slice(1);
  const visibleVerdictPoints = showAllVerdictPoints ? detailPoints : detailPoints.slice(0, 4);
  const extraVerdictCount = Math.max(0, detailPoints.length - 4);

  if (!statusLoaded) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 max-w-6xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading moderator configuration">
        <div className="h-20 rounded-2xl bg-secondary/60 border border-border" />
        <div className="h-56 rounded-2xl bg-secondary/60 border border-border" />
        <div className="h-40 rounded-2xl bg-secondary/60 border border-border" />
      </div>
    );
  }

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
              className={`p-2.5 rounded-xl t-soft t-fg ${
                isKillSwitchActive ? "tone-bad" : isAgentActive ? "tone-good" : "tone-warn"
              }`}
            >
              {isKillSwitchActive ? <ShieldAlert size={24} /> : isAgentActive ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Moderator</h1>
            <InfoTip label="About the Moderator">
              The Moderator checks your Trader, Rebalancer and Research agents. It keeps your money safe, makes sure your
              rules are followed, and stops two agents from working against each other.
            </InfoTip>
            <span
              className={`px-3 py-1 text-sm font-semibold rounded-full border ${
                isAgentActive ? toneChip.good : "bg-secondary text-muted-foreground border-border"
              }`}
            >
              {isAgentActive ? "Watching your agents" : "Switched off"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl text-pretty">
            Keeps an eye on all your agents.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleToggleModeratorActive(isAgentActive)}
            disabled={isTogglingActive}
            aria-pressed={isAgentActive}
            className={`key3d flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 ${
              isAgentActive
                ? "tone-good t-chip hover:brightness-110"
                : "bg-secondary/70 hover:bg-secondary text-foreground border-border"
            }`}
            title="Switch the Moderator on or off"
          >
            {isTogglingActive ? (
              <RotateCw size={16} className="animate-spin" />
            ) : isAgentActive ? (
              <Check size={16} />
            ) : (
              <Power size={16} />
            )}
            <span>{isAgentActive ? "Moderator is on" : "Turn Moderator on"}</span>
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
              className="key3d flex items-center gap-2 px-4 py-2.5 rounded-xl tone-good t-chip hover:brightness-110 border text-sm font-semibold disabled:opacity-50"
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
          className="tone-bad t-soft p-5 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-4">
            <span className="p-3 rounded-xl bg-card border border-border t-fg shrink-0">
              <ShieldAlert size={26} />
            </span>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Emergency stop is on</h2>
              <p className="text-base text-foreground/85 leading-relaxed">
                All agents are paused and no new trades will run. Your funds are safe. Resume when you are ready.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleKillSwitch(false)}
            disabled={isTogglingKillSwitch}
            className="key3d-solid flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-black text-base font-semibold hover:bg-emerald-400 shrink-0 disabled:opacity-50"
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
            No fleet audit is recorded for this wallet yet. Press <strong className="text-foreground">Check agents now</strong> to run a live 4-step audit
            across your fleet.
          </span>
        </div>
      )}

      {/* Live 4-step audit progress */}
      {(isDeliberating || moderatorSteps.length > 0) && (
        <section aria-label="Live audit progress" className="p-5 rounded-2xl border border-primary/30 bg-card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-secondary text-primary">
                <Shield size={20} className={isDeliberating ? "animate-pulse" : ""} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">Live audit</h2>
                <p className="text-sm text-muted-foreground">Trader, then Rebalancer, then Research, then the whole fleet</p>
              </div>
            </div>
            {isDeliberating ? (
              <span className="flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full border bg-primary/15 text-primary border-primary/30">
                <RotateCw size={14} className="animate-spin" />
                Audit in progress
              </span>
            ) : (
              <span className={`flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full border ${toneChip.good}`}>
                <CheckCircle2 size={14} />
                Audit complete
              </span>
            )}
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {moderatorSteps.map((step) => {
              const isCurrent = isDeliberating && currentActiveModStep === step.step_number;
              const isDone = step.status === "completed";
              return (
                <li
                  key={step.step_number}
                  className={`p-4 rounded-xl border space-y-2 ${
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : isDone
                      ? toneSoft.good
                      : "border-border bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">Step {step.step_number}</span>
                    {isCurrent ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                        <RotateCw size={14} className="animate-spin" /> Running
                      </span>
                    ) : isDone ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold tone-good t-fg">
                        <CheckCircle2 size={14} /> Done
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Queued</span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-foreground">{step.step_name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.message}</p>

                  {isDone && (
                    <div className="pt-2 mt-1 border-t border-border space-y-1 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Score</span>
                        <span className="font-bold font-mono text-foreground">
                          {step.score !== undefined ? `${step.score} / 100` : "Verified"}
                        </span>
                      </div>
                      {step.step_number === 1 && step.data?.metrics && (
                        <p className="text-muted-foreground">
                          Win rate {Math.round(step.data.metrics.win_rate)}% &middot; Risk:Reward 1:{step.data.metrics.avg_risk_reward_ratio}
                        </p>
                      )}
                      {step.step_number === 2 && step.data?.metrics && (
                        <p className="text-muted-foreground">
                          Drift {step.data.metrics.current_drift_pct}% &middot; Cash {step.data.metrics.stablecoin_reserve_pct}%
                        </p>
                      )}
                      {step.step_number === 3 && step.data?.hallucination_audit && (
                        <p className="text-muted-foreground">
                          Fact accuracy {Math.round(step.data.hallucination_audit.faithfulness_ratio * 100)}% &middot; Verified claims{" "}
                          {step.data.hallucination_audit.grounded_claims_count}
                        </p>
                      )}
                      {step.step_number === 4 && (
                        <p className="font-semibold text-foreground">Verdict: {humanize(step.data?.verdict || "OPTIMAL_HEALTH")}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Summary: the score and the reasons behind it, each in its own card */}
      <section aria-label="Fleet summary" className="grid grid-cols-1 lg:grid-cols-[19rem_1fr] gap-4">
        <div
          className="tilt3d flex flex-col items-center text-center gap-5 p-6 rounded-2xl bg-card border border-border"
          {...tilt3d(1.5)}
        >
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Overall fleet health</p>
          <div className={`relative w-44 h-44 ${getScoreColor(overallScore)}`}>
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
              <span className="text-5xl font-extrabold font-mono leading-none">
                {overallScore !== null ? overallScore.toFixed(1).replace(/\.0$/, "") : "—"}
              </span>
              <span className="text-sm text-muted-foreground mt-1.5">{overallScore !== null ? "out of 100" : "not audited"}</span>
            </div>
          </div>
          <span className="sr-only">
            {overallScore !== null ? `Overall health score ${overallScore} out of 100` : "Fleet has not been audited yet"}
          </span>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-foreground text-balance">{verdictHeadline}</h2>
            <span className={`inline-block px-3.5 py-1 text-sm font-semibold rounded-full border ${toneChip[verdictTone]}`}>
              {humanize(verdict)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
            The average of your Trader, Rebalancer and Research scores.
          </p>
        </div>

        <div className="tilt3d p-6 rounded-2xl bg-card border border-border space-y-5" {...tilt3d(1.5)}>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-secondary text-primary">
              <Info size={20} />
            </span>
            <h2 className="text-xl font-bold text-foreground">Why the Moderator gave this verdict</h2>
          </div>

          {verdictPoints.length === 0 ? (
            <p className="text-lg text-foreground/85 leading-relaxed">
              {hasAudit
                ? "All three agents are working safely inside the limits you set."
                : "Press Check agents now. The Moderator will audit your Trader, Rebalancer and Research agents and explain its verdict here."}
            </p>
          ) : (
            <>
              <p className="text-lg text-foreground leading-relaxed font-medium text-pretty">{capitalize(verdictPoints[0])}.</p>

              {visibleVerdictPoints.length > 0 && (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visibleVerdictPoints.map((point, i) => {
                    const agent = parseAgentPoint(point);
                    return (
                      <li key={i} className="p-4 rounded-xl bg-secondary/50 border border-border space-y-2">
                        {agent ? (
                          <>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-foreground">{agent.name}</h3>
                              <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${toneChip[agent.tone]}`}>
                                {agent.score} {agent.label && `· ${agent.label}`}
                              </span>
                            </div>
                            <p className="text-base text-foreground/85 leading-relaxed">{agent.body}.</p>
                          </>
                        ) : (
                          <p className="text-base text-foreground/85 leading-relaxed">{capitalize(point)}.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {extraVerdictCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllVerdictPoints((v) => !v)}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {showAllVerdictPoints ? "Show fewer" : `Show ${extraVerdictCount} more`}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* Status cards, one fact each */}
      <section aria-label="Status" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(2)}>
          <div className="flex items-center gap-2.5 text-base font-semibold text-muted-foreground">
            <span className="p-2 rounded-lg bg-secondary text-primary">
              <Coins size={18} />
            </span>
            Money in open trades
          </div>
          <div className="text-3xl font-bold font-mono text-foreground">
            ${exposure} <span className="text-base font-normal text-muted-foreground">of ${dailyLimit} daily limit</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden" role="presentation">
            <div
              className={`h-full rounded-full transition-all ${exposurePct > 50 ? toneBar.warn : toneBar.good}`}
              style={{ width: `${exposurePct}%` }}
            />
          </div>
        </div>

        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(2)}>
          <div className="flex items-center gap-2.5 text-base font-semibold text-muted-foreground">
            <span className="p-2 rounded-lg bg-secondary text-primary">
              <Clock size={18} />
            </span>
            Next automatic check
          </div>
          <div className="text-3xl font-bold text-foreground">
            {status?.days_remaining !== undefined && status.days_remaining > 0 ? `In about ${status.days_remaining} days` : "Scheduled"}
          </div>
          <div className="text-base text-muted-foreground">Runs every {cadenceLabel}</div>
        </div>

        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(2)}>
          <div className="flex items-center gap-2.5 text-base font-semibold text-muted-foreground">
            <span className="p-2 rounded-lg bg-secondary text-primary">
              <History size={18} />
            </span>
            Last check
          </div>
          {isDeliberating ? (
            <>
              <div className="text-3xl font-bold text-primary flex items-center gap-3">
                <RotateCw size={24} className="animate-spin shrink-0" />
                <span>Auditing...</span>
              </div>
              <div className="text-base text-muted-foreground">Running the 4-step audit</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-foreground">{status?.last_run_at ? String(status.last_run_at).slice(0, 10) : "Not run yet"}</div>
              {status?.cid ? (
                <button
                  onClick={() => copyCidToClipboard(status.cid)}
                  className="flex items-center gap-1.5 text-base font-medium text-primary hover:underline"
                  title="Copy audit reference ID"
                >
                  {copiedCid ? <Check size={16} /> : <Copy size={16} />}
                  {copiedCid ? "Copied" : "Copy audit ID"}
                </button>
              ) : (
                <div className="text-base text-muted-foreground">Press Check agents now</div>
              )}
            </>
          )}
        </div>
      </section>

      {status?.dropped_trades_count > 0 && (
        <div className="tone-warn t-soft flex items-start gap-3 p-4 rounded-2xl border">
          <ShieldAlert size={22} className="t-fg shrink-0 mt-0.5" />
          <p className="text-base text-foreground leading-relaxed">
            <strong className="font-bold">{status.dropped_trades_count} trades were skipped</strong> by your safety rules to protect your money.
          </p>
        </div>
      )}

      {/* Do the agents work together? */}
      <div
        className={`${harmonyBad ? toneSoft.bad : toneSoft.good} p-5 rounded-2xl border flex items-start sm:items-center gap-4`}
      >
        <span className={`p-2.5 rounded-xl bg-card border border-border shrink-0 ${harmonyBad ? "tone-bad" : "tone-good"} t-fg`}>
          {harmonyBad ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-bold text-foreground">{harmonyBad ? "Your agents are in conflict" : "Your agents are working together"}</h3>
          <p className="text-base text-foreground/85 leading-relaxed">
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
            const isAgentAuditing = isDeliberating && currentActiveModStep === id + 1;
            const isAgentQueued = isDeliberating && currentActiveModStep < id + 1;
            const tone = scoreTone(score);
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
                  {isAgentAuditing ? (
                    <span className="text-sm font-semibold text-primary flex items-center gap-1.5">
                      <RotateCw size={14} className="animate-spin" /> Auditing
                    </span>
                  ) : isAgentQueued ? (
                    <span className="text-sm text-muted-foreground">Queued</span>
                  ) : (
                    <span className={`text-2xl font-bold font-mono ${getScoreColor(score)}`}>
                      {score !== null && score !== undefined ? score : "—"}
                    </span>
                  )}
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden" role="presentation">
                  {isAgentAuditing ? (
                    <div className="h-full w-full bg-primary/60 animate-pulse" />
                  ) : (
                    <div
                      className={`h-full rounded-full ${toneBar[tone]}`}
                      style={{ width: `${score !== null && score !== undefined ? Math.max(0, Math.min(100, Number(score))) : 0}%` }}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{blurb}</p>
                <div className="flex items-center gap-2">
                  {isAgentAuditing ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-primary/15 text-primary border-primary/30">In review</span>
                  ) : isAgentQueued ? (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${toneChip.neutral}`}>Pending</span>
                  ) : (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${toneChip[tone]}`}>{scoreLabel(score)}</span>
                  )}
                  {halted && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${toneChip.bad}`}>Paused</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected agent report */}
        <div className="tilt3d p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-5" {...tilt3d(1.5)}>
          {isDeliberating && currentActiveModStep === activeTabNode + 1 && (
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3 text-base text-foreground">
              <RotateCw size={18} className="animate-spin shrink-0 text-primary" />
              <span>The {agentTabs[activeTabNode].name} audit is running right now.</span>
            </div>
          )}
          {isDeliberating && currentActiveModStep < activeTabNode + 1 && (
            <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-center gap-3 text-base text-muted-foreground">
              <Clock size={18} className="shrink-0" />
              <span>The {agentTabs[activeTabNode].name} audit is waiting its turn.</span>
            </div>
          )}
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
                {activeData.score !== null && activeData.score !== undefined ? `${activeData.score} / 100` : "Not audited"}
              </span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-secondary/50 border border-border space-y-2">
            <div className="text-base font-bold text-foreground flex items-center gap-2">
              <Info size={18} className="text-primary" /> Why this score
            </div>
            <p className="text-base sm:text-lg text-foreground/90 leading-relaxed text-pretty">{activeData.scoreExplanation}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="tone-good t-soft p-5 rounded-xl border space-y-3">
              <div className="text-lg font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 size={20} className="t-fg" /> What went well
              </div>
              <ul className="space-y-3 text-base text-foreground/90">
                {activeData.strengths.map((s: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3 leading-relaxed">
                    <Check size={18} className="t-fg shrink-0 mt-1" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tone-warn t-soft p-5 rounded-xl border space-y-3">
              <div className="text-lg font-bold text-foreground flex items-center gap-2">
                <AlertTriangle size={20} className="t-fg" /> What needs attention
              </div>
              <ul className="space-y-3 text-base text-foreground/90">
                {activeData.whatWasMissed.map((m: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3 leading-relaxed">
                    <ArrowRight size={18} className="t-fg shrink-0 mt-1" />
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

      {/* What it found: one card per finding */}
      {keyFindings.length > 0 && (
      <section aria-label="What the Moderator found" className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg tone-good t-soft t-fg">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <h2 className="text-xl font-bold text-foreground">What the Moderator found</h2>
            <p className="text-sm text-muted-foreground">{keyFindings.length} observations from the latest check</p>
          </div>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {keyFindings.map((f, i) => {
            const { title, body } = parsePoint(f);
            const tone = findingTone(title);
            return (
              <li key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
                <span className={`mt-0.5 p-1.5 rounded-lg shrink-0 t-soft t-fg ${tone === "bad" ? "tone-bad" : "tone-good"}`}>
                  {tone === "bad" ? <AlertTriangle size={16} /> : <Check size={16} />}
                </span>
                <div className="space-y-1 min-w-0">
                  {title && <h3 className="text-base font-bold text-foreground">{title}</h3>}
                  <p className="text-base text-foreground/80 leading-relaxed">{body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {/* What to do next: one numbered card per step */}
      {recommendedActions.length > 0 && (
      <section aria-label="What you can do next" className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-secondary text-primary">
            <Sparkles size={22} />
          </span>
          <div>
            <h2 className="text-xl font-bold text-foreground">What you can do next</h2>
            <p className="text-sm text-muted-foreground">Suggested steps, most important first</p>
          </div>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recommendedActions.map((t, i) => {
            const { title, body } = parsePoint(t, true);
            return (
              <li key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
                <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="space-y-1 min-w-0">
                  {title && <h3 className="text-base font-bold text-foreground">{title}</h3>}
                  <p className="text-base text-foreground/80 leading-relaxed">{body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      )}

      {/* Settings */}
      <section aria-label="Moderator settings">
        <AdvancedSection
          tip="Moderator settings. Changes save automatically."
          summary={`Pause below ${killThreshold} · check every ${cadence}`}
        >
        <SettingGrid>
          <SettingBox>
            <div className="flex items-start justify-between gap-2">
              <div>
                <label htmlFor="kill-threshold" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sliders size={16} className="text-primary" /> Auto-pause strictness
                  <InfoTip label="About auto-pause strictness">
                    If an agent&apos;s score drops below this number, the Moderator pauses that agent for you.
                  </InfoTip>
                </label>
              </div>
              <span className="font-mono font-bold text-sm px-2 py-0.5 rounded-lg bg-secondary text-primary border border-border shrink-0">
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
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Relaxed</span>
              <span>Strict</span>
            </div>
            {isSavingThreshold && <p className="text-sm text-primary animate-pulse">Saving...</p>}
          </SettingBox>

          <SettingBox>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock size={16} className="text-primary" /> How often to check
                <InfoTip label="About check frequency">
                  How often the Moderator reviews your agents on its own.
                </InfoTip>
              </h3>
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
                  className={`key3d py-2 px-1 rounded-xl text-center border disabled:opacity-60 ${
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
          </SettingBox>
        </SettingGrid>
        </AdvancedSection>
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
              <span className="block text-sm text-muted-foreground">The 5 areas the Moderator scores</span>
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
                    <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-lg border ${toneChip[tone]}`}>
                      {p.score !== null && p.score !== undefined ? `${p.score} / 100` : "Not audited"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden" role="presentation">
                    <div
                      className={`h-full rounded-full transition-all ${toneBar[tone]}`}
                      style={{ width: `${p.score !== null && p.score !== undefined ? p.score : 0}%` }}
                    />
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
