"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";
import { AGENT_INFO, AGENT_ORDER, agentIdFromName, timeAgo, type ActivityItem, type AgentKey } from "./dashboard-types";
import { AskModeratorButton, EmptyState, Panel } from "./dashboard-ui";

type Filter = "all" | AgentKey;

function shorten(value: string, head = 6, tail = 4) {
  return value.length > head + tail + 3 ? `${value.slice(0, head)}...${value.slice(-tail)}` : value;
}

function statusTone(status?: string) {
  const s = (status || "").toLowerCase();
  if (/(fail|error|reject|block|drop)/.test(s)) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (/(success|complete|done|execut|ok)/.test(s)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-border bg-secondary text-muted-foreground";
}

function Row({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false);
  const agent = agentIdFromName(item.agent_name);
  const reasoning = item.reasoning_text?.trim();
  const title = item.action_taken || item.trigger_type || "Activity";

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={() => reasoning && setOpen((v) => !v)}
        aria-expanded={reasoning ? open : undefined}
        className="flex w-full items-start gap-3 text-left"
      >
        <AgentAvatar agentId={agent} size={30} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{AGENT_INFO[agent].label}</span>
            {item.status && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(item.status)}`}>{item.status}</span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
          </span>
          <span className="mt-0.5 block text-sm leading-relaxed text-foreground/90 text-pretty">{title}</span>
        </span>
        {reasoning && (
          <ChevronDown size={16} aria-hidden="true" className={`mt-1 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && reasoning && (
        <div className="ml-[42px] mt-2 rounded-xl bg-secondary/50 p-3">
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{reasoning}</p>
          {(item.tx_hash || item.cid_reference) && (
            <dl className="mt-2 flex flex-col gap-1 text-xs">
              {item.tx_hash && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Transaction</dt>
                  <dd className="font-mono text-foreground/80" title={item.tx_hash}>{shorten(item.tx_hash)}</dd>
                </div>
              )}
              {item.cid_reference && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Proof</dt>
                  <dd className="font-mono text-foreground/80" title={item.cid_reference}>{shorten(item.cid_reference, 8, 6)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

export default function ActivityFeed({ items, onAsk }: { items: ActivityItem[]; onAsk?: (topic: "activity", ctx?: Record<string, unknown>) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(
    () => items.filter((i) => filter === "all" || agentIdFromName(i.agent_name) === filter).slice(0, 12),
    [items, filter],
  );

  return (
    <Panel
      title="Live activity"
      subtitle="What every agent just did and why. Tap a row for the reasoning."
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
        {onAsk && <AskModeratorButton topic="activity" onAsk={onAsk as any} label="Ask" />}
        <div role="radiogroup" aria-label="Filter by agent" className="flex flex-wrap justify-end gap-1">
          {(["all", ...AGENT_ORDER] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`key3d rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                filter === f ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground"
              }`}
            >
              {f === "all" ? "All" : AGENT_INFO[f].label}
            </button>
          ))}
        </div>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState title="No activity yet" hint="Actions from your agents and from this dashboard show up here as they happen." />
      ) : (
        <ul className="flex max-h-[28rem] flex-col divide-y divide-border/60 overflow-y-auto pr-1">
          {visible.map((item, i) => (
            <Row key={`${item.id}-${i}`} item={item} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
