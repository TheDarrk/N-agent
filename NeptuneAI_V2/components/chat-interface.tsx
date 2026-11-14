"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowDownUp, Coins, HelpCircle, CreditCard, X, TrendingUp, ShieldAlert, Sparkles, Wallet } from "lucide-react";
import ChatHeader from "@/components/chat-header";
import ChatSidebar from "@/components/chat-sidebar";
import ChatMessage from "@/components/chat-message";
import TransactionModal, { type TxStep } from "@/components/transaction-modal";
import { useWallet } from "@/providers/wallet-provider";
import TraderSection from "@/components/agent-sections/trader-section";
import RebalancerSection from "@/components/agent-sections/rebalancer-section";
import ResearchSection from "@/components/agent-sections/research-panel";
import ModeratorSection from "@/components/agent-sections/moderator-section";
import AgentMarketplace from "@/components/agent-marketplace";
import AgentDashboard from "@/components/agent-dashboard";
import NeptuneAgentSuite from "@/components/agent-suite";
import { startPageTransition } from "@/components/page-loader";
import AgentFleetModal from "@/components/agent-fleet-modal";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  action?: string;
  payload?: Record<string, unknown>;
};

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

const SUGGESTIONS = [
  { icon: ShieldAlert, label: "Which of my agents are really running right now?", desc: "Truthful status: schedule, last run, wallet" },
  { icon: TrendingUp, label: "What were my Trader's last 5 decisions and why?", desc: "Verdicts, confidence, TP/SL, reasoning" },
  { icon: Sparkles, label: "Run my Researcher on NEAR staking and yield opportunities", desc: "Your links + Fear & Greed + coin sources" },
  { icon: Wallet, label: "How far has my Rebalancer drifted from its target?", desc: "Drift on the wallet assigned to it" },
  { icon: Coins, label: "Switch on my Trader and schedule it, then confirm", desc: "Activates, schedules and verifies" },
  { icon: ArrowDownUp, label: "Swap 5 NEAR to USDC on the best route", desc: "Cross-chain via NEAR Intents" },
];

