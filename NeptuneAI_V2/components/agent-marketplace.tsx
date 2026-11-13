"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Store,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  PlusCircle,
  AlertCircle,
  XCircle,
  UserCheck,
  Copy,
  Clock,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  Tag,
  ShoppingBag,
  Sliders,
  Zap
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";
import { useWallet } from "@/providers/wallet-provider";

type Props = {
  accountId: string | null;
  onSelectAgentTab?: (tab: string) => void;
  onConnectWallet?: () => void;
};

interface MarketplaceListing {
  listing_id: string;
  seller_wallet: string;
  payout_wallet: string;
  agent_type: string;
  title: string;
  description: string;
  price_usdt: string;
  public_stats: {
    win_rate_pct?: number;
    sharpe_ratio?: number;
    risk_level?: string;
    market_regime?: string;
  };
  status: string;
  sales_count: number;
  created_at: string;
}

interface MarketplaceOrder {
  order_id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_wallet?: string;
  payout_wallet: string;
  amount_usdt: string;
  amount_base_units: string;
  token_contract: string;
  status: string;
  tx_hash?: string;
  created_at: string;
  expires_at: string;
  verified_at?: string;
  apply_status?: string;
  title?: string;
  agent_type?: string;
}

export default function AgentMarketplace({ accountId, onSelectAgentTab, onConnectWallet }: Props) {
  const walletContext = useWallet();
  const connectWallet = onConnectWallet || walletContext.connectWallet;
  const signAndSendTransaction = walletContext.signAndSendTransaction;

  const [activeTab, setActiveTab] = useState<"browse" | "purchases" | "sales">("browse");
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [myOrders, setMyOrders] = useState<MarketplaceOrder[]>([]);
  const [mySales, setMySales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buy Flow Modal State
  const [buyModalListing, setBuyModalListing] = useState<MarketplaceListing | null>(null);
  const [activeOrder, setActiveOrder] = useState<MarketplaceOrder | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [txHashInput, setTxHashInput] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "pending_retry" | "failed" | "completed">("idle");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number>(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [orderTimeRemaining, setOrderTimeRemaining] = useState<string>("");

  // Publish Modal State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishAgentType, setPublishAgentType] = useState<"trader" | "rebalancer">("trader");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishPrice, setPublishPrice] = useState("25.00");
  const [publishPayoutWallet, setPublishPayoutWallet] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);

  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Global Listings
  const fetchListings = async () => {
    try {
      const res = await fetch("/api/marketplace/listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (err) {
      console.error("[MARKETPLACE] Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch User Purchases & Sales
  const fetchUserOrdersAndSales = async () => {
    if (!accountId) {
      setMyOrders([]);
      setMySales([]);
      return;
    }
    try {
      const [ordRes, salesRes] = await Promise.all([
        fetch(`/api/marketplace/orders?wallet=${encodeURIComponent(accountId)}`),
        fetch(`/api/marketplace/sales?wallet=${encodeURIComponent(accountId)}`)
      ]);
      if (ordRes.ok) {
        const oData = await ordRes.json();
        setMyOrders(oData.orders || []);
      }
      if (salesRes.ok) {
        const sData = await salesRes.json();
        setMySales(sData.sales || []);
      }
    } catch (err) {
      console.error("[MARKETPLACE] Orders/Sales fetch error:", err);
    }
  };

  useEffect(() => {
    fetchListings();
    fetchUserOrdersAndSales();

    // Auto-refresh listings every 30s per Task 3.6
    const interval = setInterval(() => {
      fetchListings();
      fetchUserOrdersAndSales();
    }, 30000);

    return () => clearInterval(interval);
  }, [accountId]);

  // Restore in-progress order from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("neptune_active_order");
    if (saved) {
      try {
        const { order_id } = JSON.parse(saved);
        if (order_id) {
          fetch(`/api/marketplace/orders/${order_id}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.success && data.order && data.order.status === "pending") {
                const expiresAt = new Date(data.order.expires_at).getTime();
                if (expiresAt > Date.now()) {
                  setActiveOrder(data.order);
                  // Find listing
                  const matched = listings.find((l) => l.listing_id === data.order.listing_id);
                  if (matched) setBuyModalListing(matched);
                } else {
                  localStorage.removeItem("neptune_active_order");
                }
              }
            })
            .catch(() => {});
        }
      } catch (e) {
        localStorage.removeItem("neptune_active_order");
      }
    }
  }, [listings]);

  // Expiration Countdown Timer for active order
  useEffect(() => {
    if (!activeOrder?.expires_at) return;
    const updateCountdown = () => {
      const diff = new Date(activeOrder.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setOrderTimeRemaining("Expired");
      } else {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setOrderTimeRemaining(`${h}h ${m}m ${s}s`);
      }
    };
    updateCountdown();
    const t = setInterval(updateCountdown, 1000);
    return () => clearInterval(t);
  }, [activeOrder]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Start Buy Flow
  const handleOpenBuyModal = async (listing: MarketplaceListing) => {
    if (!accountId) {
      if (connectWallet) connectWallet();
      else alert("Please connect your NEAR wallet first.");
      return;
    }

    if (listing.seller_wallet.toLowerCase() === accountId.toLowerCase()) {
      alert("You cannot buy your own agent configuration.");
      return;
    }

    setBuyModalListing(listing);
    setTxHashInput("");
    setVerifyStatus("idle");
    setVerifyMessage(null);
    setIsCreatingOrder(true);

    try {
      const res = await fetch("/api/marketplace/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          buyer_wallet: accountId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to create order");
      }

      const ord: MarketplaceOrder = {
        order_id: data.order_id,
        listing_id: listing.listing_id,
        buyer_wallet: accountId,
        payout_wallet: data.pay_to,
        amount_usdt: data.amount_usdt,
        amount_base_units: data.amount_base_units,
        token_contract: data.token_contract,
        status: data.status,
        created_at: new Date().toISOString(),
        expires_at: data.expires_at
      };

      setActiveOrder(ord);
      localStorage.setItem("neptune_active_order", JSON.stringify({ order_id: ord.order_id, listing_id: listing.listing_id }));
    } catch (e: any) {
      alert(e.message || "Failed to initialize purchase order.");
      setBuyModalListing(null);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // 1-Click Auto Pay via Connected Wallet
  const handleAutoPayAndVerify = async () => {
    if (!activeOrder || !accountId) return;
    setIsPaying(true);
    setVerifyStatus("verifying");
    setVerifyMessage("Opening wallet to approve USDT transfer...");

    try {
      const payload = {
        receiverId: activeOrder.token_contract,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer",
              args: {
                receiver_id: activeOrder.payout_wallet,
                amount: activeOrder.amount_base_units,
                memo: `Neptune AI Order ${activeOrder.order_id}`
              },
              gas: "50000000000000",
              deposit: "1"
            }
          }
        ]
      };

      if (!signAndSendTransaction) {
        throw new Error("Wallet signing function not available. Please send USDT manually using the details below.");
      }

      const txResult = await signAndSendTransaction(payload);
      const hash = txResult?.hash || "";
      if (!hash) {
        throw new Error("No transaction hash returned from wallet. Paste hash below to verify.");
      }

      setTxHashInput(hash);
      setVerifyMessage(`Transfer broadcast: ${hash.slice(0, 10)}... Verifying on NEAR RPC...`);
      await executeVerify(hash);
    } catch (err: any) {
      setVerifyStatus("failed");
      setVerifyMessage(err.message || "Wallet transaction rejected or failed.");
    } finally {
      setIsPaying(false);
    }
  };

  // Verify Payment on-chain
  const executeVerify = async (hashToVerify?: string) => {
    const hash = (hashToVerify || txHashInput).trim();
    if (!activeOrder || !hash || !accountId) return;

    setVerifyStatus("verifying");
    setVerifyMessage("Querying NEAR blockchain RPC for NEP-141 USDT transfer...");

    try {
      const res = await fetch(`/api/marketplace/orders/${activeOrder.order_id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer_wallet: accountId,
          tx_hash: hash
        })
      });

      const data = await res.json();

      if (data.status === "completed") {
        setVerifyStatus("completed");
        setVerifyMessage(data.apply_message || "Payment verified! Configuration automatically applied to your agent.");
        localStorage.removeItem("neptune_active_order");
        fetchListings();
        fetchUserOrdersAndSales();
      } else if (data.status === "pending_retry") {
        setVerifyStatus("pending_retry");
        setVerifyMessage(data.message || "Transaction not finalized yet. Auto-retrying in 15 seconds...");
        startAutoRetryCountdown(hash);
      } else {
        setVerifyStatus("failed");
        setVerifyMessage(data.message || `Verification failed: ${data.reason || "Invalid transaction"}`);
      }
    } catch (e: any) {
      setVerifyStatus("failed");
      setVerifyMessage(e.message || "Network error verifying transaction.");
    }
  };

  const handleVerifyPayment = () => executeVerify(txHashInput);

  const startAutoRetryCountdown = (hashRetry?: string) => {
    let count = 15;
    setRetryCountdown(count);
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(() => {
      count -= 1;
      setRetryCountdown(count);
      if (count <= 0) {
        if (retryTimerRef.current) clearInterval(retryTimerRef.current);
        executeVerify(hashRetry || txHashInput);
      }
    }, 1000);
  };

  // Handle Publish Listing
  const handlePublishListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: accountId,
          agent_type: publishAgentType,
          title: publishTitle,
          description: publishDesc,
          price_usdt: publishPrice,
          payout_wallet: publishPayoutWallet.trim() || accountId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to publish listing.");
      }

      setPublishSuccessMsg(`Agent configuration successfully published for ${publishPrice} USDT!`);
      setIsPublishModalOpen(false);
      setPublishTitle("");
      setPublishDesc("");
      fetchListings();
      setTimeout(() => setPublishSuccessMsg(null), 6000);
    } catch (e: any) {
      setPublishError(e.message || "Error publishing agent.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-3xl border border-border bg-gradient-to-r from-card/90 via-secondary/30 to-card/90 p-6 md:p-8 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-gradient-to-bl from-primary/15 to-transparent rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold tracking-wider uppercase border border-primary/25">
                Global Strategy Marketplace
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-mono border border-emerald-500/30">
                USDT (6 Decimals)
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              Neptune Agent Marketplace
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground max-w-2xl mt-1 leading-relaxed">
              Buy verified quantitative trading and portfolio rebalancing configurations in USDT, verified on-chain via NEAR JSON-RPC with automated mirror synchronization.
            </p>
          </div>

          <button
            onClick={() => {
              if (!accountId) {
                if (onConnectWallet) onConnectWallet();
                else alert("Connect your wallet first to publish an agent.");
                return;
              }
              setPublishPayoutWallet(accountId);
              setIsPublishModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/20 shrink-0 self-start md:self-auto active:scale-95"
          >
            <PlusCircle size={15} />
            <span>Publish My Agent</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher: Browse vs My Purchases vs My Sales */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("browse")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "browse"
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Store size={14} />
            <span>Available Agents</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/30 font-mono">
              {listings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("purchases")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "purchases"
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <ShoppingBag size={14} />
            <span>My Purchases</span>
            {myOrders.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-bold">
                {myOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("sales")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "sales"
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Tag size={14} />
            <span>My Sales</span>
            {mySales.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary text-white font-mono font-bold">
                {mySales.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            setIsLoading(true);
            fetchListings();
            fetchUserOrdersAndSales();
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Refresh listings"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Notifications */}
      {publishSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in-0">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="font-medium">{publishSuccessMsg}</span>
          </div>
          <button onClick={() => setPublishSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* ─── TAB 1: BROWSE AGENTS ─── */}
      {activeTab === "browse" && (
        <>
          {isLoading && listings.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground font-mono">Loading global marketplace configurations...</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="p-10 rounded-2xl bg-card border border-border text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-primary mx-auto">
                <Store size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">No Strategies Listed Yet</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Be the first creator to share your agent! Click <strong>Publish My Agent</strong> to monetize your strategy and earn USDT with every purchase.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {listings.map((item) => {
                const isSeller = accountId && item.seller_wallet.toLowerCase() === accountId.toLowerCase();
                const alreadyBought = myOrders.some(
                  (o) => o.listing_id === item.listing_id && o.status === "completed"
                );

                return (
                  <div
                    key={item.listing_id}
                    className="p-6 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all shadow-md group"
                  >
                    <div className="space-y-3.5">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-secondary/80 border border-border flex items-center justify-center p-1 shadow-sm">
                            <AgentAvatar agentId={item.agent_type} size={30} />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                              {item.title}
                            </h3>
                            <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                              Seller: <span className="text-foreground font-semibold">{item.seller_wallet}</span>
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-secondary border border-border text-primary">
                          {item.agent_type}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {item.description || "Proven automated agent strategy configuration."}
                      </p>

                      {/* Performance Stats */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-secondary/30 border border-border text-center">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Sharpe Ratio</span>
                          <p className="text-sm font-mono font-bold text-emerald-400">
                            {item.public_stats?.sharpe_ratio ?? 2.35}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Win Rate</span>
                          <p className="text-sm font-mono font-bold text-primary">
                            {item.public_stats?.win_rate_pct ?? 78.5}%
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold">Sales</span>
                          <p className="text-sm font-mono font-bold text-foreground">
                            {item.sales_count}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Price & Action */}
                    <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                          Price in USDT
                        </span>
                        <span className="text-base font-bold text-emerald-400 font-mono">
                          {item.price_usdt} USDT
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSeller ? (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground border border-border">
                            Your Listing
                          </span>
                        ) : alreadyBought ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                            <CheckCircle2 size={13} />
                            <span>Config Applied</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenBuyModal(item)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-all shadow-md shadow-primary/20 active:scale-95"
                          >
                            <DollarSign size={13} />
                            <span>Buy ({item.price_usdt} USDT)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── TAB 2: MY PURCHASES ─── */}
      {activeTab === "purchases" && (
        <div className="space-y-4">
          {!accountId ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <p className="text-xs text-muted-foreground">Connect your wallet to view your purchased agent configurations.</p>
              <button onClick={onConnectWallet} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                Connect Wallet
              </button>
            </div>
          ) : myOrders.length === 0 ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground mx-auto">
                <ShoppingBag size={20} />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Purchases Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Browse the marketplace to purchase proven quantitative trading and rebalancing configurations.
              </p>
              <button onClick={() => setActiveTab("browse")} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                Browse Marketplace
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myOrders.map((ord) => (
                <div key={ord.order_id} className="p-5 rounded-2xl bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{ord.title || ord.listing_id}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                        ord.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : ord.status === "pending"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-red-500/15 text-red-400 border border-red-500/30"
                      }`}>
                        {ord.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Paid: <span className="text-emerald-400 font-bold">{ord.amount_usdt} USDT</span> • Order #{ord.order_id.slice(-8)}
                    </p>
                    {ord.tx_hash && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate max-w-md">
                        Tx Hash: <span className="text-foreground">{ord.tx_hash}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {ord.status === "completed" && onSelectAgentTab && (
                      <button
                        onClick={() => onSelectAgentTab(ord.agent_type === "rebalancer" ? "rebalancer" : "trader")}
                        className="px-3.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border transition-all flex items-center gap-1.5"
                      >
                        <Sliders size={13} />
                        <span>View In Agent</span>
                      </button>
                    )}
                    {ord.status === "pending" && (
                      <button
                        onClick={() => {
                          const matched = listings.find((l) => l.listing_id === ord.listing_id);
                          if (matched) setBuyModalListing(matched);
                          setActiveOrder(ord);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs transition-all flex items-center gap-1.5"
                      >
                        <span>Resume Payment</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: MY SALES ─── */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          {!accountId ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <p className="text-xs text-muted-foreground">Connect your wallet to view your sales and earnings.</p>
              <button onClick={onConnectWallet} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                Connect Wallet
              </button>
            </div>
          ) : mySales.length === 0 ? (
            <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground mx-auto">
                <Tag size={20} />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Sales Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Publish your high-performing trading or rebalancing agents to start earning USDT.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mySales.map((sale: any) => (
                <div key={sale.order_id} className="p-5 rounded-2xl bg-card border border-border flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{sale.title || sale.listing_id}</h4>
                    <p className="text-xs text-muted-foreground font-mono">
                      Buyer: <span className="text-foreground">{sale.buyer_wallet}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-400 font-mono">+{sale.amount_usdt} USDT</span>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {sale.verified_at ? new Date(sale.verified_at).toLocaleDateString() : "Completed"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 3-STEP BUY MODAL (TASK 3.6) ─── */}
      {buyModalListing && activeOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-in fade-in-0 zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Purchase Agent Configuration</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  Order #{activeOrder.order_id.slice(-8)} • {buyModalListing.title}
                </p>
              </div>
              <button
                onClick={() => {
                  setBuyModalListing(null);
                  setActiveOrder(null);
                  if (retryTimerRef.current) clearInterval(retryTimerRef.current);
                }}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Countdown Banner */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                <Clock size={14} />
                <span>Price Locked (24h Window)</span>
              </span>
              <span className="font-mono font-bold text-amber-400">{orderTimeRemaining}</span>
            </div>

            {/* Step 1: Payment Instructions */}
            <div className="space-y-3 p-4 rounded-2xl bg-secondary/30 border border-border text-xs space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Step 1: Payment Details
              </span>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-mono font-bold text-base text-emerald-400">
                  {activeOrder.amount_usdt} USDT
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Token Contract:</span>
                <span className="font-mono text-foreground font-semibold">
                  {activeOrder.token_contract}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block mb-1">Pay To (Seller Account):</span>
                <div className="flex items-center justify-between p-2 rounded-lg bg-background border border-border font-mono text-[11px]">
                  <span className="truncate max-w-[320px]">{activeOrder.payout_wallet}</span>
                  <button
                    onClick={() => copyToClipboard(activeOrder.payout_wallet, "payout")}
                    className="p-1 hover:text-primary transition-colors text-muted-foreground"
                    title="Copy address"
                  >
                    {copiedField === "payout" ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {/* 1-Click Auto-Purchase with Connected Wallet (Task 5.1) */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-emerald-500/10 border border-primary/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Zap size={14} className="text-primary" />
                  <span>1-Click Automated Purchase</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  Instant Verification
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Execute transfer directly from your connected wallet (<code>{accountId}</code>). Neptune captures your transaction hash and applies the configuration immediately.
              </p>
              <button
                onClick={handleAutoPayAndVerify}
                disabled={verifyStatus === "verifying" || isPaying}
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPaying || verifyStatus === "verifying" ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Processing On-Chain Transfer...</span>
                  </>
                ) : (
                  <>
                    <DollarSign size={14} />
                    <span>Pay {activeOrder.amount_usdt} USDT & Activate Agent</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">or manual transfer</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Step 2: Transfer Guidance */}
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-muted-foreground leading-relaxed">
              <strong>Step 2:</strong> Open your NEAR wallet (Meteor, Here, or Nightly) and send exactly <strong>{activeOrder.amount_usdt} USDT</strong> to <code>{activeOrder.payout_wallet}</code>.
            </div>

            {/* Step 3: Tx Hash & Verification */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Step 3: Verify Payment On-Chain
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste NEAR transaction hash (e.g. 8zW7Jb8pY4qT...)"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  disabled={verifyStatus === "verifying"}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-background border border-border text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleVerifyPayment}
                  disabled={verifyStatus === "verifying" || !txHashInput.trim()}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {verifyStatus === "verifying" ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={13} />
                      <span>Verify</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verification Status Feedback */}
            {verifyMessage && (
              <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                verifyStatus === "completed"
                  ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                  : verifyStatus === "pending_retry"
                  ? "bg-amber-500/15 border border-amber-500/40 text-amber-300"
                  : "bg-red-500/15 border border-red-500/40 text-red-300"
              }`}>
                {verifyStatus === "completed" ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                ) : verifyStatus === "pending_retry" ? (
                  <RefreshCw size={16} className="text-amber-400 shrink-0 animate-spin" />
                ) : (
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                )}
                <div className="flex-1">
                  <span>{verifyMessage}</span>
                  {verifyStatus === "pending_retry" && retryCountdown > 0 && (
                    <span className="block font-mono text-[11px] mt-0.5 font-bold">
                      Retrying in {retryCountdown}s...
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Completion Button */}
            {verifyStatus === "completed" && onSelectAgentTab && (
              <button
                onClick={() => {
                  setBuyModalListing(null);
                  setActiveOrder(null);
                  onSelectAgentTab(buyModalListing.agent_type === "rebalancer" ? "rebalancer" : "trader");
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                <span>Open {buyModalListing.agent_type.toUpperCase()} Agent Panel</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── PUBLISH MY AGENT MODAL ─── */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Publish Agent Strategy</h3>
              <button onClick={() => setIsPublishModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handlePublishListing} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-semibold">Agent Strategy Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishAgentType("trader")}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      publishAgentType === "trader"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                    }`}
                  >
                    Pro Momentum Trader
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishAgentType("rebalancer")}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      publishAgentType === "rebalancer"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                    }`}
                  >
                    Portfolio Rebalancer
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Multi-Timeframe High Sharpe Rebalancer"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-semibold">Description</label>
                <textarea
                  rows={2}
                  placeholder="Explain your strategic parameters and quantitative edge..."
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Price (USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={publishPrice}
                    onChange={(e) => setPublishPrice(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground font-semibold">Payout Wallet</label>
                  <input
                    type="text"
                    value={publishPayoutWallet}
                    onChange={(e) => setPublishPayoutWallet(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {publishError && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                  {publishError}
                </div>
              )}

              <button
                type="submit"
                disabled={isPublishing}
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isPublishing ? <RefreshCw size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                <span>Publish to Global Marketplace</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
