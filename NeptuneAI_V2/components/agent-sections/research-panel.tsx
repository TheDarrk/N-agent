"use client";

import { tilt3d } from "./trader/tilt-3d";
import ReportView from "./research/report-view";
import InfoTip from "./shared/info-tip";
import AdvancedSection, { SettingBox, SettingGrid } from "./shared/advanced-section";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { loadAgentConfig, useAutoSaveAgentConfig } from "@/lib/agent-config";
import { setVisibleInterval } from "@/lib/visible-interval";
import {
  startRun,
  streamRun,
  getRun,
  listRuns,
  getActiveRun,
  findRunningRun,
  setActiveRun,
  waitForRun,
} from "@/lib/agent-runs";
import {
  FileText,
  Sparkles,
  RotateCw,
  Send,
  CheckCircle2,
  Layers,
  Calendar,
  Search,
  BrainCircuit,
  Link2,
  Clock,
  ChevronDown
} from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

export interface StakingItem {
  protocol: string;
  asset: string;
  estimated_apy: string;
  liquidity_type: string;
  notes: string;
}

export interface HackathonItem {
  name: string;
  url?: string;
  prize_pool: string;
  dates: string;
  tracks: string;
  how_to_participate: string;
}

export interface EcosystemOpportunityItem {
  title: string;
  category: string;
  target_asset_or_protocol: string;
  reward_or_yield: string;
  timeframe_or_deadlines: string;
  how_to_participate: string;
  supporting_sources?: number[];
}

export interface SourceCitation {
  index?: number;
  title: string;
  url: string;
  date: string;
  tier?: string;
  distance?: number;
  source_type?: string;
  provenance?: {
    as_of?: string;
    block_height?: number;
    finality?: string;
  };
}

export interface SignalItem {
  signal: string;
  direction: string;
  asset_or_target: string;
  confidence: number;
  timeframe: string;
  rationale: string;
  supporting_sources?: number[];
}

export interface CoTStepCard {
  step_number?: number;
  title?: string;
  phase?: string;
  agent_reasoning?: string;
  tags?: string[];
  bullet_points?: string[];
  status?: string;
  // Backward compatibility
  step?: string;
  detail?: string;
  mechanisms?: string[];
  queries?: string[];
  verified_points?: string[];
}

export interface Report {
  title: string;
  regime?: string;
  user_expectations_summary?: string;
  findings?: string;
  signals?: SignalItem[];
  primary_signal?: SignalItem;
  ecosystem_opportunities?: EcosystemOpportunityItem[];
  coverage_gaps?: string[];
  tool_calls_used?: number;
  thought_process?: string[];
  cot_step_cards?: CoTStepCard[];
  cot_reasoning_trace?: CoTStepCard[];
  summary?: string;
  staking_and_yield_matrix?: StakingItem[];
  hackathons_and_opportunities?: HackathonItem[];
  actionable_signal?: {
    action: string;
    target_asset: string;
    confidence: number;
    recommended_timeframe?: string;
    key_levels_or_actions?: string;
  };
  risk_factors?: string[];
  sources_cited?: SourceCitation[];
  cid: string;
  fee_paid_near: number;
  creator_account?: string;
  created_at: string;
  date_range_applied?: string;
}

