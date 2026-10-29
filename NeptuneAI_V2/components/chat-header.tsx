"use client";

import React, { useState } from "react";
import {
  Wallet,
  Menu,
  X,
  Flame,
  Loader2,
  MessageSquare,
  TrendingUp,
  Store,
  Scale,
  FileText,
  ShieldAlert,
  Sparkles,
  Globe,
  Plus,
  History
} from "lucide-react";
import AgentFleetModal from "./agent-fleet-modal";
import FullScreenHistoryModal from "./fullscreen-history-modal";
import { ThemeToggle } from "./theme-toggle";
import { useWallet } from "@/providers/wallet-provider";
import { isMainnetAllowed } from "@/lib/near/network";

type Props = {
  accountId: string | null;
  connectedChains: string[];
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSelectAgent?: (agentId: string) => void;
};

const CHAIN_COLORS: Record<string, string> = {
  near: "bg-cyan-500/20 text-cyan-400",
  eth: "bg-purple-500/20 text-purple-400",
  solana: "bg-green-500/20 text-green-400",
  tron: "bg-red-500/20 text-red-400",
  ton: "bg-blue-500/20 text-blue-400",
  cosmos: "bg-indigo-500/20 text-indigo-400",
  stellar: "bg-yellow-500/20 text-yellow-400",
};

export default function ChatHeader({
  accountId,
  connectedChains,
  isConnecting,
  onConnect,
  onDisconnect,
  onToggleSidebar,
  sidebarOpen,
  activeTab,
  onTabChange,
  onSelectAgent,
}: Props) {
  const { network, setNetwork } = useWallet();
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);

  const tabs = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "agent-suite", label: "Neptune Agent Suite", icon: Sparkles },
    { id: "marketplace", label: "Marketplace", icon: Store },
  ];

  const handleToggleNetwork = async (net: "testnet" | "mainnet") => {
    setNetwork(net);
    try {
      await fetch("/api/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: accountId, network: net })
      });
    } catch (e) {
      console.error("Network toggle error:", e);
    }
  };

  return (
    <>
      <header className="flex flex-col 2xl:flex-row 2xl:items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-card/60 backdrop-blur-md gap-2 2xl:gap-3 z-30 overflow-hidden select-none">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onToggleSidebar}
              className="p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors lg:hidden shrink-0"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className="flex items-center gap-2 sm:gap-2.5 cursor-pointer min-w-0" onClick={() => onTabChange("chat")}>
              <img
                src="/neptune-logo.png"
                alt="Neptune AI"
                width={34}
                height={34}
                className="rounded-lg shrink-0 w-8 h-8 sm:w-[34px] sm:h-[34px]"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <span className="text-sm font-bold tracking-tight text-foreground">Neptune</span>
                  <span className="text-sm font-bold tracking-tight text-primary">Market</span>
                </div>
                <p className="hidden sm:block text-[10px] text-muted-foreground leading-none truncate">Autonomous AI Agents on NEAR</p>
              </div>
            </div>
          </div>

          {/* Mobile & Tablet Right */}
          <div className="flex items-center gap-1.5 sm:gap-2 2xl:hidden shrink-0">
            <ThemeToggle />
            <button
              onClick={() => setIsFleetModalOpen(true)}
              className="hidden sm:inline-flex p-2 rounded-lg bg-secondary text-primary"
              aria-label="Open agent fleet"
            >
              <Sparkles size={16} />
            </button>
            <button
              onClick={() => setIsFullScreenHistoryOpen(true)}
              title="Open Full Screen Fleet History & Traces"
              aria-label="Open fleet history"
              className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-all active:scale-95 shadow-sm"
            >
              <History size={14} className="text-primary" />
              <span className="hidden sm:inline">History</span>
            </button>

            {accountId ? (
              <button
                onClick={onDisconnect}
                className="px-2.5 py-2 text-xs font-mono rounded-lg bg-secondary border border-border text-foreground truncate max-w-[96px]"
              >
                {accountId.slice(0, 6)}...
              </button>
            ) : (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground whitespace-nowrap disabled:opacity-50"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Top Navigation Bar Tabs */}
        <nav className="flex items-center gap-1.5 py-1 justify-start sm:justify-center overflow-x-auto 2xl:overflow-x-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap select-none ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Wallet Connection & Controls (Desktop) */}
        <div className="hidden 2xl:flex items-center gap-2.5">
          <ThemeToggle />
          {/* Network Switcher Pill */}
          <button
            onClick={() => {
              if (!isMainnetAllowed()) {
                alert("Mainnet is prohibited by configuration (NEXT_PUBLIC_ENABLE_MAINNET=false). Testing is restricted to NEAR Testnet.");
                return;
              }
              handleToggleNetwork(network === "testnet" ? "mainnet" : "testnet");
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
              !isMainnetAllowed()
                ? "bg-secondary/40 border-border text-muted-foreground/80 cursor-default"
                : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
            }`}
            title={!isMainnetAllowed() ? "Mainnet is prohibited (NEXT_PUBLIC_ENABLE_MAINNET=false)" : "Click to switch between Testnet and Mainnet"}
          >
            <span className={`w-2 h-2 rounded-full ${network === "testnet" ? "bg-emerald-400" : "bg-purple-400"}`} />
            <span className="uppercase font-mono text-[10px]">
              {network}
              {!isMainnetAllowed() && " (TESTNET ONLY)"}
            </span>
          </button>



          <button
            onClick={() => setIsFullScreenHistoryOpen(true)}
            title="Open Full Screen Fleet History & Traces"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-all active:scale-95 shadow-sm"
          >
            <History size={13} className="text-primary" />
            <span className="hidden lg:inline">History</span>
          </button>

          {accountId ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 border border-border">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-glow" />
                <Flame size={12} className="text-orange-400" />
                <span className="text-xs font-mono text-foreground">
                  {accountId.length > 18
                    ? `${accountId.slice(0, 8)}...${accountId.slice(-6)}`
                    : accountId}
                </span>
                {connectedChains.length > 0 && (
                  <div className="flex items-center gap-1 ml-1">
                    {connectedChains.map((chain) => (
                      <span
                        key={chain}
                        className={`text-[9px] font-bold uppercase px-1 py-0.2 rounded ${CHAIN_COLORS[chain] || "bg-muted-foreground/30 text-secondary-foreground"}`}
                      >
                        {chain}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={onConnect}
                title="Connect another chain wallet (EVM, Arbitrum, Solana, TON...)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-all"
              >
                <Plus size={11} />
                <span>+ Chain</span>
              </button>

              <button
                onClick={onDisconnect}
                className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Flame size={13} className="text-orange-400 fill-orange-400" />
              )}
              <span>Connect HOT Wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* Agents Fleet & Autonomy Modal */}
      <AgentFleetModal
        isOpen={isFleetModalOpen}
        onClose={() => setIsFleetModalOpen(false)}
        accountId={accountId}
        onConnect={onConnect}
        network={network}
        onToggleNetwork={handleToggleNetwork}
      />
      <FullScreenHistoryModal
        isOpen={isFullScreenHistoryOpen}
        onClose={() => setIsFullScreenHistoryOpen(false)}
        accountId={accountId}
        onSelectAgent={onSelectAgent}
      />
    </>
  );
}
