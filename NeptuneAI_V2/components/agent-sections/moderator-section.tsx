"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCw,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  TrendingDown,
  Layers
} from "lucide-react";

type Props = {
  accountId: string | null;
};

export default function ModeratorSection({ accountId }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);

  const fetchStatus = async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/moderator/status/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Moderator status error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 20000);
    return () => clearInterval(interval);
  }, [accountId]);

  const handleToggleKillSwitch = async (activate: boolean) => {
    if (!accountId) {
      alert("Please connect wallet first");
      return;
    }
    setIsTogglingKillSwitch(true);
    try {
      const res = await fetch("/api/moderator/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          activate: activate,
        }),
      });
      await fetchStatus();
    } catch (e) {
      console.error("Kill switch error:", e);
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  const isKillSwitchActive = status?.kill_switch_active;
  const healthScore = status?.health_score ?? 100;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`p-2 rounded-lg ${isKillSwitchActive ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {isKillSwitchActive ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Moderator Watchdog
            </h1>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
              isKillSwitchActive
                ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            }`}>
              {isKillSwitchActive ? "HALTED" : "Default-On Guardian"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Continuously monitors the whole suite per user: aggregate exposure, correlated risks, and mandate breaches. Holds the master kill switch to revoke keys and halt trades instantly.
          </p>
        </div>

        {/* Master Kill Switch Button */}
        {isKillSwitchActive ? (
          <button
            onClick={() => handleToggleKillSwitch(false)}
            disabled={isTogglingKillSwitch || !accountId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
          >
            {isTogglingKillSwitch ? <RotateCw size={16} className="animate-spin" /> : <Unlock size={16} />}
            <span>Resume Normal Monitoring</span>
          </button>
        ) : (
          <button
            onClick={() => handleToggleKillSwitch(true)}
            disabled={isTogglingKillSwitch || !accountId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 text-white font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-rose-500/20 disabled:opacity-50"
          >
            {isTogglingKillSwitch ? <RotateCw size={16} className="animate-spin" /> : <Power size={16} />}
            <span>Emergency Kill Switch</span>
          </button>
        )}
      </div>

      {/* Grid: Health Score vs Aggregate Exposure */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Health Score Gauge */}
        <div className="p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] flex flex-col items-center justify-center text-center space-y-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Portfolio Health Score
          </span>
          <div className="relative flex items-center justify-center">
            <div className={`text-4xl font-extrabold font-mono ${
              healthScore > 80 ? "text-emerald-400" : healthScore > 50 ? "text-amber-400" : "text-rose-400"
            }`}>
              {healthScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {healthScore > 80
              ? "All active positions and exposures within safe parameters."
              : healthScore > 50
              ? "Elevated exposure detected. Moderator watching volatility."
              : "High risk or Kill Switch active. Trading suspended."}
          </p>
        </div>

        {/* Aggregate Exposure */}
        <div className="p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              Total Open Exposure vs Daily Limit
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              ${status?.total_open_exposure_usd || "0"} / ${status?.daily_limit_usd || "2000"} Limit
            </span>
          </div>

          {/* Meter Bar */}
          <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isKillSwitchActive
                  ? "bg-rose-500"
                  : "bg-gradient-to-r from-emerald-500 to-primary"
              }`}
              style={{
                width: `${Math.min(
                  100,
                  ((status?.total_open_exposure_usd || 0) / (status?.daily_limit_usd || 2000)) * 100
                )}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">Open Trades</span>
              <p className="text-sm font-bold text-foreground font-mono">
                {status?.open_trades_count || 0}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">Max Per Trade</span>
              <p className="text-sm font-bold text-foreground font-mono">
                ${status?.max_tx_amount_usd || 500}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">Kill Switch</span>
              <p className={`text-sm font-bold font-mono ${isKillSwitchActive ? "text-rose-400" : "text-emerald-400"}`}>
                {isKillSwitchActive ? "ACTIVE" : "STANDBY"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
