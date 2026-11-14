"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { EcosystemOpportunityItem, Report, SignalItem, SourceCitation } from "../research-panel";
import { FormattedMarkdown, renderInline } from "./report-markdown";

type Tone = "good" | "bad" | "watch" | "dev";

const toneStyles: Record<Tone, { badge: string; bar: string }> = {
  good: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  bad: {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  watch: {
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    bar: "bg-purple-500",
  },
  dev: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
};

const GOOD_DIRECTIONS = ["BUY", "STAKE", "ACCUMULATE", "PARTICIPATE", "LONG"];
const BAD_DIRECTIONS = ["AVOID", "SELL", "REDUCE", "SHORT"];

function directionTone(direction?: string): Tone {
  const value = (direction || "").toUpperCase();
  if (GOOD_DIRECTIONS.includes(value)) return "good";
  if (BAD_DIRECTIONS.includes(value)) return "bad";
  return "watch";
}

function categoryTone(category?: string): Tone {
  const value = (category || "").toLowerCase();
  if (/(yield|staking|liquidity|pool)/.test(value)) return "good";
  if (/(hackathon|grant|bounty|builder)/.test(value)) return "dev";
  return "watch";
}

function displayConfidence(value: number, hasEvidence: boolean) {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.round(hasEvidence ? Math.max(45, Math.min(95, numeric)) : Math.min(35, numeric));
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stagger(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 8) * 55}ms` };
}

function ConfidenceMeter({ value, tone }: { value: number; tone: Tone }) {
  return (
    <span className="flex items-center gap-2" title={`${value}% confidence`}>
      <span className="h-2 w-14 overflow-hidden rounded-full bg-secondary">
        <span className={`bar-grow block h-full rounded-full ${toneStyles[tone].bar}`} style={{ width: `${value}%` }} />
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}%</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${toneStyles[tone].badge}`}
    >
      {children}
    </span>
  );
}

