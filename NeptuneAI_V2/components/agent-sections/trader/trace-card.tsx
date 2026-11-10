"use client";

import React from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleSlash,
  Copy,
  Hourglass,
  Maximize2,
  ShieldAlert,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type TraceData = {
  cid: string;
  stored_at?: string;
  symbol?: string;
  verdict?: string;
  stage?: string;
  drop_reason?: string;
  confidence_score?: number;
  expected_roi_pct?: number;
  entry_price?: number;
  take_profit_price?: number;
  stop_loss_price?: number;
  risk_reward_ratio?: number;
  pattern_detected?: string;
  book_section_cited?: string;
  reasoning?: string;
  council_agreement?: string;
  council_clash?: string;
  one_thing_first?: string;
  tx_hash?: string;
  chart_image?: { data_uri?: string } | null;
  advisors?: Record<string, string | undefined>;
  binary_evidence_checks?: Record<string, boolean | undefined>;
  indicators?: {
    current_price?: number;
    rsi?: number;
    ema_trend?: string;
  };
  twitter_sentiment?: { bullish_pct?: number; bearish_pct?: number };
  researcher_intel?: unknown;
  [key: string]: unknown;
};

type Tone = "entered" | "waited" | "blocked";

type VerdictInfo = {
  tone: Tone;
  label: string;
  short: string;
  icon: LucideIcon;
};

export function describeVerdict(input: {
  verdict?: string;
  success?: boolean;
  dropped?: boolean;
}): VerdictInfo {
  const verdict = (input.verdict || "").toUpperCase();
  if (input.dropped || verdict === "DROPPED") {
    return { tone: "blocked", label: "Blocked by a safety check", short: "Blocked", icon: ShieldAlert };
  }
  if (verdict.includes("SHORT")) {
    return { tone: "entered", label: "Opened a short (sell) trade", short: "Sell trade", icon: TrendingUp };
  }
  if (verdict.includes("ENTER") || verdict.includes("BUY") || verdict.includes("LONG") || input.success) {
    return { tone: "entered", label: "Opened a buy trade", short: "Buy trade", icon: TrendingUp };
  }
  if (verdict.includes("STAND_ASIDE") || verdict === "") {
    return { tone: "waited", label: "Waited — no good trade found", short: "Waited", icon: Hourglass };
  }
  const readable = verdict.replace(/_/g, " ").toLowerCase();
  return { tone: "waited", label: readable.charAt(0).toUpperCase() + readable.slice(1), short: "Checked", icon: CircleSlash };
}

export function symbolLabel(symbol?: string) {
  if (!symbol || symbol.toUpperCase() === "MARKET" || symbol.toUpperCase() === "NONE" || symbol.toUpperCase() === "NO_TRADE") return "Stand Aside (No Trade)";
  return symbol;
}

function simplifyReasoning(text?: string) {
  if (!text) return "";
  const screener = text.match(/Screener found no qualifying setups scoring\s*>=?\s*(\d+)/i);
  if (screener) {
    return `The agent scanned the market and found no coin that scored high enough (it needs ${screener[1]} out of 100 or more).`;
  }
  return text;
}