export default function ResearchSection({ accountId, onConnectWallet }: Props) {
  const [topic, setTopic] = useState(
    "find opportunity to invest in near like staking and yeild find best pool to yeild and best liquid stakinng option and any recent hackthon on near or any way to particpate"
  );
  const [userExpectations, setUserExpectations] = useState(
    "Evaluate highest yield staking pools, best liquid staking tokens stNEAR/LiNEAR, and any recent hackathons or developer participation opportunities."
  );
  const [linksInput, setLinksInput] = useState(
    "https://docs.near.org\nhttps://near.org/blog\nhttps://metapool.app"
  );
  const [dateRange, setDateRange] = useState("1_month");

  // DB-persisted form config (skeleton until loaded)
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    if (!accountId) {
      setConfigLoaded(true);
      return;
    }
    setConfigLoaded(false);
    const ctrl = new AbortController();
    loadAgentConfig(accountId, "research", ctrl.signal).then((cfg) => {
      if (ctrl.signal.aborted) return;
      if (cfg) {
        if (typeof cfg.topic === "string" && cfg.topic) setTopic(cfg.topic);
        if (typeof cfg.userExpectations === "string" && cfg.userExpectations) setUserExpectations(cfg.userExpectations);
        if (typeof cfg.linksInput === "string") setLinksInput(cfg.linksInput);
        if (typeof cfg.dateRange === "string" && cfg.dateRange) setDateRange(cfg.dateRange);
      }
      setConfigLoaded(true);
    });
    return () => ctrl.abort();
  }, [accountId]);
  useAutoSaveAgentConfig(accountId, "research", { topic, userExpectations, linksInput, dateRange }, configLoaded);

  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(() => {
    if (typeof window === "undefined" || !accountId) return null;
    try {
      const saved = localStorage.getItem("neptune_latest_research_" + accountId);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentActiveStep, setCurrentActiveStep] = useState<number>(0);
  const [stepCards, setStepCards] = useState<CoTStepCard[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<{ tool: string; args: any; thought?: string }[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [isHiringA2A, setIsHiringA2A] = useState(false);
  const [latestA2AResult, setLatestA2AResult] = useState<any>(null);

  // Restore cached research report when accountId changes
  useEffect(() => {
    if (!accountId) {
      setActiveReport(null);
      return;
    }
    try {
      const saved = localStorage.getItem("neptune_latest_research_" + accountId);
      if (saved) {
        const parsed = JSON.parse(saved);
        setActiveReport(parsed);
        if (parsed.cot_step_cards) setStepCards(parsed.cot_step_cards);
      }
    } catch {}
  }, [accountId]);

  const fetchReports = useCallback(async () => {
    try {
      const url = accountId
        ? `/api/research/reports/${encodeURIComponent(accountId)}`
        : "/api/research/reports";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = data.reports || [];
        setReports(list);
        if (list.length > 0 && !activeReport && !isLoading) {
          setActiveReport(list[0]);
          if (list[0].cot_step_cards) {
            setStepCards(list[0].cot_step_cards);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching reports:", e);
    }
  }, [accountId, activeReport, isLoading]);

  const fetchReportsRef = useRef(fetchReports);
  fetchReportsRef.current = fetchReports;

  useEffect(() => {
    fetchReports();
    return setVisibleInterval(fetchReports, 20000);
  }, [fetchReports]);

  // Tab visibility: refresh reports when user returns to this tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchReports();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchReports]);

  const handleStreamEvent = useCallback((data: any) => {
    if (data.type === "step" && data.card) {
      setStepCards((prev) => {
        const updated = [...prev];
        updated[data.step_number - 1] = data.card;
        return updated;
      });
      setCurrentActiveStep(data.step_number + 1);
      if (data.report) {
        setActiveReport(data.report);
      }
    } else if (data.type === "result" && data.data) {
      setActiveReport(data.data);
      if (data.data.cot_step_cards) {
        setStepCards(data.data.cot_step_cards);
      }
    } else if (data.type === "pre_crawl") {
      setLiveToolCalls((prev) => [
        ...prev,
        {
          tool: "pre_crawl",
          args: { links: data.links },
          thought: data.message || "Pre-crawling user seed links to depth 4...",
        },
      ]);
    } else if (data.type === "tool_call") {
      setLiveToolCalls((prev) => [...prev, data]);
    } else if (data.type === "run_finished") {
      setIsLoading(false);
      setCurrentActiveStep(0);
    }
  }, []);

  // Check if a research generation was in progress before refresh or tab switch
  useEffect(() => {
    if (!accountId) return;
    const abortCtrl = new AbortController();

    async function checkActiveOrLatest() {
      try {
        const runningId = await findRunningRun("research", accountId as string);
        if (abortCtrl.signal.aborted) return;
        if (runningId) {
          setActiveRun("research", accountId, runningId);
          setIsLoading(true);
          setShowSteps(true);
          setStepCards([]);
          setLiveToolCalls([]);
          setCurrentActiveStep(1);
          streamRun(runningId, handleStreamEvent, 0, abortCtrl.signal)
            .then(() => {
              // Aborted = user navigated away; run continues server-side, keep the key.
              if (abortCtrl.signal.aborted) return;
              setActiveRun("research", accountId, null);
              setIsLoading(false);
              setCurrentActiveStep(0);
              fetchReportsRef.current();
            })
            .catch(() => {});
          return;
        }
        const lastId = getActiveRun("research", accountId);
        if (lastId) {
          const run = await getRun(lastId, accountId);
          if (run?.status === "completed" && run.result) {
            setActiveReport(run.result as Report);
            if (run.result.cot_step_cards) setStepCards(run.result.cot_step_cards);
          }
          setActiveRun("research", accountId, null);
        }
        // Nothing is running any more: never leave a stale spinner behind.
        setIsLoading(false);
        setCurrentActiveStep(0);
        fetchReportsRef.current();
      } catch (e) {
        console.warn("[RESEARCH] Error reconnecting active run:", e);
        setIsLoading(false);
      }

      // If no active run or completed, fetch latest completed run from backend
      try {
        const historyRuns = await listRuns(accountId as string, "research", 1);
        if (historyRuns.length > 0 && !activeReport) {
          const latestRun = await getRun(historyRuns[0].run_id, accountId);
          if (latestRun?.result) {
            setActiveReport(latestRun.result as Report);
            if (latestRun.result.cot_step_cards) setStepCards(latestRun.result.cot_step_cards);
          }
        }
      } catch (e) {
        console.warn("[RESEARCH] Error fetching latest run:", e);
      }
    }

    checkActiveOrLatest();

    return () => {
      abortCtrl.abort();
    };
  }, [accountId, handleStreamEvent]);

  const handleGenerate = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect wallet first to generate and sign research reports");
      return;
    }

    // Immediately clear previous cards to avoid stale context
    setActiveReport(null);
    setStepCards([]);
    setLiveToolCalls([]);
    setCurrentActiveStep(1);
    setIsLoading(true);
    setShowSteps(true);

    const parsedLinks = linksInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.startsWith("http"));

    // Auto-mark agent active in fleet configuration
    try {
      fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          agent_id: "research",
          is_active: true,
        }),
      }).catch(() => {});
    } catch {}

    let startedRunId: string | null = null;
    let keepActiveRun = false;
    try {
      const { run_id } = await startRun("research", {
        user_wallet: accountId,
        topic,
        user_expectations: userExpectations,
        links: parsedLinks,
        date_range: dateRange,
      });

      startedRunId = run_id;
      setActiveRun("research", accountId, run_id);

      await streamRun(run_id, handleStreamEvent, 0);

      setActiveRun("research", accountId, null);
      await fetchReports();
    } catch (e: any) {
      if (startedRunId) {
        // Already running on the backend: wait for it, never start a duplicate.
        console.warn("[RESEARCH] Live stream dropped; waiting for background run:", e);
        const finished = await waitForRun(startedRunId, accountId);
        if (finished?.status === "completed" && finished.result) {
          setActiveReport(finished.result as Report);
          if (finished.result.cot_step_cards) setStepCards(finished.result.cot_step_cards);
        }
        keepActiveRun = !finished;
        await fetchReports();
      } else {
      console.warn("Could not start background run, falling back to synchronous generation:", e);
      try {
        const res = await fetch("/api/research/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_wallet: accountId,
            topic: topic,
            user_expectations: userExpectations,
            links: parsedLinks,
            date_range: dateRange,
          }),
        });
        if (res.ok) {
          const generated = await res.json();
          setActiveReport(generated);
          if (generated.cot_step_cards) {
            setStepCards(generated.cot_step_cards);
          }
          await fetchReports();
        }
      } catch (err) {
        console.error("Generate error:", err);
      }
      }
    } finally {
      setIsLoading(false);
      setCurrentActiveStep(0);
      if (!keepActiveRun) setActiveRun("research", accountId, null);
    }
  };

  // Demo Track 7 Agent-to-Agent Hire
  const handleA2AHire = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect wallet first to execute agent-to-agent hire");
      return;
    }
    setIsHiringA2A(true);
    setLatestA2AResult(null);
    try {
      const res = await fetch("/api/research/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          symbol: "NEAR",
        }),
      });
      const data = await res.json();
      setLatestA2AResult(data);
      if (data.full_report) {
        setActiveReport(data.full_report);
      }
      await fetchReports();
    } catch (e) {
      console.error("A2A hire error:", e);
    } finally {
      setIsHiringA2A(false);
    }
  };

  if (!configLoaded) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-7xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading research configuration">
        <div className="h-24 rounded-2xl bg-secondary/60 border border-border" />
        <div className="h-64 rounded-2xl bg-secondary/60 border border-border" />
        <div className="h-40 rounded-2xl bg-secondary/60 border border-border" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-7xl mx-auto space-y-5 suite-stagger">
      {/* Header */}
      <div className="tilt3d flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border" {...tilt3d(1.5)}>
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <BrainCircuit size={22} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Researcher
            </h1>
            <InfoTip label="About the Researcher">
              Turns your crypto question into concrete Web3 options (staking APYs, liquid staking, DEX pools,
              hackathons). It crawls your source links, filters by date, refines its own queries, and saves a report
              with an IPFS CID.
            </InfoTip>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Ask a question and get a sourced research report.
          </p>
        </div>

      </div>

      {/* Research Configuration & Dispatch Studio */}
      <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            New research
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Topic & Expectations */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <Search size={14} className="text-purple-400" />
                Research Topic or Query
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. NEAR staking, liquid staking and hackathons"
                className="w-full px-3.5 py-2 rounded-xl bg-secondary/60 border border-border text-xs text-foreground focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Calendar size={14} className="text-purple-400" />
                  Date range
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-secondary/60 border border-border text-xs text-foreground focus:outline-none focus:border-purple-500/50"
                >
                  <option value="1_week">Last week</option>
                  <option value="1_month">Last month</option>
                  <option value="3_months">Last 3 months</option>
                  <option value="all_recent">All recent</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !accountId}
                  className="key3d-solid w-full px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RotateCw size={14} className="animate-spin" />
                      <span>Researching...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Save my setup and Run</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <AdvancedSection tip="Optional: tell the agent what to focus on and which sites to crawl.">
          <SettingGrid>
            <SettingBox span>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FileText size={14} className="text-purple-400" />
                What should it focus on?
                <InfoTip label="About focus">
                  Describe what you expect from the sources and which metrics matter (APYs, validator risks, hackathon
                  prize pools).
                </InfoTip>
              </label>
              <textarea
                rows={3}
                value={userExpectations}
                onChange={(e) => setUserExpectations(e.target.value)}
                placeholder="e.g. APYs and validator risks"
                className="w-full resize-none rounded-xl border border-border bg-secondary/60 px-3.5 py-2 text-xs text-foreground focus:border-purple-500/50 focus:outline-none"
              />
            </SettingBox>
            <SettingBox span>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Link2 size={14} className="text-purple-400" />
                Source links
                <InfoTip label="About source links">
                  The sites the agent crawls first. One URL per line.
                </InfoTip>
              </label>
              <textarea
                rows={3}
                value={linksInput}
                onChange={(e) => setLinksInput(e.target.value)}
                placeholder={"https://docs.near.org\nhttps://near.org/blog"}
                className="w-full resize-none rounded-xl border border-border bg-secondary/60 px-3.5 py-2 font-mono text-xs text-foreground focus:border-purple-500/50 focus:outline-none"
              />
            </SettingBox>
          </SettingGrid>
        </AdvancedSection>
      </div>

      {/* Simple research progress cards */}
      {(isLoading || activeReport) && (
        <div className="tilt3d p-4 rounded-2xl bg-card border border-border space-y-3" {...tilt3d(1.5)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <BrainCircuit size={16} className="text-purple-400" />
               <span>Research progress</span>
              {isLoading && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 animate-pulse">
                  <RotateCw size={11} className="animate-spin" />
                   <span>Step {currentActiveStep || 1} of 3</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-purple-400">
                Cutoff Applied: {activeReport?.date_range_applied || dateRange}
              </span>
              {!isLoading && (
                <button
                  type="button"
                  onClick={() => setShowSteps((v) => !v)}
                  aria-expanded={showSteps}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {showSteps ? "Hide steps" : "Show steps"}
                  <ChevronDown size={12} className={showSteps ? "rotate-180" : ""} />
                </button>
              )}
            </div>
          </div>

          {(isLoading || showSteps) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[1, 2, 3].map((stepNum, idx) => {
              const liveStep = stepCards[idx] || (activeReport?.cot_step_cards || activeReport?.cot_reasoning_trace || [])[idx];
              const isStepRunning = isLoading && !liveStep && stepNum === currentActiveStep;
              const isStepDone = Boolean(liveStep);
              const isStepQueued = isLoading && !liveStep && stepNum > currentActiveStep;

              const stepPhaseNames = [
                "Intent Understanding",
                "Evidence Gathering",
                "Final Report Delivery"
              ];

              const defaultTitles = [
                 "1. Understanding your request",
                 "2. Finding and checking sources",
                 "3. Preparing your report"
              ];

              const title = defaultTitles[idx];
              const phase = stepPhaseNames[idx];
              const reasoning = liveStep?.agent_reasoning || liveStep?.detail || "";
              const tags = liveStep?.tags || liveStep?.mechanisms || [];
              const bullets = liveStep?.bullet_points || liveStep?.queries || liveStep?.verified_points || [];

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all space-y-2.5 ${
                    isStepRunning
                      ? "bg-purple-500/15 border-purple-500 shadow-md shadow-purple-500/20 ring-1 ring-purple-500/40 animate-pulse"
                      : isStepDone
                      ? "bg-secondary/30 border-border/80 hover:border-purple-500/40"
                      : "bg-secondary/10 border-border/30 opacity-40"
                  }`}
                >
                  <div className="space-y-2">
                    {/* Header: Number Badge, Title, Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center shadow-sm ${
                            isStepRunning
                              ? "bg-purple-500 text-white animate-bounce"
                              : isStepDone
                              ? "bg-gradient-to-br from-purple-500 to-indigo-500 text-white"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {stepNum}
                        </span>
                        <span className="text-[11px] font-bold text-foreground leading-tight">
                          {title}
                        </span>
                      </div>

                      {isStepRunning ? (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-md border border-purple-500/30 animate-pulse">
                          <RotateCw size={11} className="animate-spin" />
                          <span>Streaming</span>
                        </div>
                      ) : isStepDone ? (
                        <div className="flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          <CheckCircle2 size={12} />
                          <span>Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md">
                          <Clock size={11} />
                          <span>Queued</span>
                        </div>
                      )}
                    </div>

                    {/* Phase Badge */}
                    <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {phase}
                    </span>

                    {reasoning && <p className="text-[10.5px] text-muted-foreground leading-relaxed">{reasoning}</p>}

                    {/* Node 2 Live Tool Calls Feed */}
                    {idx === 1 && liveToolCalls.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border/50 max-h-36 overflow-y-auto">
                        <div className="flex items-center justify-between text-[9px] font-bold text-purple-300">
                           <span>Recent source searches ({liveToolCalls.length})</span>
                          {isStepRunning && <span className="animate-pulse text-emerald-400">Running</span>}
                        </div>
                        {liveToolCalls.slice(-4).map((tc, tIdx) => (
                          <div key={tIdx} className="p-1.5 rounded-lg bg-secondary/60 border border-border/60 text-[9px] font-mono space-y-0.5">
                            <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                              <span>
                                {tc.tool === "rag_search"
                                  ? "Searching research sources"
                                  : tc.tool === "checkpoint"
                                  ? "Evaluating evidence coverage"
                                  : tc.tool === "pre_crawl"
                                  ? "Pre-crawling seed links (depth 4)"
                                  : tc.tool === "crawl_url"
                                  ? "Checking supplied link"
                                  : "Checking live network data"}
                              </span>
                            </div>
                            {tc.thought && (
                              <p className="text-[8.5px] text-muted-foreground line-clamp-1 italic font-sans">{tc.thought}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tags & Bullets Footer */}
                  <div className="space-y-2 pt-1 border-t border-border/50">
                    {/* Dynamic Tags from Backend */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t, tIdx) => (
                          <span
                            key={tIdx}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary text-foreground border border-border"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Dynamic Bullet Items from Backend */}
                    {bullets.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5 text-[9px] text-emerald-400/90">
                        {bullets.slice(0, 3).map((b, bIdx) => (
                          <li key={bIdx} className="leading-relaxed">{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* Active Institutional Report View */}
      {activeReport && !isLoading && <ReportView key={activeReport.cid} report={activeReport} />}

      {/* Historical Decentralized Research Reports */}
      <div className="tilt3d p-4 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-primary" />
            <h2 className="text-base font-bold text-foreground md:text-lg">
              Preserved Decentralized Research Reports (Recent 10)
            </h2>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {reports.length} Reports on IPFS
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reports.length > 0 ? (
            reports.map((r, i) => (
              <button
                type="button"
                key={r.cid || i}
                onClick={() => setActiveReport(r)}
                aria-pressed={activeReport?.cid === r.cid}
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                className={`pop-in p-4 rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-purple-500/10 space-y-2 ${
                  activeReport?.cid === r.cid
                    ? "bg-purple-500/10 border-purple-500/50 shadow-sm"
                    : "bg-secondary/30 border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                    {r.regime || "ACCUMULATION"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <h3 className="block text-[15px] font-bold text-foreground leading-snug line-clamp-2">{r.title}</h3>
              </button>
            ))
          ) : (
            <p className="col-span-2 text-center py-6 text-xs text-muted-foreground">
              No research reports generated yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
