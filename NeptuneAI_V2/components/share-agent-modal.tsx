"use client";

import React, { useState } from "react";
import {
  X,
  Store,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Scale,
  FileText,
  DollarSign,
  Coins,
  Percent,
  RefreshCw,
  Layers
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";

interface ShareAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: "trader" | "rebalancer" | "research";
  accountId: string | null;
  onConnectWallet?: () => void;
  onSuccess?: () => void;
}

export default function ShareAgentModal({
  isOpen,
  onClose,
  agentId,
  accountId,
  onConnectWallet,
  onSuccess
}: ShareAgentModalProps) {
  const isTrader = agentId === "trader";
  const isRebalancer = agentId === "rebalancer";
  const isResearch = agentId === "research";

  const defaultName = isTrader
    ? "Alpha Momentum Trader"
    : isRebalancer
    ? "StableGuard Dynamic Rebalancer"
    : "Deep On-Chain Alpha Research";

  const defaultDesc = isTrader
    ? "Technical trend and breakout momentum agent scanning top tokens with dynamic ATR-based TP/SL and social sentiment validation."
    : isRebalancer
    ? "Maintains target allocation between stablecoins and NEAR, continuously correcting portfolio drift with low slippage."
    : "Produces actionable institutional research reports, on-chain liquidity intelligence, and volume signals on NEAR.";

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDesc);
  const [pricingValue, setPricingValue] = useState<number>(isTrader ? 10 : isRebalancer ? 0.05 : 0.1);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect your wallet first to publish your agent to the marketplace.");
      return;
    }

    if (!name.trim()) {
      setError("Please enter a name for your marketplace listing.");
      return;
    }

    if (pricingValue <= 0) {
      setError("Please set a valid pricing value greater than 0.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    const pricingType = isTrader
      ? "profit_share"
      : isRebalancer
      ? "fee_per_trade"
      : "fee_per_report";

    try {
      const res = await fetch("/api/marketplace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_wallet: accountId,
          agent_type: agentId,
          name: name.trim(),
          description: description.trim(),
          pricing_type: pricingType,
          pricing_value: Number(pricingValue)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to publish agent.");
      }

      setSuccess(true);
      setTimeout(() => {
        setIsPublishing(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (e: any) {
      setError(e.message || "Failed to publish agent to marketplace.");
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-lg rounded-2xl border border-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(225,18%,14%)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-card border border-[hsl(225,18%,18%)] flex items-center justify-center p-1 shadow-md">
              <AgentAvatar agentId={agentId} size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm tracking-tight">
                  Share {isTrader ? "Trader" : isRebalancer ? "Rebalancer" : "Research"} Agent
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                  MARKETPLACE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Set monetization terms &amp; allow other users to mirror this agent
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

        {/* Success State */}
        {success ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 size={28} />
            </div>
            <h4 className="text-base font-bold text-foreground">Agent Listed on Marketplace!</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Other users can now discover and hire your agent. Actions taken by your agent will be automatically mirrored to their wallets.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Creator Wallet Note */}
            <div className="p-3 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)] flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Listing Creator:</span>
              <span className="font-mono font-semibold text-foreground">
                {accountId || "Connect wallet to publish"}
              </span>
            </div>

            {/* Form: Name */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Listing Title
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alpha Momentum Trader v1"
                className="w-full rounded-xl bg-background border border-[hsl(225,18%,16%)] px-3.5 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Form: Description */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Strategy Overview
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-xl bg-background border border-[hsl(225,18%,16%)] p-2.5 text-xs text-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>

            {/* Form: Pricing Model (Tailored to Agent Type) */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    {isTrader ? (
                      <>
                        <Percent size={14} className="text-emerald-400" />
                        <span>Profit Share Percentage (%)</span>
                      </>
                    ) : isRebalancer ? (
                      <>
                        <Coins size={14} className="text-blue-400" />
                        <span>Fee Per Rebalance Trade (NEAR)</span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} className="text-purple-400" />
                        <span>Fee Per Research Report (NEAR)</span>
                      </>
                    )}
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {isTrader
                      ? "You earn this percentage of net profit generated from winning trades executed for subscribers."
                      : isRebalancer
                      ? "Subscribers pay this fee in NEAR each time an autonomous rebalancing swap executes."
                      : "Subscribers pay this fee in NEAR per on-demand institutional research report generated."}
                  </p>
                </div>
              </div>

              {/* Pricing Input & Quick Presets */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="1"
                    step={isTrader ? "1" : "0.01"}
                    value={pricingValue}
                    onChange={(e) => setPricingValue(Number(e.target.value))}
                    className="w-full rounded-lg bg-background border border-[hsl(225,18%,18%)] px-3 py-1.5 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                    {isTrader ? "%" : "NEAR"}
                  </span>
                </div>

                {/* Presets */}
                {isTrader && (
                  <div className="flex gap-1">
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPricingValue(pct)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all ${
                          pricingValue === pct
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-muted-foreground hover:text-foreground border-[hsl(225,18%,16%)]"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}

                {isRebalancer && (
                  <div className="flex gap-1">
                    {[0.02, 0.05, 0.1].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPricingValue(amt)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all ${
                          pricingValue === amt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-muted-foreground hover:text-foreground border-[hsl(225,18%,16%)]"
                        }`}
                      >
                        {amt}N
                      </button>
                    ))}
                  </div>
                )}

                {isResearch && (
                  <div className="flex gap-1">
                    {[0.05, 0.1, 0.25].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPricingValue(amt)}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all ${
                          pricingValue === amt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-muted-foreground hover:text-foreground border-[hsl(225,18%,16%)]"
                        }`}
                      >
                        {amt}N
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error notice */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[hsl(225,18%,14%)]">
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
                disabled={isPublishing}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 active:scale-95"
              >
                {isPublishing ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Store size={14} />
                )}
                <span>Publish Agent</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
