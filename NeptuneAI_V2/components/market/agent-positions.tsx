"use client";

import { useMemo } from "react";
import { AgentAvatar } from "@/components/agent-avatars";
import { fmtPct, fmtUsd, timeAgo, type DashboardData, type TradeRow } from "@/components/dashboard/dashboard-types";
import { normalizeSymbol, fmtPrice } from "@/lib/market/market";

type Props = {
  symbol: string;
  livePrice: number | null;
  data: DashboardData;
};

function isShort(t: TradeRow) {
  return /SELL|SHORT/i.test(String(t.action));
}

function PositionRow({ trade, livePrice }: { trade: TradeRow; livePrice: number | null }) {
  const short = isShort(trade);
  const entry = Number(trade.entry_price) || 0;
  const tp = Number(trade.tp_price) || 0;
  const amount = Number(trade.amount_usd) || 0;
  const price = livePrice ?? (Number(trade.current_price) || entry);
  const pct = entry > 0 ? ((short ? entry - price : price - entry) / entry) * 100 : 0;
  const pnl = (pct / 100) * amount;
  const span = tp > 0 && entry > 0 ? Math.abs(tp - entry) : 0;
  const travelled = span > 0 ? ((short ? entry - price : price - entry) / span) * 100 : 0;
  const progress = Math.max(0, Math.min(100, travelled));
  const good = pnl >= 0;

  return (
    <li className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AgentAvatar agentId="trader" size={26} />
          <div>
            <p className="text-sm font-semibold text-foreground">
              <span className={short ? "text-rose-400" : "text-emerald-400"}>{short ? "Short" : "Long"}</span>
              {` ${trade.symbol}`}
            </p>
            <p className="text-xs text-muted-foreground">{`${fmtUsd(amount)} · opened ${timeAgo(trade.created_at)}`}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm font-semibold tabular-nums ${good ? "text-emerald-400" : "text-rose-400"}`}>{fmtUsd(pnl)}</p>
          <p className={`font-mono text-xs tabular-nums ${good ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(pct, 2)}</p>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
        <div>
          <dt className="text-muted-foreground">Entry</dt>
          <dd className="text-foreground">{fmtPrice(entry)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Live</dt>
          <dd className="text-foreground">{fmtPrice(price)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="text-foreground">{tp > 0 ? fmtPrice(tp) : "-"}</dd>
        </div>
      </dl>
      {span > 0 && (
        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${progress.toFixed(0)} percent of the way to target`}>
            <div className={`h-full rounded-full transition-[width] duration-700 ${good ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{`${progress.toFixed(0)}% of the way to target`}</p>
        </div>
      )}
    </li>
  );
}

export default function AgentPositions({ symbol, livePrice, data }: Props) {
  const open = useMemo(() => (data.trades?.open_trades ?? []).filter((t) => normalizeSymbol(t.symbol) === symbol), [data.trades, symbol]);
  const closed = useMemo(() => (data.trades?.history ?? []).filter((t) => normalizeSymbol(t.symbol) === symbol).slice(0, 4), [data.trades, symbol]);
  const traces = useMemo(() => data.traces.filter((t) => normalizeSymbol(t.symbol) === symbol).slice(0, 3), [data.traces, symbol]);
  const reports = useMemo(() => data.reports.filter((r) => normalizeSymbol(r.actionable_signal?.target_asset) === symbol).slice(0, 2), [data.reports, symbol]);
  const nothing = open.length + closed.length + traces.length + reports.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {nothing && (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{`Your agents have not touched ${symbol} yet`}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
            When the Trader opens a position or Research publishes a signal for this market, it shows up here and on the chart.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open positions</h3>
          <ul className="flex flex-col gap-2">{open.map((t) => <PositionRow key={t.id} trade={t} livePrice={livePrice} />)}</ul>
        </div>
      )}

      {(traces.length > 0 || reports.length > 0) && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent signals</h3>
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.cid} className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 p-3">
                <AgentAvatar agentId="research" size={26} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {`${r.actionable_signal?.action ?? "Signal"} ${symbol}`}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{`${Math.round((r.actionable_signal?.confidence ?? 0) <= 1 ? (r.actionable_signal?.confidence ?? 0) * 100 : (r.actionable_signal?.confidence ?? 0))}% confidence`}</span>
                  </p>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground text-pretty">{r.summary || r.title}</p>
                </div>
              </li>
            ))}
            {traces.map((t) => (
              <li key={t.cid} className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 p-3">
                <AgentAvatar agentId="trader" size={26} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t.verdict || "Reviewed"}
                    {typeof t.confidence_score === "number" && (
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{`${Math.round(t.confidence_score <= 1 ? t.confidence_score * 100 : t.confidence_score)}% confidence`}</span>
                    )}
                  </p>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground text-pretty">{t.reasoning || t.pattern_detected || t.drop_reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently closed</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {closed.map((t) => {
              const short = isShort(t);
              const entry = Number(t.entry_price) || 0;
              const pct = entry > 0 ? ((short ? entry - Number(t.current_price) : Number(t.current_price) - entry) / entry) * 100 : 0;
              return (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-foreground">{`${short ? "Short" : "Long"} · ${timeAgo(t.created_at)}`}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{`${fmtPrice(entry)} → ${fmtPrice(Number(t.current_price))}`}</span>
                  <span className={`font-mono font-semibold tabular-nums ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(pct, 2)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
