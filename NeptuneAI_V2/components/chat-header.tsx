"use client";

import React, { useState } from "react";
import {
  Menu,
  X,
  Wallet,
  Loader2,
  MessageSquare,
  Store,
  LayoutDashboard,
  Sparkles,
  Plus,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Flame
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
  sidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
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

/*
 * The header lays itself out from the width of the area next to the sidebar
 * (container queries), not the screen width, so it never overflows whether the
 * sidebar is open or collapsed. Connected wallets need more room, so their
 * "show the full labels" thresholds are wider. Class strings are written out in
 * full so Tailwind can detect them.
 */
const ROOMY = {
  tabFull: "hidden @[1300px]:inline",
  tabShort: "@[1300px]:hidden",
  subtitle: "hidden @6xl:block",
  network: "hidden @5xl:flex",
  historyLabel: "hidden @6xl:inline",
  chains: "hidden @[1300px]:flex",
  chainLabel: "hidden @[1300px]:inline",
  connectLong: "hidden @4xl:inline",
  connectShort: "@4xl:hidden",
};

const TIGHT = {
  tabFull: "hidden @[1400px]:inline",
  tabShort: "@[1400px]:hidden",
  subtitle: "hidden @[1400px]:block",
  network: "hidden @[1300px]:flex",
  historyLabel: "hidden @[1400px]:inline",
  chains: "hidden @[1300px]:flex",
  chainLabel: "hidden @[1400px]:inline",
  connectLong: "hidden @4xl:inline",
  connectShort: "@4xl:hidden",
};

export default function ChatHeader({
  accountId,
  connectedChains,
  isConnecting,
  onConnect,
  onDisconnect,
  onToggleSidebar,
  sidebarOpen,
  sidebarCollapsed = false,
  onToggleSidebarCollapse,
  activeTab,
  onTabChange,
  onSelectAgent,
}: Props) {
  const { network, setNetwork } = useWallet();
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);

  const c = accountId ? TIGHT : ROOMY;

  const tabs: { id: string; label: string; short?: string; icon: typeof MessageSquare }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "agent-suite", label: "Neptune Agent Suite", short: "Agent Suite", icon: Sparkles },
    { id: "marketplace", label: "Marketplace", icon: Store },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
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

  const toggleNetworkClick = () => {
    if (!isMainnetAllowed()) {
      alert("Mainnet is prohibited by configuration (NEXT_PUBLIC_ENABLE_MAINNET=false). Testing is restricted to NEAR Testnet.");
      return;
    }
    handleToggleNetwork(network === "testnet" ? "mainnet" : "testnet");
  };

  return (
    <>
      <div className="@container z-30 border-b border-border bg-card/60 backdrop-blur-md select-none">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5">
          {/* Brand */}
          <div className="col-start-1 row-start-1 flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onToggleSidebar}
              className="p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors lg:hidden shrink-0"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {onToggleSidebarCollapse && (
              <button
                type="button"
                onClick={onToggleSidebarCollapse}
                className="hidden lg:inline-flex p-2 -ml-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={sidebarCollapsed ? "Open left panel" : "Close left panel"}
                aria-expanded={!sidebarCollapsed}
                title={sidebarCollapsed ? "Open left panel" : "Close left panel"}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            )}

            <div
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer min-w-0"
              onClick={() => onTabChange("chat")}
            >
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
                <p className={`${c.subtitle} mt-1 text-[10px] text-muted-foreground leading-none truncate`}>
                  Autonomous AI Agents on NEAR
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav
            className="col-span-2 row-start-2 @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Main navigation"
          >
            <div className="mx-auto flex w-max items-center gap-1.5 py-0.5">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTabChange(t.id)}
                    title={t.label}
                    aria-label={t.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <Icon size={14} />
                    {isActive && <span className={c.tabShort}>{t.short ?? t.label}</span>}
                    <span className={c.tabFull}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Controls */}
          <div className="col-start-2 row-start-1 @3xl:col-start-3 flex items-center justify-self-end gap-1.5 sm:gap-2">
            <ThemeToggle />

            <button
              onClick={toggleNetworkClick}
              className={`${c.network} items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                !isMainnetAllowed()
                  ? "bg-secondary/40 border-border text-muted-foreground/80 cursor-default"
                  : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
              }`}
              title={!isMainnetAllowed() ? "Mainnet is prohibited (NEXT_PUBLIC_ENABLE_MAINNET=false)" : "Click to switch between Testnet and Mainnet"}
            >
              <span className={`w-2 h-2 rounded-full ${network === "testnet" ? "bg-emerald-400" : "bg-purple-400"}`} />
              <span className="uppercase font-mono text-[10px]">{network}</span>
            </button>

            <button
              onClick={() => setIsFleetModalOpen(true)}
              className="hidden @4xl:inline-flex p-2 rounded-lg bg-secondary text-primary hover:bg-secondary/70 transition-colors"
              aria-label="Open agent fleet"
              title="Open agent fleet"
            >
              <Sparkles size={16} />
            </button>

            <button
              onClick={() => setIsFullScreenHistoryOpen(true)}
              title="Open Full Screen Fleet History & Traces"
              aria-label="Open fleet history"
              className="flex items-center gap-1.5 p-2 @6xl:px-2.5 @6xl:py-1.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-xs font-semibold text-foreground transition-colors active:scale-95"
            >
              <History size={14} className="text-primary" />
              <span className={c.historyLabel}>History</span>
            </button>

            {accountId ? (
              <>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/80 border border-border min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-glow shrink-0" />
                  <Flame size={12} className="text-orange-400 shrink-0" />
                  <span className="text-xs font-mono text-foreground truncate max-w-[120px] @4xl:max-w-[200px]">
                    {accountId.length > 18
                      ? `${accountId.slice(0, 8)}...${accountId.slice(-6)}`
                      : accountId}
                  </span>
                  {connectedChains.length > 0 && (
                    <div className={`${c.chains} items-center gap-1`}>
                      {connectedChains.map((chain) => (
                        <span
                          key={chain}
                          className={`text-[9px] font-bold uppercase px-1 rounded ${CHAIN_COLORS[chain] || "bg-muted-foreground/30 text-secondary-foreground"}`}
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
                  aria-label="Connect another chain"
                  className="hidden @4xl:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-colors"
                >
                  <Plus size={11} />
                  <span className={c.chainLabel}>Chain</span>
                </button>

                <button
                  onClick={onDisconnect}
                  title="Disconnect wallet"
                  aria-label="Disconnect wallet"
                  className="flex items-center gap-1.5 p-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <LogOut size={13} aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                className="flex items-center gap-2 px-3 @4xl:px-4 py-2 rounded-xl whitespace-nowrap bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Wallet size={13} className="hidden @4xl:block text-primary" />
                )}
                <span className={c.connectShort}>Connect</span>
                <span className={c.connectLong}>Connect Wallet</span>
              </button>
            )}
          </div>
        </header>
      </div>

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
