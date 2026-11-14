"use client";

import { useState } from "react";
import {
  Wallet,
  X,
  Key,
  Cpu,
  Plus,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import FullScreenHistoryModal from "./fullscreen-history-modal";
import AgentWalletManagerModal from "./agent-wallet-manager-modal";
import SidebarChatHistory, { type ChatSelection } from "./sidebar-chat-history";
import SidebarFleetBar from "./sidebar-fleet-bar";
import SidebarEmailSettings from "./sidebar-email-settings";
import { getTokenLogoUrl, TOKEN_LOGOS } from "@/lib/near/token-logos";

type Props = {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  accountId: string | null;
  walletAddresses?: Record<string, string>;
  connectedChains?: string[];
  balances?: Record<string, string>;
  onReset: () => void;
  onConnectWallet?: () => void;
  onOpenFleetModal?: () => void;
  onOpenAgentSuite?: () => void;
  onSelectAgent?: (agentId: string) => void;
  onSelectChat?: (chat: ChatSelection) => void;
};

type TabId = "chat" | "wallet" | "fleet";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "fleet", label: "Fleet Status", icon: Cpu },
];

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

function shortAddress(addr: string) {
  return addr.length > 22 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

function TokenIconItem({ symbol, logoUrl, size = 16 }: { symbol: string; logoUrl?: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const cleanSymbol = symbol.replace(/^(?:\[.*?\]\s*)?/, "").toUpperCase();
  const theme = TOKEN_COLORS[cleanSymbol] || { bg: "bg-primary/20", text: "text-primary", border: "border-primary/30" };
  const effectiveUrl = logoUrl || getTokenLogoUrl(cleanSymbol);

  if (effectiveUrl && !imgError) {
    return (
      <img
        src={effectiveUrl}
        alt=""
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
      aria-hidden="true"
      className={`rounded-full border flex items-center justify-center font-bold flex-shrink-0 ${theme.bg} ${theme.text} ${theme.border}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.55)) }}
    >
      {cleanSymbol.slice(0, 1) || "•"}
    </span>
  );
}

function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {aside}
    </div>
  );
}

function WalletPanel({
  accountId,
  chains,
  walletAddresses,
  balances,
  onConnectWallet,
  onManageAgentWallets,
}: {
  accountId: string | null;
  chains: string[];
  walletAddresses: Record<string, string>;
  balances: Record<string, string>;
  onConnectWallet: () => void;
  onManageAgentWallets: () => void;
}) {
  const balanceEntries = Object.entries(balances);

  return (
    <div className="flex flex-col gap-5">
      {/* Connected wallets */}
      <section>
        <SectionLabel
          aside={
            accountId ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                {chains.length} {chains.length === 1 ? "chain" : "chains"}
              </span>
            ) : null
          }
        >
          Connected wallets
        </SectionLabel>

        {!accountId ? (
          <div className="rounded-xl border border-border bg-card/50 p-5 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <Wallet size={18} className="text-muted-foreground" />
            </div>
            <p className="text-[13px] font-medium text-foreground">No wallet connected</p>
            <p className="mt-1 mb-4 text-xs leading-relaxed text-muted-foreground">
              Connect a wallet to view balances and deploy agents.
            </p>
            <button
              onClick={onConnectWallet}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Wallet size={14} />
              Connect wallet
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card/50">
            <ul className="divide-y divide-border">
              {chains.map((chain) => {
                const addr = walletAddresses[chain] || accountId;
                return (
                  <li key={chain} className="flex items-center gap-3 px-3 py-2.5">
                    <TokenIconItem symbol={chain} logoUrl={CHAIN_ICONS[chain]} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight text-foreground">
                        {CHAIN_LABELS[chain] || chain.toUpperCase()}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground" title={addr}>
                        {shortAddress(addr)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={onConnectWallet}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
            >
              <Plus size={13} />
              Add another chain
            </button>
          </div>
        )}
      </section>

      {/* Balances */}
      {accountId && (
        <section>
          <SectionLabel
            aside={
              balanceEntries.length > 0 ? (
                <span className="text-[11px] font-medium text-muted-foreground">{balanceEntries.length} assets</span>
              ) : null
            }
          >
            Balances
          </SectionLabel>
          {balanceEntries.length > 0 ? (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card/50">
              {balanceEntries.map(([tokenKey, amount]) => {
                const match = tokenKey.match(/^(?:\[(.*?)\]\s*)?(.+)$/);
                const network = match?.[1];
                const symbol = match?.[2] ?? tokenKey;
                const logoUrl = TOKEN_LOGOS[symbol.toUpperCase()];
                return (
                  <li key={tokenKey} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TokenIconItem symbol={symbol} logoUrl={logoUrl} size={20} />
                      <span className="truncate text-[13px] font-medium text-foreground">{symbol}</span>
                      {network && (
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {network}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[13px] font-semibold text-foreground">{amount}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-border bg-card/50 px-3 py-4 text-center text-xs text-muted-foreground">
              Loading balances…
            </div>
          )}
        </section>
      )}

      {/* Agent execution wallets */}
      <section>
        <SectionLabel>Agent wallets</SectionLabel>
        <button
          onClick={onManageAgentWallets}
          className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card/50 px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Key size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-foreground">Agent wallets</span>
              <span className="shrink-0 whitespace-nowrap rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Max 4
              </span>
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              Execution keys for your agents. Tap to manage.
            </span>
          </span>
          <ChevronRight
            size={15}
            className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </button>
      </section>

      {/* Email Alert Notifications */}
      <section>
        <SidebarEmailSettings accountId={accountId} />
      </section>
    </div>
  );
}

export default function ChatSidebar({
  open,
  onClose,
  collapsed = false,
  onToggleCollapse,
  accountId,
  walletAddresses = {},
  connectedChains = [],
  balances = {},
  onReset,
  onConnectWallet = () => {},
  onOpenFleetModal = () => {},
  onOpenAgentSuite = () => {},
  onSelectAgent,
  onSelectChat,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [isAgentWalletModalOpen, setIsAgentWalletModalOpen] = useState(false);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);
  const chains = connectedChains.length > 0 ? connectedChains : accountId ? ["near"] : [];

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/65 lg:hidden" onClick={onClose} />}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          aria-expanded={!collapsed}
          style={{ left: collapsed ? 0 : 300 }}
          className="fixed top-1/2 z-[60] hidden h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-primary/50 bg-card text-primary shadow-[0_0_14px_hsl(var(--primary)/0.45)] transition-[left,color,background-color,box-shadow] duration-200 ease-out hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_20px_hsl(var(--primary)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex"
        >
          <ChevronLeft
            size={16}
            className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col border-r border-border bg-sidebar-background transition-[transform,margin-left,visibility] duration-200 ease-out lg:relative lg:w-[300px] lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:invisible lg:-ml-[300px]" : "lg:visible lg:ml-0"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/neptune-logo.png" alt="" width={32} height={32} className="rounded-md" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight tracking-tight text-foreground">Neptune AI</p>
              <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">
                {accountId ? shortAddress(accountId) : "Not connected"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* New conversation */}
        <div className="px-3 pt-3">
          <button
            onClick={() => {
              onReset();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <Plus size={14} />
            New conversation
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Sidebar sections"
          className="mx-3 mt-3 grid grid-cols-3 gap-1 rounded-lg bg-secondary/60 p-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                id={`sidebar-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls={`sidebar-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={13} className={`shrink-0 ${selected ? "text-primary" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        <div
          id={`sidebar-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`sidebar-tab-${activeTab}`}
          className="min-h-0 flex-1 px-3 pt-4 overflow-y-auto pb-4"
        >
          {activeTab === "chat" && (
            <SidebarChatHistory
              accountId={accountId}
              onConnectWallet={onConnectWallet}
              onSelectChat={(chat) => {
                onSelectChat?.(chat);
                onClose();
              }}
            />
          )}

          {activeTab === "wallet" && (
            <WalletPanel
              accountId={accountId}
              chains={chains}
              walletAddresses={walletAddresses}
              balances={balances}
              onConnectWallet={onConnectWallet}
              onManageAgentWallets={() => setIsAgentWalletModalOpen(true)}
            />
          )}

          {activeTab === "fleet" && (
            <SidebarFleetBar
              accountId={accountId}
              onConnectWallet={onConnectWallet}
              onOpenFleetModal={onOpenFleetModal}
              onOpenAgentSuite={onOpenAgentSuite}
              onSelectAgent={onSelectAgent}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-center text-[11px] text-muted-foreground/70">Powered by NEAR</p>
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
