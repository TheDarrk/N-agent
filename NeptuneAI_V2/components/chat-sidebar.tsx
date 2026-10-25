"use client";

import { useState } from "react";
import { Wallet, RefreshCw, X, BarChart3, Key, Cpu, ShieldCheck, Plus, Maximize2, History } from "lucide-react";
import FullScreenHistoryModal from "./fullscreen-history-modal";
import AgentWalletManagerModal from "./agent-wallet-manager-modal";
import SidebarAgentFeed from "./sidebar-agent-feed";
import SidebarFleetBar from "./sidebar-fleet-bar";
import { getTokenLogoUrl, TOKEN_LOGOS } from "@/lib/near/token-logos";

type Props = {
  open: boolean;
  onClose: () => void;
  accountId: string | null;
  walletAddresses?: Record<string, string>;
  connectedChains?: string[];
  balances?: Record<string, string>;
  onReset: () => void;
  onConnectWallet?: () => void;
  onOpenFleetModal?: () => void;
  onOpenAgentSuite?: () => void;
  onSelectAgent?: (agentId: string) => void;
};

const CHAIN_LABELS: Record<string, string> = {
  near: "NEAR",
  eth: "Ethereum",
  solana: "Solana",
  ton: "TON",
  tron: "TRON",
  cosmos: "Cosmos",
  stellar: "Stellar",
  btc: "Bitcoin",
  arb: "Arbitrum",
  base: "Base",
  op: "Optimism",
};

const CHAIN_ICONS: Record<string, string> = {
  near: TOKEN_LOGOS.NEAR || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/near/info/logo.png",
  eth: TOKEN_LOGOS.ETH || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/info/logo.png",
  solana: TOKEN_LOGOS.SOL || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/solana/info/logo.png",
  btc: TOKEN_LOGOS.BTC || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png",
  ton: TOKEN_LOGOS.TON || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ton/info/logo.png",
  arb: TOKEN_LOGOS.ARB || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/arbitrum/info/logo.png",
  base: TOKEN_LOGOS.BASE || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/base/info/logo.png",
  op: TOKEN_LOGOS.OP || "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/optimism/info/logo.png",
};


