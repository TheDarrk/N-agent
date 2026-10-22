"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Activity,
  Shield,
  Clock,
  Target,
  AlertTriangle,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

type Props = {
  accountId: string | null;
};

interface Trade {
  id: number;
  symbol: string;
  action: string;
  entry_price: number;
  current_price: number;
  tp_price: number;
  sl_price: number;
  confidence_score: number;
  expected_roi_pct: number;
  amount_usd: number;
  status: string;
  tx_hash: string;
  created_at: string;
}

interface TradeTrace {
  cid: string;
  stored_at: string;
  symbol: string;
  action?: string;
  confidence_score?: number;
  expected_roi_pct?: number;
  entry_price?: number;
  take_profit_price?: number;
  stop_loss_price?: number;
  pattern_detected?: string;
  reasoning?: string;
}

export default function TraderSection({ accountId }: Props) {
  const [timeframe, setTimeframe] = useState("1h");
  const [minConfidence, setMinConfidence] = useState(75);
  const [riskProfile, setRiskProfile] = useState("moderate");
  const [maxTxAmount, setMaxTxAmount] = useState(100);
  const [selectedSymbol, setSelectedSymbol] = useState("NEAR");

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [traces, setTraces] = useState<TradeTrace[]>([]);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);

  // Fetch trades and recent traces
  const fetchTrades = async () => {
    if (!accountId) return;
    setIsLoadingTrades(true);
    try {
      const res = await fetch(`/api/trader/trades/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setOpenTrades(data.open_trades || []);
        setTradeHistory(data.history || []);
      }
      const traceRes = await fetch(`/api/trader/traces`);
      if (traceRes.ok) {
        const traceData = await traceRes.json();
        setTraces(traceData.traces || []);
      }
    } catch (e) {
      console.error("Error fetching trader data:", e);
    } finally {
      setIsLoadingTrades(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30000); // Polling update every 30s
    return () => clearInterval(interval);
  }, [accountId]);

  // Trigger scan pipeline
  const handleScanNow = async () => {
    if (!accountId) {
      alert("Please connect your wallet first");
      return;
    }
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/trader/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          symbol: selectedSymbol,
          timeframe: timeframe,
          min_confidence: minConfidence,
        }),
      });
      const data = await res.json();
      setScanResult(data);
      await fetchTrades();
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setIsScanning(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!accountId) return;
    try {
      await fetch("/api/trader/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          trader_timeframe: timeframe,
          trader_min_confidence: minConfidence,
          trader_risk_profile: riskProfile,
          max_tx_amount: maxTxAmount,
        }),
      });
      alert("Trader parameters & hard caps saved successfully!");
    } catch (e) {
      console.error("Settings error:", e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Autonomous Trader Agent
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Live DEX & Intents
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            4-node pipeline with <strong>LLM-as-a-Judge</strong>. Gathers multi-timeframe indicators, matches RAG trading patterns, computes Confidence Score & Expected ROI %, and automates ATR-based Take-Profit & Stop-Loss via Defuse 1-Click Intents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTrades}
            disabled={isLoadingTrades}
            className="p-2.5 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            title="Refresh Data"
          >
            <RotateCw size={16} className={isLoadingTrades ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleScanNow}
            disabled={isScanning || !accountId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <RotateCw size={16} className="animate-spin" />
                <span>Judging Opportunity...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Analyze & Scan Market</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid: Configurations & Hard Caps vs Live Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration & Hard Caps */}
        <div className="lg:col-span-1 p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-5">
          <div className="flex items-center justify-between border-b border-[hsl(225,18%,14%)] pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sliders size={16} className="text-primary" />
              Trader Parameters & Hard Caps
            </h2>
            <button
              onClick={handleSaveSettings}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Save
            </button>
          </div>

          {/* Asset Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Candidate Asset</label>
            <div className="grid grid-cols-4 gap-2">
              {["NEAR", "WETH", "WBTC", "SOL"].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    selectedSymbol === sym
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/40 text-muted-foreground border-transparent hover:border-[hsl(225,18%,20%)]"
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe Cadence */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Analysis Cadence</span>
              <span className="text-[11px] text-primary font-mono">{timeframe}</span>
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {["1h", "2h", "4h", "6h", "12h", "1d"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`py-1.5 text-xs font-mono font-semibold rounded-lg border transition-all ${
                    timeframe === tf
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/40 text-muted-foreground border-transparent hover:border-[hsl(225,18%,20%)]"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum Confidence Threshold */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">Min Confidence Required</span>
              <span className="font-bold font-mono text-foreground">{minConfidence}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground">
              LLM Judge will only enter trades if confidence score meets or exceeds this score.
            </p>
          </div>

          {/* Risk Profile */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Risk Appetite</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "conservative", label: "Conservative", desc: "Tighter SL" },
                { id: "moderate", label: "Moderate", desc: "Balanced R:R" },
                { id: "aggressive", label: "Aggressive", desc: "Wide TP" }
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRiskProfile(r.id)}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    riskProfile === r.id
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-secondary/40 border-transparent text-muted-foreground hover:border-[hsl(225,18%,20%)]"
                  }`}
                >
                  <p className="text-xs font-semibold leading-tight">{r.label}</p>
                  <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Hard Cap per trade */}
          <div className="space-y-1.5 pt-2 border-t border-[hsl(225,18%,14%)]">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">Max Capital Per Trade</span>
              <span className="font-bold font-mono text-foreground">${maxTxAmount}</span>
            </div>
            <input
              type="range"
              min="20"
              max="500"
              step="10"
              value={maxTxAmount}
              onChange={(e) => setMaxTxAmount(Number(e.target.value))}
              className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
            />
            <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1">
              <div>Daily Trade Cap: <span className="font-mono text-foreground font-semibold">3 trades</span></div>
              <div>Weekly Cap: <span className="font-mono text-foreground font-semibold">12 trades</span></div>
            </div>
          </div>
        </div>

        {/* Right 2 cols: Live Scan Decision & Active Position Monitor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scan Opportunity Card */}
          {scanResult ? (
            <div className={`p-5 rounded-2xl border transition-all ${
              scanResult.success
                ? "bg-emerald-500/5 border-emerald-500/30"
                : "bg-card border-[hsl(225,18%,14%)]"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${scanResult.success ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                  <h3 className="text-sm font-bold text-foreground">
                    {scanResult.success ? "Trade Order Executed on NEAR Intents" : "Opportunity Analyzed (No Trade)"}
                  </h3>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  Score: <strong className="text-foreground">{scanResult.confidence_score}%</strong>
                </span>
              </div>

              {scanResult.success ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</span>
                    <p className="text-sm font-bold text-emerald-400">{scanResult.action} {scanResult.symbol}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Price</span>
                    <p className="text-sm font-mono font-bold text-foreground">${scanResult.entry_price}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Target size={11} /> Take Profit
                    </span>
                    <p className="text-sm font-mono font-bold text-emerald-400">
                      ${scanResult.take_profit_price} (+{scanResult.expected_roi_pct}%)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                    <span className="text-[10px] text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={11} /> Stop Loss
                    </span>
                    <p className="text-sm font-mono font-bold text-rose-400">${scanResult.stop_loss_price}</p>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Reasoning:</strong> {scanResult.reasoning}
              </p>

              {scanResult.cid && (
                <div className="mt-3 pt-3 border-t border-[hsl(225,18%,14%)] flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Decentralized Reasoning Trace CID:</span>
                  <span className="font-mono text-primary truncate max-w-xs">{scanResult.cid}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  Market Intelligence & Knowledge Graph Ready
                </h3>
                <p className="text-xs text-muted-foreground">
                  Click &quot;Analyze &amp; Scan Market&quot; to test the multi-node pipeline on {selectedSymbol} ({timeframe}).
                </p>
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                Min Conf: <span className="text-primary font-bold">{minConfidence}%</span>
              </div>
            </div>
          )}

          {/* Open Trades Table (1-Minute Poller Target) */}
          <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Active Positions & 1-Minute TP/SL Poller
                </h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {openTrades.length} Active
              </span>
            </div>

            {openTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[hsl(225,18%,14%)] text-muted-foreground">
                      <th className="pb-2 font-medium">Trade</th>
                      <th className="pb-2 font-medium">Entry</th>
                      <th className="pb-2 font-medium">Current</th>
                      <th className="pb-2 font-medium text-emerald-400">Target TP</th>
                      <th className="pb-2 font-medium text-rose-400">Stop Loss</th>
                      <th className="pb-2 font-medium">Confidence</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(225,18%,14%)]">
                    {openTrades.map((t) => (
                      <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2.5 font-bold text-foreground">
                          {t.action} {t.symbol}
                        </td>
                        <td className="py-2.5 font-mono text-muted-foreground">${t.entry_price}</td>
                        <td className="py-2.5 font-mono text-foreground font-semibold">${t.current_price}</td>
                        <td className="py-2.5 font-mono text-emerald-400">${t.tp_price}</td>
                        <td className="py-2.5 font-mono text-rose-400">${t.sl_price}</td>
                        <td className="py-2.5 font-mono text-primary">{t.confidence_score}%</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No open trades at the moment. Active positions will appear here and be polled every 60s for TP/SL hits.
              </div>
            )}
          </div>

          {/* Recent 10 Decentralized Trade Traces */}
          <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers size={16} className="text-primary" />
                Decentralized Reasoning Traces (Recent 10)
              </h3>
              <span className="text-[11px] text-muted-foreground">Verified IPFS / CIDs</span>
            </div>

            <div className="space-y-2">
              {traces.length > 0 ? (
                traces.slice(0, 5).map((tr, i) => (
                  <div
                    key={tr.cid || i}
                    className="p-3 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] text-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {tr.action || "SCAN"} {tr.symbol || "NEAR"}
                        </span>
                        {tr.confidence_score && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">
                            {tr.confidence_score}% Conf
                          </span>
                        )}
                        {tr.expected_roi_pct && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                            +{tr.expected_roi_pct}% ROI
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {tr.reasoning || tr.pattern_detected || "Market evaluated against RAG rules"}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <span className="font-mono text-[10px] text-primary truncate block max-w-[120px]">
                        {tr.cid}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(tr.stored_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No decentralized traces recorded yet. Traces are automatically generated on every evaluation.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
