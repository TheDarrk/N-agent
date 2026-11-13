"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MessageSquare, Bot, User, RefreshCw, Trash2, ArrowUpRight, Wallet } from "lucide-react";

export type ChatHistoryItem = {
  id: number;
  wallet_address: string;
  human_message: string;
  ai_message: string;
  session_id?: string;
  created_at: string;
};

type Props = {
  accountId: string | null;
  onSelectChat?: (chat: { human_message: string; ai_message: string }) => void;
  onConnectWallet?: () => void;
};

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

export default function SidebarChatHistory({
  accountId,
  onSelectChat,
  onConnectWallet,
}: Props) {
  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!accountId) {
      setChats([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chat/history/${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data.history || []);
      }
    } catch (e) {
      console.warn("[SidebarChatHistory] Fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const handleClearHistory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!accountId) return;
    if (!confirm("Are you sure you want to clear your recent chat history?")) return;
    setIsClearing(true);
    try {
      const res = await fetch(`/api/chat/history/${encodeURIComponent(accountId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setChats([]);
      }
    } catch (err) {
      console.error("[SidebarChatHistory] Clear error:", err);
    } finally {
      setIsClearing(false);
    }
  };

  if (!accountId) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-5 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
          <MessageSquare size={18} className="text-muted-foreground" />
        </div>
        <p className="text-[13px] font-medium text-foreground">Chat History</p>
        <p className="mt-1 mb-4 text-xs leading-relaxed text-muted-foreground">
          Connect your wallet to automatically save and view your 5 recent chats.
        </p>
        {onConnectWallet && (
          <button
            onClick={onConnectWallet}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Wallet size={14} />
            Connect wallet
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with Title and Actions */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Chats
          </h3>
          <span className="rounded bg-secondary px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
            {chats.length}/5
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Refresh history"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin text-primary" : ""} />
          </button>
          {chats.length > 0 && (
            <button
              onClick={handleClearHistory}
              disabled={isClearing}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-red-400 transition-colors"
              title="Clear chat history"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      {isLoading && chats.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 px-3 py-5 text-center text-xs text-muted-foreground">
          Loading recent chats…
        </div>
      ) : chats.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/40 p-4 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-secondary/70">
            <MessageSquare size={14} className="text-muted-foreground" />
          </div>
          <p className="text-[12px] font-medium text-foreground">No recent chats</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Ask Neptune AI anything in chat to record your session history here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat?.({ human_message: chat.human_message, ai_message: chat.ai_message })}
              className="group relative flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 p-3 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <User size={10} />
                  </span>
                  <span className="truncate text-[12px] font-semibold text-foreground">
                    {chat.human_message}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatTimeAgo(chat.created_at)}
                  </span>
                  <ArrowUpRight
                    size={11}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-opacity"
                  />
                </div>
              </div>

              {/* AI Snippet Preview */}
              <div className="flex items-start gap-1.5 pl-0.5">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-secondary text-primary mt-0.5">
                  <Bot size={9} />
                </span>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {chat.ai_message.replace(/[*_#`]/g, "").trim()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
