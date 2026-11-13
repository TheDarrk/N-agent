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
  Sliders,
  Activity,
  TrendingUp,
} from "lucide-react";
import { tilt3d } from "./tilt-3d";
import AdvancedSection, { AdvancedGroup, SettingBox, SettingGrid } from "../shared/advanced-section";
import InfoTip, { LabelWithTip } from "../shared/info-tip";

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
  // Pro Trader Mathematical & Screener Filters
  minVolumeUsd?: number;
  setMinVolumeUsd?: (v: number) => void;
  minPriceMovePct?: number;
  setMinPriceMovePct?: (v: number) => void;
  minAtrPct?: number;
  setMinAtrPct?: (v: number) => void;
  minRiskReward?: number;
  setMinRiskReward?: (v: number) => void;
  rsiOverbought?: number;
  setRsiOverbought?: (v: number) => void;
  rsiOversold?: number;
  setRsiOversold?: (v: number) => void;
  rsiSweetMin?: number;
  setRsiSweetMin?: (v: number) => void;
  rsiSweetMax?: number;
  setRsiSweetMax?: (v: number) => void;
  emaFast?: number;
  setEmaFast?: (v: number) => void;
  emaSlow?: number;
  setEmaSlow?: (v: number) => void;
  emaMacro?: number;
  setEmaMacro?: (v: number) => void;
  emaDays?: number;
  setEmaDays?: (v: number) => void;
};

