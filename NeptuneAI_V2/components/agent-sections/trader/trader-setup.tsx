"use client";

import React from "react";
import {
  Shield,
  Scale,
  Flame,
  Sparkles,
  Target,
  Plus,
  Minus,
  X,
  Save,
  RotateCw,
  CheckCircle2,
  BrainCircuit,
  Globe2,
  Coins,
  Crosshair,
  Lock,
} from "lucide-react";
import { tilt3d } from "./tilt-3d";

type Period = "day" | "week" | "month";

type Props = {
  coinMode: "auto" | "custom";
  setCoinMode: (v: "auto" | "custom") => void;
  customCoins: string[];
  newCoinInput: string;
  setNewCoinInput: (v: string) => void;
  onAddCoin: () => void;
  onRemoveCoin: (c: string) => void;
  timeframe: string;
  setTimeframe: (v: string) => void;
  minConfidence: number;
  setMinConfidence: (v: number) => void;
  riskProfile: string;
  setRiskProfile: (v: string) => void;
  maxTxAmount: number;
  setMaxTxAmount: (v: number) => void;
  tradeLimitPeriod: Period;
  setTradeLimitPeriod: (v: Period) => void;
  tradeLimitCount: number;
  setTradeLimitCount: (v: number) => void;
  enableResearcher: boolean;
  setEnableResearcher: (v: boolean) => void;
  allowCrossChain: boolean;
  onToggleCrossChain: (v: boolean) => void;
  isSaving: boolean;
  isSaved: boolean;
  onSave: () => void;
};

const PRESETS = [
  {
    id: "conservative",
    name: "Cautious",
    tagline: "Small bets. Only the strongest setups.",
    icon: Shield,
    minConfidence: 85,
    maxTxAmount: 25,
    tradeLimitCount: 2,
    timeframe: "4h",
  },
  {
    id: "moderate",
    name: "Balanced",
    tagline: "A steady middle ground. Good for most people.",
    icon: Scale,
    minConfidence: 75,
    maxTxAmount: 50,
    tradeLimitCount: 3,
    timeframe: "1h",
  },
  {
    id: "aggressive",
    name: "Bold",
    tagline: "Bigger bets. Acts on more setups.",
    icon: Flame,
    minConfidence: 65,
    maxTxAmount: 100,
    tradeLimitCount: 5,
    timeframe: "1h",
  },
] as const;

