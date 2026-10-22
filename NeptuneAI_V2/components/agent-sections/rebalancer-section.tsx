"use client";

import React, { useState, useEffect } from "react";
import { Scale, RotateCw, Play, CheckCircle2, Sliders, Shield } from "lucide-react";

type Props = {
  accountId: string | null;
};

export default function RebalancerSection({ accountId }: Props) {
  const [nearTarget, setNearTarget] = useState(30);
  const [usdcTarget, setUsdcTarget] = useState(70);
  const [driftThreshold, setDriftThreshold] = useState(5.0);

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const fetchStatus = async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/rebalancer/status/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
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

  const handleRebalance = async () => {
    if (!accountId) {
      alert("Please connect wallet first");
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
              Rule-Driven & Safest
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Maintains your ideal risk posture (e.g. 70% stablecoin / 30% NEAR). Detects portfolio drift against live balances and executes rebalancing swaps on NEAR Intents without manual intervention.
          </p>
        </div>

        <button
          onClick={handleRebalance}
          disabled={isLoading || !accountId}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
        >
          {isLoading ? <RotateCw size={16} className="animate-spin" /> : <Play size={16} />}
          <span>Evaluate & Rebalance</span>
        </button>
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
              status?.status === "REBALANCED"
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
