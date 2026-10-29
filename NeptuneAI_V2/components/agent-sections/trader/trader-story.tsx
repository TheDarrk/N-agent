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
} from "lucide-react";

type Props = {
  isScanning: boolean;
  minConfidence: number;
  maxTxAmount: number;
  tradeLimitCount: number;
  tradeLimitPeriod: string;
  coinMode: "auto" | "custom";
  customCoinCount: number;
  timeframe: string;
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

function buildSteps(p: Props): Step[] {
  return [
    {
      id: "scout",
      short: "Scout",
      title: "Pick the coins to look at",
      say: "Let me see what is moving today.",
      what: p.coinMode === "auto" ? "Grabs today's 20 trending coins." : `Looks only at your ${p.customCoinCount} chosen coins.`,
      where: "Live market data feeds (CoinGecko, CoinPaprika).",
      how: "Ranks them by momentum and drops the quiet ones.",
      icon: Radar,
    },
    {
      id: "chart",
      short: "Read chart",
      title: "Study the price chart",
      say: "Is the trend on my side?",
      what: `Draws ${p.timeframe} candles with trend lines and support zones.`,
      where: "Real exchange candles, rendered as a chart the agent can see.",
      how: "Spots patterns like breakouts and higher lows.",
      icon: LineChart,
    },
    {
      id: "book",
      short: "Rulebook",
      title: "Check it against the rulebook",
      say: "Does this match a setup I trust?",
      what: "Compares the setup with 31 written trading rules.",
      where: "A built-in trading book the agent reads from.",
      how: "Only setups that match a rule move forward.",
      icon: BookOpen,
    },
    {
      id: "crowd",
      short: "Crowd mood",
      title: "Listen to the crowd",
      say: "What is everyone else feeling?",
      what: "Measures how bullish or bearish people are.",
      where: "Social posts on X (Twitter), plus optional Research agent intel.",
      how: "Strong hype is a bonus, never a reason by itself.",
      icon: Users,
    },
    {
      id: "council",
      short: "Council",
      title: "Five advisors vote",
      say: "Let me hear the disagreement first.",
      what: "Five AI advisors argue for and against the trade.",
      where: "Inside the agent, one short debate per coin.",
      how: `A judge then says GO or STAND ASIDE. Needs ${p.minConfidence}%+ confidence.`,
      icon: Gavel,
    },
    {
      id: "gate",
      short: "Trade",
      title: "Safety check, then trade",
      say: "Last check before real money moves.",
      what: "Confirms your limits, then places the order.",
      where: "Settled on-chain through NEAR Intents.",
      how: "Take-profit and stop-loss are watched every minute.",
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

function ScoutVisual({ p }: { p: Props }) {
  const coins = ["NEAR", "BTC", "ETH", "SOL", "REF", "PEPE", "SWEAT", "WETH"];
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="grid grid-cols-4 gap-1.5">
        {coins.map((c, i) => (
          <span
            key={c}
            style={{ animationDelay: `${i * 110}ms` }}
            className={`tr-pop rounded-lg border px-1 py-1.5 text-center font-mono text-[11px] ${
              i === 3
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {p.coinMode === "auto" ? "Scanning today's top 20 trending" : `Scanning your ${p.customCoinCount} coins`} &middot; best mover highlighted
      </p>
    </div>
  );
}

function ChartVisual({ p }: { p: Props }) {
  return (
    <div className="flex h-full flex-col gap-1">
      <svg viewBox="0 0 180 100" className="h-full w-full" role="img" aria-label="Rising candlestick chart with a trend line">
        <line x1="4" x2="176" y1="74" y2="74" stroke="currentColor" strokeDasharray="3 3" className="text-primary/50" />
        <text x="6" y="84" className="fill-primary/80" fontSize="7">support</text>
        {CANDLES.map(([o, c, h, l], i) => {
          const x = 12 + i * 17;
          const up = c < o;
          return (
            <g key={i} className={`tr-pop ${up ? "text-emerald-400" : "text-rose-400"}`} style={{ animationDelay: `${i * 90}ms` }}>
              <line x1={x} x2={x} y1={h} y2={l} stroke="currentColor" strokeWidth="1.5" />
              <rect x={x - 4} y={Math.min(o, c)} width="8" height={Math.max(Math.abs(o - c), 2)} rx="1.5" fill="currentColor" />
            </g>
          );
        })}
        <polyline
          points={emaPoints()}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="tr-draw text-sky-400"
          style={{ animationDelay: "500ms" }}
        />
      </svg>
      <p className="text-[11px] text-muted-foreground">{p.timeframe} candles &middot; trend line &middot; support</p>
    </div>
  );
}

function BookVisual() {
  const rules = ["Trend agrees", "Volume confirms", "Pattern is clean", "Reward beats risk", "Entry is not chasing"];
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {rules.map((r, i) => (
        <li
          key={r}
          style={{ animationDelay: `${i * 260}ms` }}
          className="tr-pop flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground"
        >
          <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check size={10} />
          </span>
          {r}
        </li>
      ))}
    </ul>
  );
}

function CrowdVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Bearish</span>
        <span>Bullish</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-rose-500/40">
        <div className="tr-grow h-full rounded-full bg-emerald-400" style={{ "--w": "68%" } as React.CSSProperties} />
      </div>
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="tr-tick text-rose-400" style={{ animationDelay: "0.9s" }}>32%</span>
        <span className="tr-tick text-emerald-400" style={{ animationDelay: "0.9s" }}>68%</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Optional: hires the Research agent for deeper on-chain intel.</p>
    </div>
  );
}

function CouncilVisual() {
  const advisors = [
    { n: "Skeptic", go: false },
    { n: "Basics", go: true },
    { n: "Optimist", go: true },
    { n: "Outsider", go: true },
    { n: "Doer", go: true },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {advisors.map((a, i) => (
          <span
            key={a.n}
            style={{ animationDelay: `${i * 220}ms` }}
            className={`tr-pop rounded-full border px-2.5 py-1 text-xs font-medium ${
              a.go
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/40 bg-rose-500/10 text-rose-400"
            }`}
          >
            {a.n}: {a.go ? "go" : "wait"}
          </span>
        ))}
      </div>
      <p className="tr-tick rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-foreground" style={{ animationDelay: "1.3s" }}>
        Judge: <strong className="text-primary">4 of 5 agree</strong>, enter long
      </p>
    </div>
  );
}

function GateVisual({ p }: { p: Props }) {
  const checks = [
    `Confidence at least ${p.minConfidence}%`,
    `Size at most $${p.maxTxAmount || 0}`,
    `Under ${p.tradeLimitCount} trades per ${p.tradeLimitPeriod}`,
  ];
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {checks.map((c, i) => (
        <li
          key={c}
          style={{ animationDelay: `${i * 300}ms` }}
          className="tr-pop flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground"
        >
          <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check size={10} />
          </span>
          {c}
        </li>
      ))}
      <li
        style={{ animationDelay: "1s" }}
        className="tr-pop flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
      >
        <span className="tr-ring h-2 w-2 rounded-full bg-primary" />
        Order sent. Watching take-profit and stop-loss.
      </li>
    </ul>
  );
}

function StepVisual({ id, p }: { id: string; p: Props }) {
  switch (id) {
    case "scout":
      return <ScoutVisual p={p} />;
    case "chart":
      return <ChartVisual p={p} />;
    case "book":
      return <BookVisual />;
    case "crowd":
      return <CrowdVisual />;
    case "council":
      return <CouncilVisual />;
    default:
      return <GateVisual p={p} />;
  }
}

function TraderStory(props: Props) {
  const steps = useMemo(
    () => buildSteps(props),
    [props.coinMode, props.customCoinCount, props.timeframe, props.minConfidence]
  );
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [open, setOpen] = useState(true);

  const stepMs = props.isScanning ? 2600 : 5600;
  const running = playing || props.isScanning;

  useEffect(() => {
    if (!open || !running) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % steps.length), stepMs);
    return () => clearTimeout(t);
  }, [active, open, running, stepMs, steps.length]);

  useEffect(() => {
    if (props.isScanning) setActive(0);
  }, [props.isScanning]);

  const step = steps[active];

  return (
    <section
      aria-label="How the trader agent works"
      className="tilt3d overflow-hidden rounded-2xl border border-border bg-card"
      {...tilt3d(1.5)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-sm font-semibold text-foreground">How your trader works</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              props.isScanning
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${props.isScanning ? "animate-pulse bg-emerald-400" : "bg-muted-foreground"}`} />
            {props.isScanning ? "Live run" : "Walkthrough"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {open && !props.isScanning && (
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
          <ol className="flex items-start px-4 pt-4">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === active;
              const isDone = i < active;
              return (
                <React.Fragment key={s.id}>
                  <li className="shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActive(i);
                        setPlaying(false);
                      }}
                      aria-current={isActive ? "step" : undefined}
                      className="group flex flex-col items-center gap-1.5"
                    >
                      <span
                        data-active={isActive ? "true" : undefined}
                        className={`tilt3d pop3d tile3d grid h-11 w-11 place-items-center rounded-xl border ${
                          isActive
                            ? "scale-110 border-primary bg-primary text-primary-foreground"
                            : isDone
                              ? "border-primary/50 bg-secondary text-primary"
                              : "border-border bg-secondary text-muted-foreground group-hover:text-foreground"
                        }`}
                        {...tilt3d(10)}
                      >
                        {isDone ? <Check size={16} /> : <Icon size={16} />}
                      </span>
                      <span className={`hidden text-[11px] font-medium transition-colors sm:block ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {s.short}
                      </span>
                    </button>
                  </li>
                  {i < steps.length - 1 && (
                    <li aria-hidden className="relative mx-1.5 mt-5 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                      <span
                        className="absolute inset-y-0 left-0 bg-primary/70 transition-[width] duration-700"
                        style={{ width: i < active ? "100%" : "0%" }}
                      />
                      {isActive && <span className="tr-flow absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary" />}
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>

          <div key={step.id} className="grid gap-4 p-4 md:grid-cols-[1.15fr_1fr]">
            <div className="tr-pop space-y-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
                  Step {active + 1} of {steps.length}
                </p>
                <h3 className="mt-0.5 text-lg font-semibold leading-snug text-foreground text-balance">{step.title}</h3>
                <p className="mt-0.5 text-sm italic text-muted-foreground">&ldquo;{step.say}&rdquo;</p>
              </div>
              <dl className="space-y-1.5 text-sm">
                {[
                  ["What", step.what],
                  ["Where", step.where],
                  ["How", step.how],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="w-12 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">{k}</dt>
                    <dd className="leading-relaxed text-foreground/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="tilt3d pop3d min-h-36 rounded-xl border border-border bg-background/60 p-3" {...tilt3d(3)}>
              <StepVisual id={step.id} p={props} />
            </div>
          </div>

          <div className="h-0.5 w-full bg-border">
            <div
              key={`${active}-${stepMs}`}
              className="tr-progress h-full bg-primary"
              style={{ animationDuration: `${stepMs}ms`, animationPlayState: running ? "running" : "paused" }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(TraderStory);