const TIMEFRAMES = [
  { id: "1h", label: "1h", plain: "hour" },
  { id: "2h", label: "2h", plain: "2 hours" },
  { id: "4h", label: "4h", plain: "4 hours" },
  { id: "6h", label: "6h", plain: "6 hours" },
  { id: "12h", label: "12h", plain: "12 hours" },
  { id: "1d", label: "1d", plain: "day" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const choice = (active: boolean, big = false) =>
  `tilt3d ${big ? "" : "pop3d"} rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
    active
      ? "border-primary bg-primary/15 text-foreground"
      : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

function StepCard({
  step,
  icon: Icon,
  title,
  hint,
  className = "",
  children,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  hint: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      {...tilt3d(3)}
      className={`tilt3d flex flex-col gap-3 rounded-2xl border border-border bg-secondary/30 p-3.5 ${className}`}
    >
      <header className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_hsl(210_100%_36%)]">
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-tight text-foreground">
            <span className="mr-1 text-primary">Step {step}.</span>
            {title}
          </h3>
          <p className="text-[13px] font-medium leading-snug text-muted-foreground">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Switch({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      {...tilt3d(4)}
      className={`flex w-full items-center gap-3 p-3 text-left ${choice(checked)}`}
    >
      <Icon size={15} className={checked ? "text-primary" : "text-muted-foreground"} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">{description}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-secondary"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export default function TraderSetup(p: Props) {
  const activePreset = PRESETS.find((x) => x.id === p.riskProfile) ?? PRESETS[1];
  const isCustomised =
    activePreset.minConfidence !== p.minConfidence ||
    activePreset.maxTxAmount !== p.maxTxAmount ||
    activePreset.tradeLimitCount !== p.tradeLimitCount ||
    activePreset.timeframe !== p.timeframe ||
    p.tradeLimitPeriod !== "day";

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    p.setRiskProfile(preset.id);
    p.setMinConfidence(preset.minConfidence);
    p.setMaxTxAmount(preset.maxTxAmount);
    p.setTradeLimitCount(preset.tradeLimitCount);
    p.setTradeLimitPeriod("day");
    p.setTimeframe(preset.timeframe);
  };

  const plainTimeframe = TIMEFRAMES.find((t) => t.id === p.timeframe)?.plain ?? p.timeframe;
  const clampTrades = (n: number) => Math.min(50, Math.max(1, n));

  return (
    <div className="@container space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Set up your trader</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="font-bold text-foreground">Pick a style</strong>, then change anything you like. You can
            edit this <strong className="font-bold text-foreground">at any time</strong>.
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[13px] font-bold text-primary">
          {isCustomised ? `${activePreset.name}, customised` : `${activePreset.name} style`}
        </span>
      </div>

      {/* Style presets */}
      <div role="radiogroup" aria-label="Trading style" className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
        {PRESETS.map((preset) => {
          const active = p.riskProfile === preset.id;
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => applyPreset(preset)}
              {...tilt3d(7)}
              className={`group flex items-start gap-3 p-3.5 text-left ${choice(active, true)}`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground group-hover:text-primary"
                }`}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-base font-extrabold text-foreground">
                  {preset.name}
                  {preset.id === "moderate" && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-px text-xs font-semibold text-primary">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="block text-[13px] leading-snug text-muted-foreground">{preset.tagline}</span>
                <span className="mt-1 block text-[13px] font-bold text-foreground">
                  Up to ${preset.maxTxAmount} per trade, {preset.tradeLimitCount} a day
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {/* Step 1 */}
        <StepCard step={1} icon={Coins} title="What to trade" hint="Which coins the agent is allowed to look at.">
          <div role="radiogroup" aria-label="Coin list" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={p.coinMode === "auto"}
              onClick={() => p.setCoinMode("auto")}
              {...tilt3d(6)}
              className={`flex flex-col gap-0.5 p-2.5 text-left ${choice(p.coinMode === "auto")}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Sparkles size={12} className="text-primary" /> Let it choose
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">Top 20 trending coins, refreshed daily</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={p.coinMode === "custom"}
              onClick={() => p.setCoinMode("custom")}
              {...tilt3d(6)}
              className={`flex flex-col gap-0.5 p-2.5 text-left ${choice(p.coinMode === "custom")}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Target size={12} className="text-primary" /> My own list
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">Pick up to 20 coins yourself</span>
            </button>
          </div>

          {p.coinMode === "custom" && (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Add a coin symbol"
                  placeholder="Type a coin, e.g. NEAR"
                  value={p.newCoinInput}
                  onChange={(e) => p.setNewCoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && p.onAddCoin()}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={p.onAddCoin}
                  {...tilt3d(6)}
                  className="tilt3d pop3d flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold text-foreground"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {p.customCoins.map((coin) => (
                  <span
                    key={coin}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[13px] text-foreground"
                  >
                    {coin}
                    <button
                      type="button"
                      onClick={() => p.onRemoveCoin(coin)}
                      aria-label={`Remove ${coin}`}
                      className="text-muted-foreground hover:text-rose-400"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-[13px] text-muted-foreground">
                <strong className="font-bold text-foreground">{p.customCoins.length} of 20</strong> coins added
              </p>
            </div>
          )}

          <Switch
            checked={p.allowCrossChain}
            onChange={p.onToggleCrossChain}
            icon={Globe2}
            label="Include other blockchains"
            description="Also trade ETH, BTC, SOL and ARB coins."
          />
        </StepCard>

        {/* Step 2 */}
        <StepCard step={2} icon={Crosshair} title="How it decides" hint="How often it looks, and how sure it must be.">
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-foreground">How often should it look?</p>
            <div role="radiogroup" aria-label="Check frequency" className="grid grid-cols-6 gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  role="radio"
                  aria-checked={p.timeframe === tf.id}
                  onClick={() => p.setTimeframe(tf.id)}
                  {...tilt3d(8)}
                  className={`py-2 text-center font-mono text-sm font-bold ${
                    p.timeframe === tf.id
                      ? "tilt3d pop3d rounded-xl border border-primary bg-primary text-primary-foreground"
                      : choice(false)
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              Checks the market about every <strong className="font-bold text-foreground">{plainTimeframe}</strong>.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="trader-confidence" className="text-sm font-bold text-foreground">
                How sure must it be?
              </label>
              <span className="font-mono text-base font-bold text-primary">{p.minConfidence}%</span>
            </div>
            <input
              id="trader-confidence"
              type="range"
              min={50}
              max={95}
              step={5}
              value={p.minConfidence}
              onChange={(e) => p.setMinConfidence(Number(e.target.value))}
              style={{ "--fill": `${((p.minConfidence - 50) / 45) * 100}%` } as React.CSSProperties}
              className="slider3d w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Trades more often</span>
              <span>Trades only when very sure</span>
            </div>
          </div>

          <Switch
            checked={p.enableResearcher}
            onChange={p.setEnableResearcher}
            icon={BrainCircuit}
            label="Get a second opinion"
            description="Pays the Research agent 0.1 NEAR per check for extra insight."
          />
        </StepCard>

        {/* Step 3 */}
        <StepCard
          step={3}
          icon={Lock}
          title="Your safety limits"
          hint="Hard caps the agent can never go past."
          className="@2xl:col-span-2 @5xl:col-span-1"
        >
          <div className="space-y-1.5">
            <label htmlFor="trader-max-amount" className="text-sm font-bold text-foreground">
              Most it can spend on one trade
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-muted-foreground">$</span>
              <input
                id="trader-max-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={p.maxTxAmount || ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  p.setMaxTxAmount(v ? Number(v) : 0);
                }}
                placeholder="50"
                className="w-full rounded-xl border border-border bg-secondary/40 py-2 pl-7 pr-3 font-mono text-base font-bold text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5">
              {[10, 25, 50, 100, 250].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => p.setMaxTxAmount(v)}
                  aria-pressed={p.maxTxAmount === v}
                  {...tilt3d(8)}
                  className={`flex-1 py-1.5 text-center font-mono text-[13px] font-bold ${choice(p.maxTxAmount === v)}`}
                >
                  ${v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-foreground">How many trades is it allowed?</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Fewer trades"
                  onClick={() => p.setTradeLimitCount(clampTrades(p.tradeLimitCount - 1))}
                  {...tilt3d(10)}
                  className="tilt3d pop3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-mono text-base font-extrabold text-foreground" aria-live="polite">
                  {p.tradeLimitCount}
                </span>
                <button
                  type="button"
                  aria-label="More trades"
                  onClick={() => p.setTradeLimitCount(clampTrades(p.tradeLimitCount + 1))}
                  {...tilt3d(10)}
                  className="tilt3d pop3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                >
                  <Plus size={13} />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">per</span>
              <div role="radiogroup" aria-label="Trade limit period" className="grid flex-1 grid-cols-3 gap-1">
                {PERIODS.map((per) => (
                  <button
                    key={per.id}
                    type="button"
                    role="radio"
                    aria-checked={p.tradeLimitPeriod === per.id}
                    onClick={() => p.setTradeLimitPeriod(per.id)}
                    {...tilt3d(8)}
                    className={`py-2 text-center text-sm font-bold ${choice(p.tradeLimitPeriod === per.id)}`}
                  >
                    {per.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p
            {...tilt3d(3)}
            className="tilt3d pop3d rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[13px] leading-snug text-muted-foreground"
          >
            These limits are <strong className="font-bold text-foreground">enforced every time</strong>. The agent{" "}
            <strong className="font-bold text-foreground">cannot override them</strong>, even if it is very confident.
          </p>
        </StepCard>
      </div>

      {/* Plain-English summary + save */}
      <div
        {...tilt3d(2)}
        className="tilt3d flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm leading-relaxed text-foreground/90 sm:max-w-2xl">
          <span className="font-semibold text-foreground">In plain words: </span>
          About every {plainTimeframe}, the agent looks at{" "}
          {p.coinMode === "auto" ? "today's trending coins" : `your ${p.customCoins.length} coins`}
          {p.allowCrossChain ? ", including other blockchains" : ""}. It only trades when it is at least{" "}
          <strong>{p.minConfidence}%</strong> sure, spends no more than <strong>${p.maxTxAmount || 0}</strong> on a
          trade, and stops after <strong>{p.tradeLimitCount}</strong> {p.tradeLimitCount === 1 ? "trade" : "trades"} per{" "}
          {p.tradeLimitPeriod}.
        </p>
        <button
          type="button"
          onClick={p.onSave}
          disabled={p.isSaving}
          className={`key3d-solid flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-extrabold disabled:opacity-50 ${
            p.isSaved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
          }`}
        >
          {p.isSaving ? (
            <>
              <RotateCw size={14} className="animate-spin" /> Saving...
            </>
          ) : p.isSaved ? (
            <>
              <CheckCircle2 size={15} /> Saved
            </>
          ) : (
            <>
              <Save size={14} /> Save my setup
            </>
          )}
        </button>
      </div>
    </div>
  );
}
