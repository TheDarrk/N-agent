"use client";

import { setVisibleInterval } from "@/lib/visible-interval"
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
  XCircle,
  X,
  ExternalLink,
  Layers,
  BookOpen,
  Twitter,
  Plus,
  Trash2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Flame,
  LineChart,
  BrainCircuit,
  Eye,
  Maximize2,
  ChevronUp,
  Copy,
  Check,
  Brain,
  Users,
  Save
} from "lucide-react";
import FullScreenHistoryModal from "@/components/fullscreen-history-modal";
import TraderStory from "@/components/agent-sections/trader/trader-story";
import TraderPnl from "@/components/agent-sections/trader/trader-pnl";
import TraderSetup from "@/components/agent-sections/trader/trader-config";
import TraderReady from "@/components/agent-sections/trader/trader-ready";
import InteractiveChartModal from "@/components/agent-sections/trader/interactive-chart-modal";
import InfoTip from "@/components/agent-sections/shared/info-tip";
import { tilt3d } from "@/components/agent-sections/trader/tilt-3d";
import TraceCard, {
  describeVerdict,
  symbolLabel,
  type TraceData,
} from "@/components/agent-sections/trader/trace-card";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
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

interface DroppedTrade {
  id: number;
  symbol: string;
  amount_usd: number;
  drop_reason: string;
  agent_id: string;
  is_cross_chain: number;
  created_at: string;
}

interface TradeTrace {
  cid: string;
  stored_at: string;
  symbol: string;
  timeframe?: string;
  verdict?: string;
  action?: string;
  stage?: string;
  drop_reason?: string;
  confidence_score?: number;
  expected_roi_pct?: number;
  entry_price?: number;
  take_profit_price?: number;
  stop_loss_price?: number;
  risk_reward_ratio?: number;
  amount_usd?: number;
  pattern_detected?: string;
  book_section_cited?: string;
  reasoning?: string;
  council_agreement?: string;
  council_clash?: string;
  blind_spots_caught?: string;
  one_thing_first?: string;
  chart_image?: {
    data_uri?: string;
    shape?: string;
    filename?: string;
    mime_type?: string;
  } | null;
  ascii_chart?: string;
  multiframe_chart?: any;
  advisors?: {
    contrarian?: string;
    first_principles?: string;
    expansionist?: string;
    outsider?: string;
    executor?: string;
  };
  binary_evidence_checks?: {
    has_trend_alignment?: boolean;
    has_volume_confirmation?: boolean;
    has_chart_pattern_support?: boolean;
    has_social_sentiment_support?: boolean;
    favorable_risk_reward?: boolean;
  };
  indicators?: {
    symbol?: string;
    timeframe?: string;
    current_price?: number;
    rsi?: number;
    ema_trend?: string;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    atr?: number;
    atr_pct?: number;
    volume_surge?: boolean;
    volume_ratio?: number;
    recent_support?: number;
    recent_resistance?: number;
  };
  twitter_sentiment?: {
    symbol?: string;
    sentiment?: string;
    bullish_pct?: number;
    bearish_pct?: number;
    viral_velocity_score?: number;
    enabled?: boolean;
  };
  researcher_intel?: {
    hired?: boolean;
    fee_paid?: string;
    signal?: any;
    executive_summary?: any;
  } | null;
  tx_hash?: string;
  user_wallet?: string;
}

