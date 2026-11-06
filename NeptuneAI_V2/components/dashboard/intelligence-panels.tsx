"use client";

import React from "react";
import { fmtUsd, timeAgo, type DashboardData, type DroppedTrade, type TraceLite } from "./dashboard-types";
import { EmptyState, Panel } from "./dashboard-ui";

function verdictTone(verdict?: string) {
  const v = (verdict || "").toLowerCase();
  if (/(buy|long|approve|execute|go)/.test(v)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (/(sell|short|reject|drop|block)/.test(v)) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-border bg-secondary text-muted-foreground";
}

function TraceRow({ trace }: { trace: TraceLite }) {
  const conf = typeof trace.confidence_score === "number" ? Math.round(trace.confidence_score) : null;
  const note = trace.reasoning || trace.pattern_detected || trace.drop_reason;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-foreground">{trace.symbol || "Market"}</span>
        {trace.verdict && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${verdictTone(trace.verdict)}`}>
            {trace.verdict.replace(/_/g, " ")}
          </span>
        )}
        {trace.stage && <span className="text-xs text-muted-foreground">{trace.stage.replace(/_/g, " ")}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{timeAgo(trace.stored_at)}</span>
      </div>
      {conf !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`Confidence ${conf} percent`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, conf))}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{conf}%</span>
          {typeof trace.expected_roi_pct === "number" && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">ROI {trace.expected_roi_pct.toFixed(1)}%</span>
          )}
        </div>
      )}
      {note && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground text-pretty">{note}</p>}
    </li>
  );
}

function DroppedRow({ trade }: { trade: DroppedTrade }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{trade.symbol}</span>
          {Boolean(trade.is_cross_chain) && (
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">cross-chain</span>
          )}
        </span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground text-pretty">{trade.drop_reason || "Blocked by safety rules"}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-sm tabular-nums text-foreground">{fmtUsd(Number(trade.amount_usd ?? 0))}</span>
        <span className="block text-xs text-muted-foreground">{timeAgo(trade.created_at)}</span>
      </span>
    </li>
  );
}

export function TraderBrain({ data }: { data: DashboardData }) {
  const traces = data.traces.slice(0, 6);
  return (
    <Panel title="Trader reasoning" subtitle="The latest setups the Trader looked at, with its confidence.">
      {traces.length === 0 ? (
        <EmptyState title="No reasoning saved yet" hint="Each scan stores the Trader's thinking so you can audit every decision." />
      ) : (
        <ul className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto pr-1">
          {traces.map((t) => (
            <TraceRow key={t.cid} trace={t} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function SafetyBlocks({ data }: { data: DashboardData }) {
  const dropped = (data.trades?.dropped_trades ?? []).slice(0, 6);
  return (
    <Panel title="Blocked by safety rules" subtitle="Trades the system refused to place, and why.">
      {dropped.length === 0 ? (
        <EmptyState title="Nothing was blocked" hint="When a trade breaks a limit, it is listed here instead of being placed." />
      ) : (
        <ul className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto pr-1">
          {dropped.map((d) => (
            <DroppedRow key={d.id} trade={d} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TraderSetup({ data }: { data: DashboardData }) {
  const s = data.settings;
  const rows: { label: string; value: string }[] = [
    { label: "Timeframe", value: s?.trader_timeframe || "n/a" },
    { label: "Min confidence", value: s?.trader_min_confidence != null && s.trader_min_confidence !== "" ? `${s.trader_min_confidence}%` : "n/a" },
    { label: "Risk profile", value: s?.trader_risk_profile || "n/a" },
    { label: "Max per trade", value: s?.max_tx_amount != null && s.max_tx_amount !== "" ? fmtUsd(Number(s.max_tx_amount)) : "n/a" },
    { label: "Trades per day", value: s?.trader_max_trades_per_day != null && s.trader_max_trades_per_day !== "" ? String(s.trader_max_trades_per_day) : "n/a" },
    {
      label: "Coins",
      value: s?.trader_coin_mode === "custom" ? s.trader_custom_coins || "Custom list" : s?.trader_coin_mode ? "Auto pick" : "n/a",
    },
    { label: "Researcher plugin", value: s ? (s.trader_enable_researcher ? "On" : "Off") : "n/a" },
  ];
  return (
    <Panel title="Trader setup" subtitle="The rules your Trader follows on every scan.">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-border bg-secondary/40 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold capitalize text-foreground" title={r.value}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
