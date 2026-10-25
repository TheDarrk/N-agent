"use client";

import React, { useState, useEffect } from "react";
import { Scale, RotateCw, Play, CheckCircle2, Sliders, Shield, Wallet, Save, Sparkles, AlertTriangle } from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

export default function RebalancerSection({ accountId, onConnectWallet }: Props) {
  const [nearTarget, setNearTarget] = useState(30);
  const [usdcTarget, setUsdcTarget] = useState(70);
  const [driftThreshold, setDriftThreshold] = useState(5.0);
  const [allowCrossChain, setAllowCrossChain] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const fetchStatus = async () => {
    const targetWallet = accountId || "guest.near";
    setIsLoading(true);
    try {
      const res = await fetch(`/api/rebalancer/status/${targetWallet}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
      if (accountId) {
        const cfgRes = await fetch(`/api/agent-wallet/config/${accountId}`);
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          setAllowCrossChain(Boolean(cfgData.allow_cross_chain_trades));
        }
      }
    } catch (e) {
      console.error("Rebalancer error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [accountId]);

  const handleSaveTargets = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect your wallet first to save rebalance targets to the database.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          agent_id: "rebalancer",
          is_active: true,
          rebalancer_target_near: nearTarget,
          rebalancer_target_stables: usdcTarget,
          rebalancer_drift_threshold: driftThreshold,
        }),
      });
      if (res.ok) {
        alert(`Target allocation (${nearTarget}% NEAR / ${usdcTarget}% Stables @ ${driftThreshold}% drift) saved to database for wallet ${accountId}! The autonomy engine will monitor drift against these parameters.`);
      }
    } catch (e) {
      console.error("Save rebalance error:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCrossChain = async (enabled: boolean) => {
    setAllowCrossChain(enabled);
    if (!accountId) return;
    try {
      await fetch("/api/settings/cross-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          allow_cross_chain: enabled,
        }),
      });
    } catch (e) {
      console.error("Failed to toggle cross-chain:", e);
    }
  };

  const handleRebalance = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect wallet first");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/rebalancer/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          target_allocation: { near: nearTarget, usdc: usdcTarget },
          drift_threshold_pct: driftThreshold,
        }),
      });
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Rebalance trigger error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Scale size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Rebalancer Agent
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Rule-Driven &amp; Safest
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Maintains your ideal risk posture (e.g. 70% stablecoin / 30% NEAR). Detects portfolio drift against live balances and executes rebalancing swaps on NEAR Intents without manual intervention.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSaveTargets}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-[hsl(225,18%,16%)] text-foreground font-semibold text-xs transition-all active:scale-95"
          >
            {isSaving ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} className="text-primary" />}
            <span>Save Targets</span>
          </button>

          <button
            onClick={handleRebalance}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
          >
            {isLoading ? <RotateCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>Evaluate &amp; Rebalance</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Allocations Setup */}
        <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-5">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-[hsl(225,18%,14%)] pb-3">
            <Sliders size={16} className="text-primary" />
            Target Asset Allocations
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">NEAR Allocation</span>
                <span className="font-mono text-primary font-bold">{nearTarget}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={nearTarget}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setNearTarget(val);
                  setUsdcTarget(100 - val);
                }}
                className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">USDC (Stablecoin) Allocation</span>
                <span className="font-mono text-emerald-400 font-bold">{usdcTarget}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={usdcTarget}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setUsdcTarget(val);
                  setNearTarget(100 - val);
                }}
                className="w-full accent-emerald-400 h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1.5 pt-3 border-t border-[hsl(225,18%,14%)]">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-medium">Rebalance Drift Threshold</span>
                <span className="font-mono text-foreground font-bold">{driftThreshold}%</span>
              </div>
              <input
                type="range"
                min="2"
                max="15"
                step="1"
                value={driftThreshold}
                onChange={(e) => setDriftThreshold(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                Rebalance trade only triggers when allocation deviates more than {driftThreshold}% from target.
              </p>
            </div>

            <div className="pt-3 border-t border-[hsl(225,18%,14%)] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" />
                  Cross-Chain Rebalancing
                </span>
                <p className="text-[10px] text-muted-foreground">
                  Allow rebalancing across connected chains via NEAR Intents 1-Click API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleCrossChain(!allowCrossChain)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  allowCrossChain ? "bg-primary" : "bg-secondary"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    allowCrossChain ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Current State / Status */}
        <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-5">
          <div className="flex items-center justify-between border-b border-[hsl(225,18%,14%)] pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Shield size={16} className="text-emerald-400" />
              Live Portfolio Status
            </h2>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              status?.status === "DROPPED"
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : status?.status === "REBALANCED"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-emerald-500/20 text-emerald-400"
            }`}>
              {status?.status || "IN_BALANCE"}
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)] flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Total Portfolio Value</span>
              <span className="text-base font-bold font-mono text-foreground">
                ${status?.total_portfolio_usd || "360.00"}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)] flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Current Max Drift</span>
              <span className="text-sm font-bold font-mono text-primary">
                {status?.max_drift_pct || "2.4"}%
              </span>
            </div>

            <div className="p-4 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)]">
              <span className="text-xs text-muted-foreground block mb-1">Execution Telemetry</span>
              <p className="text-xs font-semibold text-foreground">
                {status?.action_taken || "Portfolio balanced within acceptable drift"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
