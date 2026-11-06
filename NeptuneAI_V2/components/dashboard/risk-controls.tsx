"use client";

import React, { useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatars";
import { fmtUsd, pickNum, pickText, scoreToPct, type AgentKey, type DashboardData } from "./dashboard-types";
import type { DashboardActions } from "./use-dashboard-data";
import { Panel } from "./dashboard-ui";

const CADENCES = [
  { id: "1w", label: "1 week" },
  { id: "2w", label: "2 weeks" },
  { id: "1m", label: "1 month" },
];

function scoreColor(pct: number | null) {
  if (pct === null) return "bg-muted-foreground/40";
  if (pct >= 70) return "bg-emerald-400";
  if (pct >= 45) return "bg-amber-400";
  return "bg-rose-400";
}

function ScoreBar({ agent, label, pct }: { agent: AgentKey; label: string; pct: number | null }) {
  return (
    <li className="flex items-center gap-3">
      <AgentAvatar agentId={agent} size={28} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">{pct === null ? "n/a" : `${Math.round(pct)}/100`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${label} score ${pct === null ? "not available" : Math.round(pct)}`}>
          <div className={`h-full rounded-full transition-all duration-500 ${scoreColor(pct)}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
    </li>
  );
}

export default function RiskControls({ data, actions }: { data: DashboardData; actions: DashboardActions }) {
  const mod = data.moderator;
  const saved = pickNum(mod, "kill_switch_threshold") ?? pickNum(mod, "kill_threshold") ?? 30;
  const [threshold, setThreshold] = useState<number>(saved);
  const cadence = pickText(mod, "review_frequency") || pickText(mod, "frequency") || "1w";

  useEffect(() => setThreshold(saved), [saved]);

  const overall = scoreToPct(pickNum(mod, "overall_performance_score") ?? pickNum(mod, "total_mean_score"));
  const trader = scoreToPct(pickNum(mod, "trader_score") ?? pickNum(mod, "trader_mean_score"));
  const rebalancer = scoreToPct(pickNum(mod, "rebalancer_score") ?? pickNum(mod, "rebalancer_mean_score"));
  const research = scoreToPct(pickNum(mod, "research_score") ?? pickNum(mod, "researcher_score") ?? pickNum(mod, "research_mean_score"));
  const exposure = pickNum(mod, "total_open_exposure_usd");
  const limit = pickNum(mod, "daily_limit_usd");
  const usedPct = exposure !== null && limit ? Math.min(100, (exposure / limit) * 100) : null;
  const saving = actions.pending === "threshold";

  return (
    <Panel title="Risk controls" subtitle="How the Moderator scores your fleet and when it steps in.">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between rounded-xl border border-border bg-secondary/40 p-3.5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fleet score</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">{overall === null ? "n/a" : Math.round(overall)}</p>
            </div>
            <p className="max-w-[12rem] text-right text-xs leading-relaxed text-muted-foreground">
              {overall === null ? "Run a Moderator review to get your first score." : overall >= 70 ? "Healthy. Agents are working well together." : overall >= 45 ? "Fair. Worth a look at the weakest agent." : "Low. Consider pausing and tuning."}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            <ScoreBar agent="trader" label="Trader" pct={trader} />
            <ScoreBar agent="rebalancer" label="Portfolio" pct={rebalancer} />
            <ScoreBar agent="research" label="Researcher" pct={research} />
          </ul>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="auto-pause" className="text-sm font-semibold text-foreground">Auto-pause below score</label>
              <span className="font-mono text-sm font-bold tabular-nums text-primary">{threshold}</span>
            </div>
            <input
              id="auto-pause"
              type="range"
              min={0}
              max={80}
              step={5}
              value={threshold}
              disabled={saving}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onPointerUp={() => threshold !== saved && actions.setKillThreshold(threshold)}
              onKeyUp={() => threshold !== saved && actions.setKillThreshold(threshold)}
              className="w-full accent-[var(--primary)]"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground text-pretty">
              If the fleet score falls under {threshold}, the Moderator stops every agent for you. Set 0 to turn auto-pause off.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Automatic review schedule</p>
            <div role="radiogroup" aria-label="Review schedule" className="grid grid-cols-3 gap-2">
              {CADENCES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={cadence === c.id}
                  disabled={actions.pending === "cadence"}
                  onClick={() => cadence !== c.id && actions.setCadence(c.id)}
                  className={`key3d rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                    cadence === c.id ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-sm font-semibold text-foreground">Daily spend used</p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {exposure !== null && limit ? `${fmtUsd(exposure)} of ${fmtUsd(limit)}` : "No limit data"}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`Daily limit used ${usedPct === null ? "unknown" : Math.round(usedPct)} percent`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${usedPct !== null && usedPct > 80 ? "bg-amber-400" : "bg-primary"}`}
                style={{ width: `${usedPct ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