function AccordionRow({
  badge,
  title,
  meta,
  open,
  onToggle,
  index,
  children,
}: {
  badge: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <li
      style={stagger(index)}
      className={`pop-in rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:shadow-md hover:shadow-purple-500/10 ${
        open ? "border-purple-500/40 shadow-md shadow-purple-500/10" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
      >
        {badge}
        <span
          className={`min-w-0 flex-1 text-[15px] font-semibold leading-snug text-foreground ${open ? "text-pretty" : "line-clamp-2"}`}
        >
          {title}
        </span>
        {meta && <span className="hidden shrink-0 sm:block">{meta}</span>}
        <ChevronDown
          aria-hidden="true"
          className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pop-in space-y-2 border-t border-border/60 px-4 pb-4 pt-3 text-[15px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </li>
  );
}

function SignalList({ signals, sources }: { signals: SignalItem[]; sources: SourceCitation[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <ul className="space-y-2.5">
      {signals.map((signal, index) => {
        const tone = directionTone(signal.direction);
        const confidence = displayConfidence(signal.confidence, Boolean(signal.supporting_sources?.length));
        return (
          <AccordionRow
            key={index}
            index={index}
            badge={<Badge tone={tone}>{signal.direction}</Badge>}
            title={signal.signal}
            meta={<ConfidenceMeter value={confidence} tone={tone} />}
            open={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {signal.asset_or_target && (
                <span className="font-mono text-purple-700 dark:text-purple-300">{signal.asset_or_target}</span>
              )}
              {signal.timeframe && (
                <span className="flex items-center gap-1">
                  <Clock aria-hidden="true" className="size-3" />
                  {signal.timeframe}
                </span>
              )}
              <span className="sm:hidden">
                <ConfidenceMeter value={confidence} tone={tone} />
              </span>
            </div>
            <p>{renderInline(signal.rationale, sources)}</p>
          </AccordionRow>
        );
      })}
    </ul>
  );
}

function OpportunityTile({
  opportunity,
  index,
  sources,
  detailed,
}: {
  opportunity: EcosystemOpportunityItem;
  index: number;
  sources: SourceCitation[];
  detailed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = categoryTone(opportunity.category);
  return (
    <li
      style={stagger(index)}
      className={`pop-in rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:shadow-md hover:shadow-purple-500/10 ${
        open ? "border-purple-500/40 shadow-md shadow-purple-500/10" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full flex-col gap-2 rounded-xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
      >
        <span className="flex items-center justify-between gap-2">
          <Badge tone={tone}>{opportunity.category}</Badge>
          {opportunity.reward_or_yield && (
            <span className="truncate rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {opportunity.reward_or_yield}
            </span>
          )}
        </span>
        <span className={`text-[15px] font-semibold leading-snug text-foreground ${open ? "text-pretty" : "line-clamp-2"}`}>
          {opportunity.title}
        </span>
        {(opportunity.timeframe_or_deadlines || detailed) && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock aria-hidden="true" className="size-3.5 shrink-0" />
            <span className={open ? "" : "line-clamp-1"}>{opportunity.timeframe_or_deadlines || "No deadline listed"}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="pop-in space-y-2 border-t border-border/60 px-4 pb-4 pt-3 text-[15px] leading-relaxed text-muted-foreground">
          {opportunity.target_asset_or_protocol && (
            <p className="font-mono text-sm font-semibold text-purple-700 dark:text-purple-300">{opportunity.target_asset_or_protocol}</p>
          )}
          <p>
            <span className="font-bold text-foreground">How to join: </span>
            {renderInline(opportunity.how_to_participate, sources)}
          </p>
        </div>
      )}
    </li>
  );
}

function OpportunityGrid({
  opportunities,
  sources,
  detailed = false,
}: {
  opportunities: EcosystemOpportunityItem[];
  sources: SourceCitation[];
  detailed?: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
      {opportunities.map((opportunity, index) => (
        <OpportunityTile key={index} index={index} opportunity={opportunity} sources={sources} detailed={detailed} />
      ))}
    </ul>
  );
}

function Analysis({ report }: { report: Report }) {
  const [expanded, setExpanded] = useState(false);
  const body = report.findings || report.summary || "";
  const isLong = body.length > 700;
  if (!body) return null;
  return (
    <div className="space-y-3">
      {report.user_expectations_summary && (
        <p className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-[15px] text-muted-foreground">
          <span className="font-bold text-foreground">Matched to your request: </span>
          {report.user_expectations_summary}
        </p>
      )}
      <div className="relative">
        <div className={expanded || !isLong ? "" : "max-h-60 overflow-hidden"}>
          <FormattedMarkdown text={body} sources={report.sources_cited || []} />
        </div>
        {isLong && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-purple-500/40"
        >
          {expanded ? "Show less" : "Read full analysis"}
        </button>
      )}
    </div>
  );
}

function RiskChip({ text, tone, index }: { text: string; tone: "risk" | "gap"; index: number }) {
  const styles =
    tone === "risk"
      ? "border-rose-500/20 bg-rose-500/5"
      : "border-amber-500/25 bg-amber-500/5";
  return (
    <li
      style={stagger(index)}
      className={`pop-in flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${styles}`}
    >
      <AlertTriangle
        aria-hidden="true"
        className={`mt-1 size-4 shrink-0 ${tone === "risk" ? "text-rose-500" : "text-amber-500"}`}
      />
      <span>{text}</span>
    </li>
  );
}