function relativeTime(value?: string) {
  if (!value) return { short: "Recently", full: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { short: "Recently", full: "" };
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  const full = date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  if (seconds < 60) return { short: "Just now", full };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { short: `${minutes} min ago`, full };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { short: `${hours} hr ago`, full };
  const days = Math.round(hours / 24);
  if (days < 7) return { short: `${days} day${days > 1 ? "s" : ""} ago`, full };
  return { short: date.toLocaleDateString([], { month: "short", day: "numeric" }), full };
}

function rsiMeaning(rsi: number) {
  if (rsi >= 70) return "Overbought — price may cool off";
  if (rsi <= 30) return "Oversold — price may bounce";
  return "Neutral — no extreme";
}

function trendMeaning(trend?: string) {
  const t = (trend || "").toUpperCase();
  if (t.includes("BULL")) return "Uptrend";
  if (t.includes("BEAR")) return "Downtrend";
  return trend || "Sideways";
}

const toneStyles: Record<Tone, { card: string; icon: string; pill: string }> = {
  entered: {
    card: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50",
    icon: "bg-emerald-500/15 text-emerald-400",
    pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  waited: {
    card: "border-border bg-secondary/30 hover:border-primary/40",
    icon: "bg-amber-500/10 text-amber-400",
    pill: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  },
  blocked: {
    card: "border-rose-500/40 bg-rose-950/20 hover:border-rose-500/60",
    icon: "bg-rose-500/15 text-rose-400",
    pill: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  },
};

const advisorInfo: { key: string; name: string; role: string; accent: string }[] = [
  { key: "contrarian", name: "The Skeptic", role: "Argues against the trade", accent: "text-rose-400" },
  { key: "first_principles", name: "The Analyst", role: "Checks the basics", accent: "text-blue-400" },
  { key: "expansionist", name: "The Optimist", role: "Looks for upside", accent: "text-emerald-400" },
  { key: "outsider", name: "The Outsider", role: "Fresh-eyes view", accent: "text-purple-400" },
  { key: "executor", name: "The Operator", role: "How to act on it", accent: "text-amber-400" },
];

const evidenceLabels: Record<string, string> = {
  has_trend_alignment: "Trend agrees",
  has_volume_confirmation: "Trading volume is strong",
  has_chart_pattern_support: "Chart pattern supports it",
  has_social_sentiment_support: "Social mood agrees",
  favorable_risk_reward: "Reward is bigger than risk",
};

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-semibold text-foreground truncate">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Step({
  title,
  state = "done",
  last,
  children,
}: {
  title: string;
  state?: "done" | "warn" | "fail";
  last?: boolean;
  children: React.ReactNode;
}) {
  const marker =
    state === "fail"
      ? "bg-rose-500/15 text-rose-400"
      : state === "warn"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-emerald-500/15 text-emerald-400";
  const Icon = state === "fail" ? XCircle : state === "warn" ? Hourglass : CheckCircle2;
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${marker}`}>
          <Icon size={14} />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="mt-1.5 space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

type Props = {
  trace: TraceData;
  expanded: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: (json: string, cid: string) => void;
  onOpenChart: (uri: string, title: string) => void;
};

export default function TraceCard({ trace: tr, expanded, copied, onToggle, onCopy, onOpenChart }: Props) {
  const dropped = Boolean(tr.stage?.includes("DROP") || tr.drop_reason || tr.verdict === "DROPPED");
  const info = describeVerdict({ verdict: tr.verdict, dropped });
  const style = toneStyles[info.tone];
  const Icon = info.icon;
  const time = relativeTime(tr.stored_at);
  const reasoning = simplifyReasoning(tr.drop_reason || tr.reasoning || tr.pattern_detected);
  const confidence = typeof tr.confidence_score === "number" ? tr.confidence_score : null;
  const ind = tr.indicators;
  const hasScan = Boolean(ind && (typeof ind.current_price === "number" || typeof ind.rsi === "number"));
  const advisors = advisorInfo.filter((a) => tr.advisors?.[a.key]);
  const checks = tr.binary_evidence_checks
    ? Object.entries(tr.binary_evidence_checks).filter(([k]) => evidenceLabels[k])
    : [];
  const hasPlan =
    typeof tr.entry_price === "number" ||
    typeof tr.take_profit_price === "number" ||
    typeof tr.stop_loss_price === "number";
  const hasDeepSteps = hasScan || Boolean(tr.pattern_detected) || advisors.length > 0 || tr.twitter_sentiment;

  const chartUri = tr.chart_image?.data_uri;

  return (
    <article className={`rounded-xl border transition-colors ${style.card}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          <Icon size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-sm font-bold text-foreground">{info.label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${style.pill}`}>
              {symbolLabel(tr.symbol)}
            </span>
            {confidence !== null && confidence > 0 && (
              <span className="text-xs text-muted-foreground">
                Confidence <strong className="font-mono text-foreground">{confidence}%</strong>
              </span>
            )}
            {typeof tr.expected_roi_pct === "number" && tr.expected_roi_pct > 0 && (
              <span className="text-xs text-emerald-400">Aiming for +{tr.expected_roi_pct}%</span>
            )}
          </div>
          {reasoning && (
            <p className={`mt-1 text-sm leading-relaxed line-clamp-2 ${info.tone === "blocked" ? "text-rose-200/90" : "text-muted-foreground"}`}>
              {reasoning}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <time dateTime={tr.stored_at} title={time.full} className="text-xs text-muted-foreground whitespace-nowrap">
            {time.short}
          </time>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/80 text-muted-foreground">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-4 animate-in fade-in-0 duration-150">
          {hasPlan && (
            <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-border bg-background/50 p-3 sm:grid-cols-4">
              <Fact
                label="Buy price"
                value={typeof tr.entry_price === "number" ? `$${tr.entry_price}` : "—"}
              />
              <Fact
                label="Sell to take profit"
                value={typeof tr.take_profit_price === "number" ? `$${tr.take_profit_price}` : "—"}
                hint="Closes the trade in profit"
              />
              <Fact
                label="Sell to limit loss"
                value={typeof tr.stop_loss_price === "number" ? `$${tr.stop_loss_price}` : "—"}
                hint="Closes the trade if price drops"
              />
              <Fact
                label="Reward vs risk"
                value={typeof tr.risk_reward_ratio === "number" ? `${tr.risk_reward_ratio.toFixed(1)} : 1` : "—"}
              />
            </div>
          )}

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How the agent decided
          </p>

          <ol>
            {hasScan && ind && (
              <Step title="Looked at the market">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {typeof ind.current_price === "number" && (
                    <Fact label="Current price" value={`$${ind.current_price.toFixed(4)}`} />
                  )}
                  {typeof ind.rsi === "number" && (
                    <Fact label="Momentum (RSI)" value={ind.rsi.toFixed(1)} hint={rsiMeaning(ind.rsi)} />
                  )}
                  {ind.ema_trend && <Fact label="Overall trend" value={trendMeaning(ind.ema_trend)} />}
                </div>
              </Step>
            )}

            {tr.pattern_detected && (
              <Step title="Looked for chart patterns">
                <p>
                  Spotted <strong className="text-foreground">{tr.pattern_detected}</strong>
                  {tr.book_section_cited ? ` — checked against the trading rulebook (${tr.book_section_cited}).` : "."}
                </p>
                {chartUri && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenChart(chartUri, `${symbolLabel(tr.symbol)} chart — ${tr.pattern_detected}`)
                    }
                    className="group relative block w-full max-w-md overflow-hidden rounded-lg border border-border bg-[#0B0F19]"
                  >
                    <img
                      src={chartUri}
                      alt={`Chart showing ${tr.pattern_detected} for ${symbolLabel(tr.symbol)}`}
                      className="h-auto max-h-40 w-full object-contain"
                    />
                    <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Maximize2 size={12} /> View larger
                    </span>
                  </button>
                )}
              </Step>
            )}

            {tr.twitter_sentiment && typeof tr.twitter_sentiment.bullish_pct === "number" && (
              <Step title="Checked what people are saying">
                <p>
                  <strong className="text-emerald-400">{tr.twitter_sentiment.bullish_pct}%</strong> of social posts were
                  positive
                  {typeof tr.twitter_sentiment.bearish_pct === "number" && (
                    <>
                      , <strong className="text-rose-400">{tr.twitter_sentiment.bearish_pct}%</strong> negative
                    </>
                  )}
                  .
                </p>
              </Step>
            )}

            {(advisors.length > 0 || tr.council_agreement || tr.council_clash) && (
              <Step title="Asked a panel of 5 AI advisors">
                {checks.length > 0 && (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {checks.map(([key, ok]) => (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        {ok ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                        ) : (
                          <XCircle size={14} className="shrink-0 text-rose-400" />
                        )}
                        <span className={ok ? "text-foreground" : "text-muted-foreground"}>{evidenceLabels[key]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tr.council_agreement && (
                  <p>
                    <strong className="text-emerald-400">They agreed: </strong>
                    {tr.council_agreement}
                  </p>
                )}
                {tr.council_clash && (
                  <p>
                    <strong className="text-amber-400">They disagreed: </strong>
                    {tr.council_clash}
                  </p>
                )}
                {advisors.length > 0 && (
                  <details className="group rounded-lg border border-border bg-background/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground">
                      See what each advisor said
                    </summary>
                    <div className="space-y-3 border-t border-border p-3">
                      {advisors.map((a) => (
                        <div key={a.key}>
                          <p className={`text-sm font-semibold ${a.accent}`}>
                            {a.name} <span className="font-normal text-muted-foreground">· {a.role}</span>
                          </p>
                          <p className="mt-0.5">{tr.advisors?.[a.key]}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Step>
            )}

            <Step
              title="Safety check before spending money"
              state={dropped ? "fail" : info.tone === "waited" ? "warn" : "done"}
            >
              {dropped ? (
                <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-rose-200">
                  {tr.drop_reason || "The agent wallet has no funds, so the trade was stopped."}
                </p>
              ) : info.tone === "waited" ? (
                <p>No money was moved — the agent decided to wait.</p>
              ) : (
                <p>Wallet key and balance were verified and no spending limits were exceeded.</p>
              )}
            </Step>

            <Step title="Result" last state={dropped ? "fail" : info.tone === "waited" ? "warn" : "done"}>
              <p className="text-foreground">{info.label}.</p>
              {!hasDeepSteps && info.tone === "waited" && (
                <p>
                  Nothing looked promising enough, so the agent skipped the detailed analysis and will check again on its
                  next run.
                </p>
              )}
              {tr.one_thing_first && (
                <p>
                  <strong className="text-foreground">Next step: </strong>
                  {tr.one_thing_first}
                </p>
              )}
              {tr.tx_hash && (
                <p className="break-all font-mono text-xs">Transaction: {tr.tx_hash}</p>
              )}
            </Step>
          </ol>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={tr.cid}>
              Run ID: <span className="font-mono">{tr.cid.length > 20 ? `${tr.cid.slice(0, 10)}…${tr.cid.slice(-6)}` : tr.cid}</span>
              {time.full && <span> · {time.full}</span>}
            </p>
            <button
              type="button"
              onClick={() => onCopy(JSON.stringify(tr, null, 2), tr.cid)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Copy raw data</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