export default function TraderSection({ accountId, onConnectWallet }: Props) {
  // Coin Selection Mode: "auto" (Dynamic Daily Trending) vs "custom" (User Watchlist up to 20)
  const [coinMode, setCoinMode] = useState<"auto" | "custom">("auto");
  const [customCoins, setCustomCoins] = useState<string[]>([
    "NEAR", "WETH", "WBTC", "SOL", "REF", "SWEAT", "PEPE"
  ]);
  const [newCoinInput, setNewCoinInput] = useState("");

  // Trader Parameters & Hard Caps
  const [timeframe, setTimeframe] = useState("1h");
  const [minConfidence, setMinConfidence] = useState(75);
  const [riskProfile, setRiskProfile] = useState("moderate");
  const [maxTxAmount, setMaxTxAmount] = useState(50);
  const [tradeLimitPeriod, setTradeLimitPeriod] = useState<"day" | "week" | "month">("day");
  const [tradeLimitCount, setTradeLimitCount] = useState<number>(3);
  const [enableResearcher, setEnableResearcher] = useState(false);

  // Pro Trader Mathematical & Screener Filters
  const [minVolumeUsd, setMinVolumeUsd] = useState(25000);
  const [minPriceMovePct, setMinPriceMovePct] = useState(2.0);
  const [minAtrPct, setMinAtrPct] = useState(0.30);
  const [minRiskReward, setMinRiskReward] = useState(1.5);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [rsiSweetMin, setRsiSweetMin] = useState(45);
  const [rsiSweetMax, setRsiSweetMax] = useState(62);
  const [emaFast, setEmaFast] = useState(20);
  const [emaSlow, setEmaSlow] = useState(50);
  const [emaMacro, setEmaMacro] = useState(200);
  const [emaDays, setEmaDays] = useState(14);
  const [selectedChartTrace, setSelectedChartTrace] = useState<any>(null);

  // Persistence & Save State
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [settingsConfirmed, setSettingsConfirmed] = useState(false);
  const hasLoadedSettingsRef = React.useRef<string | null>(null);

  // Load User Configuration & Hard Caps from SQLite DB
  useEffect(() => {
    if (!accountId || hasLoadedSettingsRef.current === accountId) return;
    const loadSettings = async () => {
      try {
        const res = await fetch(`/api/settings/${accountId}`);
        if (res.ok) {
          const u = await res.json();
          if (u.trader_timeframe) setTimeframe(u.trader_timeframe);
          if (u.trader_min_confidence !== undefined && u.trader_min_confidence !== null) setMinConfidence(Number(u.trader_min_confidence));
          if (u.trader_risk_profile) setRiskProfile(u.trader_risk_profile);
          if (u.max_tx_amount !== undefined && u.max_tx_amount !== null) setMaxTxAmount(Number(u.max_tx_amount));
          if (u.trader_max_trades_per_day !== undefined && u.trader_max_trades_per_day !== null) {
            setTradeLimitPeriod("day");
            setTradeLimitCount(Number(u.trader_max_trades_per_day));
          } else if (u.trader_max_trades_per_week !== undefined && u.trader_max_trades_per_week !== null) {
            setTradeLimitPeriod("week");
            setTradeLimitCount(Number(u.trader_max_trades_per_week));
          }
          if (u.trader_coin_mode) setCoinMode(u.trader_coin_mode as "auto" | "custom");
          if (u.trader_custom_coins) {
            const list = u.trader_custom_coins.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
            if (list.length > 0) setCustomCoins(list);
          }
          if (u.trader_enable_researcher !== undefined) setEnableResearcher(Boolean(u.trader_enable_researcher));

          // Pro Trader filters
          if (u.trader_min_volume_usd !== undefined && u.trader_min_volume_usd !== null) setMinVolumeUsd(Number(u.trader_min_volume_usd));
          else if (u.min_volume_usd !== undefined && u.min_volume_usd !== null) setMinVolumeUsd(Number(u.min_volume_usd));

          if (u.trader_min_price_move_pct !== undefined && u.trader_min_price_move_pct !== null) setMinPriceMovePct(Number(u.trader_min_price_move_pct));
          else if (u.min_price_move_pct !== undefined && u.min_price_move_pct !== null) setMinPriceMovePct(Number(u.min_price_move_pct));

          if (u.trader_min_atr_pct !== undefined && u.trader_min_atr_pct !== null) setMinAtrPct(Number(u.trader_min_atr_pct));
          else if (u.min_atr_pct !== undefined && u.min_atr_pct !== null) setMinAtrPct(Number(u.min_atr_pct));

          if (u.trader_min_risk_reward !== undefined && u.trader_min_risk_reward !== null) setMinRiskReward(Number(u.trader_min_risk_reward));
          else if (u.min_risk_reward !== undefined && u.min_risk_reward !== null) setMinRiskReward(Number(u.min_risk_reward));

          if (u.trader_rsi_overbought !== undefined && u.trader_rsi_overbought !== null) setRsiOverbought(Number(u.trader_rsi_overbought));
          else if (u.rsi_overbought !== undefined && u.rsi_overbought !== null) setRsiOverbought(Number(u.rsi_overbought));

          if (u.trader_rsi_oversold !== undefined && u.trader_rsi_oversold !== null) setRsiOversold(Number(u.trader_rsi_oversold));
          else if (u.rsi_oversold !== undefined && u.rsi_oversold !== null) setRsiOversold(Number(u.rsi_oversold));

          if (u.trader_rsi_sweet_min !== undefined && u.trader_rsi_sweet_min !== null) setRsiSweetMin(Number(u.trader_rsi_sweet_min));
          else if (u.rsi_sweet_min !== undefined && u.rsi_sweet_min !== null) setRsiSweetMin(Number(u.rsi_sweet_min));

          if (u.trader_rsi_sweet_max !== undefined && u.trader_rsi_sweet_max !== null) setRsiSweetMax(Number(u.trader_rsi_sweet_max));
          else if (u.rsi_sweet_max !== undefined && u.rsi_sweet_max !== null) setRsiSweetMax(Number(u.rsi_sweet_max));

          if (u.trader_ema_fast !== undefined && u.trader_ema_fast !== null) setEmaFast(Number(u.trader_ema_fast));
          else if (u.ema_fast !== undefined && u.ema_fast !== null) setEmaFast(Number(u.ema_fast));

          if (u.trader_ema_slow !== undefined && u.trader_ema_slow !== null) setEmaSlow(Number(u.trader_ema_slow));
          else if (u.ema_slow !== undefined && u.ema_slow !== null) setEmaSlow(Number(u.ema_slow));

          if (u.trader_ema_macro !== undefined && u.trader_ema_macro !== null) setEmaMacro(Number(u.trader_ema_macro));
          else if (u.ema_macro !== undefined && u.ema_macro !== null) setEmaMacro(Number(u.ema_macro));

          if (u.trader_ema_days !== undefined && u.trader_ema_days !== null) setEmaDays(Number(u.trader_ema_days));
          else if (u.ema_days !== undefined && u.ema_days !== null) setEmaDays(Number(u.ema_days));

          hasLoadedSettingsRef.current = accountId;
          if (u.trader_timeframe || u.max_tx_amount !== undefined) setSettingsConfirmed(true);
        }
      } catch (err) {
        console.error("Failed to load user settings:", err);
      }
    };
    loadSettings();
  }, [accountId]);

  // Execution & Live Data State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(() => {
    if (typeof window === "undefined" || !accountId) return null;
    try {
      const saved = localStorage.getItem("neptune_latest_trader_run_" + accountId);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [showAsciiChart, setShowAsciiChart] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [modalChartUri, setModalChartUri] = useState<string | null>(null);
  const [modalChartTitle, setModalChartTitle] = useState<string>("");
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [droppedTrades, setDroppedTrades] = useState<DroppedTrade[]>([]);
  const [allowCrossChain, setAllowCrossChain] = useState(false);
  const [traces, setTraces] = useState<TradeTrace[]>([]);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);
  const [activeTraceTab, setActiveTraceTab] = useState<"traces" | "history">("traces");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "open" | "completed" | "dropped">("all");
  const [expandedTraceCid, setExpandedTraceCid] = useState<string | null>(null);
  const [isFullScreenHistoryOpen, setIsFullScreenHistoryOpen] = useState(false);
  const [copiedCid, setCopiedCid] = useState<string | null>(null);

  // Restore cached scan result if accountId changes
  useEffect(() => {
    if (!accountId) {
      setScanResult(null);
      return;
    }
    try {
      const saved = localStorage.getItem("neptune_latest_trader_run_" + accountId);
      if (saved) setScanResult(JSON.parse(saved));
    } catch {}
  }, [accountId]);

  const handleCopyTrace = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCid(id);
    setTimeout(() => setCopiedCid(null), 2000);
  };

  // Fetch trades and recent traces strictly isolated to the user's wallet
  const fetchTrades = async () => {
    if (!accountId) return;
    setIsLoadingTrades(true);
    try {
      const res = await fetch(`/api/trader/trades/${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const data = await res.json();
        setOpenTrades(data.open_trades || []);
        setTradeHistory(data.history || []);
        setDroppedTrades(data.dropped_trades || []);
      }
      const cfgRes = await fetch(`/api/agent-wallet/config/${encodeURIComponent(accountId)}`);
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setAllowCrossChain(Boolean(cfgData.allow_cross_chain_trades));
      }
      const traceRes = await fetch(`/api/trader/traces/${encodeURIComponent(accountId)}`);
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
    return setVisibleInterval(fetchTrades, 15000);
  }, [accountId]);

  // Tab visibility: refresh instantly when user switches back to this tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && accountId) {
        fetchTrades();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [accountId]);

  // In-progress scan persistence across page refreshes and tab switches
  useEffect(() => {
    if (!accountId) return;
    try {
      const rawMeta = localStorage.getItem("neptune_trader_scan_in_progress");
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        const elapsed = Date.now() - (meta.startedAt || 0);
        if (meta.accountId === accountId && elapsed < 120000) {
          setIsScanning(true);
          const pollInterval = setInterval(async () => {
            try {
              const res = await fetch(`/api/trader/traces/${encodeURIComponent(accountId)}`);
              if (res.ok) {
                const traceData = await res.json();
                const list = traceData.traces || [];
                setTraces(list);
                if (list.length > 0) {
                  const newest = list[0];
                  const traceTime = newest.created_at ? new Date(newest.created_at).getTime() : 0;
                  const currentElapsed = Date.now() - meta.startedAt;
                  if (traceTime >= meta.startedAt - 5000 || currentElapsed > 35000) {
                    setIsScanning(false);
                    localStorage.removeItem("neptune_trader_scan_in_progress");
                    clearInterval(pollInterval);
                    await fetchTrades();
                  }
                }
              }
            } catch {}
          }, 3000);

          return () => clearInterval(pollInterval);
        } else {
          localStorage.removeItem("neptune_trader_scan_in_progress");
        }
      }
    } catch {}
  }, [accountId]);

  // Handle adding custom coin (max 20)
  const handleAddCustomCoin = () => {
    const clean = newCoinInput.trim().toUpperCase();
    if (!clean) return;
    if (customCoins.includes(clean)) {
      setNewCoinInput("");
      return;
    }
    if (customCoins.length >= 20) {
      alert("Maximum 20 coins allowed in custom watchlist.");
      return;
    }
    setCustomCoins([...customCoins, clean]);
    setNewCoinInput("");
  };

  const handleRemoveCustomCoin = (sym: string) => {
    setCustomCoins(customCoins.filter((c) => c !== sym));
  };

  // Trigger scan pipeline
  const handleScanNow = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet(); else alert("Please connect your wallet first");
      return;
    }
    const scanMeta = {
      accountId,
      startedAt: Date.now(),
      coinMode,
      timeframe,
    };
    try {
      localStorage.setItem("neptune_trader_scan_in_progress", JSON.stringify(scanMeta));
    } catch {}
    setIsScanning(true);
    try {
      const res = await fetch("/api/trader/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          coin_mode: coinMode,
          custom_coins: coinMode === "custom" ? customCoins : undefined,
          timeframe: timeframe,
          min_confidence: minConfidence,
          enable_researcher_plugin: enableResearcher,
        }),
      });
      const data = await res.json();
      setScanResult(data);
      try {
        localStorage.setItem("neptune_latest_trader_run_" + accountId, JSON.stringify(data));
      } catch {}
      await fetchTrades();
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setIsScanning(false);
      try {
        localStorage.removeItem("neptune_trader_scan_in_progress");
      } catch {}
    }
  };

  // Save Configuration & Hard Caps to Database
  const handleSaveSettings = async () => {
    if (!accountId) {
      if (onConnectWallet) {
        onConnectWallet();
      } else {
        alert("Please connect your wallet first to save configuration.");
      }
      return;
    }
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/trader/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          trader_timeframe: timeframe,
          trader_min_confidence: minConfidence,
          trader_risk_profile: riskProfile,
          max_tx_amount: maxTxAmount,
          trader_max_trades_per_day: tradeLimitPeriod === "day" ? tradeLimitCount : 3,
          trader_max_trades_per_week: tradeLimitPeriod === "week" ? tradeLimitCount : 12,
          trader_coin_mode: coinMode,
          trader_custom_coins: customCoins.join(","),
          trader_enable_researcher: enableResearcher ? 1 : 0,
          trader_min_volume_usd: minVolumeUsd,
          trader_min_price_move_pct: minPriceMovePct,
          trader_min_atr_pct: minAtrPct,
          trader_min_risk_reward: minRiskReward,
          trader_rsi_overbought: rsiOverbought,
          trader_rsi_oversold: rsiOversold,
          trader_rsi_sweet_min: rsiSweetMin,
          trader_rsi_sweet_max: rsiSweetMax,
          trader_ema_fast: emaFast,
          trader_ema_slow: emaSlow,
          trader_ema_macro: emaMacro,
          trader_ema_days: emaDays,
        }),
      });
      if (res.ok) {
        setIsSaved(true);
        setSettingsConfirmed(true);
        setTimeout(() => setIsSaved(false), 3500);
      } else {
        console.error("Failed to save trader settings");
      }
    } catch (e) {
      console.error("Settings error:", e);
    } finally {
      setIsSavingSettings(false);
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
      console.error("Failed to update cross-chain setting:", e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-6xl mx-auto space-y-4 suite-stagger">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <TrendingUp size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Trader Agent</h1>
              <InfoTip label="About the Trader agent" side="bottom">
                Finds a setup, double-checks it, trades inside your limits, and reports the result.
              </InfoTip>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  isScanning
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-secondary/60 text-muted-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isScanning ? "animate-pulse bg-emerald-400" : openTrades.length > 0 ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
                {isScanning
                  ? "Analysing the market"
                  : openTrades.length > 0
                    ? `Watching ${openTrades.length} open ${openTrades.length === 1 ? "trade" : "trades"}`
                    : "Standing by"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTrades}
            disabled={isLoadingTrades}
            className="key3d grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RotateCw size={15} className={isLoadingTrades ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleScanNow}
            disabled={isScanning || !accountId}
            className="key3d flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <RotateCw size={14} className="animate-spin" />
                <span>Analysing...</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>Run analysis now</span>
              </>
            )}
          </button>
        </div>
      </div>

      <TraderStory
        isScanning={isScanning}
        minConfidence={minConfidence}
        maxTxAmount={maxTxAmount}
        tradeLimitCount={tradeLimitCount}
        tradeLimitPeriod={tradeLimitPeriod}
        coinMode={coinMode}
        customCoinCount={customCoins.length}
        timeframe={timeframe}
      />

      <TraderPnl
        openTrades={openTrades}
        tradeHistory={tradeHistory}
        droppedCount={droppedTrades.length}
        connected={Boolean(accountId)}
      />

      {/* Setup + live status */}
      <div className="space-y-4">
        <TraderSetup
          coinMode={coinMode}
          setCoinMode={setCoinMode}
          customCoins={customCoins}
          newCoinInput={newCoinInput}
          setNewCoinInput={setNewCoinInput}
          onAddCoin={handleAddCustomCoin}
          onRemoveCoin={handleRemoveCustomCoin}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          minConfidence={minConfidence}
          setMinConfidence={setMinConfidence}
          riskProfile={riskProfile}
          setRiskProfile={setRiskProfile}
          maxTxAmount={maxTxAmount}
          setMaxTxAmount={setMaxTxAmount}
          tradeLimitPeriod={tradeLimitPeriod}
          setTradeLimitPeriod={setTradeLimitPeriod}
          tradeLimitCount={tradeLimitCount}
          setTradeLimitCount={setTradeLimitCount}
          enableResearcher={enableResearcher}
          setEnableResearcher={setEnableResearcher}
          allowCrossChain={allowCrossChain}
          onToggleCrossChain={handleToggleCrossChain}
          isSaving={isSavingSettings}
          isSaved={isSaved}
          onSave={handleSaveSettings}
          minVolumeUsd={minVolumeUsd}
          setMinVolumeUsd={setMinVolumeUsd}
          minPriceMovePct={minPriceMovePct}
          setMinPriceMovePct={setMinPriceMovePct}
          minAtrPct={minAtrPct}
          setMinAtrPct={setMinAtrPct}
          minRiskReward={minRiskReward}
          setMinRiskReward={setMinRiskReward}
          rsiOverbought={rsiOverbought}
          setRsiOverbought={setRsiOverbought}
          rsiOversold={rsiOversold}
          setRsiOversold={setRsiOversold}
          rsiSweetMin={rsiSweetMin}
          setRsiSweetMin={setRsiSweetMin}
          rsiSweetMax={rsiSweetMax}
          setRsiSweetMax={setRsiSweetMax}
          emaFast={emaFast}
          setEmaFast={setEmaFast}
          emaSlow={emaSlow}
          setEmaSlow={setEmaSlow}
          emaMacro={emaMacro}
          setEmaMacro={setEmaMacro}
          emaDays={emaDays}
          setEmaDays={setEmaDays}
        />

        {/* Right 2 cols: Live Scan Decision & Active Position Monitor */}
        <div className="space-y-4">
          {/* Active Live Run & Real-Time Chart: derived from manual scanResult OR latest autonomous background trace */}
          {(() => {
            const latestTrace = traces.length > 0 ? traces[0] : null;
            const activeRun = scanResult || (latestTrace ? {
              success: latestTrace.verdict === "ENTER_LONG",
              verdict: latestTrace.verdict,
              symbol: latestTrace.symbol,
              timeframe: latestTrace.timeframe || timeframe || "1h",
              confidence_score: latestTrace.confidence_score,
              expected_roi: latestTrace.expected_roi_pct,
              expected_roi_pct: latestTrace.expected_roi_pct,
              pattern: latestTrace.pattern_detected || "Dynamic Trend Structure",
              entry_price: latestTrace.entry_price || latestTrace.indicators?.current_price,
              take_profit_price: latestTrace.take_profit_price,
              stop_loss_price: latestTrace.stop_loss_price,
              chart_image: latestTrace.chart_image,
              ascii_chart: latestTrace.ascii_chart,
              advisors: latestTrace.advisors,
              council_agreement: latestTrace.council_agreement,
              council_clash: latestTrace.council_clash,
              blind_spots_caught: latestTrace.blind_spots_caught,
              one_thing_first: latestTrace.one_thing_first,
              binary_evidence_checks: latestTrace.binary_evidence_checks,
              multiframe_chart: latestTrace.multiframe_chart,
              researcher_intel: latestTrace.researcher_intel,
              twitter_sentiment: latestTrace.twitter_sentiment,
              reasoning: latestTrace.reasoning,
              cid: latestTrace.cid,
              isAutonomousFeed: true
            } : null);

            if (!activeRun) {
              return (
                <TraderReady
                  connected={Boolean(accountId)}
                  settingsSaved={settingsConfirmed}
                  isScanning={isScanning}
                  coinLabel={coinMode === "auto" ? "Trending coins" : `${customCoins.length} coins`}
                  timeframe={timeframe}
                  minConfidence={minConfidence}
                  maxTxAmount={maxTxAmount}
                  onConnect={onConnectWallet}
                  onRun={handleScanNow}
                />
              );
            }

            return (
              <div className={`p-4 rounded-2xl border transition-all ${
                activeRun.success
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-card border-border"
              }`}>
                {isScanning && (
                  <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-2">
                      <RotateCw size={14} className="animate-spin text-primary" />
                      <span className="text-xs font-bold text-primary">
                        Scanning market in real-time... evaluating mathematical indicators &amp; 20 Trading Book heuristics
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">In Progress</span>
                  </div>
                )}
                {activeRun.limit_warning && (
                  <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-between">
                    <span>{activeRun.limit_warning}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${activeRun.success ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                    <h3 className="text-sm font-bold text-foreground">
                      Latest decision:{" "}
                      <span className={activeRun.success ? "text-emerald-400 font-mono font-bold" : "text-amber-400 font-mono font-bold"}>
                        {describeVerdict({ verdict: activeRun.verdict, success: activeRun.success }).label}
                      </span>
                    </h3>
                    {activeRun.isAutonomousFeed && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
                        <Activity size={10} /> Live Autonomous Run
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-foreground">
                      Coin: <strong>{symbolLabel(activeRun.symbol)}</strong>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confidence: <strong className="font-mono text-foreground">{activeRun.confidence_score}%</strong>{" "}
                      (needs {minConfidence}% to trade)
                    </span>
                  </div>
                </div>

                {/* Candlestick Vision Chart Display */}
                {activeRun.chart_image && activeRun.chart_image.data_uri && (
                  <div className="mb-4 rounded-xl overflow-hidden border border-border bg-[#0B0F19] shadow-xl">
                    <div className="p-2.5 bg-secondary/50 border-b border-border flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-foreground">
                        <LineChart size={14} className="text-primary" />
                        Real-Time Candlestick Chart &amp; Pattern Lines: {activeRun.pattern}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setModalChartUri(activeRun.chart_image.data_uri);
                            setModalChartTitle(`${activeRun.symbol} Technical Analysis & Forecast (${activeRun.pattern})`);
                            setSelectedChartTrace(activeRun);
                            setIsChartExpanded(true);
                          }}
                          className="key3d text-[11px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 flex items-center gap-1"
                          title="Expand Fullscreen Chart"
                        >
                          <Maximize2 size={12} /> Expand
                        </button>
                        {activeRun.ascii_chart && (
                          <button
                            onClick={() => setShowAsciiChart(!showAsciiChart)}
                            className="key3d text-[11px] px-2.5 py-1 rounded-lg bg-secondary/50 text-primary hover:bg-secondary border border-border flex items-center gap-1"
                          >
                            <Eye size={12} /> {showAsciiChart ? "Hide ASCII" : "View ASCII Chart"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* High-Resolution Interactive Chart Container */}
                    <div 
                      className="relative cursor-pointer group bg-[#0B0F19] p-1 flex justify-center"
                      onClick={() => {
                        setModalChartUri(activeRun.chart_image.data_uri);
                        setModalChartTitle(`${activeRun.symbol} Technical Analysis & Forecast (${activeRun.pattern})`);
                        setSelectedChartTrace(activeRun);
                        setIsChartExpanded(true);
                      }}
                    >
                      <img
                        src={activeRun.chart_image.data_uri}
                        alt="Candlestick Chart Pattern & Prediction"
                        className="w-full h-auto max-h-[380px] object-contain rounded"
                      />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 px-2 py-1 rounded text-[10px] text-white flex items-center gap-1 pointer-events-none">
                        <Maximize2 size={10} /> Click to expand
                      </div>
                    </div>

                    {/* Chart Feature Badges */}
                    <div className="px-3 py-2 bg-secondary/20 border-t border-border flex items-center gap-2 flex-wrap text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        ✓ Real Candles (Gecko/Bybit)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                        EMA 20/50 Ribbons
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                        S/R Zones
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                        SL &amp; TP Lines
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                        Pattern Overlay
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-semibold flex items-center gap-1">
                        <Sparkles size={10} /> Forward Prediction Path
                      </span>
                    </div>

                    {showAsciiChart && activeRun.ascii_chart && (
                      <pre className="p-3 text-[10px] font-mono text-emerald-400/90 overflow-x-auto bg-black/60 border-t border-border leading-tight">
                        {activeRun.ascii_chart}
                      </pre>
                    )}
                  </div>
                )}

                {/* Multi-Timeframe Chart Confluence Matrix (1h, 2h, 4h, 1d, 1w) */}
                {activeRun.multiframe_chart && (
                  <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-primary/20 space-y-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Layers size={12} /> Multi-Timeframe Chart Confluence (1h, 2h, 4h, 1d, 1w)
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        Macro Alignment: {activeRun.multiframe_chart.macro_alignment} ({activeRun.multiframe_chart.bullish_timeframes_count} Bullish)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      {activeRun.multiframe_chart.timeframe_details &&
                        Object.entries(activeRun.multiframe_chart.timeframe_details).map(([tf, d]: [string, any]) => (
                          <div key={tf} className="p-2 rounded-lg bg-background/50 border border-border text-[10px]">
                            <div className="flex justify-between items-center font-bold font-mono">
                              <span className="text-foreground uppercase">{tf}</span>
                              <span className={d.trend === "BULLISH" ? "text-emerald-400" : "text-rose-400"}>
                                {d.trend}
                              </span>
                            </div>
                            <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                              RSI: {d.rsi} • R:R: {d.risk_reward || "—"}
                            </div>
                            {d.pattern && (
                              <div className="text-[9px] text-primary truncate mt-0.5" title={d.pattern}>
                                {d.pattern}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* LLM Council Deliberation (5 Institutional Advisors) */}
                {(activeRun.council_agreement || activeRun.advisors) && (
                  <div className="mb-4 p-3.5 rounded-xl bg-secondary/30 border border-primary/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Users size={12} />
                        LLM Council Deliberation (5 Institutional Advisors)
                      </span>
                      {activeRun.one_thing_first && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Priority: {activeRun.one_thing_first}
                        </span>
                      )}
                    </div>

                    {/* 5 Advisors Grid */}
                    {activeRun.advisors && (
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-[10px]">
                        {activeRun.advisors.contrarian && (
                          <div className="p-2 rounded-lg bg-background/60 border border-rose-500/20">
                            <span className="font-bold text-rose-400 block mb-0.5">The Contrarian</span>
                            <p className="text-muted-foreground leading-relaxed">{activeRun.advisors.contrarian}</p>
                          </div>
                        )}
                        {activeRun.advisors.first_principles && (
                          <div className="p-2 rounded-lg bg-background/60 border border-blue-500/20">
                            <span className="font-bold text-blue-400 block mb-0.5">First Principles</span>
                            <p className="text-muted-foreground leading-relaxed">{activeRun.advisors.first_principles}</p>
                          </div>
                        )}
                        {activeRun.advisors.expansionist && (
                          <div className="p-2 rounded-lg bg-background/60 border border-emerald-500/20">
                            <span className="font-bold text-emerald-400 block mb-0.5">The Expansionist</span>
                            <p className="text-muted-foreground leading-relaxed">{activeRun.advisors.expansionist}</p>
                          </div>
                        )}
                        {activeRun.advisors.outsider && (
                          <div className="p-2 rounded-lg bg-background/60 border border-purple-500/20">
                            <span className="font-bold text-purple-400 block mb-0.5">The Outsider</span>
                            <p className="text-muted-foreground leading-relaxed">{activeRun.advisors.outsider}</p>
                          </div>
                        )}
                        {activeRun.advisors.executor && (
                          <div className="p-2 rounded-lg bg-background/60 border border-amber-500/20">
                            <span className="font-bold text-amber-400 block mb-0.5">The Executor</span>
                            <p className="text-muted-foreground leading-relaxed">{activeRun.advisors.executor}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agreement & Clashes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] pt-1">
                      {activeRun.council_agreement && (
                        <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                          <span className="font-bold text-emerald-400 block mb-0.5">Where the Council Agrees:</span>
                          <p className="text-emerald-200/80">{activeRun.council_agreement}</p>
                        </div>
                      )}
                      {activeRun.council_clash && (
                        <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/20">
                          <span className="font-bold text-amber-400 block mb-0.5">Where the Council Clashes:</span>
                          <p className="text-amber-200/80">{activeRun.council_clash}</p>
                        </div>
                      )}
                    </div>
                    {activeRun.blind_spots_caught && (
                      <div className="p-2 rounded-lg bg-background/40 border border-border text-[10px]">
                        <span className="font-bold text-primary block mb-0.5">Blind Spots Caught:</span>
                        <p className="text-muted-foreground">{activeRun.blind_spots_caught}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Binary Evidence Checks Breakdown */}
                {activeRun.binary_evidence_checks && (
                  <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Node 2 Binary Evidence Criteria (shimo4228/llm-as-judge)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {Object.entries(activeRun.binary_evidence_checks).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-1.5 text-xs">
                          {val ? (
                            <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                          ) : (
                            <XCircle size={14} className="text-rose-400 flex-shrink-0" />
                          )}
                          <span className="text-[10px] text-foreground capitalize truncate">
                            {key.replace(/_/g, " ").replace("has ", "")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Parameters (if warrant) */}
                {activeRun.success ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</span>
                      <p className="text-sm font-bold text-emerald-400">{activeRun.verdict || "ENTER_LONG"} {activeRun.symbol}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Price</span>
                      <p className="text-sm font-mono font-bold text-foreground">${activeRun.entry_price || activeRun.indicators?.current_price || "—"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Target size={11} /> Take Profit
                      </span>
                      <p className="text-sm font-mono font-bold text-emerald-400">
                        ${activeRun.take_profit_price} (+{activeRun.expected_roi_pct}%)
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                      <span className="text-[10px] text-rose-400 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle size={11} /> Stop Loss
                      </span>
                      <p className="text-sm font-mono font-bold text-rose-400">${activeRun.stop_loss_price}</p>
                    </div>
                  </div>
                ) : null}

                {/* Research Agent Intel & Twitter Sentiment Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {activeRun.researcher_intel && activeRun.researcher_intel.hired && (
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-bold text-purple-400 text-[11px]">
                          <BrainCircuit size={13} />
                          Researcher Agent Second Opinion (Free)
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                          {typeof activeRun.researcher_intel.signal === 'object' && activeRun.researcher_intel.signal !== null
                            ? `${(activeRun.researcher_intel.signal as any).action || ''} ${(activeRun.researcher_intel.signal as any).target_asset || ''}`.trim() || 'ACCUMULATE'
                            : String(activeRun.researcher_intel.signal || 'ACCUMULATE')}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {typeof activeRun.researcher_intel.executive_summary === 'object'
                          ? JSON.stringify(activeRun.researcher_intel.executive_summary)
                          : String(activeRun.researcher_intel.executive_summary || '')}
                      </p>
                    </div>
                  )}

                  {activeRun.twitter_sentiment && (
                    <div className="p-3 rounded-xl bg-secondary/40 border border-border text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
                          <Twitter size={13} className="text-sky-400" />
                          Twitter Sentiment ({activeRun.twitter_sentiment.hashtag})
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-bold">
                          {activeRun.twitter_sentiment.bullish_pct}% Bullish
                        </span>
                      </div>
                      {activeRun.twitter_sentiment.sample_tweets && activeRun.twitter_sentiment.sample_tweets[0] && (
                        <p className="text-[11px] text-muted-foreground italic truncate">
                          &quot;{activeRun.twitter_sentiment.sample_tweets[0]}&quot;
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>Judge Reasoning:</strong> {activeRun.reasoning}
                </p>

                {activeRun.cid && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Decentralized Reasoning Trace CID:</span>
                    <span className="font-mono text-primary truncate max-w-xs">{activeRun.cid}</span>
                  </div>
                )}
              </div>
            );
          })()}

          
          <div {...tilt3d(2)} className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4 select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock size={18} className="text-primary" />
                <h3 className="text-base font-bold text-foreground">
                  Open Positions
                  <InfoTip label="About open positions">
                    Checked every 60 seconds so take-profit and stop-loss levels trigger on time.
                  </InfoTip>
                </h3>
              </div>
              <span className="text-sm font-mono font-semibold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                {openTrades.length} Active Positions
              </span>
            </div>

            {openTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 font-medium">Trade</th>
                      <th className="pb-2 font-medium">Entry</th>
                      <th className="pb-2 font-medium">Current</th>
                      <th className="pb-2 font-medium text-emerald-400">Target TP</th>
                      <th className="pb-2 font-medium text-rose-400">Stop Loss</th>
                      <th className="pb-2 font-medium">Confidence</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
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
              <div className="py-6 text-center text-sm text-muted-foreground">
                No open trades right now.
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ═══ REASONING TRACES, STEP-BY-STEP AGENT RUNS & TRADE HISTORY ═══ */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div {...tilt3d(1.5)} className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4">
            {/* Header with Dual Tabs and Fullscreen Trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2.5">
                  <Brain size={18} className="text-primary" />
                  Agent Decisions &amp; Trades
                  <InfoTip label="About decisions and trades">
                    Every time your agent checked the market, why it did or didn&apos;t trade, and the trades it made.
                  </InfoTip>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullScreenHistoryOpen(true)}
                  {...tilt3d(8)}
                  className="tilt3d pop3d flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-sm font-bold"
                  title="Open Full Screen History & Traces"
                >
                  <Maximize2 size={14} />
                  <span>Full Screen View</span>
                </button>
                <button
                  onClick={fetchTrades}
                  disabled={isLoadingTrades}
                  {...tilt3d(10)}
                  className="tilt3d pop3d shrink-0 p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground border border-border"
                  title="Refresh Trades & Traces"
                  aria-label="Refresh trades and traces"
                >
                  <RotateCw size={15} className={isLoadingTrades ? "animate-spin text-primary" : ""} />
                </button>
              </div>
            </div>

            {/* Sub-Tabs: Reasoning Traces vs Trade History */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTraceTab("traces")}
                  data-active={activeTraceTab === "traces"}
                  {...tilt3d(8)}
                  className={`tilt3d pop3d flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold ${
                    activeTraceTab === "traces"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Brain size={14} />
                  <span>Decisions</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-background/20 font-mono">
                    {traces.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTraceTab("history")}
                  data-active={activeTraceTab === "history"}
                  {...tilt3d(8)}
                  className={`tilt3d pop3d flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold ${
                    activeTraceTab === "history"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock size={14} />
                  <span>Trades</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-background/20 font-mono">
                    {openTrades.length + tradeHistory.length + droppedTrades.length}
                  </span>
                </button>
              </div>

              {/* Status pill filter if in history tab */}
              {activeTraceTab === "history" && (
                <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-xl border border-border text-[11px]">
                  <button
                    onClick={() => setHistoryStatusFilter("all")}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      historyStatusFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({openTrades.length + tradeHistory.length + droppedTrades.length})
                  </button>
                  <button
                    onClick={() => setHistoryStatusFilter("open")}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      historyStatusFilter === "open" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Active ({openTrades.length})
                  </button>
                  <button
                    onClick={() => setHistoryStatusFilter("completed")}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      historyStatusFilter === "completed" ? "bg-background text-emerald-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Completed ({tradeHistory.length})
                  </button>
                  <button
                    onClick={() => setHistoryStatusFilter("dropped")}
                    className={`px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${
                      historyStatusFilter === "dropped"
                        ? "bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)] font-bold"
                        : "text-rose-400/80 hover:text-rose-300"
                    }`}
                  >
                    <AlertTriangle size={10} className="text-rose-400" />
                    <span>Dropped ({droppedTrades.length})</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── VIEW 1: AGENT REASONING TRACES (WITH STEP-BY-STEP EVAL BREAKDOWN) ── */}
            {activeTraceTab === "traces" && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Each card is one check of the market.</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Opened a trade
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Waited
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Blocked
                  </span>
                </div>
                {traces.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Brain size={28} className="mx-auto mb-2 text-muted-foreground/40" />
                    No decisions yet. Your agent logs one here every time it checks the market.
                  </div>
                ) : (
                  traces.map((tr, i) => (
                    <TraceCard
                      key={tr.cid || i}
                      trace={tr as TraceData}
                      expanded={expandedTraceCid === tr.cid}
                      copied={copiedCid === tr.cid}
                      onToggle={() => setExpandedTraceCid(expandedTraceCid === tr.cid ? null : tr.cid)}
                      onCopy={handleCopyTrace}
                      onOpenChart={(uri, title) => {
                        setModalChartUri(uri);
                        setModalChartTitle(title);
                        setSelectedChartTrace(tr);
                        setIsChartExpanded(true);
                      }}
                    />
                  ))
                )}
              </div>
            )}

            {/* ── VIEW 2: TRADE HISTORY (ACTIVE, COMPLETED & DROPPED TRADES) ── */}
            {activeTraceTab === "history" && (
              <div className="space-y-3 pt-1">
                {/* Active Positions */}
                {(historyStatusFilter === "all" || historyStatusFilter === "open") && openTrades.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      Active Positions (1-Minute TP/SL Poller Target)
                    </span>
                    <div className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                            <th className="py-2.5 px-3 font-medium">Trade</th>
                            <th className="py-2.5 px-3 font-medium">Entry</th>
                            <th className="py-2.5 px-3 font-medium">Current</th>
                            <th className="py-2.5 px-3 font-medium text-emerald-400">TP</th>
                            <th className="py-2.5 px-3 font-medium text-rose-400">SL</th>
                            <th className="py-2.5 px-3 font-medium">Confidence</th>
                            <th className="py-2.5 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {openTrades.map((t) => (
                            <tr key={t.id} className="hover:bg-primary/10 transition-colors">
                              <td className="py-2 px-3 font-bold text-foreground">{t.action} {t.symbol}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">${t.entry_price}</td>
                              <td className="py-2 px-3 font-mono text-foreground font-semibold">${t.current_price}</td>
                              <td className="py-2 px-3 font-mono text-emerald-400">${t.tp_price}</td>
                              <td className="py-2 px-3 font-mono text-rose-400">${t.sl_price}</td>
                              <td className="py-2 px-3 font-mono text-primary">{t.confidence_score}%</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/20 text-primary border border-primary/30">
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dropped / Failed Trades WITH HIGH VISIBILITY RED EFFECTS */}
                {(historyStatusFilter === "all" || historyStatusFilter === "dropped") && droppedTrades.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-rose-400" />
                      Dropped / Failed Trades (Hard Validator Guard)
                    </span>
                    <div className="space-y-2">
                      {droppedTrades.map((d) => (
                        <div
                          key={`drop-${d.id}-${d.created_at}`}
                          className="p-3.5 rounded-xl border border-rose-500/50 bg-rose-950/20 text-xs shadow-[0_0_15px_rgba(244,63,94,0.15)] flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/50 ring-1 ring-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.25)]">
                                <AlertTriangle size={10} className="text-rose-400" />
                                <span>DROPPED</span>
                              </span>
                              <span className="font-bold text-rose-200 text-xs">{d.symbol}</span>
                              {d.amount_usd > 0 && (
                                <span className="font-mono text-rose-300/80 text-[11px]">(${d.amount_usd})</span>
                              )}
                              {Boolean(d.is_cross_chain) && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                                  CROSS-CHAIN
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-rose-200 bg-rose-950/50 p-2 rounded-lg border border-rose-800/40">
                              <strong>Drop Reason:</strong> {d.drop_reason}
                            </p>
                          </div>
                          <span className="text-[10px] text-rose-300/60 font-mono shrink-0 self-end sm:self-start">
                            {d.created_at ? new Date(d.created_at).toLocaleTimeString() : "Recent"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Historical Trades */}
                {(historyStatusFilter === "all" || historyStatusFilter === "completed") && tradeHistory.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      Completed Historical Trades
                    </span>
                    <div className="rounded-xl border border-border bg-secondary/20 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30 text-muted-foreground">
                            <th className="py-2.5 px-3 font-medium">Trade</th>
                            <th className="py-2.5 px-3 font-medium">Entry Price</th>
                            <th className="py-2.5 px-3 font-medium">Exit / TP</th>
                            <th className="py-2.5 px-3 font-medium">Amount</th>
                            <th className="py-2.5 px-3 font-medium">Status</th>
                            <th className="py-2.5 px-3 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {tradeHistory.map((h) => (
                            <tr key={h.id} className="hover:bg-secondary/40 transition-colors">
                              <td className="py-2 px-3 font-bold text-foreground">{h.action} {h.symbol}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">${h.entry_price}</td>
                              <td className="py-2 px-3 font-mono text-emerald-400">${h.tp_price || h.current_price}</td>
                              <td className="py-2 px-3 font-mono text-foreground">${h.amount_usd}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  {h.status || "COMPLETED"}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground">
                                {h.created_at ? new Date(h.created_at).toLocaleDateString() : "Recent"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {openTrades.length === 0 && tradeHistory.length === 0 && droppedTrades.length === 0 && (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    <Clock size={24} className="mx-auto mb-2 text-muted-foreground/40" />
                    No trades recorded yet. Activated positions and execution logs will appear here.
                  </div>
                )}
              </div>
            )}
          </div>
          <FullScreenHistoryModal
            isOpen={isFullScreenHistoryOpen}
            onClose={() => setIsFullScreenHistoryOpen(false)}
            accountId={accountId}
          />

          {/* Interactive Lightweight Chart & Strategy Reason Modal */}
          <InteractiveChartModal
            isOpen={isChartExpanded}
            onClose={() => setIsChartExpanded(false)}
            symbol={selectedChartTrace?.symbol || scanResult?.symbol || "MARKET"}
            timeframe={selectedChartTrace?.timeframe || timeframe || "1h"}
            verdict={selectedChartTrace?.verdict || scanResult?.verdict}
            action={selectedChartTrace?.action}
            stage={selectedChartTrace?.stage}
            confidenceScore={selectedChartTrace?.confidence_score ?? scanResult?.confidence_score}
            expectedRoiPct={selectedChartTrace?.expected_roi_pct ?? scanResult?.expected_roi_pct}
            entryPrice={selectedChartTrace?.entry_price ?? scanResult?.pipeline?.council?.plans?.[0]?.entry}
            tpPrice={selectedChartTrace?.take_profit_price ?? scanResult?.pipeline?.council?.plans?.[0]?.tp}
            slPrice={selectedChartTrace?.stop_loss_price ?? scanResult?.pipeline?.council?.plans?.[0]?.sl}
            riskRewardRatio={selectedChartTrace?.risk_reward_ratio ?? scanResult?.pipeline?.council?.plans?.[0]?.risk_reward}
            patternDetected={selectedChartTrace?.pattern_detected || scanResult?.pattern}
            reasoning={selectedChartTrace?.reasoning || scanResult?.reasoning || scanResult?.halt_cause}
            dropReason={selectedChartTrace?.drop_reason || scanResult?.drop_reason}
            chartImageUri={modalChartUri}
            candles={selectedChartTrace?.indicators?.candles || scanResult?.candles}
            indicators={selectedChartTrace?.indicators || scanResult?.indicators}
          />
        </div>
      </div>
    </div>
  );
}
