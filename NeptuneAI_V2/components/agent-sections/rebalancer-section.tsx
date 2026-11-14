"use client";

import { dedupedGetJson } from "@/lib/dedupe-fetch";
import { tilt3d } from "./trader/tilt-3d";
import InfoTip from "./shared/info-tip";
import AdvancedSection, { SettingBox, SettingGrid } from "./shared/advanced-section";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { setVisibleInterval } from "@/lib/visible-interval";
import {
  startRun,
  streamRun,
  getRun,
  listRuns,
  getActiveRun,
  setActiveRun,
  waitForRun,
  findRunningRun,
} from "@/lib/agent-runs";
import { loadAgentConfig, peekAgentConfig, useAutoSaveAgentConfig } from "@/lib/agent-config";
import {
  Scale,
  RotateCw,
  Play,
  CheckCircle2,
  Sliders,
  Shield,
  Wallet,
  Save,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Coins,
  FileText,
  History,
  X,
  Check,
  ExternalLink,
  BrainCircuit
} from "lucide-react";
import { getTokenLogoUrl, TOKEN_LOGOS } from "@/lib/near/token-logos";
import { fetchAllTokens, getAccountBalance, formatBalance } from "@/lib/near/near-utils";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

interface TokenInfo {
  symbol: string;
  name: string;
  price?: number;
  blockchain?: string;
  decimals?: number;
  contractAddress?: string;
  coingeckoId?: string;
}

interface StrategyRule {
  token_index: number;
  symbol: string;
  target_allocation_pct: number;
  action: "BUY" | "HOLD" | "REDUCE" | "SELL_TO_USDT" | "TARGET";
  current_price: number;
  entry_price: number;
  rationale: string;
}

interface ActiveStrategy {
  id?: number;
  user_wallet?: string;
  selected_coins?: string[];
  user_expectation?: string;
  cadence_days?: number;
  status?: string;
  allocations?: Record<string, number>;
  tp_sl_rules?: StrategyRule[];
  market_regime?: string;
  overall_strategy?: string;
  created_at?: string;
  sources?: any[];
  research?: any;
  decision?: "NEW" | "PERSIST" | "REVISE";
  raw_pydantic_output?: any;
}

const PRESET_STRATEGIES = [
  {
    label: "Trend Growth & De-Risk",
    text: "Accumulate coins with bullish 1d/1w trend. If any coin breaks key support, sell and convert into USDT immediately. Take profit into USDT at resistance. Keep 20% USDT cash reserve."
  },
  {
    label: "Conservative Stables + Majors",
    text: "Allocate 50% to USDT cash reserve. Keep 30% in NEAR and 20% in ETH. Take profit on NEAR at $6.00 and de-risk if it drops below $3.20."
  },
  {
    label: "Aggressive Multi-Asset Momentum",
    text: "Target strong momentum across selected altcoins. Keep only 15% in USDT reserve. Set trailing take-profits on surges, and convert to USDT if 1h RSI goes overbought above 75."
  }
];

/**
 * Universal Token Icon component using jsDelivr TrustWallet CDN & token-logos registry
 */
