"use client";

import React, { useEffect, useState } from "react";
import { X, Wallet, RefreshCw, TrendingUp, Layers, FileText, AlertCircle } from "lucide-react";

type Props = { listingId: string | null; title?: string; agentType?: string; onClose: () => void };

const fmtTime = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};
const num = (v: any, digits = 2) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? "-" : Number(v).toFixed(digits));

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-2.5 text-center">
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-bold text-foreground">{value}</p>
    </div>
  );
}

/**
 * Real analytics of a listed agent, straight from the seller's history in the database:
 * the agent wallet address, counts, the last 10 decisions / strategies and the last reports.
 * Nothing here is a placeholder: missing data shows "-" or "no data yet".
 */
export default function ListingAnalyticsModal({ listingId, title, agentType, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/marketplace/listings/${encodeURIComponent(listingId)}/analytics`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || j.error || "Could not load analytics");
        if (!cancelled) setData(j.analytics);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!listingId) return null;
  const type = data?.agent_type || agentType;
  const m = data?.metrics || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85">
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-primary/30 bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{title || "Agent analytics"}</h3>
            <p className="text-[11px] text-muted-foreground">Real history of this agent. No placeholder numbers.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <RefreshCw size={14} className="animate-spin" /> Loading analytics from the database...
          </div>
        )}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {data && (
          <>
            {/* Wallet connected to the agent */}
            <div className="rounded-xl bg-secondary/40 border border-border p-3 text-xs space-y-1">
              <p className="flex items-center gap-1.5 font-bold text-foreground">
                <Wallet size={13} className="text-emerald-400" /> Agent wallet connected
              </p>
              {data.agent_wallets?.length ? (
                data.agent_wallets.map((w: any) => (
                  <p key={w.id} className="font-mono text-muted-foreground break-all">
                    {w.address} <span className="text-[10px]">({w.label}, {w.chain})</span>
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">No wallet is assigned to this agent.</p>
              )}
            </div>

            {type === "trader" && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Trades taken" value={m.trades_taken ?? 0} />
                  <Metric label="Open now" value={m.open_trades ?? 0} />
                  <Metric label="TP / SL hits" value={`${m.take_profit_hits ?? 0} / ${m.stop_loss_hits ?? 0}`} />
                  <Metric label="Win rate" value={m.win_rate_pct == null ? "no closed trades" : `${m.win_rate_pct}%`} />
                </div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp size={13} /> Last {data.recent_decisions?.length || 0} decisions ({m.decisions_total ?? 0} total)
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-[11px]">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="text-left p-2">When</th><th className="text-left p-2">Coin</th><th className="text-left p-2">Verdict</th>
                        <th className="text-right p-2">Conf.</th><th className="text-right p-2">Entry</th><th className="text-right p-2">TP</th><th className="text-right p-2">SL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.recent_decisions || []).map((d: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 text-muted-foreground">{fmtTime(d.at)}</td>
                          <td className="p-2 font-semibold text-foreground">{d.symbol}</td>
                          <td className="p-2">{String(d.verdict || "").replace(/_/g, " ")}</td>
                          <td className="p-2 text-right font-mono">{d.confidence ?? "-"}</td>
                          <td className="p-2 text-right font-mono">{num(d.entry, 4)}</td>
                          <td className="p-2 text-right font-mono">{num(d.take_profit, 4)}</td>
                          <td className="p-2 text-right font-mono">{num(d.stop_loss, 4)}</td>
                        </tr>
                      ))}
                      {!data.recent_decisions?.length && (
                        <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No decisions recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {type === "rebalancer" && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Metric label="Strategies" value={m.strategies_total ?? 0} />
                  <Metric label="Swaps" value={m.swaps_total ?? 0} />
                  <Metric label="Swaps ok" value={m.swaps_successful ?? 0} />
                  <Metric label="Failed / refunded" value={m.swaps_failed_or_refunded ?? 0} />
                </div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Layers size={13} /> Last {data.recent_strategies?.length || 0} strategies
                </p>
                <div className="space-y-2">
                  {(data.recent_strategies || []).map((s: any, i: number) => (
                    <div key={i} className="rounded-xl bg-secondary/30 border border-border p-2.5 text-[11px] space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{String(s.regime || "").replace(/_/g, " ") || "Strategy"} · {s.status}</span>
                        <span className="text-muted-foreground">{fmtTime(s.at)}</span>
                      </div>
                      <p className="font-mono text-muted-foreground">
                        {Object.entries(s.allocations || {}).map(([k, v]) => `${k} ${v}%`).join(" · ") || "no allocation recorded"}
                      </p>
                      {s.summary && <p className="text-muted-foreground line-clamp-2">{s.summary}</p>}
                    </div>
                  ))}
                  {!data.recent_strategies?.length && <p className="text-xs text-muted-foreground">No strategies recorded yet.</p>}
                </div>
              </>
            )}

            {type === "research" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Reports" value={m.reports_total ?? 0} />
                  <Metric label="Avg sources / report" value={m.avg_sources_per_report ?? "-"} />
                </div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText size={13} /> Last {data.recent_reports?.length || 0} reports
                </p>
                <div className="space-y-2">
                  {(data.recent_reports || []).map((r: any, i: number) => (
                    <div key={i} className="rounded-xl bg-secondary/30 border border-border p-2.5 text-[11px] space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{r.title}</span>
                        <span className="text-muted-foreground">{fmtTime(r.at)}</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-3">{r.summary}</p>
                      <p className="font-mono text-muted-foreground">
                        {r.sources_count} sources{r.signal ? ` · signal ${r.signal}` : ""}{r.confidence != null ? ` (${r.confidence}%)` : ""}
                      </p>
                    </div>
                  ))}
                  {!data.recent_reports?.length && <p className="text-xs text-muted-foreground">No reports generated yet.</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
