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

        <AdvancedGroup title="Extras">
          <SettingGrid>
          <Switch
            checked={p.enableResearcher}
            onChange={p.setEnableResearcher}
            icon={BrainCircuit}
            label="Second opinion"
            tip="Pays the Research agent 0.1 NEAR per check for extra insight before a trade."
          />
          <Switch
            checked={p.allowCrossChain}
            onChange={p.onToggleCrossChain}
            icon={Globe2}
            label="Other blockchains"
            tip="Also trade ETH, BTC, SOL and ARB coins, not just NEAR-based ones."
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