function TokenIcon({
  symbol,
  size = 20,
  className = ""
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const clean = (symbol || "").replace(/^(?:\[.*?\]\s*)?/, "").toUpperCase().trim();
  const url = getTokenLogoUrl(clean);

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt={clean}
        width={size}
        height={size}
        onError={() => setHasError(true)}
        className={`rounded-full object-cover flex-shrink-0 bg-secondary/80 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Graceful colorful badge fallback
  const firstChar = clean.slice(0, 1) || "•";
  return (
    <span
      className={`rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold flex-shrink-0 text-[10px] ${className}`}
      style={{ width: size, height: size }}
    >
      {firstChar}
    </span>
  );
}

export default function RebalancerSection({ accountId, onConnectWallet }: Props) {
  // ─── RUNTIME 1-CLICK API TOKENS ───
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [tokenSearch, setTokenSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── USER CONFIGURATION ───
  const [selectedCoins, setSelectedCoins] = useState<string[]>(["NEAR", "ETH"]);
  const [userExpectation, setUserExpectation] = useState(
    "Make buy these coins if they are good options and change into USDT if risk is high. For NEAR, take profit into USDT at $5.50 and stop loss at $3.20. Balance the rest prudently."
  );
  const [cadenceDays, setCadenceDays] = useState<number>(7);
  const [driftThreshold, setDriftThreshold] = useState<number>(5.0);
  const [minStablePct, setMinStablePct] = useState<number>(15.0);
  const [allowCrossChain, setAllowCrossChain] = useState<boolean>(false);

  // ─── DB-PERSISTED CONFIG (loaded once per wallet; skeleton until ready) ───
  const [configLoaded, setConfigLoaded] = useState<boolean>(() => !accountId || !!peekAgentConfig(accountId, "rebalancer"));
  const [fleetActive, setFleetActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accountId) {
      setConfigLoaded(true);
      return;
    }
    const apply = (cfg: Record<string, any> | null) => {
      if (!cfg) return;
      if (Array.isArray(cfg.selectedCoins) && cfg.selectedCoins.length) setSelectedCoins(cfg.selectedCoins);
      if (typeof cfg.userExpectation === "string" && cfg.userExpectation) setUserExpectation(cfg.userExpectation);
      if (typeof cfg.cadenceDays === "number") setCadenceDays(cfg.cadenceDays);
      if (typeof cfg.driftThreshold === "number") setDriftThreshold(cfg.driftThreshold);
      if (typeof cfg.minStablePct === "number") setMinStablePct(cfg.minStablePct);
    };
    const ctrl = new AbortController();
    if (!peekAgentConfig(accountId, "rebalancer")) setConfigLoaded(false);
    loadAgentConfig(accountId, "rebalancer", ctrl.signal, apply).then((cfg) => {
      if (ctrl.signal.aborted) return;
      apply(cfg);
      setConfigLoaded(true);
    });
    return () => ctrl.abort();
  }, [accountId]);

  useAutoSaveAgentConfig(
    accountId,
    "rebalancer",
    { selectedCoins, userExpectation, cadenceDays, driftThreshold, minStablePct },
    configLoaded
  );

  // ─── REAL WALLET HOLDINGS (ZERO DUMMY DATA) ───
  const [currentHoldings, setCurrentHoldings] = useState<Record<string, number>>({});
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);
  const [customSymbol, setCustomSymbol] = useState("");
  const [customAmount, setCustomAmount] = useState("");

  // ─── ACTIVE STRATEGY & DB STATUS ───
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [activeStrategy, setActiveStrategy] = useState<ActiveStrategy | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ─── LIVE DRIFT & TELEMETRY ───
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [driftStatus, setDriftStatus] = useState<any>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── FETCH RUNTIME 1-CLICK API TOKENS ───
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const res = await fetch("/api/tokens");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tokens) && data.tokens.length > 0) {
            setAvailableTokens(data.tokens);
          }
        }
      } catch (e) {
        console.error("Failed to load runtime 1-Click tokens:", e);
      }
    };
    fetchTokens();
  }, []);

  // ─── FETCH REAL ON-CHAIN BALANCES (ZERO DUMMY DATA) ───
  const fetchRealHoldings = async (wallet: string, isManual = false) => {
    if (isManual) {
      setIsLoadingHoldings(true);
    }
    try {
      const realHoldings: Record<string, number> = {};

      // 1. Native NEAR balance
      const nearRaw = await getAccountBalance(wallet);
      if (nearRaw && nearRaw !== "0") {
        const nearVal = parseFloat(formatBalance(nearRaw, 24));
        if (nearVal > 0) {
          realHoldings["NEAR"] = nearVal;
        }
      }

      // 2. NEP-141 Tokens via FastNEAR / Testnet
      const tokensWithBal = await fetchAllTokens(wallet);
      if (Array.isArray(tokensWithBal)) {
        tokensWithBal.forEach((t) => {
          const val = parseFloat(t.formatted || "0");
          if (val > 0) {
            const sym = t.symbol.toUpperCase();
            realHoldings[sym] = (realHoldings[sym] || 0) + val;
          }
        });
      }

      setCurrentHoldings(realHoldings);
    } catch (e) {
      console.warn("Could not fetch on-chain wallet holdings:", e);
      setCurrentHoldings({});
    } finally {
      setIsLoadingHoldings(false);
    }
  };

  // ─── FETCH ACTIVE STRATEGY & DRIFT STATUS ───
  const fetchStrategyAndStatus = async (isManual = false) => {
    if (!accountId) {
      setActiveStrategy(null);
      setDriftStatus(null);
      setCurrentHoldings({});
      return;
    }

    if (isManual) {
      setIsLoadingStatus(true);
    }
    try {
      // 1. Fetch real holdings from blockchain
      await fetchRealHoldings(accountId, isManual);

      // 2. Fetch active strategy from Rebalancer DB
      const stratRes = await fetch(`/api/rebalancer/strategy/${accountId}`);
      if (stratRes.ok) {
        const stratData = await stratRes.json();
        if (stratData.active_strategy) {
          // NOTE: never overwrite the user's saved form config here (it polls every 20s).
          setActiveStrategy(stratData.active_strategy);
        } else {
          setActiveStrategy(null);
        }
        if (Array.isArray(stratData.history)) {
          setHistory(stratData.history);
        }
      }

      // 3. Fetch live drift telemetry
      const driftRes = await fetch(`/api/rebalancer/status/${accountId}`);
      if (driftRes.ok) {
        const data = await driftRes.json();
        setDriftStatus(data);
      }

      // 3b. Fleet activation flag (same source as the suite cards / sidebar)
      try {
        const fleet = await dedupedGetJson<any>(`/api/fleet/${encodeURIComponent(accountId)}`, 3000);
        if (fleet) {
          setFleetActive(Boolean(fleet?.agents?.rebalancer?.is_active));
        }
      } catch {}

      // 4. User wallet config
      const cfgData = await dedupedGetJson<any>(`/api/agent-wallet/config/${accountId}`, 3000);
      if (cfgData) {
        setAllowCrossChain(Boolean(cfgData.allow_cross_chain_trades));
      }
    } catch (e) {
      console.error("Rebalancer status fetch error:", e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleStreamEvent = useCallback((ev: any) => {
    if (ev.type === "step") {
      setGenerationStep(ev.agent_reasoning || `Executing Step ${ev.step_number || ""}`);
      if (ev.strategy) {
        setActiveStrategy(ev.strategy);
      }
    } else if (ev.type === "final" && ev.result) {
      setActiveStrategy(ev.result);
      setGenerationStep("Strategy synthesized and saved to database!");
    } else if (ev.type === "run_finished") {
      setIsGenerating(false);
      setGenerationStep("");
    }
  }, []);

  useEffect(() => {
    fetchStrategyAndStatus(false);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && accountId) {
        fetchStrategyAndStatus(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const cleanup = setVisibleInterval(() => fetchStrategyAndStatus(false), 20000);

    const abortCtrl = new AbortController();
    async function checkActiveRebalanceRun() {
      if (!accountId) return;
      try {
        const runningId = await findRunningRun("rebalancer", accountId);
        if (abortCtrl.signal.aborted) return;
        if (runningId) {
          setActiveRun("rebalancer", accountId, runningId);
          setIsGenerating(true);
          setGenerationStep("Resuming strategy generation in background...");
          streamRun(runningId, handleStreamEvent, 0, abortCtrl.signal)
            .then(() => {
              // Aborted = user just navigated away; the run is still going, keep the key.
              if (abortCtrl.signal.aborted) return;
              setActiveRun("rebalancer", accountId, null);
              setIsGenerating(false);
              setGenerationStep("");
              fetchStrategyAndStatus();
            })
            .catch(() => {});
          return;
        }
        const lastId = getActiveRun("rebalancer", accountId);
        if (lastId) {
          const run = await getRun(lastId, accountId);
          if (run?.status === "completed" && run.result) setActiveStrategy(run.result as any);
          setActiveRun("rebalancer", accountId, null);
        }
        setIsGenerating(false);
        setGenerationStep("");
      } catch (e) {
        console.warn("[REBALANCER] Error reconnecting active run:", e);
        setIsGenerating(false);
      }
    }
    checkActiveRebalanceRun();

    return () => {
      cleanup();
      abortCtrl.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [accountId, handleStreamEvent]);

  // ─── COIN SELECTION (ADD / REMOVE) ───
  const handleToggleCoin = (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean || clean === "USDT" || clean === "USDC") return;
    if (selectedCoins.includes(clean)) {
      setSelectedCoins(selectedCoins.filter((c) => c !== clean));
    } else {
      setSelectedCoins([...selectedCoins, clean]);
    }
  };

  const handleRemoveCoin = (sym: string) => {
    setSelectedCoins(selectedCoins.filter((c) => c !== sym));
  };

  // ─── CURRENT HOLDINGS ACTIONS ───
  const handleUpdateHolding = (sym: string, amt: number) => {
    setCurrentHoldings((prev) => ({
      ...prev,
      [sym]: amt
    }));
  };

  const handleAddCustomHolding = () => {
    if (!customSymbol) return;
    const clean = customSymbol.trim().toUpperCase();
    const amt = parseFloat(customAmount) || 0.0;
    setCurrentHoldings((prev) => ({
      ...prev,
      [clean]: amt
    }));
    setCustomSymbol("");
    setCustomAmount("");
  };

  const handleRemoveHolding = (sym: string) => {
    setCurrentHoldings((prev) => {
      const copy = { ...prev };
      delete copy[sym];
      return copy;
    });
  };

  // ─── GENERATE AI REBALANCE STRATEGY ───
  const handleGenerateStrategy = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect your wallet first.");
      return;
    }
    if (!selectedCoins.length) {
      alert("Please select at least 1 coin from the dropdown to construct your target portfolio.");
      return;
    }

    setIsGenerating(true);
    setGenerationStep("Ingesting 1h, 1d, 1w closed candles (zero lookahead)...");

    // Auto-mark agent active in fleet configuration
    setFleetActive(true);
    try {
      fetch("/api/fleet/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          agent_id: "rebalancer",
          is_active: true,
        }),
      }).catch(() => {});
    } catch {}

    let startedRunId: string | null = null;
    let keepActiveRun = false;
    try {
      const { run_id } = await startRun("rebalancer", {
        user_wallet: accountId,
        selected_coins: selectedCoins,
        user_expectation: userExpectation,
        current_holdings: currentHoldings,
        cadence_days: cadenceDays,
        min_stable_pct: minStablePct,
        drift_threshold_pct: driftThreshold
      });

      startedRunId = run_id;
      setActiveRun("rebalancer", accountId, run_id);

      await streamRun(run_id, handleStreamEvent, 0);

      setActiveRun("rebalancer", accountId, null);
      await fetchStrategyAndStatus();
    } catch (e: any) {
      if (startedRunId) {
        // Already running on the backend: wait for it, never start a duplicate.
        console.warn("[REBALANCER] Live stream dropped; waiting for background run:", e);
        const finished = await waitForRun(startedRunId, accountId);
        if (finished?.status === "completed" && finished.result) setActiveStrategy(finished.result as any);
        keepActiveRun = !finished;
        await fetchStrategyAndStatus();
      } else {
      console.warn("Could not start background run, falling back to synchronous generation:", e);
      try {
        const res = await fetch("/api/rebalancer/generate-strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_wallet: accountId,
            selected_coins: selectedCoins,
            user_expectation: userExpectation,
            current_holdings: currentHoldings,
            cadence_days: cadenceDays,
            min_stable_pct: minStablePct,
        drift_threshold_pct: driftThreshold
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned ${res.status}`);
        }

        const newStrategy = await res.json();
        setActiveStrategy(newStrategy);
        setGenerationStep("Strategy saved to Rebalancer DB! Agent status activated.");
        await fetchStrategyAndStatus();
      } catch (err: any) {
        console.error("Strategy generation error:", err);
        alert(`Error generating strategy: ${err.message || String(err)}`);
      }
      }
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
      if (!keepActiveRun) setActiveRun("rebalancer", accountId, null);
    }
  };

  // ─── EVALUATE & EXECUTE DRIFT REBALANCE ───
  const handleEvaluateAndRebalance = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet();
      else alert("Please connect wallet first");
      return;
    }

    setIsRebalancing(true);
    try {
      const res = await fetch("/api/rebalancer/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          target_allocation: activeStrategy?.allocations || undefined,
          drift_threshold_pct: driftThreshold
        })
      });
      const data = await res.json();
      setDriftStatus(data);
    } catch (e) {
      console.error("Rebalance trigger error:", e);
    } finally {
      setIsRebalancing(false);
    }
  };

  // ─── TOGGLE CROSS CHAIN ───
  const handleToggleCrossChain = async (enabled: boolean) => {
    setAllowCrossChain(enabled);
    if (!accountId) return;
    try {
      await fetch("/api/settings/cross-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          allow_cross_chain: enabled
        })
      });
    } catch (e) {
      console.error("Failed to toggle cross-chain:", e);
    }
  };

  // Compute live portfolio total from real holdings & prices
  const liveTotalUsd = useMemo(() => {
    if (driftStatus?.total_portfolio_usd && driftStatus.total_portfolio_usd > 0) {
      return driftStatus.total_portfolio_usd;
    }
    let total = 0;
    const priceMap: Record<string, number> = {};
    availableTokens.forEach((t) => {
      if (t.price) priceMap[t.symbol.toUpperCase()] = t.price;
    });
    priceMap["USDT"] = 1.0;
    priceMap["USDC"] = 1.0;

    Object.entries(currentHoldings).forEach(([sym, amt]) => {
      const p = priceMap[sym.toUpperCase()] || (sym.toUpperCase() === "NEAR" ? 3.85 : 0);
      total += amt * p;
    });
    return total;
  }, [currentHoldings, availableTokens, driftStatus]);

  // Filter and deduplicate 1-Click tokens for dropdown search
  const filtered1ClickTokens = useMemo(() => {
    const q = tokenSearch.toLowerCase().trim();
    const rawList = !q
      ? availableTokens
      : availableTokens.filter((t) => {
          return (
            t.symbol.toLowerCase().includes(q) ||
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.blockchain && t.blockchain.toLowerCase().includes(q))
          );
        });

    // Deduplicate by symbol and blockchain to prevent React key collision
    const seen = new Set<string>();
    const uniqueList: typeof rawList = [];
    for (const t of rawList) {
      const dedupeKey = `${t.symbol.toUpperCase()}-${(t.blockchain || "near").toLowerCase()}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        uniqueList.push(t);
      }
    }
    return uniqueList;
  }, [availableTokens, tokenSearch]);

  // Determine if agent status is ACTIVE
  const isAgentActive = fleetActive ?? Boolean(activeStrategy && activeStrategy.status === "ACTIVE");

  if (!configLoaded) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-5xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading rebalancer configuration">
        <div className="h-24 rounded-2xl bg-secondary/60 border border-border" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-5">
            <div className="h-48 rounded-2xl bg-secondary/60 border border-border" />
            <div className="h-72 rounded-2xl bg-secondary/60 border border-border" />
          </div>
          <div className="lg:col-span-5 space-y-5">
            <div className="h-56 rounded-2xl bg-secondary/60 border border-border" />
            <div className="h-48 rounded-2xl bg-secondary/60 border border-border" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 max-w-5xl mx-auto space-y-5 suite-stagger">
      {/* ─── HEADER WITH DYNAMIC ACTIVE AGENT BADGE ─── */}
      <div className="tilt3d flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border" {...tilt3d(1.5)}>
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scale size={22} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Autonomous Rebalancer Agent
            </h1>

            {/* DYNAMIC AGENT STATUS BADGE */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border transition-all ${
                isAgentActive
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isAgentActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              {isAgentActive ? "AGENT STATUS: ACTIVE" : "AGENT STATUS: STANDBY"}
            </span>
          </div>

          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            Keeps your portfolio balanced and moves profits into USDT.
            <InfoTip label="About the Rebalancer">
              The agent reads 1h, 1d and 1w charts plus its trading rulebook, then proposes target allocations with
              exact take-profit and stop-loss levels for converting assets to USDT.
            </InfoTip>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStrategyAndStatus(true)}
            disabled={isLoadingStatus || !accountId}
            className="key3d flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs disabled:opacity-50"
            title="Refresh active strategy and live drift"
          >
            <RotateCw size={14} className={isLoadingStatus ? "animate-spin text-primary" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleEvaluateAndRebalance}
            disabled={isRebalancing || isLoadingStatus || !accountId}
            className="key3d-solid flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-primary/20 disabled:opacity-50"
          >
            {isRebalancing ? <RotateCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>Evaluate &amp; Execute Swaps</span>
          </button>
        </div>
      </div>

      {/* ─── WALLET CONNECTION NOTICE (IF NOT CONNECTED) ─── */}
      {!accountId && (
        <div className="p-6 rounded-2xl bg-card border border-amber-500/30 bg-amber-500/5 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Wallet size={24} />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Connect your wallet to start
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            We read your balances to build a rebalance plan.
          </p>
          <button
            onClick={onConnectWallet}
            className="key3d-solid px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-primary/20"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* ─── MAIN WORKSPACE GRID ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Target Allocation & Strategy Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Target Portfolio Coins with Runtime 1-Click Dropdown */}
          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Coins size={17} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Your coins
                </h2>
                <InfoTip label="About your coins">
                  Pick every coin you want in your portfolio. USDT is always kept as your stable cash reserve.
                </InfoTip>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                {selectedCoins.length} selected
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {/* Fixed USDT Cash Reserve */}
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 text-xs font-semibold shadow-sm">
                  <TokenIcon symbol="USDT" size={18} />
                  <span>USDT</span>
                  <span className="text-[10px] text-teal-300/80 font-normal">(Cash Reserve)</span>
                </span>

                {/* User-selected coins */}
                {selectedCoins.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary text-foreground border border-border text-xs font-semibold group shadow-sm"
                  >
                    <TokenIcon symbol={sym} size={18} />
                    <span>{sym}</span>
                    <button
                      onClick={() => handleRemoveCoin(sym)}
                      className="text-muted-foreground hover:text-rose-400 ml-0.5 transition-colors p-0.5"
                      title={`Remove ${sym}`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* ─── RUNTIME 1-CLICK API TOKENS DROPDOWN LIST ─── */}
            <div className="relative pt-1" ref={dropdownRef}>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Add coins</label>

              {/* Dropdown Toggle Trigger Button */}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="key3d w-full flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary/70 border border-border text-xs text-foreground"
              >
                <div className="flex items-center gap-2">
                  <Search size={15} className="text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">
                    {isDropdownOpen ? "Search coins..." : "Browse coins"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-primary font-bold">
                    {availableTokens.length}
                  </span>
                  {isDropdownOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
              </button>

              {/* Popover Dropdown Panel with Search & Token Icons */}
              {isDropdownOpen && (
                <div className="absolute z-40 left-0 right-0 mt-2 rounded-2xl bg-card border border-border shadow-2xl p-2.5 space-y-2 max-h-80 flex flex-col">
                  {/* Search input inside dropdown */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary border border-border flex-shrink-0">
                    <Search size={15} className="text-muted-foreground ml-1" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search by name or symbol"
                      value={tokenSearch}
                      onChange={(e) => setTokenSearch(e.target.value)}
                      className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none flex-1"
                    />
                    {tokenSearch && (
                      <button
                        onClick={() => setTokenSearch("")}
                        className="text-muted-foreground hover:text-foreground text-xs p-1"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Token List with Real Icons & Live Prices */}
                  <div className="overflow-y-auto space-y-1 flex-1 pr-1 divide-y divide-border/40">
                    {filtered1ClickTokens.length > 0 ? (
                      filtered1ClickTokens.map((tok, idx) => {
                        const isSelected = selectedCoins.includes(tok.symbol.toUpperCase());
                        const isUsdt = tok.symbol.toUpperCase() === "USDT" || tok.symbol.toUpperCase() === "USDC";

                        return (
                          <div
                            key={`${tok.symbol}-${tok.blockchain || "near"}-${tok.contractAddress || idx}`}
                            onClick={() => {
                              if (isUsdt) return;
                              handleToggleCoin(tok.symbol);
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                              isUsdt
                                ? "opacity-60 cursor-not-allowed bg-secondary/20"
                                : isSelected
                                ? "bg-primary/15 text-foreground font-semibold"
                                : "hover:bg-secondary text-foreground"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <TokenIcon symbol={tok.symbol} size={24} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-foreground text-xs">
                                    {tok.symbol}
                                  </span>
                                  {tok.blockchain && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground uppercase border border-border">
                                      {tok.blockchain}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                  {tok.name || tok.symbol}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                              {tok.price !== undefined && tok.price > 0 && (
                                <span className="font-mono text-xs text-foreground font-semibold">
                                  ${tok.price < 1 ? tok.price.toFixed(4) : tok.price.toFixed(2)}
                                </span>
                              )}

                              {isUsdt ? (
                                <span className="text-[11px] text-teal-400 font-semibold px-2 py-0.5 rounded bg-teal-500/10">
                                  Pinned
                                </span>
                              ) : isSelected ? (
                                <span className="flex items-center gap-1 text-[11px] text-primary font-bold px-2 py-0.5 rounded bg-primary/20 border border-primary/30">
                                  <Check size={12} />
                                  Selected
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground hover:text-foreground font-medium px-2 py-0.5 rounded bg-secondary border border-border">
                                  + Add
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No coins match &ldquo;{tokenSearch}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. User Expectation & Strategy Prompt Box */}
          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Your strategy
                </h2>
                <InfoTip label="About your strategy">
                  Tell the agent when to buy more, what profit targets to lock into USDT, and what risk should make it
                  move back to USDT.
                </InfoTip>
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_STRATEGIES.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setUserExpectation(p.text)}
                  className="key3d px-2.5 py-1 rounded-lg text-[11px] font-medium bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              value={userExpectation}
              onChange={(e) => setUserExpectation(e.target.value)}
              placeholder="e.g. Buy these coins if they are good options and change into USDT if risk is high. For NEAR, take profit into USDT at $5.50..."
              className="w-full p-3 rounded-xl bg-secondary/40 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed resize-none"
            />

            <AdvancedSection
              tip="How often the agent checks, when it swaps, and how much cash it keeps in USDT."
              summary={`Every ${cadenceDays}d · ${driftThreshold}% drift · ${minStablePct}% USDT`}
            >
            <SettingGrid>
              <SettingBox span>
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar size={13} className="text-primary" />
                  Check every
                  <InfoTip label="About check frequency">
                    The agent refreshes market data and its strategy every {cadenceDays} days.
                  </InfoTip>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[3, 7, 14, 30].map((days) => (
                    <button
                      key={days}
                      onClick={() => setCadenceDays(days)}
                      className={`key3d py-1.5 rounded-lg text-xs font-semibold border ${
 cadenceDays === days
 ? "bg-primary text-primary-foreground border-primary"
 : "bg-secondary/70 hover:bg-secondary text-foreground border-border"
 }`}
                    >
                      {days === 30 ? "1 Mo" : `${days}d`}
                    </button>
                  ))}
                </div>
              </SettingBox>

              <SettingBox>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-foreground inline-flex items-center gap-1">
                    Swap when off by
                    <InfoTip label="About drift threshold">
                      Triggers a swap when an allocation moves more than {driftThreshold}% from its target.
                    </InfoTip>
                  </span>
                  <span className="font-mono text-primary font-bold">{driftThreshold}%</span>
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
              </SettingBox>

              <SettingBox>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-foreground inline-flex items-center gap-1">
                    Minimum USDT
                    <InfoTip label="About minimum USDT">
                      The baseline cash reserve. The agent raises it automatically when volatile coins look risky.
                    </InfoTip>
                  </span>
                  <span className="font-mono text-teal-400 font-bold">{minStablePct}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={minStablePct}
                  onChange={(e) => setMinStablePct(Number(e.target.value))}
                  className="w-full accent-teal-500 h-1.5 bg-secondary rounded-lg cursor-pointer"
                />
              </SettingBox>

            {/* Cross-chain setting */}
            <SettingBox span className="flex-row items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" />
                  Cross-chain swaps
                  <InfoTip label="About cross-chain swaps">
                    Allow swaps across Arbitrum, Ethereum and Solana via NEAR Intents.
                  </InfoTip>
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowCrossChain}
                aria-label="Cross-chain swaps"
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
            </SettingBox>
            </SettingGrid>
            </AdvancedSection>

            {/* Main Action: Generate AI Strategy */}
            <button
              onClick={handleGenerateStrategy}
              disabled={isGenerating || !accountId}
              className="key3d-solid w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs active:scale-[0.99] disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RotateCw size={15} className="animate-spin" />
                  <span>{generationStep || "Generating AI Rebalance Strategy..."}</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Save my setup and Run</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Real Wallet Holdings & Live Status (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Real Wallet Holdings (Zero Dummy Data) */}
          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Wallet size={17} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-foreground">
                  Your holdings
                </h2>
                <InfoTip label="About your holdings">
                  Live on-chain balances from your connected wallet. The agent decides when to hold, trim, or sell into
                  USDT.
                </InfoTip>
              </div>
              {accountId && (
                <button
                  onClick={() => fetchRealHoldings(accountId, true)}
                  disabled={isLoadingHoldings}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  title="Refresh on-chain balances"
                >
                  <RotateCw size={11} className={isLoadingHoldings ? "animate-spin" : ""} />
                  <span>On-Chain</span>
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {Object.keys(currentHoldings).length > 0 ? (
                Object.entries(currentHoldings).map(([sym, amt]) => (
                  <div
                    key={sym}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 border border-border text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <TokenIcon symbol={sym} size={18} />
                      <span>{sym}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={amt}
                        onChange={(e) => handleUpdateHolding(sym, parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 rounded-lg bg-secondary border border-border text-xs font-mono text-right text-foreground focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveHolding(sym)}
                        className="text-muted-foreground hover:text-rose-400 p-1"
                        title="Remove holding"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-secondary/30 border border-border text-center text-xs text-muted-foreground">
                  {accountId
                    ? "No balances found. Add one below."
                    : "Connect your wallet to see holdings."}
                </div>
              )}
            </div>

            {/* Quick add custom holding */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <input
                type="text"
                placeholder="TOKEN (e.g. NEAR)"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                className="w-28 px-2.5 py-1.5 rounded-lg bg-secondary/60 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <input
                type="number"
                placeholder="Amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary/60 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={handleAddCustomHolding}
                className="key3d px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Live Portfolio Status Telemetry (Zero Dummy Data) */}
          <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-4" {...tilt3d(1.5)}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Shield size={17} className="text-blue-400" />
                Live Portfolio Telemetry
              </h2>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                  driftStatus?.status === "DROPPED"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : driftStatus?.status === "REBALANCED"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : isAgentActive
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-secondary text-muted-foreground border border-border"
                }`}
              >
                {driftStatus?.status || (isAgentActive ? "ACTIVE_MONITORING" : "STANDBY")}
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary/40 border border-border flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Total Valuation</span>
                <span className="text-base font-bold font-mono text-foreground">
                  ${liveTotalUsd.toFixed(2)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-secondary/40 border border-border flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Current Max Drift</span>
                <span className="text-sm font-bold font-mono text-primary">
                  {driftStatus?.max_drift_pct !== undefined ? `${driftStatus.max_drift_pct}%` : "0.0%"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                <span className="text-xs text-muted-foreground block mb-1">Execution Telemetry</span>
                <p className="text-xs font-semibold text-foreground">
                  {driftStatus?.action_taken ||
                    (isAgentActive
                      ? `Portfolio actively monitored against Strategy #${activeStrategy?.id}`
                      : "No active rebalance evaluation recorded yet.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── ACTIVE STRATEGY PRESENTATION (GENERATED BY LLM & RAG) ─── */}
      {activeStrategy && (
        <div className="tilt3d p-5 rounded-2xl bg-card border border-border space-y-5" {...tilt3d(1.5)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  Active Rebalancer Strategy #{activeStrategy.id || "Current"}
                </h2>
                <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ACTIVE
                </span>
                {(() => {
                  const d = activeStrategy.decision || activeStrategy.raw_pydantic_output?.decision;
                  if (!d) return null;
                  const label = d === "PERSIST" ? "KEPT · NO SWAPS" : d === "REVISE" ? "REVISED · SWAPPED AT MARKET" : "NEW STRATEGY";
                  const cls =
                    d === "PERSIST"
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      : d === "REVISE"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                  return <span className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${cls}`}>{label}</span>;
                })()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Market Regime: <span className="font-semibold text-foreground">{activeStrategy.market_regime || "Balanced Consolidation"}</span>
                {" • "}Cadence: <span className="font-semibold text-foreground">{activeStrategy.cadence_days || cadenceDays} Days</span>
                {activeStrategy.created_at ? ` • Created: ${new Date(activeStrategy.created_at).toLocaleString()}` : ""}
              </p>
            </div>

            <button
              onClick={() => setShowHistory(!showHistory)}
              className="key3d flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs self-start sm:self-center"
            >
              <History size={13} />
              <span>History ({history.length})</span>
              {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Overall Strategy Narrative */}
          {activeStrategy.overall_strategy && (
            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/80 text-xs text-foreground/90 leading-relaxed">
              <span className="font-semibold text-primary block mb-1">Executive Strategy Overview:</span>
              {activeStrategy.overall_strategy}
            </div>
          )}

          {/* Visual Allocations Breakdown Bar */}
          {activeStrategy.allocations && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Target Portfolio Allocations (Sum = 100%)</span>
                <span className="font-mono text-primary font-bold">
                  {Object.values(activeStrategy.allocations).reduce((a, b) => a + b, 0).toFixed(1)}%
                </span>
              </span>

              {/* Progress bar */}
              <div className="h-4 w-full rounded-xl overflow-hidden flex bg-secondary border border-border">
                {Object.entries(activeStrategy.allocations).map(([sym, pct], idx) => {
                  const colors = [
                    "bg-emerald-500",
                    "bg-blue-500",
                    "bg-purple-500",
                    "bg-amber-500",
                    "bg-cyan-500",
                    "bg-rose-500"
                  ];
                  const color = colors[idx % colors.length];
                  return (
                    <div
                      key={sym}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                      className={`${color} h-full transition-all`}
                      title={`${sym}: ${pct}%`}
                    />
                  );
                })}
              </div>

              {/* Badges with Real Logos */}
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(activeStrategy.allocations).map(([sym, pct], idx) => {
                  const colors = [
                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    "bg-blue-500/10 text-blue-400 border-blue-500/30",
                    "bg-purple-500/10 text-purple-400 border-purple-500/30",
                    "bg-amber-500/10 text-amber-400 border-amber-500/30",
                    "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                    "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  ];
                  const colorCls = colors[idx % colors.length];
                  return (
                    <span
                      key={sym}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${colorCls} flex items-center gap-2`}
                    >
                      <TokenIcon symbol={sym} size={16} />
                      <span>{sym}:</span>
                      <span className="font-mono font-bold">{pct}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance since the previous strategy + target portfolio (spot, market-price swaps) */}
          {(() => {
            const perf = activeStrategy.raw_pydantic_output?.performance_since_previous;
            if (!perf) return null;
            const fmt = (v: any) => (typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "n/a");
            const tone = (v: any) => (typeof v === "number" ? (v >= 0 ? "text-emerald-400" : "text-rose-400") : "text-muted-foreground");
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[11px] text-muted-foreground block">Previous strategy return</span>
                  <span className={`text-base font-bold font-mono ${tone(perf.previous_target_mix_return_pct)}`}>
                    {fmt(perf.previous_target_mix_return_pct)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[11px] text-muted-foreground block">Portfolio value change</span>
                  <span className={`text-base font-bold font-mono ${tone(perf.portfolio_value_change_pct)}`}>
                    {fmt(perf.portfolio_value_change_pct)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <span className="text-[11px] text-muted-foreground block">Value then → now</span>
                  <span className="text-base font-bold font-mono text-foreground">
                    {perf.portfolio_value_then_usd != null ? `$${Number(perf.portfolio_value_then_usd).toFixed(2)}` : "—"} →{" "}
                    {perf.portfolio_value_now_usd != null ? `$${Number(perf.portfolio_value_now_usd).toFixed(2)}` : "—"}
                  </span>
                </div>
              </div>
            );
          })()}

          {activeStrategy.tp_sl_rules && activeStrategy.tp_sl_rules.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sliders size={14} className="text-primary" />
                Target Portfolio (spot, swapped at market price)
              </h3>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground uppercase text-[10px] border-b border-border font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Asset</th>
                      <th className="py-2.5 px-3">Target %</th>
                      <th className="py-2.5 px-3">Now %</th>
                      <th className="py-2.5 px-3">Gap</th>
                      <th className="py-2.5 px-3">Value at target</th>
                      <th className="py-2.5 px-3">Price then</th>
                      <th className="py-2.5 px-3">Price now</th>
                      <th className="py-2.5 px-3">Change</th>
                      <th className="py-2.5 px-3 min-w-[220px]">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeStrategy.tp_sl_rules.map((rule, idx) => {
                      const sym = String(rule.symbol).toUpperCase();
                      const isStable = ["USDT", "USDC", "DAI"].includes(sym);
                      const target = Number(rule.target_allocation_pct ?? (rule as any).target_pct ?? 0);
                      const nowPct = driftStatus?.current_allocation?.[sym];
                      const gap = typeof nowPct === "number" ? nowPct - target : null;
                      const total = Number(driftStatus?.total_portfolio_usd ?? 0);
                      const pxThen = Number(rule.entry_price ?? rule.current_price ?? 0);
                      const live = availableTokens.find((t) => t.symbol.toUpperCase() === sym)?.price;
                      const pxNow = isStable ? 1 : Number(live ?? 0);
                      const chg = pxThen > 0 && pxNow > 0 ? (pxNow / pxThen - 1) * 100 : null;
                      const money = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
                      return (
                        <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-foreground">
                            <div className="flex items-center gap-2">
                              <TokenIcon symbol={rule.symbol} size={20} />
                              <span>{rule.symbol}</span>
                              {isStable && <span className="text-[9px] text-teal-400 font-semibold">RESERVE</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-primary">{target}%</td>
                          <td className="py-2.5 px-3 font-mono text-foreground">
                            {typeof nowPct === "number" ? `${nowPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className={`py-2.5 px-3 font-mono font-semibold ${gap == null ? "text-muted-foreground" : gap >= 0 ? "text-amber-400" : "text-blue-400"}`}>
                            {gap == null ? "—" : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)} pp`}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {total > 0 ? money((target / 100) * total) : "—"}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">{pxThen > 0 ? money(pxThen) : "—"}</td>
                          <td className="py-2.5 px-3 font-mono text-foreground">{pxNow > 0 ? money(pxNow) : "—"}</td>
                          <td className={`py-2.5 px-3 font-mono font-semibold ${chg == null ? "text-muted-foreground" : chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-muted-foreground leading-relaxed">{rule.rationale}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Research Sub-Agent Sources Section (Depth 1 Second Opinion) */}
          {Boolean((activeStrategy.sources && activeStrategy.sources.length > 0) || (activeStrategy.research?.sources && activeStrategy.research.sources.length > 0)) && (
            <div className="p-4 rounded-xl bg-secondary/30 border border-border text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                  <BrainCircuit size={14} className="text-purple-400" />
                  Verified Source Links (Depth 1 Macro Research Second Opinion)
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-semibold">
                  {(activeStrategy.sources || activeStrategy.research?.sources || []).length} Verified Sources
                </span>
              </div>
              {activeStrategy.research?.executive_summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {activeStrategy.research.executive_summary}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(activeStrategy.sources || activeStrategy.research?.sources || []).map((src: any, sIdx: number) => (
                  <a
                    key={sIdx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-lg border border-border bg-card hover:border-purple-500/40 hover:bg-secondary/40 transition-all flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-[11px] text-foreground group-hover:text-purple-400 truncate">
                        {src.title || src.url}
                      </span>
                      <ExternalLink size={12} className="text-muted-foreground group-hover:text-purple-400 shrink-0" />
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {src.url}
                    </span>
                    {(src.snippet || src.description) && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-1">
                        {src.snippet || src.description}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Strategy History Drawer / Accordion */}
          {showHistory && (
            <div className="pt-4 border-t border-border space-y-3">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <History size={14} className="text-primary" />
                Previous Rebalancer Strategies (Rebalancer DB)
              </h4>
              {history.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {history.map((histItem) => (
                    <div
                      key={histItem.id}
                      className="p-3 rounded-xl bg-secondary/30 border border-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">Strategy #{histItem.id}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              histItem.status === "ACTIVE"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {histItem.status}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            {histItem.created_at ? new Date(histItem.created_at).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          Coins: {Array.isArray(histItem.selected_coins) ? histItem.selected_coins.join(", ") : String(histItem.selected_coins)}
                          {histItem.drop_reason ? ` • ${histItem.drop_reason}` : ""}
                        </p>
                      </div>
                      <div className="text-[11px] font-mono font-semibold text-primary">
                        {histItem.allocations ? JSON.stringify(histItem.allocations).slice(0, 45) : ""}...
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No historical strategies found.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
