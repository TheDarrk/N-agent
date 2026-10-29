"use client";

import React from "react";
import { Check, Play, RotateCw, Wallet, SlidersHorizontal, Radar, ArrowRight } from "lucide-react";
import { tilt3d } from "./tilt-3d";

type Props = {
  connected: boolean;
  settingsSaved: boolean;
  isScanning: boolean;
  coinLabel: string;
  timeframe: string;
  minConfidence: number;
  maxTxAmount: number;
  onConnect?: () => void;
  onRun: () => void;
};

export default function TraderReady({
  connected,
  settingsSaved,
  isScanning,
  coinLabel,
  timeframe,
  minConfidence,
  maxTxAmount,
  onConnect,
  onRun,
}: Props) {
  const steps = [
    {
      icon: Wallet,
      title: "Connect your wallet",
      detail: connected ? "Wallet connected." : "The agent trades from your wallet, inside your limits.",
      done: connected,
    },
    {
      icon: SlidersHorizontal,
      title: "Save your setup",
      detail: settingsSaved ? "Your limits are saved." : "Pick a style above and press Save my setup.",
      done: settingsSaved,
    },
    {
      icon: Radar,
      title: "Run your first analysis",
      detail: "The agent scans, double-checks, then shows you its decision here.",
      done: false,
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            Ready when you are
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <strong className="font-bold text-foreground">Nothing has been traded yet.</strong> Follow these three steps
            to get going.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[13px]">
          {[`${coinLabel}`, `Every ${timeframe}`, `${minConfidence}%+ sure`, `Max $${maxTxAmount || 0}`].map((chip) => (
            <span
              key={chip}
              {...tilt3d(10)}
              className="tilt3d pop3d rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-bold text-primary"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = i === current;
          return (
            <li
              key={s.title}
              {...tilt3d(6)}
              className={`tilt3d flex items-start gap-3 rounded-2xl border p-4 ${
                s.done
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary/30"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm font-bold ${
                  s.done
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400 shadow-[0_3px_0_hsl(160_60%_20%)]"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_3px_0_hsl(210_100%_36%)]"
                      : "border-border bg-secondary text-muted-foreground shadow-[0_3px_0_var(--ledge-deep)]"
                }`}
              >
                {s.done ? <Check size={16} /> : <Icon size={15} />}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold uppercase tracking-wide text-primary">
                  {s.done ? "Done" : isCurrent ? "Do this next" : `Step ${i + 1}`}
                </p>
                <p className="text-base font-extrabold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-[13px] font-medium leading-snug text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-[13px] leading-snug text-muted-foreground">
          <strong className="font-bold text-foreground">A first run only looks.</strong> It will not place a trade
          unless a setup passes your confidence and safety limits.
        </p>
        {connected ? (
          <button
            type="button"
            onClick={onRun}
            disabled={isScanning}
            className="key3d-solid flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {isScanning ? (
              <>
                <RotateCw size={14} className="animate-spin" /> Analysing...
              </>
            ) : (
              <>
                <Play size={14} /> Run my first analysis
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="key3d-solid flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-extrabold text-primary-foreground"
          >
            Connect wallet <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