function RiskPanel({ risks, gaps }: { risks: string[]; gaps: string[] }) {
  return (
    <div className="space-y-3">
      {risks.length > 0 && (
        <ul className="space-y-1.5">
          {risks.map((risk, index) => (
            <RiskChip key={index} index={index} text={risk} tone="risk" />
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            The research could not fully verify these points, so treat them with care:
          </p>
          <ul className="space-y-1.5">
            {gaps.map((gap, index) => (
              <RiskChip key={index} index={index} text={gap} tone="gap" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceList({ sources }: { sources: SourceCitation[] }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
      {sources.map((source, index) => (
        <li key={index} style={stagger(index)} className="pop-in">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:shadow-md hover:shadow-purple-500/10"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-purple-500/15 font-mono text-sm font-bold text-purple-700 dark:text-purple-300">
              {source.index || index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-foreground group-hover:text-purple-700 dark:group-hover:text-purple-300">
                {source.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {hostnameOf(source.url)}
                {source.date && source.date !== "N/A" ? ` · ${source.date}` : ""}
                {source.source_type === "on_chain" ? " · live on-chain" : ""}
              </span>
            </span>
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function ReportView({ report }: { report: Report }) {
  const [copied, setCopied] = useState(false);

  const sources = report.sources_cited || [];
  const signals = report.signals || [];
  const opportunities = report.ecosystem_opportunities || [];
  const risks = report.risk_factors || [];
  const gaps = report.coverage_gaps || [];
  const hasAnalysis = Boolean(report.findings || report.summary);

  const primary = report.primary_signal || signals[0];
  const fallbackAction = report.actionable_signal;
  const primaryDirection = primary?.direction || fallbackAction?.action;
  const primaryTarget = primary?.asset_or_target || fallbackAction?.target_asset || "";
  const primaryConfidence = primary
    ? displayConfidence(primary.confidence, Boolean(primary.supporting_sources?.length))
    : Math.round(fallbackAction?.confidence ?? 0);
  const primaryTimeframe = primary?.timeframe || fallbackAction?.recommended_timeframe;
  const primaryTone = directionTone(primaryDirection);

  const tabs = [
    { id: "signals", label: "Signals", count: signals.length, show: signals.length > 0 },
    { id: "opportunities", label: "Opportunities", count: opportunities.length, show: opportunities.length > 0 },
    { id: "analysis", label: "Analysis", count: 0, show: hasAnalysis },
    { id: "risks", label: "Risks", count: risks.length + gaps.length, show: risks.length + gaps.length > 0 },
    { id: "sources", label: "Sources", count: sources.length, show: sources.length > 0 },
  ].filter((tab) => tab.show);

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "analysis");

  const copyCid = async () => {
    try {
      await navigator.clipboard.writeText(report.cid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const shortCid = report.cid.length > 16 ? `${report.cid.slice(0, 8)}…${report.cid.slice(-5)}` : report.cid;

  return (
    <section aria-label="Research report" className="pop-in overflow-hidden rounded-2xl border border-border bg-card">
      <header className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            {report.regime || "Accumulation"}
          </span>
          <button
            type="button"
            onClick={copyCid}
            title="Copy the full report ID (IPFS CID)"
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-purple-500/40 hover:text-foreground"
          >
            {copied ? <Check aria-hidden="true" className="size-3 text-emerald-500" /> : <Copy aria-hidden="true" className="size-3" />}
            {copied ? "Copied" : shortCid}
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        <h2 className="line-clamp-2 text-xl font-bold leading-snug text-foreground text-balance md:text-2xl">{report.title}</h2>

        {primaryDirection && (
          <div className="pop-in flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-purple-500/30 bg-purple-500/5 px-4 py-3 transition-all duration-200 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10">
            <span className="text-sm font-bold uppercase tracking-wide text-foreground">Top pick</span>
            <Badge tone={primaryTone}>{primaryDirection}</Badge>
            {primaryTarget && <span className="min-w-0 flex-1 text-base font-semibold text-foreground text-pretty">{primaryTarget}</span>}
            <span className="flex items-center gap-3">
              <ConfidenceMeter value={primaryConfidence} tone={primaryTone} />
              {primaryTimeframe && <span className="hidden text-sm text-muted-foreground sm:inline">{primaryTimeframe}</span>}
            </span>
          </div>
        )}
      </header>

      <div className="space-y-4 border-t border-border/60 bg-secondary/10 p-4 md:p-5">
        {tabs.length > 0 && (
          <div key="full" className="pop-in space-y-3">
            <div role="tablist" aria-label="Report sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5">
              {tabs.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`report-tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`report-panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[15px] font-bold transition-all duration-200 ${
                      selected
                        ? "bg-purple-500/15 text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="rounded-full bg-secondary px-1.5 font-mono text-[11px] text-muted-foreground">{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              key={activeTab}
              role="tabpanel"
              id={`report-panel-${activeTab}`}
              aria-labelledby={`report-tab-${activeTab}`}
              className="pop-in rounded-2xl border border-border bg-secondary/20 p-4"
            >
              {activeTab === "signals" && <SignalList signals={signals} sources={sources} />}
              {activeTab === "opportunities" && (
                <OpportunityGrid opportunities={opportunities} sources={sources} detailed />
              )}
              {activeTab === "analysis" && <Analysis report={report} />}
              {activeTab === "risks" && <RiskPanel risks={risks} gaps={gaps} />}
              {activeTab === "sources" && <SourceList sources={sources} />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