/* ── Draggable floating About button ── */
function DraggableAboutButton({ onClick }: { onClick: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({ dragging: false, wasDragged: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [pos, setPos] = useState({ left: 230, top: 700 });

  useEffect(() => {
    // Docked sidebar only exists from lg (1024px); below that, park the button at the right edge above the input.
    const isDocked = window.innerWidth >= 1024;
    setPos({
      left: isDocked ? 230 : window.innerWidth - 52,
      top: isDocked ? window.innerHeight - 130 : window.innerHeight - 190,
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { dragging: true, wasDragged: false, startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) s.wasDragged = true;
    const newLeft = Math.max(0, Math.min(window.innerWidth - 44, s.startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - 44, s.startTop + dy));
    setPos({ left: newLeft, top: newTop });
  }, []);

  const onPointerUp = useCallback(() => {
    const wasDragged = dragState.current.wasDragged;
    dragState.current.dragging = false;
    if (!wasDragged) onClick();
  }, [onClick]);

  return (
    <button
      ref={btnRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="fixed w-10 h-10 rounded-full bg-card border border-primary/20 shadow-lg shadow-primary/5 flex items-center justify-center hover:border-primary/40 hover:shadow-primary/10 z-[9999] group cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ left: pos.left, top: pos.top }}
      title="About Neptune AI"
    >
      <img
        src="/neptune-logo.png"
        alt="About Neptune AI"
        width={24}
        height={24}
        className="rounded-full pointer-events-none"
        draggable={false}
      />
    </button>
  );
}

export default function ChatInterface({ initialTab }: { initialTab?: string }) {
  const {
    accountId,
    walletAddresses,
    connectedChains,
    balances,
    isConnecting,
    connectWallet,
    disconnect,
    signAndSendTransaction,
    signAndSendEvmTransaction,
    signAndSendGenericTransaction,
  } = useWallet();

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (p.startsWith("/agent-suite")) return "agent-suite";
      if (p.startsWith("/marketplace")) return "marketplace";
      if (p.startsWith("/dashboard")) return "dashboard";
    }
    return "chat";
  });

  const navigateTab = useCallback((tab: string, subView: string | null = null) => {
    const isBrowser = typeof window !== "undefined";
    let targetPath = "/";
    if (tab === "agent-suite") {
      targetPath = subView ? `/agent-suite?agent=${subView}` : "/agent-suite";
    } else if (tab === "marketplace") {
      targetPath = "/marketplace";
    } else if (tab === "dashboard") {
      targetPath = "/dashboard";
    }

    if (isBrowser && window.location.pathname !== targetPath.split("?")[0]) {
      startPageTransition();
    }
    setActiveTab(tab);
    setAgentSuiteSubView(subView);
    if (isBrowser && window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      startPageTransition();
      const p = window.location.pathname;
      if (p.startsWith("/agent-suite")) {
        setActiveTab("agent-suite");
        const params = new URLSearchParams(window.location.search);
        setAgentSuiteSubView(params.get("agent") || null);
      } else if (p.startsWith("/marketplace")) {
        setActiveTab("marketplace");
      } else if (p.startsWith("/dashboard")) {
        setActiveTab("dashboard");
      } else {
        setActiveTab("chat");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [agentSuiteSubView, setAgentSuiteSubView] = useState<string | null>(null);
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>("preparing");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [txPayload, setTxPayload] = useState<Record<string, unknown> | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  useEffect(() => {
    setSessionId(uid());
  }, []);

  useEffect(() => {
    let active = true;
    if (!accountId) {
      setMessages([]);
      return;
    }

    const loadHistory = async () => {
      setIsFetchingHistory(true);
      try {
        const res = await fetch(`/api/chat/history/${encodeURIComponent(accountId)}`);
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(
              data.messages.map((m: any) => ({
                id: m.id || uid(),
                role: m.role === "assistant" ? "ai" : m.role,
                content: m.content || "",
                action: m.action,
                payload: m.payload,
              }))
            );
          } else {
            setMessages([]);
          }
        }
      } catch (err) {
        console.warn("[Chat] Failed to load history:", err);
      } finally {
        if (active) setIsFetchingHistory(false);
      }
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, [accountId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 140) + "px";
    }
  }, [input]);

  // ── Real Transaction Signing ───────────────────���──────
  const handleSign = async (payload: Record<string, unknown>) => {
    if (!accountId) {
      connectWallet();
      return;
    }

    setTxPayload(payload);
    setTxHash(undefined);
    setTxError(undefined);
    setTxStep("preparing");
    setTxModalOpen(true);

    try {
      // Step 1: Preparing
      setTxStep("signing");

      // Step 2: Route to correct signer based on payload type
      // EVM payloads have a `chainId` field (numeric), NEAR payloads are arrays of tx objects
      // Generic chain payloads have a `chain` field (string) + `type: "native_transfer"`
      const isEvmTx = payload.chainId !== undefined;
      const isGenericTx = payload.chain !== undefined && payload.type === "native_transfer";

      let result: { hash: string };
      if (isEvmTx) {
        console.log("[Chat] Routing to EVM signer (chainId:", payload.chainId, ")");
        result = await signAndSendEvmTransaction(payload);
      } else if (isGenericTx) {
        console.log("[Chat] Routing to Generic chain signer (chain:", payload.chain, ")");
        result = await signAndSendGenericTransaction(payload);
      } else {
        console.log("[Chat] Routing to NEAR signer");
        result = await signAndSendTransaction(payload);
      }

      setTxStep("broadcasting");
      // Brief pause for UX — the tx is already sent
      await new Promise((r) => setTimeout(r, 800));

      // Step 3: Confirmed
      setTxHash(result.hash);
      setTxStep("confirmed");

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "ai",
          content: `Swap completed successfully! Your transaction hash is \`${result.hash}\`. Your wallet balance will update shortly.`,
        },
      ]);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Transaction was rejected or failed.";
      setTxError(errMsg);
      setTxStep("error");

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "ai",
          content: `Transaction failed: ${errMsg}. You can try again when ready.`,
        },
      ]);
    }
  };

  const handleTxRetry = () => {
    if (txPayload) handleSign(txPayload);
  };

  const handleTxClose = () => {
    setTxModalOpen(false);
  };

  // ── Chat ──────────────────────────────────────────────
  const handleSend = async (text?: string) => {
    // Abort previous request if running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const msg = text || input.trim();
    if (!msg || isLoading) return;

    setMessages((prev) => [...prev, { id: uid(), role: "user", content: msg }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "24px";
    setIsLoading(true);

    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          session_id: sessionId,
          account_id: accountId || null,
          wallet_addresses: Object.keys(walletAddresses).length > 0 ? walletAddresses : null,
          connected_chains: connectedChains.length > 0 ? connectedChains : null,
          balances: balances || null,
        }),
      });
      if (!res.ok) throw new Error("Backend unavailable");
      const data = await res.json();

      // Prevent race condition: If chat was reset/aborted, ignore result
      if (abortControllerRef.current !== controller) return;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "ai",
          content: data.response,
          action: data.action,
          payload: data.payload,
        },
      ]);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request aborted");
        return;
      }

      // Prevent race condition: If chat was reset/aborted, ignore error
      if (abortControllerRef.current !== controller) return;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "ai",
          content:
            "Can't connect to server please try again later code: 404 ai",
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Re-open a saved conversation from the sidebar history: show all its turns and continue in the same session.
  const openPastChat = useCallback((chat: { turns: { human_message: string; ai_message: string }[]; session_id?: string }) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    const restored: Message[] = [];
    for (const t of chat.turns) {
      if (t.human_message) restored.push({ id: uid(), role: "user", content: t.human_message });
      if (t.ai_message) restored.push({ id: uid(), role: "ai", content: t.ai_message });
    }
    setMessages(restored);
    if (chat.session_id) setSessionId(chat.session_id);
    navigateTab("chat", null);
  }, [navigateTab]);

  const resetChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setMessages([]);
    setSessionId(uid());
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        accountId={accountId}
        walletAddresses={walletAddresses}
        connectedChains={connectedChains}
        balances={balances}
        onReset={resetChat}
        onConnectWallet={connectWallet}
        onOpenFleetModal={() => setIsFleetModalOpen(true)}
        onOpenAgentSuite={() => navigateTab("agent-suite", null)}
        onSelectAgent={(agentId) => navigateTab("agent-suite", agentId)}
        onSelectChat={openPastChat}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <ChatHeader
          accountId={accountId}
          connectedChains={connectedChains}
          isConnecting={isConnecting}
          onConnect={connectWallet}
          onDisconnect={disconnect}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarCollapse={() => setSidebarCollapsed((c) => !c)}
          activeTab={activeTab}
          onTabChange={(tab) => navigateTab(tab, null)}
          onSelectAgent={(agentId) => navigateTab("agent-suite", agentId as any)}
        />

        {activeTab === "agent-suite" ? (
          <NeptuneAgentSuite
            accountId={accountId}
            activeAgentSubView={agentSuiteSubView}
            onSelectAgentSubView={(sub) => navigateTab("agent-suite", sub)}
            onConnectWallet={connectWallet}
          />
        ) : activeTab === "marketplace" ? (
          <AgentMarketplace
            accountId={accountId}
            onSelectAgentTab={(agentId) => navigateTab("agent-suite", agentId)}
            onConnectWallet={connectWallet}
          />
        ) : activeTab === "dashboard" ? (
          <AgentDashboard
            accountId={accountId}
            onSelectAgentTab={(agentId) => navigateTab("agent-suite", agentId)}
          />
        ) : (
          <>
        {/* Chat Area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!accountId ? (
            /* Connect Wallet Required for Chat History */
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-6">
              <div className="max-w-md w-full text-center p-6 rounded-3xl border border-border bg-card/60 backdrop-blur-sm shadow-xl">
                <img
                  src="/neptune-logo.png"
                  alt="Neptune AI"
                  width={68}
                  height={68}
                  className="mx-auto mb-3 rounded-2xl"
                />
                <h3 className="text-base font-bold text-foreground mb-1.5">
                  Connect Wallet to See Chat History
                </h3>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                  Connect your wallet to restore your persistent conversations, execute trades, and manage autonomous agents.
                </p>
                <button
                  onClick={connectWallet}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/20"
                >
                  <Wallet size={15} />
                  Connect Wallet
                </button>
              </div>
            </div>
          ) : isEmpty ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-6">
              <div className="max-w-lg w-full text-center">
                <img
                  src="/neptune-logo.png"
                  alt="Neptune AI"
                  width={100}
                  height={100}
                  className="mx-auto mb-1 w-20 h-20 sm:w-[100px] sm:h-[100px]"
                />
                <h2 className="text-xl font-bold text-foreground mb-2 text-balance">
                  What can Neptune AI do for you?
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed text-pretty">
                  Swap across chains and run your AI agents (Trader, Rebalancer, Researcher, Moderator) — all powered by NEAR.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSend(s.label)}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card text-left hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.98]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                        <s.icon size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground leading-tight">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="mx-auto max-w-2xl px-4 py-6 md:px-0">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onSignAction={handleSign}
                  index={i}
                />
              ))}

              {isLoading && (
                <div className="flex items-start gap-3 mb-5 animate-fade-in">
                  <img
                    src="/neptune-logo.png"
                    alt="Neptune AI"
                    width={36}
                    height={36}
                    className="rounded-lg flex-shrink-0 mt-0.5"
                  />
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground font-medium">Thinking</span>
                      <span className="flex items-center gap-[3px] mt-[2px]">
                        <span className="thinking-dot w-[4px] h-[4px] rounded-full bg-muted-foreground" style={{ animationDelay: "0s" }} />
                        <span className="thinking-dot w-[4px] h-[4px] rounded-full bg-muted-foreground" style={{ animationDelay: "0.2s" }} />
                        <span className="thinking-dot w-[4px] h-[4px] rounded-full bg-muted-foreground" style={{ animationDelay: "0.4s" }} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 md:px-6 bg-card/30 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_hsl(210,100%,56%,0.1)]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Swap tokens, ask what your agents are doing, or tell them what to do..."
                rows={1}
                className="flex-1 resize-none bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground leading-normal"
                style={{ height: "20px", maxHeight: "120px" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
              Neptune AI · Powered by NEAR
            </p>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Floating Draggable About Button */}
      <DraggableAboutButton onClick={() => setShowAbout(true)} />

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/65"
            onClick={() => setShowAbout(false)}
          />
          <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-primary/15 bg-card shadow-2xl shadow-primary/5 animate-fade-in">
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <div className="flex items-center gap-3">
                <img src="/neptune-logo.png" alt="Neptune AI" width={36} height={36} className="rounded-full" />
                <div>
                  <h2 className="text-base font-bold text-foreground">Neptune AI</h2>
                  <p className="text-[11px] text-muted-foreground">Autonomous multi-chain finance, powered by NEAR</p>
                </div>
              </div>
              <button
                onClick={() => setShowAbout(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 text-[13px] leading-relaxed text-foreground/85">
              <p>
                Neptune AI is a chat assistant plus a <strong className="text-foreground">fleet of AI agents</strong> that work
                for you. It runs on <strong className="text-foreground">NEAR Intents</strong> for cross-chain swaps, and every agent
                keeps a real history you can inspect.
              </p>

              <div className="rounded-xl bg-secondary/30 border border-primary/8 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Assistant</p>
                <div className="flex items-start gap-2">
                  <ArrowDownUp size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Swaps</strong> - cross-chain token swaps with best-route optimization.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Payments</strong> - shareable links that accept crypto from any chain.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Coins size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Portfolio</strong> - balances, tokens and assets in one place.</p>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/30 border border-primary/8 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Agent Suite</p>
                <div className="flex items-start gap-2">
                  <TrendingUp size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Trader</strong> - scans markets on your schedule, explains every decision, sets take-profit and stop-loss within your risk limits.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Wallet size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Rebalancer</strong> - keeps your target allocation, watches drift on its own wallet and swaps at market price when needed.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Researcher</strong> - crawls your links and trusted sources, writes cited reports, and gives the Trader and Rebalancer a second opinion (Fear &amp; Greed, coin sources).</p>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldAlert size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Moderator</strong> - the watchdog: audits the whole fleet, scores it and can halt agents with a kill switch.</p>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/30 border border-primary/8 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Wallets &amp; Marketplace</p>
                <p><strong className="text-foreground">Agent Wallets</strong> - give each agent its own wallet (up to 4); its assets and activity stay separate from yours.</p>
                <p><strong className="text-foreground">Agent Marketplace</strong> - sell or buy agent setups for USDT. Buyers see the seller&apos;s real history first (agent wallet, last decisions, strategies and reports), and a purchase copies the configuration into their own agent.</p>
              </div>

              <p className="text-[11px] text-muted-foreground/60 text-center pt-1">
                Built by the Neptune team
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fleet & Autonomy Modal */}
      <AgentFleetModal
        isOpen={isFleetModalOpen}
        onClose={() => setIsFleetModalOpen(false)}
        accountId={accountId}
        onConnect={connectWallet}
        network={network}
        onToggleNetwork={setNetwork}
      />

      {/* Transaction Modal */}
      <TransactionModal
        open={txModalOpen}
        step={txStep}
        txHash={txHash}
        errorMessage={txError}
        payload={txPayload}
        onClose={handleTxClose}
        onRetry={handleTxRetry}
      />
    </div>
  );
}
