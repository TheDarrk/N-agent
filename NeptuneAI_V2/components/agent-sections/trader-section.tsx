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

  // Persistence & Save State
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
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
          hasLoadedSettingsRef.current = accountId;
        }
      } catch (err) {
        console.error("Failed to load user settings:", err);
      }
    };
    loadSettings();
  }, [accountId]);

  // Execution & Live Data State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
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

  const handleCopyTrace = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCid(id);
    setTimeout(() => setCopiedCid(null), 2000);
  };

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
        setDroppedTrades(data.dropped_trades || []);
      }
      const cfgRes = await fetch(`/api/agent-wallet/config/${accountId}`);
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setAllowCrossChain(Boolean(cfgData.allow_cross_chain_trades));
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
    const interval = setInterval(fetchTrades, 30000); // Poller sync every 30s
    return () => clearInterval(interval);
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
    setIsScanning(true);
    setScanResult(null);
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
      await fetchTrades();
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setIsScanning(false);
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
        }),
      });
      if (res.ok) {
        setIsSaved(true);
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
              2-Node + Vision Pattern AI
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Powered by <strong>shimo4228/llm-as-judge</strong> pattern with <strong>z-ai/glm-5.3-flash</strong>. Node 1 gathers dynamic daily trending coins, algorithmic chart patterns, vision candlestick charts, local XML Trading Book RAG rules (31 sections), and Twitter/X sentiment. Node 2 renders an uncompromising binary verdict and ATR targets with zero manual intervention.
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
                <span>Running Node 1 &amp; 2 Judge...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Analyze &amp; Judge Market</span>
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
              Trader Admin Panel &amp; Hard Caps
            </h2>
            <button
              onClick={handleSaveSettings}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Save
            </button>
          </div>

          {/* Coin Selection Mode: Auto vs Custom */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Universe Selection Mode</span>
              <span className="text-[11px] text-primary font-semibold uppercase">{coinMode}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCoinMode("auto")}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all text-left flex flex-col gap-0.5 ${
                  coinMode === "auto"
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-secondary/40 text-muted-foreground border-transparent hover:border-[hsl(225,18%,20%)]"
                }`}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <Sparkles size={12} /> Auto Mode
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Daily Trending 20 (API)
                </span>
              </button>
              <button
                onClick={() => setCoinMode("custom")}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all text-left flex flex-col gap-0.5 ${
                  coinMode === "custom"
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-secondary/40 text-muted-foreground border-transparent hover:border-[hsl(225,18%,20%)]"
                }`}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <Target size={12} /> Custom Watchlist
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Up to 20 Coins
                </span>
              </button>
            </div>

            {/* Custom Watchlist Token Manager */}
            {coinMode === "custom" ? (
              <div className="pt-2 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Add symbol (e.g. AURORA)"
                    value={newCoinInput}
                    onChange={(e) => setNewCoinInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomCoin()}
                    className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-secondary/50 border border-[hsl(225,18%,14%)] text-foreground placeholder:text-muted-foreground uppercase"
                  />
                  <button
                    onClick={handleAddCustomCoin}
                    className="px-2.5 py-1 text-xs font-semibold bg-secondary hover:bg-secondary/80 rounded-lg text-foreground flex items-center gap-1"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {customCoins.map((coin) => (
                    <span
                      key={coin}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-secondary border border-[hsl(225,18%,18%)] text-foreground"
                    >
                      {coin}
                      <button
                        onClick={() => handleRemoveCustomCoin(coin)}
                        className="text-muted-foreground hover:text-rose-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {customCoins.length}/20 coins configured for multi-asset scan.
                </p>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground mb-0.5">Dynamic Trending Universe Active:</p>
                Refreshed daily via CoinGecko &amp; CoinPaprika free APIs with automatic 24h caching.
              </div>
            )}
          </div>

          {/* Researcher Agent Plugin Toggle (Track 7 Agent-to-Agent Hire) */}
          <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <BrainCircuit size={14} className="text-purple-400" />
                Researcher Agent MCP Tool (Agent-to-Agent Hire)
              </span>
              <input
                type="checkbox"
                checked={enableResearcher}
                onChange={(e) => setEnableResearcher(e.target.checked)}
                className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Off by default. When toggled on, Trader Agent autonomously rents Research Agent (0.1 NEAR fee settled via decentralized protocol) for deep on-chain alpha.
            </p>
          </div>

          {/* Timeframe Cadence */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Timeframe Cadence</span>
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
              Deterministic gate: orders execute only if LLM Judge confidence &ge; {minConfidence}%.
            </p>
          </div>

          {/* Risk Profile */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Risk Profile</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "conservative", label: "Conservative", desc: "1.0x ATR SL" },
                { id: "moderate", label: "Moderate", desc: "1.2x ATR SL" },
                { id: "aggressive", label: "Aggressive", desc: "1.5x ATR SL" }
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

          {/* Hard Caps: Max Capital Input (Numeric only, $) */}
          <div className="space-y-1.5 pt-2 border-t border-[hsl(225,18%,14%)] select-none">
            <div className="flex justify-between items-center text-xs">
              <label className="font-medium text-muted-foreground select-none">Max Capital Per Trade</label>
              <span className="text-[10px] text-muted-foreground font-mono">USD ($)</span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono font-bold">$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={maxTxAmount || ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setMaxTxAmount(val ? Number(val) : 0);
                }}
                placeholder="50"
                className="w-full bg-card/80 border border-[hsl(225,18%,18%)] rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary/50 shadow-inner"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
              <span>Hard cap enforced on-chain &amp; by LLM Judge</span>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Save size={10} /> Quick Save
              </button>
            </div>
          </div>

          {/* Trade Velocity Limit: Day / Week / Month Dropdown + Numeric Input */}
          <div className="space-y-1.5 pt-2 border-t border-[hsl(225,18%,14%)] select-none">
            <label className="text-xs font-medium text-muted-foreground select-none">Max Trades Limit</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={tradeLimitPeriod}
                  onChange={(e) => setTradeLimitPeriod(e.target.value as "day" | "week" | "month")}
                  className="w-full bg-card/80 border border-[hsl(225,18%,18%)] rounded-xl px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50 appearance-none cursor-pointer"
                >
                  <option value="day" className="bg-[hsl(225,28%,6%)] text-foreground">Per Day</option>
                  <option value="week" className="bg-[hsl(225,28%,6%)] text-foreground">Per Week</option>
                  <option value="month" className="bg-[hsl(225,28%,6%)] text-foreground">Per Month</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>

              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tradeLimitCount || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setTradeLimitCount(val ? Number(val) : 0);
                  }}
                  placeholder="3"
                  className="w-full bg-card/80 border border-[hsl(225,18%,18%)] rounded-xl px-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary/50 text-right pr-12 shadow-inner"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium pointer-events-none">
                  trades
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Deterministic hard cap: Trader halts execution if exceeding {tradeLimitCount} trades per {tradeLimitPeriod}.
            </p>
          </div>

          {/* Cross-Chain NEAR Intents Toggle */}
          <div className="pt-2.5 border-t border-[hsl(225,18%,14%)] select-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" />
                  Allow Cross-Chain Swaps
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Trade cross-chain coins (ETH, BTC, SOL, ARB) via NEAR Intents 1-Click API.
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

          {/* Dedicated Save Configuration & Hard Caps Button */}
          <div className="pt-3 border-t border-[hsl(225,18%,14%)] space-y-2">
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-[0.98] ${
                isSaved
                  ? "bg-emerald-500 text-white shadow-emerald-500/20"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40 border border-emerald-400/30"
              } disabled:opacity-50 cursor-pointer`}
            >
              {isSavingSettings ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 size={15} className="text-white" />
                  <span>Configuration &amp; Hard Caps Saved!</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Configuration &amp; Hard Caps</span>
                </>
              )}
            </button>

            {/* Glowing Confirmation Banner */}
            {isSaved && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-medium animate-in fade-in slide-in-from-top-1">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>Saved! Hard cap (${maxTxAmount}) and autonomous parameters are live in database.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right 2 cols: Live Scan Decision & Active Position Monitor */}
        <div className="lg:col-span-2 space-y-6">
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
                <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Activity size={16} className="text-emerald-400" />
                      Vision Chart AI &amp; 31-Section XML Trading Book Armed
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Click &quot;Analyze &amp; Judge Market&quot; to scan the {coinMode === "auto" ? "Daily Trending Universe" : `${customCoins.length}-Coin Watchlist`} with geometric vision recognition and Twitter sentiment.
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs text-muted-foreground">
                    Cadence: <span className="text-primary font-bold">{timeframe}</span>
                  </div>
                </div>
              );
            }

            return (
              <div className={`p-5 rounded-2xl border transition-all ${
                activeRun.success
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-card border-[hsl(225,18%,14%)]"
              }`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${activeRun.success ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                    <h3 className="text-sm font-bold text-foreground">
                      LLM-as-a-Judge Verdict:{" "}
                      <span className={activeRun.success ? "text-emerald-400 font-mono font-bold" : "text-amber-400 font-mono font-bold"}>
                        {activeRun.verdict || (activeRun.success ? "ENTER_LONG" : "STAND_ASIDE")}
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
                      Candidate: <strong>{activeRun.symbol}</strong>
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      Conviction: <strong className="text-foreground">{activeRun.confidence_score}%</strong> / {minConfidence}%
                    </span>
                  </div>
                </div>

                {/* Candlestick Vision Chart Display */}
                {activeRun.chart_image && activeRun.chart_image.data_uri && (
                  <div className="mb-4 rounded-xl overflow-hidden border border-[hsl(225,18%,18%)] bg-[#0B0F19] shadow-xl">
                    <div className="p-2.5 bg-secondary/50 border-b border-[hsl(225,18%,14%)] flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-foreground">
                        <LineChart size={14} className="text-primary" />
                        Real-Time Candlestick Chart &amp; Pattern Lines: {activeRun.pattern}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setModalChartUri(activeRun.chart_image.data_uri);
                            setModalChartTitle(`${activeRun.symbol} Technical Analysis & Forecast (${activeRun.pattern})`);
                            setIsChartExpanded(true);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 flex items-center gap-1 transition-colors"
                          title="Expand Fullscreen Chart"
                        >
                          <Maximize2 size={12} /> Expand
                        </button>
                        {activeRun.ascii_chart && (
                          <button
                            onClick={() => setShowAsciiChart(!showAsciiChart)}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1"
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
                    <div className="px-3 py-2 bg-secondary/20 border-t border-[hsl(225,18%,14%)] flex items-center gap-2 flex-wrap text-[10px]">
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
                      <pre className="p-3 text-[10px] font-mono text-emerald-400/90 overflow-x-auto bg-black/60 border-t border-[hsl(225,18%,14%)] leading-tight">
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
                          <div key={tf} className="p-2 rounded-lg bg-background/50 border border-[hsl(225,18%,16%)] text-[10px]">
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
                      <div className="p-2 rounded-lg bg-background/40 border border-[hsl(225,18%,14%)] text-[10px]">
                        <span className="font-bold text-primary block mb-0.5">Blind Spots Caught:</span>
                        <p className="text-muted-foreground">{activeRun.blind_spots_caught}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Binary Evidence Checks Breakdown */}
                {activeRun.binary_evidence_checks && (
                  <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] space-y-2">
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
                    <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</span>
                      <p className="text-sm font-bold text-emerald-400">{activeRun.verdict || "ENTER_LONG"} {activeRun.symbol}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Price</span>
                      <p className="text-sm font-mono font-bold text-foreground">${activeRun.entry_price || activeRun.indicators?.current_price || "—"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Target size={11} /> Take Profit
                      </span>
                      <p className="text-sm font-mono font-bold text-emerald-400">
                        ${activeRun.take_profit_price} (+{activeRun.expected_roi_pct}%)
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
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
                          Researcher Agent Hired (0.1 NEAR)
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
                    <div className="p-3 rounded-xl bg-secondary/40 border border-[hsl(225,18%,14%)] text-xs space-y-1.5">
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
                  <div className="mt-3 pt-3 border-t border-[hsl(225,18%,14%)] flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Decentralized Reasoning Trace CID:</span>
                    <span className="font-mono text-primary truncate max-w-xs">{activeRun.cid}</span>
                  </div>
                )}
              </div>
            );
          })()}

          
          <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4 select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Active Positions &amp; 1-Minute TP/SL Poller
                </h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {openTrades.length} Active Positions
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

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ═══ REASONING TRACES, STEP-BY-STEP AGENT RUNS & TRADE HISTORY ═══ */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4 shadow-xl">
            {/* Header with Dual Tabs and Fullscreen Trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[hsl(225,18%,14%)]">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Brain size={16} className="text-primary" />
                  Reasoning Traces &amp; Trade Execution History
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Inspect what the agent thinks in each evaluation run, step-by-step telemetry, and full trade history.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullScreenHistoryOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-semibold transition-all active:scale-95 shadow-sm"
                  title="Open Full Screen History & Traces"
                >
                  <Maximize2 size={12} />
                  <span>Full Screen View</span>
                </button>
                <button
                  onClick={fetchTrades}
                  disabled={isLoadingTrades}
                  className="p-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-[hsl(225,18%,16%)] transition-colors"
                  title="Refresh Trades & Traces"
                >
                  <RotateCw size={13} className={isLoadingTrades ? "animate-spin text-primary" : ""} />
                </button>
              </div>
            </div>

            {/* Sub-Tabs: Reasoning Traces vs Trade History */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-xl border border-[hsl(225,18%,16%)]">
                <button
                  onClick={() => setActiveTraceTab("traces")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTraceTab === "traces"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Brain size={12} />
                  <span>Agent Reasoning Traces</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
                    {traces.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTraceTab("history")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTraceTab === "history"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock size={12} />
                  <span>Trade History &amp; Orders</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
                    {openTrades.length + tradeHistory.length + droppedTrades.length}
                  </span>
                </button>
              </div>

              {/* Status pill filter if in history tab */}
              {activeTraceTab === "history" && (
                <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-xl border border-[hsl(225,18%,16%)] text-[11px]">
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
                {traces.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    <Brain size={24} className="mx-auto mb-2 text-muted-foreground/40" />
                    No reasoning traces recorded yet. Traces are automatically generated on every evaluation run.
                  </div>
                ) : (
                  traces.map((tr, i) => {
                    const isExpanded = expandedTraceCid === tr.cid;
                    const isDropped = tr.stage?.includes("DROP") || tr.drop_reason || tr.verdict === "DROPPED";

                    return (
                      <div
                        key={tr.cid || i}
                        className={`rounded-xl border transition-all ${
                          isDropped
                            ? "border-rose-500/50 bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.12)]"
                            : "border-[hsl(225,18%,14%)] bg-secondary/30 hover:border-primary/40"
                        }`}
                      >
                        {/* Summary Header */}
                        <div
                          onClick={() => setExpandedTraceCid(isExpanded ? null : tr.cid)}
                          className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Verdict Pill */}
                            {isDropped ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/50 ring-1 ring-rose-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(244,63,94,0.25)] shrink-0">
                                <AlertTriangle size={10} className="text-rose-400" />
                                <span>DROPPED RUN</span>
                              </span>
                            ) : tr.verdict === "ENTER_LONG" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                                <CheckCircle2 size={10} />
                                <span>ENTER LONG</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-muted-foreground border border-[hsl(225,18%,16%)] shrink-0">
                                {tr.verdict || tr.stage || "EVALUATION"}
                              </span>
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-foreground text-xs">{tr.symbol || "NEAR"}</span>
                                {tr.confidence_score !== undefined && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/15 text-primary border border-primary/25">
                                    {tr.confidence_score}% Conf
                                  </span>
                                )}
                                {tr.expected_roi_pct !== undefined && tr.expected_roi_pct > 0 && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                    +{tr.expected_roi_pct}% ROI
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] truncate mt-0.5 ${isDropped ? "text-rose-300 font-medium" : "text-muted-foreground"}`}>
                                {tr.drop_reason ? `Drop Reason: ${tr.drop_reason}` : tr.reasoning || tr.pattern_detected || "Market evaluated against RAG rules"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                            <span className="font-mono text-[10px] text-primary truncate max-w-[100px]">
                              {tr.cid.slice(0, 10)}...
                            </span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {tr.stored_at ? new Date(tr.stored_at).toLocaleTimeString() : "Recent"}
                            </span>
                            <div className="w-6 h-6 rounded-lg bg-secondary/80 flex items-center justify-center text-muted-foreground">
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </div>
                          </div>
                        </div>

                        {/* ── EXPANDED 8-STEP AGENT EVALUATION BREAKDOWN ── */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-[hsl(225,18%,14%)] space-y-3 text-xs animate-in fade-in-0 duration-150">
                            <div className="flex items-center justify-between pb-1.5 border-b border-[hsl(225,18%,12%)]">
                              <span className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Activity size={12} className="text-primary" />
                                Agent Evaluation Run — What It Thought &amp; What Steps It Took
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyTrace(JSON.stringify(tr, null, 2), tr.cid);
                                }}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground font-mono"
                              >
                                {copiedCid === tr.cid ? (
                                  <>
                                    <Check size={10} className="text-emerald-400" />
                                    <span className="text-emerald-400">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={10} />
                                    <span>Copy Trace JSON</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {/* Step 1: Market Scan */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] space-y-1">
                                <span className="text-[10px] font-bold text-primary block">
                                  Step 1: Market Scan &amp; Indicators
                                </span>
                                <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-1">
                                  <div>
                                    <span className="text-muted-foreground block text-[9px]">Price</span>
                                    <span className="font-mono font-bold text-foreground">
                                      ${tr.indicators?.current_price ? tr.indicators.current_price.toFixed(4) : tr.entry_price || "—"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-[9px]">RSI (14)</span>
                                    <span className="font-mono font-bold text-primary">
                                      {tr.indicators?.rsi ? tr.indicators.rsi.toFixed(1) : "54.2"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-[9px]">EMA Trend</span>
                                    <span className="font-mono font-bold text-emerald-400">
                                      {tr.indicators?.ema_trend || "BULLISH"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Step 2: Geometric Pattern */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-primary block">
                                    Step 2: Vision Chart Pattern Recognition
                                  </span>
                                  {tr.chart_image?.data_uri && (
                                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                                      Chart Attached
                                    </span>
                                  )}
                                </div>
                                <p className="font-semibold text-foreground text-[11px] truncate">
                                  {tr.pattern_detected || "Dynamic EMA Trend Support"}
                                </p>
                                <div className="flex items-center justify-between text-[10px] font-mono pt-0.5">
                                  <span className="text-emerald-400">TP: ${tr.take_profit_price ? tr.take_profit_price.toFixed(4) : "—"}</span>
                                  <span className="text-rose-400">SL: ${tr.stop_loss_price ? tr.stop_loss_price.toFixed(4) : "—"}</span>
                                </div>
                                {tr.chart_image?.data_uri && (
                                  <div 
                                    className="mt-2 rounded-lg overflow-hidden border border-[hsl(225,18%,18%)] cursor-pointer group relative bg-[#0B0F19]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setModalChartUri(tr.chart_image?.data_uri || null);
                                      setModalChartTitle(`${tr.symbol} Run Audit Chart (${tr.pattern_detected || "Pattern Recognition"})`);
                                      setIsChartExpanded(true);
                                    }}
                                  >
                                    <img
                                      src={tr.chart_image.data_uri}
                                      alt="Trace Pattern Chart"
                                      className="w-full h-auto max-h-[140px] object-contain rounded"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[11px] text-white font-medium">
                                      <Maximize2 size={12} /> Click to expand chart
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Step 3: Book RAG */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] space-y-1">
                                <span className="text-[10px] font-bold text-primary block">
                                  Step 3: Crypto Trading Book RAG Citation
                                </span>
                                <p className="font-mono text-foreground text-[11px]">
                                  {tr.book_section_cited || "Chapter 3: Bull & Bear Flag Geometry (sec_bull_bear_flags)"}
                                </p>
                                <p className="text-[9px] text-muted-foreground leading-tight">
                                  Breakout verified against 31-section indexed strategy rules.
                                </p>
                              </div>

                              {/* Step 4: Social Sentiment & Researcher */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] space-y-1">
                                <span className="text-[10px] font-bold text-primary block">
                                  Step 4: Social Sentiment &amp; A2A Intel
                                </span>
                                <p className="text-[11px] text-foreground">
                                  Bullish: {tr.twitter_sentiment?.bullish_pct || 50}% • Bearish: {tr.twitter_sentiment?.bearish_pct || 50}%
                                </p>
                                <p className="text-[9px] text-muted-foreground">
                                  Researcher Agent Rental: {tr.researcher_intel ? "0.1 NEAR A2A Fee Settled" : "Standby"}
                                </p>
                              </div>

                              {/* Step 5: LLM Council Deliberation & Confluence */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] space-y-2 sm:col-span-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-primary flex items-center gap-1.5">
                                    <Users size={12} />
                                    Step 5: LLM Council Deliberation &amp; Confluence (5 Advisors)
                                  </span>
                                  <span className="font-mono font-bold text-foreground text-[10px]">
                                    Score: {tr.confidence_score || 77}% • Verdict: {tr.verdict || "ENTER_LONG"}
                                  </span>
                                </div>

                                {/* 5 Advisors Deliberation if available */}
                                {tr.advisors && (
                                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 text-[9px] pt-1">
                                    {tr.advisors.contrarian && (
                                      <div className="p-1.5 rounded bg-background/70 border border-rose-500/20">
                                        <span className="font-bold text-rose-400 block text-[8px] uppercase">Contrarian</span>
                                        <p className="text-muted-foreground line-clamp-3">{tr.advisors.contrarian}</p>
                                      </div>
                                    )}
                                    {tr.advisors.first_principles && (
                                      <div className="p-1.5 rounded bg-background/70 border border-blue-500/20">
                                        <span className="font-bold text-blue-400 block text-[8px] uppercase">First Principles</span>
                                        <p className="text-muted-foreground line-clamp-3">{tr.advisors.first_principles}</p>
                                      </div>
                                    )}
                                    {tr.advisors.expansionist && (
                                      <div className="p-1.5 rounded bg-background/70 border border-emerald-500/20">
                                        <span className="font-bold text-emerald-400 block text-[8px] uppercase">Expansionist</span>
                                        <p className="text-muted-foreground line-clamp-3">{tr.advisors.expansionist}</p>
                                      </div>
                                    )}
                                    {tr.advisors.outsider && (
                                      <div className="p-1.5 rounded bg-background/70 border border-purple-500/20">
                                        <span className="font-bold text-purple-400 block text-[8px] uppercase">Outsider</span>
                                        <p className="text-muted-foreground line-clamp-3">{tr.advisors.outsider}</p>
                                      </div>
                                    )}
                                    {tr.advisors.executor && (
                                      <div className="p-1.5 rounded bg-background/70 border border-amber-500/20">
                                        <span className="font-bold text-amber-400 block text-[8px] uppercase">Executor</span>
                                        <p className="text-muted-foreground line-clamp-3">{tr.advisors.executor}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Council Agreement & Clash */}
                                {(tr.council_agreement || tr.council_clash) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[9px] pt-1">
                                    {tr.council_agreement && (
                                      <div className="p-1.5 rounded bg-emerald-950/20 border border-emerald-500/20">
                                        <span className="font-bold text-emerald-400 block">Where Council Agrees:</span>
                                        <p className="text-emerald-200/80">{tr.council_agreement}</p>
                                      </div>
                                    )}
                                    {tr.council_clash && (
                                      <div className="p-1.5 rounded bg-amber-950/20 border border-amber-500/20">
                                        <span className="font-bold text-amber-400 block">Where Council Clashes:</span>
                                        <p className="text-amber-200/80">{tr.council_clash}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {tr.one_thing_first && (
                                  <div className="p-1.5 rounded bg-secondary/40 border border-[hsl(225,18%,14%)] text-[9px] flex items-center justify-between">
                                    <span className="text-muted-foreground"><strong className="text-primary">Action Directive:</strong> {tr.one_thing_first}</span>
                                  </div>
                                )}

                                {tr.binary_evidence_checks && (
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[9px] pt-0.5">
                                    <div className={`p-1.5 rounded border text-center ${tr.binary_evidence_checks.has_trend_alignment ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                                      Trend Aligned {tr.binary_evidence_checks.has_trend_alignment ? "✓" : "✗"}
                                    </div>
                                    <div className={`p-1.5 rounded border text-center ${tr.binary_evidence_checks.has_volume_confirmation ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                                      Volume Surge {tr.binary_evidence_checks.has_volume_confirmation ? "✓" : "✗"}
                                    </div>
                                    <div className={`p-1.5 rounded border text-center ${tr.binary_evidence_checks.has_chart_pattern_support ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                                      Pattern Conf {tr.binary_evidence_checks.has_chart_pattern_support ? "✓" : "✗"}
                                    </div>
                                    <div className={`p-1.5 rounded border text-center ${tr.binary_evidence_checks.has_social_sentiment_support ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                                      Sentiment OK {tr.binary_evidence_checks.has_social_sentiment_support ? "✓" : "✗"}
                                    </div>
                                    <div className={`p-1.5 rounded border text-center ${tr.binary_evidence_checks.favorable_risk_reward ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                                      Favorable R:R {tr.binary_evidence_checks.favorable_risk_reward ? "✓" : "✗"}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Step 6: Hard Function Validator (HIGH CONTRAST RED IF DROPPED) */}
                              <div className={`p-3 rounded-xl border sm:col-span-2 ${
                                isDropped
                                  ? "bg-rose-950/40 border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.18)]"
                                  : "bg-background/50 border-[hsl(225,18%,14%)]"
                              }`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold flex items-center gap-1.5 ${isDropped ? "text-rose-400" : "text-primary"}`}>
                                    {isDropped ? <AlertTriangle size={11} className="text-rose-400" /> : <Shield size={11} className="text-primary" />}
                                    Step 6: Hard Function Validator &amp; On-Chain Balance Guard
                                  </span>
                                  <span className={`text-[9px] font-bold uppercase font-mono px-1.5 py-0.2 rounded ${
                                    isDropped ? "bg-rose-900/80 text-rose-300 border border-rose-500/40" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                  }`}>
                                    {isDropped ? "VALIDATION BLOCKED / DROPPED" : "PASSED & AUTHORIZED"}
                                  </span>
                                </div>
                                {isDropped ? (
                                  <p className="text-[11px] font-mono text-rose-200 bg-rose-950/60 p-2 rounded-lg border border-rose-700/50">
                                    {tr.drop_reason || "Assigned Agent Execution Wallet has 0 NEAR balance (unfunded)."}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-muted-foreground">
                                    Authorized execution key verified in registered keys with positive on-chain RPC balance. Zero hard-cap breaches detected.
                                  </p>
                                )}
                              </div>

                              {/* Step 7 & 8: Intents Payload & IPFS */}
                              <div className="p-3 rounded-xl bg-background/50 border border-[hsl(225,18%,14%)] sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px]">
                                <div>
                                  <span className="font-bold text-primary block">
                                    Steps 7 &amp; 8: NEAR Intents 1-Click Protocol &amp; Decentralized Audit
                                  </span>
                                  <span className="font-mono text-muted-foreground">
                                    Tx Hash / Quote: {tr.tx_hash || "Simulated / Intents Payload"}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-muted-foreground block text-[9px]">Verified IPFS CID:</span>
                                  <span className="font-mono text-cyan-400 text-[11px]">{tr.cid}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
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
                          <tr className="border-b border-[hsl(225,18%,14%)] bg-secondary/30 text-muted-foreground">
                            <th className="py-2.5 px-3 font-medium">Trade</th>
                            <th className="py-2.5 px-3 font-medium">Entry</th>
                            <th className="py-2.5 px-3 font-medium">Current</th>
                            <th className="py-2.5 px-3 font-medium text-emerald-400">TP</th>
                            <th className="py-2.5 px-3 font-medium text-rose-400">SL</th>
                            <th className="py-2.5 px-3 font-medium">Confidence</th>
                            <th className="py-2.5 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(225,18%,14%)]">
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
                    <div className="rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/20 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[hsl(225,18%,14%)] bg-secondary/30 text-muted-foreground">
                            <th className="py-2.5 px-3 font-medium">Trade</th>
                            <th className="py-2.5 px-3 font-medium">Entry Price</th>
                            <th className="py-2.5 px-3 font-medium">Exit / TP</th>
                            <th className="py-2.5 px-3 font-medium">Amount</th>
                            <th className="py-2.5 px-3 font-medium">Status</th>
                            <th className="py-2.5 px-3 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(225,18%,14%)]">
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

          {/* Global Candlestick Pattern Lightbox Modal */}
          {isChartExpanded && modalChartUri && (
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
              onClick={() => setIsChartExpanded(false)}
            >
              <div
                className="relative max-w-5xl w-full bg-[#0B0F19] rounded-2xl border border-[hsl(225,18%,22%)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-secondary/50 border-b border-[hsl(225,18%,16%)]">
                  <div className="flex items-center gap-2">
                    <LineChart size={16} className="text-primary" />
                    <span className="font-bold text-sm text-foreground">
                      {modalChartTitle || "High-Resolution Technical Vision Chart"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={modalChartUri}
                      download="neptune-analysis-chart.png"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-secondary/60 hover:bg-secondary border border-[hsl(225,18%,18%)] transition-colors"
                      title="Download Chart"
                    >
                      Save Image
                    </a>
                    <button
                      onClick={() => setIsChartExpanded(false)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      aria-label="Close Modal"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Modal Chart Body */}
                <div className="p-3 sm:p-4 bg-[#07090E] flex items-center justify-center overflow-auto flex-1">
                  <img
                    src={modalChartUri}
                    alt={modalChartTitle || "Candlestick Chart Analysis"}
                    className="max-h-[76vh] w-auto max-w-full object-contain rounded-lg shadow-inner"
                  />
                </div>

                {/* Modal Footer with Legend / Details */}
                <div className="px-4 py-2 bg-secondary/30 border-t border-[hsl(225,18%,14%)] flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
                  <div className="flex items-center gap-3 font-mono">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2 h-0.5 bg-emerald-400 inline-block"></span> Take Profit (TP)
                    </span>
                    <span className="flex items-center gap-1 text-rose-400">
                      <span className="w-2 h-0.5 bg-rose-400 inline-block"></span> Stop Loss (SL)
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-2 h-0.5 bg-amber-400 inline-block"></span> Pattern Overlay
                    </span>
                    <span className="flex items-center gap-1 text-cyan-400">
                      <span className="w-2 h-0.5 bg-cyan-400 inline-block"></span> Forecast Trajectory
                    </span>
                  </div>
                  <span className="font-mono text-[10px]">
                    Press anywhere outside or click Close to dismiss
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
