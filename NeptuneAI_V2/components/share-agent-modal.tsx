"use client";

import React, { useEffect, useState } from "react";
import { X, Store, CheckCircle2, AlertCircle, DollarSign, RefreshCw, Trash2, Clock } from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";

interface ShareAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: "trader" | "rebalancer" | "research";
  accountId: string | null;
  onConnectWallet?: () => void;
  onSuccess?: () => void;
}

type ExistingListing = {
  listing_id: string;
  title: string;
  price_usdt: string;
  can_edit?: boolean;
  edit_lock_seconds_remaining?: number;
};

const LABELS: Record<string, { name: string; title: string; desc: string }> = {
  trader: {
    name: "Trader",
    title: "Alpha Momentum Trader",
    desc: "Technical trend and breakout momentum configuration with ATR-based TP/SL and sentiment validation.",
  },
  rebalancer: {
    name: "Rebalancer",
    title: "StableGuard Dynamic Rebalancer",
    desc: "Target-allocation strategy keeping a stablecoin floor and correcting drift with low slippage.",
  },
  research: {
    name: "Research",
    title: "Deep On-Chain Alpha Research",
    desc: "Research setup (topic, expectations, seed sources) that produces institutional-grade reports.",
  },
};

/**
 * Publishes the agent's CURRENT configuration to the global USDT marketplace (one flat price,
 * no profit sharing). One active listing per agent: delete the old one to list again.
 */
export default function ShareAgentModal({
  isOpen,
  onClose,
  agentId,
  accountId,
  onConnectWallet,
  onSuccess,
}: ShareAgentModalProps) {
  const meta = LABELS[agentId] || LABELS.trader;

  const [name, setName] = useState(meta.title);
  const [description, setDescription] = useState(meta.desc);
  const [priceUsdt, setPriceUsdt] = useState("25.00");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [existing, setExisting] = useState<ExistingListing | null>(null);
  const [checking, setChecking] = useState(false);

  // Reset defaults whenever the modal opens for a (different) agent
  useEffect(() => {
    if (!isOpen) return;
    setName(meta.title);
    setDescription(meta.desc);
    setError(null);
    setSuccess(false);
  }, [isOpen, agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Is this agent already listed by me?
  const loadExisting = React.useCallback(async () => {
    if (!accountId) {
      setExisting(null);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(
        `/api/marketplace/listings?seller=${encodeURIComponent(accountId)}&agent_type=${agentId}`
      );
      if (res.ok) {
        const data = await res.json();
        setExisting((data.listings || [])[0] || null);
      }
    } catch {
      /* non-fatal */
    } finally {
      setChecking(false);
    }
  }, [accountId, agentId]);

  useEffect(() => {
    if (isOpen) loadExisting();
  }, [isOpen, loadExisting]);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect your wallet first to publish your agent to the marketplace.");
      return;
    }
    if (name.trim().length < 3) {
      setError("Please enter a listing title (3+ characters).");
      return;
    }
    const price = Number(priceUsdt);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a price in USDT greater than 0.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: accountId,
          agent_type: agentId,
          title: name.trim(),
          description: description.trim(),
          price_usdt: String(price),
          payout_wallet: accountId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "Failed to publish agent.");

      setSuccess(true);
      setTimeout(() => {
        setIsPublishing(false);
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (e: any) {
      setError(e.message || "Failed to publish agent to marketplace.");
      setIsPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!accountId || !existing) return;
    if (!window.confirm(`Delete "${existing.title}" from the marketplace? You can list this agent again afterwards.`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketplace/listings/${encodeURIComponent(existing.listing_id)}?wallet=${encodeURIComponent(accountId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "Failed to delete listing.");
      setExisting(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete listing.");
    } finally {
      setIsDeleting(false);
    }
  };

  const lockText = (secs?: number) => {
    if (!secs || secs <= 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 animate-in fade-in-0">
      <div className="relative w-full max-w-lg rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center p-1 shadow-md">
              <AgentAvatar agentId={agentId} size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm tracking-tight">Sell {meta.name} Agent</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                  MARKETPLACE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Flat one-time price in USDT. Buyers get a copy of your current configuration.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 size={28} />
            </div>
            <h4 className="text-base font-bold text-foreground">Agent Listed on Marketplace!</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Other users can now find it in the Marketplace tab and buy your configuration for {priceUsdt} USDT.
            </p>
          </div>
        ) : existing ? (
          /* Already listed: show it + delete (publishing again is blocked until deleted) */
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2 text-xs">
              <p className="font-bold text-foreground text-sm">{existing.title}</p>
              <p className="text-muted-foreground">
                Already listed for <span className="font-mono font-bold text-emerald-400">{existing.price_usdt} USDT</span>.
                Delete this listing to list your {meta.name} agent again.
              </p>
              {existing.can_edit === false && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock size={12} /> Editing is locked for {lockText(existing.edit_lock_seconds_remaining)} (deleting is always allowed).
                </p>
              )}
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/40 text-xs font-bold transition-all disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>Delete Listing</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="p-3 rounded-xl bg-secondary/40 border border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seller / payout wallet:</span>
              <span className="font-mono font-semibold text-foreground">{accountId || "Connect wallet to publish"}</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Listing Title</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Strategy Overview</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-xl bg-background border border-border p-2.5 text-xs text-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <DollarSign size={14} className="text-emerald-400" />
                <span>Price (USDT, one-time)</span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                Buyers pay this once and receive a copy of your current {meta.name.toLowerCase()} configuration. No profit sharing.
              </p>
              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={priceUsdt}
                  onChange={(e) => setPriceUsdt(e.target.value)}
                  className="w-full rounded-lg bg-background border border-border px-3 py-1.5 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                  USDT
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing || checking}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 active:scale-95"
              >
                {isPublishing ? <RefreshCw size={14} className="animate-spin" /> : <Store size={14} />}
                <span>Publish Agent</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
