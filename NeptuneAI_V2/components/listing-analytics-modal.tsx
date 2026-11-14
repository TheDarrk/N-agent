"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Wallet,
  RefreshCw,
  TrendingUp,
  Layers,
  FileText,
  AlertCircle,
  Copy,
  Check,
  Activity,
  Target,
  Trophy,
  CircleDot,
  Repeat,
  CheckCircle2,
  XCircle,
  BookOpen,
  Link2,
} from "lucide-react";

type Props = { listingId: string | null; title?: string; agentType?: string; onClose: () => void };

type Tone = "neutral" | "good" | "bad" | "info";

const toneStyles: Record<Tone, { box: string; icon: string; value: string }> = {
  neutral: { box: "border-border bg-secondary/40", icon: "bg-secondary text-muted-foreground", value: "text-foreground" },
  good: { box: "border-emerald-500/25 bg-emerald-500/5", icon: "bg-emerald-500/15 text-emerald-400", value: "text-emerald-400" },
  bad: { box: "border-red-500/25 bg-red-500/5", icon: "bg-red-500/15 text-red-400", value: "text-red-400" },
  info: { box: "border-primary/25 bg-primary/5", icon: "bg-primary/15 text-primary", value: "text-primary" },
};

const typeLabel: Record<string, string> = { trader: "Trader", rebalancer: "Rebalancer", research: "Research" };

const fmtTime = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};
const num = (v: any, digits = 2) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? "-" : Number(v).toFixed(digits));

