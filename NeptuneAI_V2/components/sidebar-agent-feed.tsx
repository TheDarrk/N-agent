"use client";

import { setVisibleInterval } from "@/lib/visible-interval"
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Brain, Maximize2, ChevronRight } from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";

type Props = {
  accountId: string | null;
  onOpenAgentSuite?: () => void;
  onSelectAgent?: (agentId: string) => void;
  onOpenFullScreenHistory?: () => void;
};

interface AgentLogItem {
  id: number;
  agent_name: string;
  trigger_type: string;
  reasoning_text: string;
  action_taken: string;
  cid_reference?: string | null;
  tx_hash?: string | null;
  status: string;
  created_at: string;
  created_at_utc?: string;
}

type AgentId = "trader" | "moderator" | "research" | "rebalancer";
type Filter = "all" | AgentId;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trader", label: "Trader" },
  { id: "moderator", label: "Mod" },
  { id: "research", label: "Research" },
  { id: "rebalancer", label: "Rebal" },
];

const AGENT_TEXT: Record<AgentId, string> = {
  trader: "text-cyan-600 dark:text-cyan-400",
  moderator: "text-purple-600 dark:text-purple-400",
  research: "text-emerald-600 dark:text-emerald-400",
  rebalancer: "text-amber-600 dark:text-amber-400",
};

const getAgentId = (name: string): AgentId => {
  const n = (name || "").toLowerCase();
  if (n.includes("moderator")) return "moderator";
  if (n.includes("research")) return "research";
  if (n.includes("rebalanc")) return "rebalancer";
  return "trader";
};

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const normalized = dateStr.endsWith("Z") || dateStr.includes("UTC") ? dateStr.replace(" UTC", "Z") : `${dateStr}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};

const dayLabel = (d: Date | null) => {
  if (!d) return "Recent";
  const day = d.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (day === today.toISOString().slice(0, 10)) return "Today";
  if (day === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return day;
};

const timeLabel = (d: Date | null) => (d ? `${d.toISOString().slice(11, 16)} UTC` : "");

export default function SidebarAgentFeed({
  accountId,
  onOpenAgentSuite,
  onSelectAgent,
  onOpenFullScreenHistory
}: Props) {
  const [logs, setLogs] = useState<AgentLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchLogs = useCallback(async () => {
    const wallet = accountId || "guest.near";
    setIsLoading(true);
    try {
      const fleetRes = await fetch(`/api/fleet/${wallet}`);
      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        if (fleetData.recent_activity && fleetData.recent_activity.length > 0) {
          setLogs(fleetData.recent_activity);
          return;
        }
      }

      const logRes = await fetch(`/api/logs/${wallet}`);
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(Array.isArray(data) ? data.slice(0, 30) : []);
      }
    } catch (e) {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchLogs();
    return setVisibleInterval(fetchLogs, 12000);
  }, [fetchLogs]);

  const groups = useMemo(() => {
    const filtered = logs.filter((l) => filter === "all" || getAgentId(l.agent_name) === filter);
    const map = new Map<string, { item: AgentLogItem; date: Date | null }[]>();
    for (const item of filtered) {
      const date = parseDate(item.created_at || item.created_at_utc || "");
      const label = dayLabel(date);
      const list = map.get(label) ?? [];
      list.push({ item, date });
      map.set(label, list);
    }
    return Array.from(map.entries());
  }, [logs, filter]);

  const visibleCount = groups.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Decision history
          {logs.length > 0 && <span className="ml-1.5 font-mono normal-case text-foreground/70">{logs.length}</span>}
        </h3>
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Refresh decision history"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filters */}
      <div className="-mx-1 flex flex-wrap gap-1 px-1" role="group" aria-label="Filter by agent">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card/50">
        {visibleCount === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 py-8 text-center">
            <Brain size={22} className="mb-2 text-muted-foreground/60" />
            <p className="text-[13px] font-medium text-foreground">
              {logs.length === 0 ? "Suite standing by" : "No decisions for this agent"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {logs.length === 0
                ? "Decisions appear here when agents scan or act."
                : "Try a different filter."}
            </p>
          </div>
        ) : (
          groups.map(([label, items]) => (
            <section key={label}>
              <h4 className="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">
                {label}
              </h4>
              <ul className="divide-y divide-border">
                {items.map(({ item, date }) => {
                  const agentId = getAgentId(item.agent_name);
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => (onSelectAgent ? onSelectAgent(agentId) : onOpenAgentSuite?.())}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/70">
                          <AgentAvatar agentId={agentId} size={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-[11px] font-semibold uppercase tracking-wide ${AGENT_TEXT[agentId]}`}>
                              {item.agent_name || "Agent"}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeLabel(date)}</span>
                          </span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-snug text-foreground line-clamp-1">
                            {item.action_taken || item.trigger_type || "Autonomous audit"}
                          </span>
                          {item.reasoning_text && (
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground line-clamp-2">
                              {item.reasoning_text}
                            </span>
                          )}
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="capitalize">{item.status || "Verified"}</span>
                            {item.cid_reference && item.cid_reference !== "local" && (
                              <span className="truncate font-mono" title={item.cid_reference}>
                                CID {item.cid_reference.slice(0, 6)}…
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {onOpenFullScreenHistory && (
          <button
            onClick={onOpenFullScreenHistory}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Maximize2 size={13} />
            Full history
          </button>
        )}
        {onOpenAgentSuite && (
          <button
            onClick={onOpenAgentSuite}
            className="flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            Suite
            <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
