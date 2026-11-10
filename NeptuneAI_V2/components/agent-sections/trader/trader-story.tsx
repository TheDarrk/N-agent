"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import { tilt3d } from "./tilt-3d";
import {
  Radar,
  LineChart,
  BookOpen,
  Users,
  Gavel,
  ShieldCheck,
  Play,
  Pause,
  ChevronDown,
  Check,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Layers,
  Sparkles
} from "lucide-react";

export interface PipelineStepEvent {
  step_number: number;
  step_name: string;
  title: string;
  status: "running" | "completed" | "stand_aside";
  message: string;
  halt_step?: string;
  cause?: string;
  verdict?: string;
  data?: any;
}

type Props = {
  isScanning: boolean;
  minConfidence: number;
  maxTxAmount: number;
  tradeLimitCount: number;
  tradeLimitPeriod: string;
  coinMode: "auto" | "custom";
  customCoinCount: number;
  timeframe: string;
  pipelineSteps?: PipelineStepEvent[];
  currentActiveStep?: number;
  haltInfo?: { step: string; cause: string } | null;
  latestResult?: any;
};

type Step = {
  id: string;
  short: string;
  title: string;
  say: string;
  what: string;
  where: string;
  how: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

function buildWalkthroughSteps(p: Props): Step[] {
  return [
    {
      id: "scout",
      short: "Scout",
      title: "Pick the coins to look at",
      say: "Let me see what is moving today.",
      what: p.coinMode === "auto" ? "Grabs today's trending 1-Click DEX coins." : `Looks only at your ${p.customCoinCount} chosen watchlist coins.`,
      where: "Live market data feeds (1-Click Universe, CoinGecko).",
      how: "Ranks by liquidity & volume, filtering out stablecoins and illiquid pairs.",
      icon: Radar,
    },
    {
      id: "chart",
      short: "Read chart",
      title: "Study multi-timeframe candles",
      say: "Is the trend and momentum on my side?",
      what: `Draws ${p.timeframe} and 12h candles with EMA20/50/200 and swing levels.`,
      where: "Institutional candle engine with raw indicator arrays.",
      how: "Calculates RSI, MACD histogram, and candlestick body/wick anatomy.",
      icon: LineChart,
    },
    {
      id: "book",
      short: "Rulebook",
      title: "0-100 Rubric candidate scoring",
      say: "Does this match an institutional setup?",
      what: "Scores Trend (30), Confluence (20), Momentum (20), Volatility (10).",
      where: "Autonomous Screener engine without hardcoded cutoff boundaries.",
      how: "Returns top candidates ranked by rubric score with key technical edge.",
      icon: BookOpen,
    },
    {
      id: "crowd",
      short: "Council",
      title: "Technical & Risk Council debate",
      say: "Let's ground entry, target, and stop loss.",
      what: "Technical Analyst and Risk Manager build complete trade plans.",
      where: "Cross-checked with 31 Embedded Trading Book rules (RAG).",
      how: "Calibrates SL with ATR buffers and sets structural TP targets.",
      icon: Users,
    },
    {
      id: "council",
      short: "Judge",
      title: "Chairman Judge evidence audit",
      say: "Auditing math and hallucination checks.",
      what: "Verifies R:R ratio, numbers vs tool logs, and user confidence threshold.",
      where: "Zero-hallucination verification gate inside the agent.",
      how: `Requires ${p.minConfidence}%+ confidence to execute, else stands aside.`,
      icon: Gavel,
    },
    {
      id: "gate",
      short: "Trade",
      title: "Safety check & Intent execution",
      say: "Final check before real money moves.",
      what: "Enforces max transaction size, daily spending caps, and stop-loss.",
      where: "Executed on-chain through NEAR Intents.",
      how: "Active positions monitored every minute by Watchdog.",
      icon: ShieldCheck,
    },
  ];
}

const CANDLES: [number, number, number, number][] = [
  [70, 64, 74, 60],
  [64, 66, 70, 58],
  [66, 58, 68, 54],
  [58, 60, 64, 52],
  [60, 50, 62, 46],
  [50, 52, 56, 44],
  [52, 42, 54, 38],
  [42, 44, 48, 34],
  [44, 34, 46, 30],
  [34, 28, 38, 24],
];

function emaPoints() {
  let ema = CANDLES[0][1];
  return CANDLES.map((c, i) => {
    ema = ema + 0.4 * (c[1] - ema);
    return `${12 + i * 17},${ema.toFixed(1)}`;
  }).join(" ");
}

/* ========================================================================= */
/* LIVE PIPELINE VISUAL COMPONENTS                                            */
/* ========================================================================= */

function LivePreScannerVisual({ step, p }: { step?: PipelineStepEvent; p: Props }) {
  const sampleCoins = step?.data?.sample || ["NEAR", "BTC", "ETH", "SOL", "OKB", "XRP", "AAVE", "DASH"];
  const qualifiedCount = step?.data?.qualified_count ?? 36;
  const isRunning = step?.status === "running";

  return (
    <div className="flex h-full flex-col justify-between gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Radar size={13} className={isRunning ? "animate-spin text-primary" : "text-primary"} />
          1-Click DEX Universe
        </span>
        <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
          {qualifiedCount} Assets Qualified
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {sampleCoins.slice(0, 8).map((c: string, i: number) => (
          <span
            key={c}
            className={`rounded-lg border px-1.5 py-1 text-center font-mono text-[11px] font-semibold transition-all ${
              i < 2
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-sm"
                : "border-border bg-secondary/50 text-foreground"
            }`}
          >
            {c}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-border/60 bg-secondary/30 p-2 text-[11px] space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>Tradeability Gate:</span>
          <span className="font-mono text-foreground font-semibold">Vol &gt; $25k &middot; ATR &gt; 0.3%</span>
        </div>
        <div className="flex justify-between">
          <span>Stablecoins Filtered:</span>
          <span className="font-mono text-emerald-400 font-semibold">Excluded 63 pegged assets</span>
        </div>
      </div>
    </div>
  );
}

function LiveScreenerVisual({ step, p }: { step?: PipelineStepEvent; p: Props }) {
  const selections = step?.data?.selections || [];
  const reasoning = step?.data?.reasoning || step?.message || "";
  const isRunning = step?.status === "running";

  if (isRunning) {
    return (
      <div className="flex h-full flex-col justify-center items-center gap-2 text-center p-3">
        <RotateCw size={24} className="animate-spin text-primary" />
        <p className="text-xs font-semibold text-foreground">Scoring Candidates on 0-100 Rubric...</p>
        <p className="text-[11px] text-muted-foreground max-w-xs">
          Trend (30pts), Confluence (20pts), Momentum (20pts), Volatility (10pts)
        </p>
      </div>
    );
  }

  if (selections.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
        <div className="flex items-center gap-2 text-xs font-bold">
          <AlertTriangle size={15} />
          <span>0 Coins Qualified Rubric</span>
        </div>
        <p className="text-[11px] text-amber-200/90 leading-relaxed">
          {reasoning || "Market is dominated by sideways chop or conflicting timeframe signals. Standing aside."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sparkles size={13} className="text-primary" />
          Top Scored Candidates
        </span>
        <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
          {selections.length} Selected
        </span>
      </div>

      <div className="space-y-1.5">
        {selections.map((s: any, idx: number) => {
          const score = s.rubric_score ?? 75;
          const isLong = (s.direction || "").toUpperCase() === "LONG";
          return (
            <div
              key={s.coin || idx}
              className="rounded-xl border border-primary/30 bg-secondary/50 p-2 flex items-center justify-between gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/20 text-primary font-mono text-xs font-bold">
                  {s.coin}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isLong
                      ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                      : "border border-rose-500/40 bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {isLong ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {s.direction}
                </span>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-bold text-primary flex items-center gap-1">
                  <span>{score}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">/ 100</span>
                </div>
                <div className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">
                  {s.edge_summary || "Technical setup"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground italic truncate">
        Passed to Council Specialists for chart verification & SL/TP formulation.
      </p>
    </div>
  );
}

function LiveCouncilVisual({ step, p }: { step?: PipelineStepEvent; p: Props }) {
  const plans = step?.data?.plans || [];
  const isRunning = step?.status === "running";

  if (isRunning) {
    return (
      <div className="flex h-full flex-col justify-center items-center gap-2 text-center p-3">
        <RotateCw size={24} className="animate-spin text-primary" />
        <p className="text-xs font-semibold text-foreground">Council Formulating Plans...</p>
        <p className="text-[11px] text-muted-foreground max-w-xs">
          Fetching 4h/12h chart tools & querying 31 Classical Trading Book rules.
        </p>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center items-center gap-2 text-center p-3 text-muted-foreground">
        <BookOpen size={22} className="text-muted-foreground/60" />
        <p className="text-xs font-medium">Awaiting Screener candidates...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Layers size={13} className="text-primary" />
          Grounded Trade Plans
        </span>
        <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
          {plans.length} Formulated
        </span>
      </div>

      <div className="space-y-1.5">
        {plans.map((pl: any, idx: number) => (
          <div key={pl.coin || idx} className="rounded-xl border border-border bg-secondary/50 p-2 space-y-1 text-xs">
            <div className="flex items-center justify-between font-mono font-bold">
              <span className="text-foreground">{pl.coin} ({pl.direction})</span>
              <span className="text-emerald-400 text-[11px]">R:R {pl.risk_reward || pl.stated_rr || 2.0}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 font-mono text-[10px] text-muted-foreground">
              <div>Entry: <span className="text-foreground font-semibold">${pl.entry}</span></div>
              <div>TP: <span className="text-emerald-400 font-semibold">${pl.tp}</span></div>
              <div>SL: <span className="text-rose-400 font-semibold">${pl.sl}</span></div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Check size={11} className="text-emerald-400" />
        Grounded in Classical Trading Book RAG rules & ATR buffers.
      </p>
    </div>
  );
}

function LiveJudgeVisual({ step, p, haltInfo }: { step?: PipelineStepEvent; p: Props; haltInfo?: { step: string; cause: string } | null }) {
  const isRunning = step?.status === "running";
  const data = step?.data || {};
  const isExecute = step?.verdict === "EXECUTE" || data.final_decision === "EXECUTE";
  const isStandAside = step?.status === "stand_aside" || Boolean(haltInfo);
  const cause = haltInfo?.cause || step?.cause || data.reasoning || "Awaiting final audit...";

  if (isRunning) {
    return (
      <div className="flex h-full flex-col justify-center items-center gap-2 text-center p-3">
        <RotateCw size={24} className="animate-spin text-primary" />
        <p className="text-xs font-semibold text-foreground">Chairman Judge Auditing Evidence...</p>
        <p className="text-[11px] text-muted-foreground max-w-xs">
          Verifying math, checking for hallucinations against tool logs, checking confidence threshold.
        </p>
      </div>
    );
  }

  if (isExecute) {
    const coin = data.chosen_coin || "ASSET";
    const conf = Math.round((data.confidence || 0.85) * 100);
    return (
      <div className="flex h-full flex-col justify-center gap-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>EXECUTION APPROVED: {coin}</span>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-400">{conf}% Confidence</span>
        </div>
        <p className="text-[11px] text-emerald-200/90 leading-relaxed font-mono">
          All hallucination checks passed &middot; R:R verified &middot; Routing intent order on-chain.
        </p>
      </div>
    );
  }

  if (isStandAside) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs">
            <AlertTriangle size={16} className="text-amber-400" />
            <span>STAND ASIDE (Capital Preserved)</span>
          </div>
          <span className="font-mono text-[10px] uppercase font-bold text-amber-400/90">
            {haltInfo?.step || step?.halt_step || "SAFEGUARD"}
          </span>
        </div>
        <p className="text-[11px] text-amber-100/90 leading-relaxed">
          {cause}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center items-center gap-2 text-center p-3 text-muted-foreground">
      <Gavel size={22} className="text-muted-foreground/60" />
      <p className="text-xs font-medium">Awaiting Council plans for final audit...</p>
    </div>
  );
}

/* ========================================================================= */
/* MAIN TRADER STORY COMPONENT                                               */
/* ========================================================================= */

function TraderStory(props: Props) {
  const isPipelineActive = Boolean(props.isScanning || (props.pipelineSteps && props.pipelineSteps.length > 0));

  // 4 Live Pipeline Stages
  const liveStages = useMemo(() => [
    {
      num: 1,
      name: "Pre-Scanner",
      short: "Pre-Scanner",
      title: "1-Click DEX Universe & Tradeability Gate",
      icon: Radar,
      say: "Scanning 1-Click DEX tokens, filtering stablecoins & illiquid pairs."
    },
    {
      num: 2,
      name: "Stage 1 Screener",
      short: "Screener",
      title: "Multi-Candidate 0-100 Rubric Scoring",
      icon: LineChart,
      say: "Evaluating Trend, Confluence, Momentum, and Volatility across 12h & 4h."
    },
    {
      num: 3,
      name: "Council Specialists",
      short: "Council",
      title: "Technical, Book RAG & Risk Plans",
      icon: BookOpen,
      say: "Formulating grounded Entry, TP, and SL targets backed by trading book rules."
    },
    {
      num: 4,
      name: "Chairman Judge",
      short: "Judge",
      title: "Evidence Audit & Execution Decision",
      icon: Gavel,
      say: "Auditing plans against tool log, verifying R:R >= 2.0 & user threshold."
    }
  ], []);

  // Standard Walkthrough Steps for educational mode
  const walkthroughSteps = useMemo(
    () => buildWalkthroughSteps(props),
    [props.coinMode, props.customCoinCount, props.timeframe, props.minConfidence]
  );

  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [open, setOpen] = useState(true);

  // Automatically track live pipeline step when active
  useEffect(() => {
    if (isPipelineActive) {
      if (props.currentActiveStep && props.currentActiveStep >= 1 && props.currentActiveStep <= 4) {
        setActiveStep(props.currentActiveStep - 1);
      } else if (props.pipelineSteps && props.pipelineSteps.length > 0) {
        const last = props.pipelineSteps[props.pipelineSteps.length - 1];
        if (last.step_number >= 1 && last.step_number <= 4) {
          setActiveStep(last.step_number - 1);
        }
      }
    }
  }, [isPipelineActive, props.currentActiveStep, props.pipelineSteps]);

  // Educational Walkthrough Auto-Advance
  const stepMs = 5600;
  const running = playing && !isPipelineActive;

  useEffect(() => {
    if (!open || !running || isPipelineActive) return;
    const t = setTimeout(() => setActiveStep((a) => (a + 1) % walkthroughSteps.length), stepMs);
    return () => clearTimeout(t);
  }, [activeStep, open, running, stepMs, walkthroughSteps.length, isPipelineActive]);

  // Current step metadata
  const currentLiveEvent = props.pipelineSteps?.find(s => s.step_number === activeStep + 1);

  return (
    <section
      aria-label="How the trader agent works"
      className="tilt3d overflow-hidden rounded-2xl border border-border bg-card"
      {...tilt3d(1.5)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-sm font-semibold text-foreground">
            {isPipelineActive ? "Autonomous Trading Pipeline" : "How your trader works"}
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              props.isScanning
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : props.haltInfo
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : isPipelineActive
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            {props.isScanning ? (
              <>
                <RotateCw size={11} className="animate-spin text-emerald-400" />
                <span>Live Run &middot; Stage {activeStep + 1} of 4</span>
              </>
            ) : props.haltInfo ? (
              <>
                <AlertTriangle size={11} className="text-amber-400" />
                <span>Stand Aside &middot; {props.haltInfo.step}</span>
              </>
            ) : isPipelineActive ? (
              <>
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span>Completed</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <span>Walkthrough</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {open && !isPipelineActive && (
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
              className="tilt3d pop3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground"
              {...tilt3d(8)}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide walkthrough" : "Show walkthrough"}
            className="tilt3d pop3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground"
            {...tilt3d(8)}
          >
            <ChevronDown size={14} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="tr-stage border-t border-border">
          {/* Timeline Bar */}
          <ol className="flex items-start px-4 pt-4">
            {(isPipelineActive ? liveStages : walkthroughSteps).map((s, i) => {
              const Icon = s.icon;
              const isActive = i === activeStep;
              const isDone = isPipelineActive
                ? (props.pipelineSteps?.some(ps => ps.step_number === i + 1 && ps.status === "completed") || false)
                : i < activeStep;
              const isHalted = isPipelineActive && props.pipelineSteps?.some(ps => ps.step_number === i + 1 && ps.status === "stand_aside");

              return (
                <React.Fragment key={s.short}>
                  <li className="shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStep(i);
                        setPlaying(false);
                      }}
                      aria-current={isActive ? "step" : undefined}
                      className="group flex flex-col items-center gap-1.5"
                    >
                      <span
                        data-active={isActive ? "true" : undefined}
                        className={`tilt3d pop3d tile3d grid h-11 w-11 place-items-center rounded-xl border transition-all ${
                          isActive
                            ? "scale-110 border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                            : isHalted
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                              : isDone
                                ? "border-emerald-500/50 bg-secondary text-emerald-400"
                                : "border-border bg-secondary text-muted-foreground group-hover:text-foreground"
                        }`}
                        {...tilt3d(10)}
                      >
                        {isDone ? (
                          <Check size={16} />
                        ) : isHalted ? (
                          <AlertTriangle size={16} />
                        ) : (
                          <Icon size={16} />
                        )}
                      </span>
                      <span className={`hidden text-[11px] font-medium transition-colors sm:block ${isActive ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                        {s.short}
                      </span>
                    </button>
                  </li>
                  {i < (isPipelineActive ? liveStages.length : walkthroughSteps.length) - 1 && (
                    <li aria-hidden className="relative mx-1.5 mt-5 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                      <span
                        className="absolute inset-y-0 left-0 bg-primary/70 transition-[width] duration-700"
                        style={{ width: isDone ? "100%" : i === activeStep ? "50%" : "0%" }}
                      />
                      {isActive && props.isScanning && (
                        <span className="tr-flow absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary animate-pulse" />
                      )}
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>

          {/* Step Detail Content & Visual */}
          {isPipelineActive ? (
            /* LIVE EXECUTION VIEW */
            <div className="grid gap-4 p-4 md:grid-cols-[1.15fr_1fr]">
              <div className="tr-pop space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-primary font-bold">
                      Stage {activeStep + 1} of 4: {liveStages[activeStep].name}
                    </p>
                    {currentLiveEvent?.status === "running" && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 rounded-full animate-pulse">
                        <RotateCw size={9} className="animate-spin" /> RUNNING
                      </span>
                    )}
                    {currentLiveEvent?.status === "completed" && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                        <Check size={10} /> DONE
                      </span>
                    )}
                    {currentLiveEvent?.status === "stand_aside" && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30 px-2 py-0.2 rounded-full">
                        <AlertTriangle size={10} /> STAND ASIDE
                      </span>
                    )}
                  </div>
                  <h3 className="mt-0.5 text-lg font-semibold leading-snug text-foreground">
                    {liveStages[activeStep].title}
                  </h3>
                  <p className="mt-0.5 text-sm italic text-muted-foreground">
                    &ldquo;{currentLiveEvent?.message || liveStages[activeStep].say}&rdquo;
                  </p>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <div className="flex gap-3">
                    <dt className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">Role</dt>
                    <dd className="leading-relaxed text-foreground/90 font-mono text-xs">
                      {activeStep === 0 && "Filters 1-Click Universe for liquidity (> $25k) and volatility (> 0.3% ATR)."}
                      {activeStep === 1 && "Scores candidates on a 0-100 rubric, ranks edge, and returns top setups."}
                      {activeStep === 2 && "Generates grounded plans with live chart tools, RAG book citations, and SL/TP."}
                      {activeStep === 3 && "Performs hallucination checks, audits math against tool logs, and gates execution."}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">Status</dt>
                    <dd className="leading-relaxed text-foreground/90 font-mono text-xs">
                      {currentLiveEvent?.message || "Pending pipeline trigger..."}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Live Visual Right Card */}
              <div className="tilt3d pop3d min-h-40 rounded-xl border border-border bg-background/60 p-3" {...tilt3d(3)}>
                {activeStep === 0 && <LivePreScannerVisual step={props.pipelineSteps?.find(s => s.step_number === 1)} p={props} />}
                {activeStep === 1 && <LiveScreenerVisual step={props.pipelineSteps?.find(s => s.step_number === 2)} p={props} />}
                {activeStep === 2 && <LiveCouncilVisual step={props.pipelineSteps?.find(s => s.step_number === 3)} p={props} />}
                {activeStep === 3 && <LiveJudgeVisual step={props.pipelineSteps?.find(s => s.step_number === 4)} p={props} haltInfo={props.haltInfo} />}
              </div>
            </div>
          ) : (
            /* EDUCATIONAL WALKTHROUGH VIEW */
            <div key={walkthroughSteps[activeStep].id} className="grid gap-4 p-4 md:grid-cols-[1.15fr_1fr]">
              <div className="tr-pop space-y-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
                    Step {activeStep + 1} of {walkthroughSteps.length}
                  </p>
                  <h3 className="mt-0.5 text-lg font-semibold leading-snug text-foreground text-balance">
                    {walkthroughSteps[activeStep].title}
                  </h3>
                  <p className="mt-0.5 text-sm italic text-muted-foreground">
                    &ldquo;{walkthroughSteps[activeStep].say}&rdquo;
                  </p>
                </div>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ["What", walkthroughSteps[activeStep].what],
                    ["Where", walkthroughSteps[activeStep].where],
                    ["How", walkthroughSteps[activeStep].how],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-12 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">{k}</dt>
                      <dd className="leading-relaxed text-foreground/90">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="tilt3d pop3d min-h-36 rounded-xl border border-border bg-background/60 p-3" {...tilt3d(3)}>
                <LivePreScannerVisual p={props} />
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="h-0.5 w-full bg-border">
            <div
              key={`${activeStep}-${props.isScanning}`}
              className="tr-progress h-full bg-primary"
              style={{
                animationDuration: `${props.isScanning ? 3000 : stepMs}ms`,
                animationPlayState: running || props.isScanning ? "running" : "paused",
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(TraderStory);
