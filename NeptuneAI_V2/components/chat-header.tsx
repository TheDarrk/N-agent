"use client";

import { Wallet, Menu, X, Flame, Loader2 } from "lucide-react";

type Props = {
  accountId: string | null;
  connectedChains: string[];
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
};

// Chain badge colors
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
}: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-[hsl(225,18%,14%)] bg-card/40 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors md:hidden"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <div className="flex items-center gap-2.5">
          <img
            src="/neptune-logo.png"
            alt="Neptune AI"
            width={44}
            height={44}
            className="rounded-lg"
          />
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold tracking-tight text-foreground">Neptune</span>
              <span className="text-sm font-bold tracking-tight text-primary">AI</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-none">Swaps · Payments · Multi-chain</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {accountId ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/80 border border-[hsl(225,18%,14%)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-glow" />
              <Flame size={12} className="text-orange-400" />
              <span className="text-xs font-mono text-foreground">
                {accountId.length > 18
                  ? `${accountId.slice(0, 8)}...${accountId.slice(-6)}`
                  : accountId}
              </span>
              {/* Chain badges */}
              {connectedChains.length > 0 && (
                <div className="flex items-center gap-1 ml-1">
                  {connectedChains.map((chain) => (
                    <span
                      key={chain}
                      className={`text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md ${CHAIN_COLORS[chain] || "bg-gray-500/20 text-gray-400"}`}
                    >
                      {chain}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onConnect}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            >
              + Add Wallet
            </button>
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[hsl(225,18%,14%)] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-primary/20"
          >
            {isConnecting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wallet size={14} />
            )}
            <span className="hidden sm:inline">Connect Wallet</span>
            <span className="sm:hidden">Connect</span>
          </button>
        )}
      </div>
    </header>
  );
}
