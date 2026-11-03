"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Sparkles,
  ExternalLink,
  RotateCw,
  Send,
  CheckCircle2,
  Coins,
  ArrowRight,
  Layers,
  ShieldCheck,
  Globe,
  Calendar,
  Search,
  BrainCircuit,
  Link2,
  Database,
  TrendingUp,
  AlertTriangle,
  Award,
  Clock,
  Info
} from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

interface StakingItem {
  protocol: string;
  asset: string;
  estimated_apy: string;
  liquidity_type: string;
  notes: string;
}

interface HackathonItem {
  name: string;
  url?: string;
  prize_pool: string;
  dates: string;
  tracks: string;
  how_to_participate: string;
}

interface EcosystemOpportunityItem {
  title: string;
  category: string;
  target_asset_or_protocol: string;
  reward_or_yield: string;
  timeframe_or_deadlines: string;
  how_to_participate: string;
  supporting_sources?: number[];
}

interface SourceCitation {
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

interface SignalItem {
  signal: string;
  direction: string;
  asset_or_target: string;
  confidence: number;
  timeframe: string;
  rationale: string;
  supporting_sources?: number[];
}

interface CoTStepCard {
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

interface Report {
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

function renderInline(text: string, sources: SourceCitation[] = []) {
  const parts = text.split(/(\[S\d+(?:\s*,\s*S\d+)*\])/g);
  return parts.map((part, index) => {
    const citation = part.match(/^\[S(\d+(?:\s*,\s*S\d+)*)\]$/);
    if (citation) {
      return citation[1].split(/\s*,\s*/).map((raw, citationIndex) => {
        const sourceIndex = Number(raw);
        const source = sources.find((item) => item.index === sourceIndex);
        if (!source) return <span key={`${index}-${citationIndex}`} className="text-purple-300">[S{sourceIndex}]</span>;
        return (
          <a
            key={`${index}-${citationIndex}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="mx-0.5 inline-flex max-w-full items-center rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300 underline decoration-purple-400/60 underline-offset-2 hover:bg-purple-500/25 hover:text-purple-200"
          >
            [{sourceIndex}: {source.title}]
          </a>
        );
      });
    }
    const inlineParts = part.split(/(\*\*[^*]+\*\*)/g);
    return inlineParts.map((inlinePart, inlineIndex) =>
      inlinePart.startsWith("**") && inlinePart.endsWith("**")
        ? <strong key={`${index}-${inlineIndex}`} className="font-semibold text-foreground">{inlinePart.slice(2, -2)}</strong>
        : <React.Fragment key={`${index}-${inlineIndex}`}>{inlinePart}</React.Fragment>
    );
  });
}

function FormattedMarkdown({ text, sources = [] }: { text: string; sources?: SourceCitation[] }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        // Render GitHub-style markdown tables as actual tables.
        if (trimmed.startsWith("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
          const headers = trimmed.split("|").slice(1, -1).map((cell) => cell.trim());
          let end = index + 2;
          while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
          const rows = lines.slice(index + 2, end).map((row) => row.trim().split("|").slice(1, -1).map((cell) => cell.trim()));
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-border/70">
              <table className="min-w-full text-left text-[11px]"><thead className="bg-secondary/70"><tr>{headers.map((header, h) => <th key={h} className="px-3 py-2 font-semibold text-foreground">{renderInline(header, sources)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r} className="border-t border-border/60">{row.map((cell, c) => <td key={c} className="px-3 py-2 align-top">{renderInline(cell, sources)}</td>)}</tr>)}</tbody></table>
            </div>
          );
        }
        if (trimmed.startsWith("|")) return null;
        if (/^\s*\|?\s*:?-{2,}/.test(trimmed) && lines[index - 1]?.trim().startsWith("|")) return null;
        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const Heading = heading[1].length <= 2 ? "h3" : "h4";
          return <Heading key={index} className={`${heading[1].length <= 2 ? "text-sm" : "text-xs"} pt-2 font-bold text-foreground`}>{renderInline(heading[2], sources)}</Heading>;
        }
        if (/^[-*] /.test(trimmed)) return <li key={index} className="ml-4 list-disc">{renderInline(trimmed.slice(2), sources)}</li>;
        if (trimmed.startsWith("> ")) return <blockquote key={index} className="border-l-2 border-purple-400/60 pl-3 italic">{renderInline(trimmed.slice(2), sources)}</blockquote>;
        return <p key={index}>{renderInline(trimmed, sources)}</p>;
      })}
    </div>
  );
}

function displayConfidence(value: number, hasEvidence: boolean) {
  const numeric = Number.isFinite(value) ? value : 0;
  return hasEvidence ? Math.max(45, Math.min(95, numeric)) : Math.min(35, numeric);
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

  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentActiveStep, setCurrentActiveStep] = useState<number>(0);
  const [stepCards, setStepCards] = useState<CoTStepCard[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<{ tool: string; args: any; thought?: string }[]>([]);
  const [isHiringA2A, setIsHiringA2A] = useState(false);
  const [latestA2AResult, setLatestA2AResult] = useState<any>(null);

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/research/reports");
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
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerate = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect wallet first to generate and sign research reports");
      return;
    }

    // Immediately clear all previous reports & cards to avoid any stale dummy context
    setActiveReport(null);
    setStepCards([]);
    setLiveToolCalls([]);
    setCurrentActiveStep(1);
    setIsLoading(true);

    const parsedLinks = linksInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.startsWith("http"));

    try {
      // Connect to real-time backend stream (no fake timers!)
      const res = await fetch("/api/research/stream", {
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

      if (!res.ok) {
        throw new Error(`Streaming failed with status HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available from backend");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
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
            } else if (data.type === "pre_crawl") {
              setLiveToolCalls((prev) => [
                ...prev,
                {
                  tool: "pre_crawl",
                  args: { links: data.links },
                  thought: data.message || "Pre-crawling user seed links to depth 4..."
                }
              ]);
            } else if (data.type === "tool_call") {
              setLiveToolCalls((prev) => [...prev, data]);
            } else if (data.type === "done") {
              break;
            }
          } catch (pe) {
            console.error("NDJSON chunk parse error:", pe);
          }
        }
      }
      await fetchReports();
    } catch (e) {
      console.warn("Direct stream encounter, falling back to synchronous generation:", e);
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
    } finally {
      setIsLoading(false);
      setCurrentActiveStep(0);
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

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-7xl mx-auto space-y-5 suite-stagger">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-md shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <BrainCircuit size={22} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Autonomous Institutional Researcher
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
              RAG Research Chain
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Deconstructs user crypto intent into concrete Web3 mechanisms (staking APYs, liquid derivatives, DEX pools, hackathons). Crawls seed links on-demand, filters by strict date cutoffs, mutates queries with RAG feedback, and drafts institutional reports preserved with IPFS CIDs.
          </p>
        </div>

      </div>

      {/* Research Configuration & Dispatch Studio */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Configure Autonomous Research & Crawler Directives
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Fee:</span>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20">
              0.1 NEAR
            </span>
          </div>
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
                placeholder="e.g. find opportunity to invest in near like staking and yield, liquid staking options and hackathons..."
                className="w-full px-3.5 py-2 rounded-xl bg-secondary/60 border border-border text-xs text-foreground focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <FileText size={14} className="text-purple-400" />
                User Expectations & Scope Prompt Box
              </label>
              <textarea
                rows={3}
                value={userExpectations}
                onChange={(e) => setUserExpectations(e.target.value)}
                placeholder="Tell the agent what you expect from the sources, what kind of research you need, and specific metrics (e.g. APYs, validator risks, hackathon prize pools)..."
                className="w-full px-3.5 py-2 rounded-xl bg-secondary/60 border border-border text-xs text-foreground focus:outline-none focus:border-purple-500/50 resize-none"
              />
            </div>
          </div>

          {/* Right Column: Source Link Box & Date Range Filter */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <Link2 size={14} className="text-purple-400" />
                Source Seed Links to Crawl (One URL per line)
              </label>
              <textarea
                rows={3}
                value={linksInput}
                onChange={(e) => setLinksInput(e.target.value)}
                placeholder="https://docs.near.org&#10;https://near.org/blog&#10;https://metapool.app"
                className="w-full px-3.5 py-2 font-mono text-xs rounded-xl bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-purple-500/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Calendar size={14} className="text-purple-400" />
                  Date Range Filter
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-secondary/60 border border-border text-xs text-foreground focus:outline-none focus:border-purple-500/50"
                >
                  <option value="1_week">Last 1 Week (Fresh Alpha & News)</option>
                  <option value="1_month">Last 1 Month (Current Cycle)</option>
                  <option value="3_months">Last 3 Months (Quarterly)</option>
                  <option value="all_recent">All Recent (Evergreen + 2024-2026)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !accountId}
                  className="w-full px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <RotateCw size={14} className="animate-spin" />
                      <span>Conducting Research...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Deploy Autonomous Researcher</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simple research progress cards */}
      {(isLoading || activeReport) && (
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
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
            <span className="text-[10px] font-mono text-purple-400">
              Cutoff Applied: {activeReport?.date_range_applied || dateRange}
            </span>
          </div>

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
        </div>
      )}

      {/* Active Institutional Report View */}
      {activeReport && !isLoading && (
        <div className="space-y-4">

          {/* Institutional Report View */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-5 shadow-sm">
            {/* Report Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {activeReport.regime || "ACCUMULATION"}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    CID: {activeReport.cid}
                  </span>
                </div>
                <h2 className="text-base font-bold text-foreground leading-snug">
                  {activeReport.title}
                </h2>
              </div>

              {(() => {
                const pri = activeReport.primary_signal || activeReport.signals?.[0];
                const act = activeReport.actionable_signal;
                if (!pri && !act) return null;
                const action = pri?.direction || act?.action || "ACTION";
                const target = pri?.asset_or_target || act?.target_asset || "";
                const conf = pri ? displayConfidence(pri.confidence, Boolean(pri.supporting_sources?.length)) : (act?.confidence || 85);
                const tf = pri?.timeframe || act?.recommended_timeframe || "1w-1m";
                return (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-right sm:min-w-[180px]">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      Primary Signal
                    </span>
                    <p className="text-sm font-extrabold text-foreground">
                      {action} {target}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Confidence: {conf}% ({tf})
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Actionable Signals Matrix */}
            {activeReport.signals && activeReport.signals.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-emerald-400" />
                  Actionable Intelligence Signals ({activeReport.signals.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeReport.signals.map((sig, sIdx) => {
                    const isPositive = ["BUY", "STAKE", "ACCUMULATE", "PARTICIPATE"].includes(sig.direction);
                    const isWarning = ["AVOID", "OTHER"].includes(sig.direction);
                    return (
                      <div
                        key={sIdx}
                        className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                          isPositive
                            ? "bg-emerald-500/5 border-emerald-500/25 hover:border-emerald-500/40"
                            : isWarning
                            ? "bg-rose-500/5 border-rose-500/25 hover:border-rose-500/40"
                            : "bg-purple-500/5 border-purple-500/25 hover:border-purple-500/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                              isPositive
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : isWarning
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            }`}
                          >
                            {sig.direction}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {sig.timeframe} • {displayConfidence(sig.confidence, Boolean(sig.supporting_sources?.length))}% evidence
                          </span>
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-foreground">{sig.signal}</h4>
                          <span className="text-[10px] font-mono text-purple-400">{sig.asset_or_target}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                          {renderInline(sig.rationale, activeReport.sources_cited || [])}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Known Coverage Gaps Advisory Banner */}
            {activeReport.coverage_gaps && activeReport.coverage_gaps.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  Identified Research Coverage Gaps (Honest Boundary Assessment)
                </span>
                <ul className="list-disc list-inside text-muted-foreground text-[11px] space-y-0.5">
                  {activeReport.coverage_gaps.map((gap, gIdx) => (
                  <li key={gIdx} className="flex items-start gap-1.5">
                    <span className="flex-1">{gap}</span>
                    <span title="This means the research found related sources, but not enough verified data to answer this part. Open the linked sources or run a broader date range." className="mt-0.5 cursor-help text-amber-300"><Info size={13} /></span>
                  </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Grounded Research Findings */}
            {activeReport.findings ? (
              <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-3">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText size={14} className="text-primary" />
                  Grounded Evidence & Protocol Findings
                </h3>
                <FormattedMarkdown text={activeReport.findings} sources={activeReport.sources_cited || []} />
              </div>
            ) : activeReport.summary ? (
              <div className="p-3.5 rounded-xl bg-secondary/40 border border-border">
                <h3 className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-primary" />
                  Executive Research Summary
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {activeReport.summary}
                </p>
              </div>
            ) : null}

            {activeReport.user_expectations_summary && (
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs">
                <span className="font-semibold text-purple-300">Target User Alignment: </span>
                <span className="text-muted-foreground">
                  {activeReport.user_expectations_summary}
                </span>
              </div>
            )}

            {/* Dynamic Ecosystem Opportunities (Yields, Hackathons, Grants, Protocols) */}
            {activeReport.ecosystem_opportunities && activeReport.ecosystem_opportunities.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-400" />
                  Key Ecosystem Opportunities & Participation Avenues ({activeReport.ecosystem_opportunities.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeReport.ecosystem_opportunities.map((opp, idx) => {
                    const isYield = opp.category.toLowerCase().includes("yield") || opp.category.toLowerCase().includes("staking") || opp.category.toLowerCase().includes("liquidity") || opp.category.toLowerCase().includes("pool");
                    const isDev = opp.category.toLowerCase().includes("hackathon") || opp.category.toLowerCase().includes("grant") || opp.category.toLowerCase().includes("bounty") || opp.category.toLowerCase().includes("builder");
                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border space-y-2.5 transition-all ${
                          isYield
                            ? "bg-emerald-500/5 border-emerald-500/25 hover:border-emerald-500/40"
                            : isDev
                            ? "bg-amber-500/5 border-amber-500/25 hover:border-amber-500/40"
                            : "bg-secondary/30 border-border hover:border-purple-500/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold font-mono uppercase mb-1 ${
                              isYield
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : isDev
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            }`}>
                              {opp.category}
                            </span>
                            <h4 className="text-xs font-extrabold text-foreground">{opp.title}</h4>
                            {opp.target_asset_or_protocol && (
                              <span className="text-[10px] font-mono text-muted-foreground">{opp.target_asset_or_protocol}</span>
                            )}
                          </div>
                          {opp.reward_or_yield && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
                              {opp.reward_or_yield}
                            </span>
                          )}
                        </div>

                        {opp.timeframe_or_deadlines && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Clock size={11} className="text-muted-foreground shrink-0" />
                            <span>{opp.timeframe_or_deadlines}</span>
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1.5 border-t border-border/50">
                          {renderInline(opp.how_to_participate, activeReport.sources_cited || [])}
                        </p>

                        {opp.supporting_sources && opp.supporting_sources.length > 0 && (
                          <div className="flex items-center gap-1 pt-1 text-[9px]">
                            <span className="text-muted-foreground font-mono">Sources:</span>
                            {opp.supporting_sources.map((sNum) => (
                              <span key={sNum} className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 font-mono font-bold">
                                [S{sNum}]
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Legacy Staking & Yield Matrix Fallback */}
                {activeReport.staking_and_yield_matrix && activeReport.staking_and_yield_matrix.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Coins size={14} className="text-purple-400" />
                      Staking & Yield Matrix (Liquid Staking & Liquidity Pools)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {activeReport.staking_and_yield_matrix.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-secondary/30 border border-border hover:border-purple-500/30 transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">{item.protocol}</span>
                            <span className="text-xs font-extrabold text-emerald-400">
                              {item.estimated_apy}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground font-mono">
                              {item.asset}
                            </span>
                            <span className="text-muted-foreground">{item.liquidity_type}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
                            {item.notes}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Legacy Hackathons Fallback */}
                {activeReport.hackathons_and_opportunities && activeReport.hackathons_and_opportunities.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Award size={14} className="text-amber-400" />
                      Ecosystem Hackathons & Participation Opportunities
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {activeReport.hackathons_and_opportunities.map((hack, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground flex items-center gap-2">
                              {hack.url ? <a href={hack.url} target="_blank" rel="noopener noreferrer" className="underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300">{hack.name}</a> : hack.name}
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-400">
                                Prize: {hack.prize_pool}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {hack.dates}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            <strong>Tracks:</strong> {hack.tracks}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            <strong>How to Participate:</strong> {hack.how_to_participate}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Risk Factors */}
            {activeReport.risk_factors && activeReport.risk_factors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                <h3 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-rose-400" />
                  Key Risk Factors & Protocol Safeguards
                </h3>
                <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-1">
                  {activeReport.risk_factors.map((risk, idx) => (
                    <li key={idx}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Verified Sources & Citations */}
            {activeReport.sources_cited && activeReport.sources_cited.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Database size={14} className="text-primary" />
                  Retrieved Research Citations & Source URLs ({activeReport.sources_cited.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {activeReport.sources_cited.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-secondary/30 border border-border hover:border-purple-500/40 transition-all flex flex-col justify-between group space-y-2"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                          [S{s.index || idx + 1}]
                        </span>
                        <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                          {s.title}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                        <span className="px-1.5 py-0.2 rounded bg-secondary font-mono text-[9px]">
                          {s.tier || "Evergreen"}
                        </span>
                        <span>{s.date && s.date !== "N/A" ? s.date : "Verified Doc"}</span>
                        {s.source_type === "on_chain" && <span className="text-emerald-400">Live {s.provenance?.block_height ? `• block ${s.provenance.block_height}` : ""}</span>}
                        <ExternalLink size={12} className="text-muted-foreground group-hover:text-primary" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Footer with Decentralized Storage Details */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-muted-foreground gap-2">
              <span className="font-mono">
                Preserved with IPFS CID: <strong className="text-primary">{activeReport.cid}</strong>
              </span>
              <span>
                Generated: {new Date(activeReport.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Historical Decentralized Research Reports */}
      <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">
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
              <div
                key={r.cid || i}
                onClick={() => setActiveReport(r)}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  activeReport?.cid === r.cid
                    ? "bg-purple-500/10 border-purple-500/50 shadow-sm"
                    : "bg-secondary/30 border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-bold text-foreground leading-snug line-clamp-1">
                    {r.title}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                    {r.regime || "ACCUMULATION"}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {r.summary}
                </p>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono text-primary truncate max-w-[160px]">{r.cid}</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
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