function Metric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ size?: number }>;
  tone?: Tone;
}) {
  const t = toneStyles[tone];
  return (
    <div className={`rounded-2xl border p-3 flex flex-col gap-2 ${t.box}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
        <span className={`grid place-items-center w-6 h-6 rounded-lg shrink-0 ${t.icon}`}>
          <Icon size={13} />
        </span>
      </div>
      <p className={`text-lg font-mono font-bold leading-tight ${t.value}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 text-xs font-bold text-foreground">
      <span className="grid place-items-center w-6 h-6 rounded-lg bg-primary/15 text-primary">
        <Icon size={13} />
      </span>
      {children}
    </h4>
  );
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  const text = String(verdict || "-").replace(/_/g, " ");
  const v = text.toUpperCase();
  const cls = /LONG|BUY/.test(v)
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : /SHORT|SELL/.test(v)
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-secondary text-muted-foreground border-border";
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{text}</span>;
}

function ConfidenceBar({ value }: { value: any }) {
  const n = Number(value);
  if (value === null || value === undefined || isNaN(n)) return <span className="font-mono text-muted-foreground">-</span>;
  const pct = Math.max(0, Math.min(100, n));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-12 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono w-7 text-right text-foreground">{n}</span>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={copied ? "Address copied" : "Copy wallet address"}
      className="shrink-0 grid place-items-center w-7 h-7 rounded-lg border border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
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

  useEffect(() => {
    if (!listingId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listingId, onClose]);

  if (!listingId) return null;
  const type: string | undefined = data?.agent_type || agentType;
  const m = data?.metrics || {};
  const wallets: any[] = data?.agent_wallets || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title || "Agent"} analytics`}
        className="relative flex flex-col w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl border border-primary/25 bg-card shadow-2xl shadow-primary/10"
      >
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border bg-gradient-to-b from-primary/10 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 text-primary shrink-0">
              <Activity size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-foreground truncate">{title || "Agent analytics"}</h3>
                {type && typeLabel[type] && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {typeLabel[type]}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Real history of this agent. No placeholder numbers.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close analytics"
            className="shrink-0 grid place-items-center w-9 h-9 rounded-xl border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div role="status" className="space-y-3">
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                <RefreshCw size={14} className="animate-spin" /> Loading analytics from the database...
              </div>
              <div className="h-16 rounded-2xl bg-secondary/40 border border-border animate-pulse" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-secondary/40 border border-border animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          {data && (
            <>
              <section
                className={`rounded-2xl border p-4 ${wallets.length ? "border-emerald-500/25 bg-emerald-500/5" : "border-border bg-secondary/30"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <span
                      className={`grid place-items-center w-6 h-6 rounded-lg ${wallets.length ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"}`}
                    >
                      <Wallet size={13} />
                    </span>
                    {wallets.length ? "Agent wallet connected" : "No agent wallet connected"}
                  </p>
                  {wallets.length > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
                      <CircleDot size={10} /> Live
                    </span>
                  )}
                </div>
                {wallets.length ? (
                  <ul className="mt-3 space-y-2">
                    {wallets.map((w: any) => (
                      <li key={w.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11px] text-foreground break-all">{w.address}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {w.label} · {w.chain}
                          </p>
                        </div>
                        <CopyAddress address={w.address} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No wallet is assigned to this agent.</p>
                )}
              </section>

              {type === "trader" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Metric label="Trades taken" value={m.trades_taken ?? 0} icon={Repeat} tone="info" />
                    <Metric label="Open now" value={m.open_trades ?? 0} icon={CircleDot} tone={m.open_trades ? "good" : "neutral"} />
                    <Metric label="TP / SL hits" value={`${m.take_profit_hits ?? 0} / ${m.stop_loss_hits ?? 0}`} icon={Target} />
                    <Metric
                      label="Win rate"
                      value={m.win_rate_pct == null ? "No trades" : `${m.win_rate_pct}%`}
                      icon={Trophy}
                      tone={m.win_rate_pct == null ? "neutral" : m.win_rate_pct >= 50 ? "good" : "bad"}
                    />
                  </div>

                  <section className="space-y-3">
                    <SectionTitle icon={TrendingUp}>
                      Last {data.recent_decisions?.length || 0} decisions
                      <span className="font-normal text-muted-foreground">({m.decisions_total ?? 0} total)</span>
                    </SectionTitle>
                    <div className="overflow-x-auto rounded-2xl border border-border bg-background/30">
                      <table className="w-full text-[11px] min-w-[560px]">
                        <thead className="bg-secondary/50 text-muted-foreground uppercase tracking-wide text-[10px]">
                          <tr>
                            <th className="text-left font-bold px-3 py-2.5">When</th>
                            <th className="text-left font-bold px-3 py-2.5">Coin</th>
                            <th className="text-left font-bold px-3 py-2.5">Verdict</th>
                            <th className="text-right font-bold px-3 py-2.5">Conf.</th>
                            <th className="text-right font-bold px-3 py-2.5">Entry</th>
                            <th className="text-right font-bold px-3 py-2.5">TP</th>
                            <th className="text-right font-bold px-3 py-2.5">SL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.recent_decisions || []).map((d: any, i: number) => (
                            <tr key={i} className="border-t border-border hover:bg-secondary/30 transition-colors">
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtTime(d.at)}</td>
                              <td className="px-3 py-2.5">
                                <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono font-bold text-foreground">{d.symbol}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <VerdictBadge verdict={d.verdict} />
                              </td>
                              <td className="px-3 py-2.5">
                                <ConfidenceBar value={d.confidence} />
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-foreground">{num(d.entry, 4)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-400">{num(d.take_profit, 4)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-400">{num(d.stop_loss, 4)}</td>
                            </tr>
                          ))}
                          {!data.recent_decisions?.length && (
                            <tr>
                              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                                No decisions recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {type === "rebalancer" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Metric label="Strategies" value={m.strategies_total ?? 0} icon={Layers} tone="info" />
                    <Metric label="Swaps" value={m.swaps_total ?? 0} icon={Repeat} />
                    <Metric label="Swaps ok" value={m.swaps_successful ?? 0} icon={CheckCircle2} tone={m.swaps_successful ? "good" : "neutral"} />
                    <Metric
                      label="Failed / refunded"
                      value={m.swaps_failed_or_refunded ?? 0}
                      icon={XCircle}
                      tone={m.swaps_failed_or_refunded ? "bad" : "neutral"}
                    />
                  </div>

                  <section className="space-y-3">
                    <SectionTitle icon={Layers}>Last {data.recent_strategies?.length || 0} strategies</SectionTitle>
                    <div className="space-y-2.5">
                      {(data.recent_strategies || []).map((s: any, i: number) => (
                        <article key={i} className="rounded-2xl border border-border bg-secondary/30 p-3.5 text-[11px] space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold text-foreground">
                              {String(s.regime || "").replace(/_/g, " ") || "Strategy"}
                              <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                                {s.status}
                              </span>
                            </span>
                            <span className="text-muted-foreground">{fmtTime(s.at)}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(s.allocations || {}).map(([k, v]) => (
                              <span key={k} className="rounded-md bg-background/50 border border-border px-2 py-0.5 font-mono text-foreground">
                                {k} <span className="text-primary">{String(v)}%</span>
                              </span>
                            ))}
                            {!Object.keys(s.allocations || {}).length && <span className="text-muted-foreground">no allocation recorded</span>}
                          </div>
                          {s.summary && <p className="text-muted-foreground line-clamp-2">{s.summary}</p>}
                        </article>
                      ))}
                      {!data.recent_strategies?.length && <EmptyRow>No strategies recorded yet.</EmptyRow>}
                    </div>
                  </section>
                </>
              )}

              {type === "research" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Reports" value={m.reports_total ?? 0} icon={BookOpen} tone="info" />
                    <Metric label="Avg sources / report" value={m.avg_sources_per_report ?? "-"} icon={Link2} />
                  </div>

                  <section className="space-y-3">
                    <SectionTitle icon={FileText}>Last {data.recent_reports?.length || 0} reports</SectionTitle>
                    <div className="space-y-2.5">
                      {(data.recent_reports || []).map((r: any, i: number) => (
                        <article key={i} className="rounded-2xl border border-border bg-secondary/30 p-3.5 text-[11px] space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <span className="font-semibold text-foreground text-xs">{r.title}</span>
                            <span className="text-muted-foreground whitespace-nowrap">{fmtTime(r.at)}</span>
                          </div>
                          <p className="text-muted-foreground line-clamp-3">{r.summary}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-background/50 border border-border px-2 py-0.5 font-mono text-foreground">
                              {r.sources_count} sources
                            </span>
                            {r.signal && (
                              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-bold uppercase text-primary">
                                {r.signal}
                                {r.confidence != null ? ` ${r.confidence}%` : ""}
                              </span>
                            )}
                          </div>
                        </article>
                      ))}
                      {!data.recent_reports?.length && <EmptyRow>No reports generated yet.</EmptyRow>}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