const PRESETS = [
  {
    id: "conservative",
    name: "Cautious",
    tagline: "Small bets, strongest setups only",
    icon: Shield,
    minConfidence: 85,
    maxTxAmount: 25,
    tradeLimitCount: 2,
    timeframe: "4h",
  },
  {
    id: "moderate",
    name: "Balanced",
    tagline: "Steady middle ground",
    icon: Scale,
    minConfidence: 75,
    maxTxAmount: 50,
    tradeLimitCount: 3,
    timeframe: "1h",
  },
  {
    id: "aggressive",
    name: "Bold",
    tagline: "Bigger bets, more setups",
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
  `${big ? "tilt3d" : "key3d"} rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
    active
      ? "border-primary bg-primary/15 text-foreground"
      : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

function Switch({
  checked,
  onChange,
  label,
  tip,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tip: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
  <div className={`flex min-w-0 items-center gap-2 p-3 ${choice(checked)}`}>
  <Icon size={16} className={`shrink-0 ${checked ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
  <span className="min-w-0 flex-1 text-sm font-bold leading-tight text-foreground">{label}</span>
  <InfoTip label={`About ${label}`}>{tip}</InfoTip>
  <button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onClick={() => onChange(!checked)}
  className="flex shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
  >
  <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform duration-200 ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
  </button>
  </div>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-extrabold text-foreground">Set up your trader</h2>
          <InfoTip label="About setting up your trader">
            Pick a style, choose which coins to watch, then save. Open Advanced Configurations to fine-tune anything. You
            can change this at any time.
          </InfoTip>
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
                <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold text-foreground">
                  {preset.name}
                  {preset.id === "moderate" && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-px text-xs font-semibold text-primary">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="block text-[13px] leading-snug text-muted-foreground">{preset.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* What to trade */}
      <div className="space-y-2.5">
        <LabelWithTip tip="Let it choose uses today's top 20 trending coins, refreshed daily. My own list lets you pick up to 20 coins yourself.">
          What to trade
        </LabelWithTip>
        <div role="radiogroup" aria-label="Coin list" className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={p.coinMode === "auto"}
            onClick={() => p.setCoinMode("auto")}
            className={`flex items-center gap-2 p-3 text-left text-sm font-bold text-foreground ${choice(p.coinMode === "auto")}`}
          >
            <Sparkles size={14} className="text-primary" /> Let it choose
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={p.coinMode === "custom"}
            onClick={() => p.setCoinMode("custom")}
            className={`flex items-center gap-2 p-3 text-left text-sm font-bold text-foreground ${choice(p.coinMode === "custom")}`}
          >
            <Target size={14} className="text-primary" /> My own list
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
                className="key3d flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-bold text-foreground"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="flex max-h-20 flex-wrap items-center gap-1.5 overflow-y-auto">
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
              <span className="text-xs text-muted-foreground">{p.customCoins.length} / 20</span>
            </div>
          </div>
        )}
      </div>

      {/* Advanced */}
      <AdvancedSection
        summary={`Checks every ${plainTimeframe} · ${p.minConfidence}% sure · max $${p.maxTxAmount || 0}`}
        tip="Fine-tune how often the agent looks, how sure it must be, and the hard limits on spending. The style you picked already sets sensible values."
      >
        <AdvancedGroup title="How it decides">
          <SettingGrid>
          <SettingBox span>
            <LabelWithTip tip="How often the agent checks the market. Shorter means more frequent checks and usually more trades.">
              Check frequency
            </LabelWithTip>
            <div role="radiogroup" aria-label="Check frequency" className="grid grid-cols-6 gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  role="radio"
                  aria-checked={p.timeframe === tf.id}
                  onClick={() => p.setTimeframe(tf.id)}
                  className={`py-2 text-center font-mono text-sm font-bold ${
                    p.timeframe === tf.id
                      ? "key3d rounded-xl border border-primary bg-primary text-primary-foreground"
                      : choice(false)
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </SettingBox>

          <SettingBox span>
            <div className="flex items-center justify-between gap-3">
            <LabelWithTip tip="The agent only trades when it is at least this sure. Higher means fewer, safer trades. Lower means more trades.">
              Minimum confidence
            </LabelWithTip>
            <div className="flex items-center justify-center gap-1.5">
              <button
                type="button"
                aria-label="Lower confidence"
                onClick={() => p.setMinConfidence(Math.max(50, p.minConfidence - 5))}
                className="key3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
              >
                <Minus size={14} />
              </button>
              <span className="w-14 text-center font-mono text-base font-extrabold text-primary" aria-live="polite">
                {p.minConfidence}%
              </span>
              <button
                type="button"
                aria-label="Raise confidence"
                onClick={() => p.setMinConfidence(Math.min(95, p.minConfidence + 5))}
                className="key3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
              >
                <Plus size={13} />
              </button>
            </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${((p.minConfidence - 50) / 45) * 100}%` }}
              />
            </div>
          </SettingBox>
          </SettingGrid>
        </AdvancedGroup>

        <AdvancedGroup
          title="Pro Screener & Math Filters"
          tip="Fine-tune algorithmic tradeability thresholds, minimum move range %, ATR volatility buffer, and minimum Risk:Reward ratio."
        >
          <SettingGrid>
            {/* Min 24h Volume */}
            <SettingBox>
              <LabelWithTip htmlFor="pro-min-volume" tip="Exclude tokens whose 24-hour DEX trading volume is below this value. Default: $25,000.">
                Min 24h Volume ($)
              </LabelWithTip>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-muted-foreground">$</span>
                <input
                  id="pro-min-volume"
                  type="text"
                  inputMode="numeric"
                  value={p.minVolumeUsd ?? 25000}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    if (p.setMinVolumeUsd) p.setMinVolumeUsd(v ? Number(v) : 0);
                  }}
                  className="w-full rounded-xl border border-border bg-secondary/40 py-2 pl-7 pr-3 font-mono text-base font-bold text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                {[10000, 25000, 50000, 100000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => p.setMinVolumeUsd && p.setMinVolumeUsd(v)}
                    className={`py-1 px-2 text-center font-mono text-xs font-bold ${choice((p.minVolumeUsd ?? 25000) === v)}`}
                  >
                    ${v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
            </SettingBox>

            {/* Min Price Move % & Min ATR % */}
            <SettingBox>
              <LabelWithTip htmlFor="pro-min-move" tip="Minimum 24h price movement range % and minimum ATR volatility % to guarantee tradeable volatility.">
                Min Price Move & Volatility
              </LabelWithTip>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1">Min Move Range</span>
                  <div className="relative">
                    <input
                      id="pro-min-move"
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10.0"
                      value={p.minPriceMovePct ?? 2.0}
                      onChange={(e) => p.setMinPriceMovePct && p.setMinPriceMovePct(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-secondary/40 py-1.5 pl-3 pr-7 font-mono text-sm font-bold text-foreground focus:border-primary/50 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1">Min ATR Band</span>
                  <div className="relative">
                    <input
                      id="pro-min-atr"
                      type="number"
                      step="0.05"
                      min="0.10"
                      max="5.0"
                      value={p.minAtrPct ?? 0.30}
                      onChange={(e) => p.setMinAtrPct && p.setMinAtrPct(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-secondary/40 py-1.5 pl-3 pr-7 font-mono text-sm font-bold text-foreground focus:border-primary/50 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </SettingBox>

            {/* Min Risk-to-Reward Ratio */}
            <SettingBox>
              <LabelWithTip tip="Minimum required headline Risk-to-Reward ratio (|TP - Entry| / |Entry - SL|). Setups yielding lower R:R are flagged or rejected.">
                Min Risk / Reward (R:R)
              </LabelWithTip>
              <div className="flex items-center gap-1.5">
                {[1.2, 1.5, 2.0, 2.5, 3.0].map((rr) => (
                  <button
                    key={rr}
                    type="button"
                    onClick={() => p.setMinRiskReward && p.setMinRiskReward(rr)}
                    className={`flex-1 py-1.5 text-center font-mono text-xs font-bold ${choice((p.minRiskReward ?? 1.5) === rr)}`}
                  >
                    1:{rr % 1 === 0 ? rr.toFixed(0) : rr.toFixed(1)}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Current threshold: <strong className="text-foreground font-mono">1 : {(p.minRiskReward ?? 1.5).toFixed(1)}</strong>
              </span>
            </SettingBox>

            {/* RSI Bounds & Sweet Spot */}
            <SettingBox>
              <LabelWithTip tip="Configurable RSI overbought/oversold boundaries and momentum sweet spot for continuation setups.">
                RSI Thresholds & Sweet Spot
              </LabelWithTip>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-0.5">Oversold / Overbought</span>
                  <div className="flex items-center gap-1 font-mono">
                    <input
                      type="number"
                      min="15"
                      max="40"
                      value={p.rsiOversold ?? 30}
                      onChange={(e) => p.setRsiOversold && p.setRsiOversold(Number(e.target.value))}
                      className="w-12 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground"
                    />
                    <span className="text-muted-foreground">/</span>
                    <input
                      type="number"
                      min="60"
                      max="85"
                      value={p.rsiOverbought ?? 70}
                      onChange={(e) => p.setRsiOverbought && p.setRsiOverbought(Number(e.target.value))}
                      className="w-12 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-0.5">Sweet Spot Range</span>
                  <div className="flex items-center gap-1 font-mono">
                    <input
                      type="number"
                      min="35"
                      max="50"
                      value={p.rsiSweetMin ?? 45}
                      onChange={(e) => p.setRsiSweetMin && p.setRsiSweetMin(Number(e.target.value))}
                      className="w-12 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground"
                    />
                    <span className="text-muted-foreground">to</span>
                    <input
                      type="number"
                      min="55"
                      max="75"
                      value={p.rsiSweetMax ?? 62}
                      onChange={(e) => p.setRsiSweetMax && p.setRsiSweetMax(Number(e.target.value))}
                      className="w-12 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground"
                    />
                  </div>
                </div>
              </div>
            </SettingBox>

            {/* EMA Periods & Days-Wise Trend Horizon */}
            <SettingBox>
              <LabelWithTip tip="Configure custom Exponential Moving Average (EMA) periods and day-based lookback horizon. Controls trend detection, golden/death cross triggers, and dynamic pullback support.">
                EMA Periods & Days-Wise Horizon
              </LabelWithTip>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-0.5">Fast / Slow / Macro Periods</span>
                  <div className="flex items-center gap-1 font-mono">
                    <input
                      type="number"
                      min="5"
                      max="50"
                      value={p.emaFast ?? 20}
                      onChange={(e) => p.setEmaFast && p.setEmaFast(Number(e.target.value))}
                      className="w-10 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground text-xs"
                      title="Fast EMA period (e.g. 9 or 20)"
                    />
                    <span className="text-muted-foreground">/</span>
                    <input
                      type="number"
                      min="20"
                      max="100"
                      value={p.emaSlow ?? 50}
                      onChange={(e) => p.setEmaSlow && p.setEmaSlow(Number(e.target.value))}
                      className="w-10 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground text-xs"
                      title="Slow EMA period (e.g. 50)"
                    />
                    <span className="text-muted-foreground">/</span>
                    <input
                      type="number"
                      min="50"
                      max="300"
                      value={p.emaMacro ?? 200}
                      onChange={(e) => p.setEmaMacro && p.setEmaMacro(Number(e.target.value))}
                      className="w-12 rounded-lg border border-border bg-secondary/40 py-1 text-center font-bold text-foreground text-xs"
                      title="Macro Baseline EMA period (e.g. 200)"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-0.5">Lookback Horizon</span>
                  <div className="flex items-center gap-1">
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => p.setEmaDays && p.setEmaDays(d)}
                        className={`px-1.5 py-1 rounded font-mono text-[11px] font-bold ${
                          (p.emaDays ?? 14) === d
                            ? "bg-primary/20 text-primary border border-primary/40"
                            : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SettingBox>
          </SettingGrid>
        </AdvancedGroup>

        <AdvancedGroup
          title="Safety limits"
          tip="Hard caps enforced every time. The agent cannot go past them, even when it is very confident."
        >
          <SettingGrid>
          <SettingBox>
            <LabelWithTip htmlFor="trader-max-amount" tip="The most money the agent may spend on a single trade.">
              Max per trade
            </LabelWithTip>
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
            <div className="grid grid-cols-5 gap-1">
              {[10, 25, 50, 100, 250].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => p.setMaxTxAmount(v)}
                  aria-pressed={p.maxTxAmount === v}
                  className={`py-1.5 text-center font-mono text-xs font-bold ${choice(p.maxTxAmount === v)}`}
                >
                  ${v}
                </button>
              ))}
            </div>
          </SettingBox>

          <SettingBox>
            <LabelWithTip tip="The most trades the agent may make in the period you choose.">Trade limit</LabelWithTip>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  aria-label="Fewer trades"
                  onClick={() => p.setTradeLimitCount(clampTrades(p.tradeLimitCount - 1))}
                  className="key3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
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
                  className="key3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                >
                  <Plus size={13} />
                </button>
              </div>
              <span className="text-center text-xs text-muted-foreground">per</span>
              <div role="radiogroup" aria-label="Trade limit period" className="grid grid-cols-3 gap-1">
                {PERIODS.map((per) => (
                  <button
                    key={per.id}
                    type="button"
                    role="radio"
                    aria-checked={p.tradeLimitPeriod === per.id}
                    onClick={() => p.setTradeLimitPeriod(per.id)}
                    className={`py-1.5 text-center text-xs font-bold ${choice(p.tradeLimitPeriod === per.id)}`}
                  >
                    {per.label}
                  </button>
                ))}
              </div>
            </div>
          </SettingBox>
          </SettingGrid>
        </AdvancedGroup>

        <AdvancedGroup title="Extras">          <SettingGrid>
          <Switch
            checked={p.enableResearcher}
            onChange={p.setEnableResearcher}
            icon={BrainCircuit}
            label="Second opinion"
            tip="Consults the Research agent for second opinions on candidate tokens (Free - 0 NEAR). Make sure data source links are configured."
          />
          <Switch
            checked={p.allowCrossChain}
            onChange={p.onToggleCrossChain}
            icon={Globe2}
            label="Cross-Chain & Multichain Trading"
            tip="Execute true cross-chain trades into multichain ETH, SOL, Base, and Arbitrum, not just wrapped tokens on NEAR."
          />
          </SettingGrid>
        </AdvancedGroup>
      </AdvancedSection>

      {/* Summary + save */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Every <strong className="font-semibold text-foreground">{plainTimeframe}</strong> ·{" "}
          <strong className="font-semibold text-foreground">{p.minConfidence}%</strong> sure ·{" "}
          <strong className="font-semibold text-foreground">${p.maxTxAmount || 0}</strong> max ·{" "}
          <strong className="font-semibold text-foreground">
            {p.tradeLimitCount}/{p.tradeLimitPeriod}
          </strong>
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
