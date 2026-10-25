"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Clock,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Brain,
  Shield,
  Layers,
  ChevronRight,
  Maximize2
} from "lucide-react";
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
}

export default function SidebarAgentFeed({
  accountId,
  onOpenAgentSuite,
  onSelectAgent,
  onOpenFullScreenHistory
}: Props) {
  const [logs, setLogs] = useState<AgentLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    const wallet = accountId || "guest.near";
    try {
      // 1. Fetch fleet recent_activity
      const fleetRes = await fetch(`/api/fleet/${wallet}`);
      if (fleetRes.ok) {
        const fleetData = await fleetRes.json();
        if (fleetData.recent_activity && fleetData.recent_activity.length > 0) {
          setLogs(fleetData.recent_activity);
          return;
        }
      }

      // 2. Fallback to /api/logs
      const logRes = await fetch(`/api/logs/${wallet}`);
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(Array.isArray(data) ? data.slice(0, 8) : []);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 12000);
    return () => clearInterval(interval);
  }, [accountId]);

  const getAgentColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("trader")) return "text-cyan-400 border-cyan-500/30 bg-cyan-500/10";
    if (n.includes("moderator")) return "text-purple-400 border-purple-500/30 bg-purple-500/10";
    if (n.includes("research")) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (n.includes("rebalancer")) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-blue-400 border-blue-500/30 bg-blue-500/10";
  };

  const getAgentId = (name: string): "trader" | "moderator" | "research" | "rebalancer" => {
    const n = name.toLowerCase();
    if (n.includes("moderator")) return "moderator";
    if (n.includes("research")) return "research";
    if (n.includes("rebalancer") || n.includes("rebalance")) return "rebalancer";
    return "trader";
  };

  const formatUtcDateTime = (dateStr: string) => {
    if (!dateStr) return "Just now (UTC)";
    try {
      const d = new Date(dateStr.endsWith("Z") || dateStr.includes("UTC") ? dateStr.replace(" UTC", "Z") : `${dateStr}Z`);
      if (isNaN(d.getTime())) return dateStr.includes("UTC") ? dateStr : `${dateStr} UTC`;
      const ymd = d.toISOString().slice(0, 10);
      const time = d.toISOString().slice(11, 19);
      return `${ymd} ${time} UTC`;
    } catch {
      return `${dateStr} UTC`;
    }
  };

  return (
    <div className="mx-1 mt-4 rounded-2xl border border-[hsl(225,18%,16%)] bg-card/40 p-3 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[hsl(225,18%,14%)]">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-primary animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
            Suite Decision History
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenFullScreenHistory && (
            <button
              onClick={onOpenFullScreenHistory}
              className="text-muted-foreground hover:text-primary transition-colors p-1"
              title="View History in Full Screen"
            >
              <Maximize2 size={11} />
            </button>
          )}
          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Refresh decision history"
          >
            <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Decision Log Items */}
      {logs.length === 0 ? (
        <div className="py-4 text-center">
          <Brain size={18} className="mx-auto mb-1.5 text-muted-foreground/50" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Suite Standing By
          </p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            Awaiting 4-agent scan triggers &amp; autonomous events
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5 scrollbar-thin">
          {logs.map((item) => {
            const agentId = getAgentId(item.agent_name);
            const badgeColor = getAgentColor(item.agent_name);

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (onSelectAgent) {
                    onSelectAgent(agentId);
                  } else if (onOpenAgentSuite) {
                    onOpenAgentSuite();
                  }
                }}
                className="group p-2 rounded-xl border border-[hsl(225,18%,13%)] bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30 transition-all cursor-pointer"
              >
                {/* Top Row: SVG Avatar, Agent Name, Time */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AgentAvatar agentId={agentId} size={15} />
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border truncate ${badgeColor}`}
                    >
                      {item.agent_name || "Agent"}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono flex-shrink-0">
                    {formatUtcDateTime(item.created_at || (item as any).created_at_utc)}
                  </span>
                </div>

                {/* Action Taken */}
                <p className="text-[10px] font-semibold text-foreground leading-tight truncate">
                  {item.action_taken || item.trigger_type || "Autonomous Audit"}
                </p>

                {/* Reasoning summary */}
                {item.reasoning_text && (
                  <p className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {item.reasoning_text}
                  </p>
                )}

                {/* Footer Metadata: CID & Tx Hash */}
                <div className="flex items-center justify-between gap-1 mt-1.5 pt-1 border-t border-[hsl(225,18%,12%)]/60 text-[8px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={9} className="text-emerald-400" />
                    <span className="capitalize">{item.status || "Verified"}</span>
                  </span>

                  {item.cid_reference && item.cid_reference !== "local" && (
                    <span className="font-mono text-cyan-400 truncate max-w-[80px]" title={item.cid_reference}>
                      CID:{item.cid_reference.slice(0, 6)}...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Links */}
      <div className="flex items-center gap-1.5 mt-2.5 pt-1.5 border-t border-[hsl(225,18%,13%)]">
        {onOpenFullScreenHistory && (
          <button
            onClick={onOpenFullScreenHistory}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/25 text-[10px] text-primary transition-all font-semibold active:scale-95 shadow-sm"
          >
            <Maximize2 size={11} />
            <span>Full Screen History</span>
          </button>
        )}
        {onOpenAgentSuite && (
          <button
            onClick={onOpenAgentSuite}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors font-medium"
            title="Open Agent Suite Overview"
          >
            <span>Suite</span>
            <ChevronRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
