"use client";

import React, { memo } from "react";
import { ModeratorAgentAvatar } from "@/components/agent-avatars";
import type { HelpTopic } from "./dashboard-types";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground text-balance">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground text-pretty">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export const StatTile = memo(function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
});

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">{hint}</p>
    </div>
  );
}

export function AskModeratorButton({
  topic,
  onAsk,
  label = "Ask Moderator",
  context,
}: {
  topic: HelpTopic;
  onAsk: (topic: HelpTopic, context?: Record<string, unknown>) => void;
  label?: string;
  context?: Record<string, unknown>;
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk(topic, context)}
      className="key3d inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-foreground"
    >
      <ModeratorAgentAvatar size={18} />
      {label}
    </button>
  );
}

export function StatusPill({ active, killed }: { active: boolean; killed?: boolean }) {
  if (killed) {
    return <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">Stopped</span>;
  }
  return active ? (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">Active</span>
  ) : (
    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Standing by</span>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-secondary/60 ${className}`} aria-hidden="true" />;
}

export const chartTooltipStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 13,
  color: "var(--foreground)",
};
