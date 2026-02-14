"use client";

import { Wallet, RefreshCw, X, BarChart3 } from "lucide-react";

const TOKEN_LOGOS: Record<string, string> = {
  NEAR: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
  WNEAR: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  WETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  BTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  WBTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3717.png",
  USDC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
  USDT: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
  AURORA: "https://s2.coinmarketcap.com/static/img/coins/64x64/14803.png",
  HOT: "https://s2.coinmarketcap.com/static/img/coins/64x64/31557.png",
  SOL: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  DAI: "https://s2.coinmarketcap.com/static/img/coins/64x64/4943.png",
  SWEAT: "https://s2.coinmarketcap.com/static/img/coins/64x64/21351.png",
  ARB: "https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png",
  OP: "https://s2.coinmarketcap.com/static/img/coins/64x64/11840.png",
  AVAX: "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png",
  BNB: "https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png",
  LINK: "https://s2.coinmarketcap.com/static/img/coins/64x64/1975.png",
  AAVE: "https://s2.coinmarketcap.com/static/img/coins/64x64/7278.png",
  UNI: "https://s2.coinmarketcap.com/static/img/coins/64x64/7083.png",
};

type Props = {
  open: boolean;
  onClose: () => void;
  accountId: string | null;
  walletAddresses?: Record<string, string>;
  connectedChains?: string[];
  balances?: Record<string, string>;
  onReset: () => void;
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
};

const CHAIN_ICONS: Record<string, string> = {
  near: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
  eth: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  solana: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  btc: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  ton: "https://s2.coinmarketcap.com/static/img/coins/64x64/11419.png",
};

export default function ChatSidebar({
  open,
  onClose,
  accountId,
  walletAddresses = {},
  connectedChains = [],
  balances = {},
  onReset,
}: Props) {
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

        {/* Portfolio Section */}
        <div className="flex-1 overflow-y-auto px-3 pt-5">
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
                      {CHAIN_ICONS[chain] ? (
                        <img src={CHAIN_ICONS[chain]} alt={chain} width={16} height={16} className="rounded-full" crossOrigin="anonymous" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-primary/20 flex-shrink-0" />
                      )}
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

              {/* Token Balances */}
              {Object.keys(balances).length > 0 ? (
                <div className="rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[hsl(225,18%,14%)]/50">
                    <BarChart3 size={10} className="text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Balances</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(balances).map(([token, amount]) => (
                      <div key={token} className="flex items-center justify-between p-1.5 rounded-lg bg-card/30 hover:bg-card/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {TOKEN_LOGOS[token.toUpperCase()] ? (
                            <img
                              src={TOKEN_LOGOS[token.toUpperCase()]}
                              alt={token}
                              width={14}
                              height={14}
                              className="rounded-full flex-shrink-0"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex-shrink-0" />
                          )}
                          <span className="text-[11px] font-medium uppercase text-muted-foreground">{token}</span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-foreground">{amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[10px] text-muted-foreground">Loading balances...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[hsl(225,18%,14%)]">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Powered by NEAR Protocol & HOT
          </p>
        </div>
      </aside>
    </>
  );
}
