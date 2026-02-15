"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowDownUp, Coins, HelpCircle, CreditCard, X } from "lucide-react";
import ChatHeader from "@/components/chat-header";
import ChatSidebar from "@/components/chat-sidebar";
import ChatMessage from "@/components/chat-message";
import TransactionModal, { type TxStep } from "@/components/transaction-modal";
import { useWallet } from "@/providers/wallet-provider";

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
  { icon: ArrowDownUp, label: "Swap 5 NEAR for USDC", desc: "Token exchange" },
  { icon: Coins, label: "What tokens are available?", desc: "Browse tokens" },
  { icon: CreditCard, label: "Create a payment link for 50 USDC", desc: "HOT Pay" },
  { icon: HelpCircle, label: "What can you do?", desc: "Learn more" },
];

/* ── Draggable floating About button ── */
function DraggableAboutButton({ onClick }: { onClick: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({ dragging: false, wasDragged: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [pos, setPos] = useState({ left: 230, top: typeof window !== "undefined" ? window.innerHeight - 130 : 700 });

  useEffect(() => {
    setPos({ left: 230, top: window.innerHeight - 130 });
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

export default function ChatInterface() {
  const {
    accountId,
    walletAddresses,
    connectedChains,
    balances,
    isConnecting,
    connectWallet,
    disconnect,
    signAndSendTransaction,
  } = useWallet();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>("preparing");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [txPayload, setTxPayload] = useState<Record<string, unknown> | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSessionId(uid());
  }, []);

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

  // ── Real Transaction Signing ──────────────────────────
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

      // Step 2: Real wallet signing
      const result = await signAndSendTransaction(payload);

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
    <div className="flex h-screen overflow-hidden bg-background">
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        accountId={accountId}
        walletAddresses={walletAddresses}
        connectedChains={connectedChains}
        balances={balances}
        onReset={resetChat}
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
        />

        {/* Chat Area */}
        <div className={`flex-1 ${isEmpty ? "overflow-hidden" : "overflow-y-auto"}`}>
          {isEmpty ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="max-w-lg w-full text-center">
                <img
                  src="/neptune-logo.png"
                  alt="Neptune AI"
                  width={100}
                  height={100}
                  className="mx-auto mb-1"
                />
                <h2 className="text-xl font-bold text-foreground mb-2 text-balance">
                  What can Neptune AI do for you?
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed text-pretty">
                  Swap tokens, create payment links, explore chains — all powered by NEAR Intents & HOT Pay.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSend(s.label)}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-[hsl(225,18%,14%)] bg-card text-left hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.98]"
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
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-[hsl(225,18%,14%)]">
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
        <div className="border-t border-[hsl(225,18%,14%)] px-4 py-3 md:px-6 bg-card/30 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-2 rounded-xl border border-[hsl(225,18%,14%)] bg-card px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_hsl(210,100%,56%,0.1)]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Swap tokens, create payment links, or ask anything..."
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
              Neptune AI · Powered by NEAR Intents & HOT Pay
            </p>
          </div>
        </div>
      </div>

      {/* Floating Draggable About Button */}
      <DraggableAboutButton onClick={() => setShowAbout(true)} />

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAbout(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-primary/15 bg-card shadow-2xl shadow-primary/5 animate-fade-in">
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <div className="flex items-center gap-3">
                <img src="/neptune-logo.png" alt="Neptune AI" width={36} height={36} className="rounded-full" />
                <div>
                  <h2 className="text-base font-bold text-foreground">Neptune AI</h2>
                  <p className="text-[11px] text-muted-foreground">Multi-chain AI Assistant</p>
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
                Neptune AI is your intelligent gateway to decentralized finance. Powered by
                <strong className="text-foreground"> NEAR Intents</strong> and
                <strong className="text-foreground"> HOT Pay</strong>, it brings the power of multi-chain
                operations into a simple conversational interface.
              </p>
              <div className="rounded-xl bg-secondary/30 border border-primary/8 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <ArrowDownUp size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Token Swaps</strong> — Cross-chain swaps across 30+ blockchains with best-route optimization.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Payments</strong> — Create shareable payment links that accept crypto from any chain.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Coins size={14} className="text-primary mt-0.5 flex-shrink-0" />
                  <p><strong className="text-foreground">Portfolio</strong> — View balances, track tokens, and manage your assets in one place.</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/60 text-center pt-1">
                Built by the Neptune team
              </p>
            </div>
          </div>
        </div>
      )}

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