const TOKEN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEAR: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  WNEAR: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  USDT: { bg: "bg-teal-500/20", text: "text-teal-400", border: "border-teal-500/30" },
  USDC: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  BTC: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  WBTC: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  ETH: { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30" },
  WETH: { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30" },
  SOL: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
  TON: { bg: "bg-sky-500/20", text: "text-sky-400", border: "border-sky-500/30" },
};

function TokenIconItem({ symbol, logoUrl, size = 16 }: { symbol: string; logoUrl?: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const cleanSymbol = symbol.replace(/^(?:\[.*?\]\s*)?/, "").toUpperCase();
  const theme = TOKEN_COLORS[cleanSymbol] || { bg: "bg-primary/20", text: "text-primary", border: "border-primary/30" };
  const effectiveUrl = logoUrl || getTokenLogoUrl(cleanSymbol);

  if (effectiveUrl && !imgError) {
    return (
      <img
        src={effectiveUrl}
        alt={symbol}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="rounded-full flex-shrink-0 object-cover"
      />
    );
  }

  return (
    <span
      className={`rounded-full border flex items-center justify-center font-bold flex-shrink-0 ${theme.bg} ${theme.text} ${theme.border}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.55)) }}
    >
      {cleanSymbol.slice(0, 1) || "•"}
    </span>
  );
}

export default function ChatSidebar({
  open,
  onClose,
  accountId,
  walletAddresses = {},
  connectedChains = [],
  balances = {},
  onReset,
  onConnectWallet = () => {},
  onOpenFleetModal = () => {},
  onOpenAgentSuite = () => {},
  onSelectAgent,
}: Props) {
    const [isAgentWalletModalOpen, setIsAgentWalletModalOpen] = useState(false);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);
  const chains = connectedChains.length > 0 ? connectedChains : (accountId ? ["near"] : []);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-[hsl(225,18%,14%)] bg-[hsl(225,28%,5%)] transition-transform duration-200 ease-out md:relative md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[hsl(225,18%,14%)]">
          <div className="flex items-center gap-2.5">
            <img
              src="/neptune-logo.png"
              alt="Neptune AI"
              width={36}
              height={36}
              className="rounded-md"
            />
            <span className="text-sm font-bold tracking-tight text-foreground">Neptune AI</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pt-3">
          <button
            onClick={() => {
              onReset();
              onClose();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium border border-dashed border-[hsl(225,18%,14%)] text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
          >
            <RefreshCw size={14} />
            New Conversation
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3 pt-5">
          {/* Portfolio Section */}
          <div className="flex items-center gap-1.5 px-2 mb-3">
            <BarChart3 size={12} className="text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Portfolio
            </span>
          </div>

          {!accountId ? (
            <div className="mx-1 mt-2 rounded-xl border border-dashed border-[hsl(225,18%,14%)] bg-secondary/30 p-8 text-center">
              <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <Wallet size={18} className="text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect your wallet to
                <br />
                view token balances
              </p>
            </div>
          ) : (
            <div className="mx-1 mt-2 space-y-3">
              {/* Connected Wallets */}
              {chains.map((chain) => {
                const addr = walletAddresses[chain] || accountId;
                return (
                  <div key={chain} className="rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[hsl(225,18%,14%)]/50">
                      <TokenIconItem symbol={chain} logoUrl={CHAIN_ICONS[chain]} size={16} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        {CHAIN_LABELS[chain] || chain.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate mb-2" title={addr}>
                      {addr}
                    </p>
                  </div>
                );
              })}

              {/* Multi-Chain Wallet Connect Action */}
              <button
                onClick={onConnectWallet}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-semibold transition-all shadow-sm"
              >
                <Plus size={12} />
                <span>+ Connect Another Chain (ETH, ARB, SOL...)</span>
              </button>

              {/* Token Balances */}
              {Object.keys(balances).length > 0 ? (
                <div className="rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[hsl(225,18%,14%)]/50">
                    <BarChart3 size={10} className="text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Balances</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(balances).map(([tokenKey, amount]) => {
                      const match = tokenKey.match(/^(?:\[.*?\]\s*)?(.+)$/);
                      const symbol = match ? match[1] : tokenKey;
                      const logoUrl = TOKEN_LOGOS[symbol.toUpperCase()];
                      return (
                        <div key={tokenKey} className="flex items-center justify-between p-1.5 rounded-lg bg-card/30 hover:bg-card/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <TokenIconItem symbol={symbol} logoUrl={logoUrl} size={15} />
                            <span className="text-[11px] font-medium uppercase text-muted-foreground">{tokenKey}</span>
                          </div>
                          <span className="text-[11px] font-mono font-semibold text-foreground">{amount}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[10px] text-muted-foreground">Loading balances...</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ Agent Execution Wallets Section (Track 7: Give AI a Wallet) ═══ */}
          <div className="mx-1 mt-4 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-[hsl(225,18%,14%)]/50">
              <div className="flex items-center gap-1.5">
                <Key size={11} className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Agent Wallets
                </span>
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                MAX 4
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed mb-2.5">
              Autonomous execution keys for Trader, Rebalancer &amp; Research agents.
            </p>
            <button
              onClick={() => setIsAgentWalletModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary text-xs font-semibold transition-all active:scale-95"
            >
              <Key size={12} />
              <span>Manage Agent Wallets</span>
            </button>
          </div>

          {/* ═══ Autonomous Agent Fleet Bar ═══ */}
          <SidebarFleetBar
            accountId={accountId}
            onConnectWallet={onConnectWallet}
            onOpenFleetModal={onOpenFleetModal}
            onOpenAgentSuite={onOpenAgentSuite}
            onSelectAgent={onSelectAgent}
          />

          {/* ═══ Full Screen Fleet History Button ═══ */}
          <div className="mx-1 mt-3">
            <button
              onClick={() => setIsFullScreenHistoryOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/60 hover:bg-secondary border border-[hsl(225,18%,15%)] hover:border-primary/40 text-xs font-semibold text-foreground transition-all group active:scale-95 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <History size={13} className="text-primary group-hover:rotate-12 transition-transform" />
                <span>Full Screen Fleet History</span>
              </div>
              <Maximize2 size={11} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </div>

          {/* ═══ 4-Agent Suite Decision History ═══ */}
          <SidebarAgentFeed
            accountId={accountId}
            onOpenAgentSuite={onOpenAgentSuite}
            onSelectAgent={onSelectAgent}
            onOpenFullScreenHistory={() => setIsFullScreenHistoryOpen(true)}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[hsl(225,18%,14%)]">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Powered by NEAR Protocol & HOT
          </p>
        </div>
            </aside>
      <AgentWalletManagerModal
        isOpen={isAgentWalletModalOpen}
        onClose={() => setIsAgentWalletModalOpen(false)}
        accountId={accountId}
        onConnectWallet={onConnectWallet}
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
