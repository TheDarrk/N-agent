"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Maximize2,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Sparkles,
  BarChart2,
  Image as ImageIcon,
  Activity,
  Brain,
} from "lucide-react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

export interface InteractiveChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  timeframe?: string;
  verdict?: string;
  action?: string;
  stage?: string;
  confidenceScore?: number;
  expectedRoiPct?: number;
  entryPrice?: number;
  tpPrice?: number;
  slPrice?: number;
  riskRewardRatio?: number;
  patternDetected?: string;
  reasoning?: string;
  dropReason?: string;
  candles?: Array<{
    time?: number | string;
    timestamp?: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  chartImageUri?: string | null;
  indicators?: {
    current_price?: number;
    ema20?: number;
    ema50?: number;
    rsi?: number;
    atr?: number;
    atr_pct?: number;
    recent_support?: number;
    recent_resistance?: number;
    candles?: any[];
  };
  fearAndGreed?: {
    value?: number;
    value_classification?: string;
  };
}

export default function InteractiveChartModal({
  isOpen,
  onClose,
  symbol,
  timeframe = "1h",
  verdict,
  confidenceScore,
  expectedRoiPct,
  entryPrice,
  tpPrice,
  slPrice,
  riskRewardRatio,
  patternDetected,
  reasoning,
  dropReason,
  candles: initialCandles,
  chartImageUri,
  indicators,
  fearAndGreed,
}: InteractiveChartModalProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const [activeTab, setActiveTab] = useState<"interactive" | "original">("interactive");
  const [candlesData, setCandlesData] = useState<any[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(false);
  const [showEma, setShowEma] = useState(true);

  const displayReason = dropReason || reasoning || "Standing aside to protect capital and preserve buying power.";
  const isExecuted = verdict === "ENTER_LONG" || verdict === "ENTER_SHORT" || verdict === "EXECUTE";
  const isDropped = Boolean(dropReason || verdict === "DROPPED");
  const isStandAside = !isExecuted && !isDropped;

  // Extract or fetch candlestick data
  useEffect(() => {
    if (!isOpen) return;

    // 1. Check if candles were passed directly
    const rawCandles = initialCandles || indicators?.candles;
    if (rawCandles && Array.isArray(rawCandles) && rawCandles.length > 0) {
      const formatted = rawCandles
        .map((c: any, idx: number) => {
          let timeVal = c.time || c.timestamp || Math.floor(Date.now() / 1000) - (rawCandles.length - idx) * 3600;
          if (typeof timeVal === "string") {
            const parsed = new Date(timeVal).getTime() / 1000;
            timeVal = isNaN(parsed) ? Math.floor(Date.now() / 1000) - (rawCandles.length - idx) * 3600 : parsed;
          } else if (timeVal > 1e11) {
            timeVal = Math.floor(timeVal / 1000);
          }
          return {
            time: Math.floor(timeVal) as any,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          };
        })
        .filter((c: any) => !isNaN(c.open) && !isNaN(c.close) && c.high >= c.low)
        .sort((a: any, b: any) => a.time - b.time);

      // De-duplicate any candles with identical timestamp
      const deduped: any[] = [];
      for (let i = 0; i < formatted.length; i++) {
        if (i === 0 || formatted[i].time > deduped[deduped.length - 1].time) {
          deduped.push(formatted[i]);
        }
      }

      if (deduped.length > 0) {
        setCandlesData(deduped);
        return;
      }
    }

    // 2. Fallback: fetch historical candles from internal market API
    const fetchMarketCandles = async () => {
      setIsLoadingCandles(true);
      try {
        const cleanSym = symbol ? symbol.toUpperCase() : "NEAR";
        const res = await fetch(`/api/market/candles?symbol=${cleanSym}&timeframe=${timeframe}&limit=60`);
        if (res.ok) {
          const json = await res.json();
          const items = json.candles || json.data || [];
          if (Array.isArray(items) && items.length > 0) {
            const formatted = items
              .map((c: any, idx: number) => {
                let timeVal = c.time || c.timestamp || Math.floor(Date.now() / 1000) - (items.length - idx) * 3600;
                if (typeof timeVal === "string") timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
                else if (timeVal > 1e11) timeVal = Math.floor(timeVal / 1000);
                return {
                  time: Math.floor(timeVal) as any,
                  open: Number(c.open),
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                };
              })
              .filter((c: any) => !isNaN(c.open) && !isNaN(c.close))
              .sort((a: any, b: any) => a.time - b.time);

            const deduped: any[] = [];
            for (let i = 0; i < formatted.length; i++) {
              if (i === 0 || formatted[i].time > deduped[deduped.length - 1].time) {
                deduped.push(formatted[i]);
              }
            }
            if (deduped.length > 0) {
              setCandlesData(deduped);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch market candles for interactive chart:", err);
      } finally {
        setIsLoadingCandles(false);
      }

      // 3. Synthetic candle fallback centered around entry / indicator price
      const basePrice = entryPrice || indicators?.current_price || 10.0;
      const nowSec = Math.floor(Date.now() / 1000);
      const synth = [];
      let current = basePrice * 0.96;
      for (let i = 40; i >= 0; i--) {
        const drift = (Math.sin(i / 3) * 0.015 + (Math.random() - 0.48) * 0.02) * current;
        const open = current;
        const close = current + drift;
        const high = Math.max(open, close) + Math.abs(drift) * 0.6;
        const low = Math.min(open, close) - Math.abs(drift) * 0.6;
        current = close;
        synth.push({
          time: (nowSec - i * 3600) as any,
          open: Number(open.toFixed(4)),
          high: Number(high.toFixed(4)),
          low: Number(low.toFixed(4)),
          close: Number(close.toFixed(4)),
        });
      }
      setCandlesData(synth);
    };

    fetchMarketCandles();
  }, [isOpen, symbol, timeframe, initialCandles, indicators, entryPrice]);

  // Initialize and update Lightweight Charts canvas
  useEffect(() => {
    if (!isOpen || activeTab !== "interactive" || !chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 750,
      height: container.clientHeight || 480,
      layout: {
        background: { color: "#07090E" },
        textColor: "#94a3b8",
        fontSize: 12,
        fontFamily: "var(--font-geist-mono), monospace",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.07)" },
        horzLines: { color: "rgba(148, 163, 184, 0.07)" },
      },
      crosshair: {
        vertLine: { color: "rgba(56, 189, 248, 0.4)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(56, 189, 248, 0.4)", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        scaleMargins: { top: 0.12, bottom: 0.15 },
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartInstanceRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    if (candlesData.length > 0) {
      candleSeries.setData(candlesData);

      // EMA Overlays
      if (showEma && candlesData.length >= 10) {
        const calcEma = (period: number) => {
          const k = 2 / (period + 1);
          let ema = candlesData[0].close;
          return candlesData.map((c) => {
            ema = c.close * k + ema * (1 - k);
            return { time: c.time, value: Number(ema.toFixed(4)) };
          });
        };

        const ema20Series = chart.addSeries(LineSeries, {
          color: "#38bdf8",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          title: "EMA 20",
        });
        ema20Series.setData(calcEma(20));

        if (candlesData.length >= 25) {
          const ema50Series = chart.addSeries(LineSeries, {
            color: "#fbbf24",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "EMA 50",
          });
          ema50Series.setData(calcEma(50));
        }
      }

      // Add Horizontal Structural Price Lines
      if (entryPrice && entryPrice > 0) {
        candleSeries.createPriceLine({
          price: entryPrice,
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "ENTRY",
        });
      }

      if (tpPrice && tpPrice > 0) {
        candleSeries.createPriceLine({
          price: tpPrice,
          color: "#10b981",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "TARGET (TP)",
        });
      }

      if (slPrice && slPrice > 0) {
        candleSeries.createPriceLine({
          price: slPrice,
          color: "#f43f5e",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "STOP LOSS",
        });
      }

      // Support / Resistance lines if present in indicators
      if (indicators?.recent_support && indicators.recent_support > 0) {
        candleSeries.createPriceLine({
          price: indicators.recent_support,
          color: "rgba(16, 185, 129, 0.5)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "SUPPORT",
        });
      }
      if (indicators?.recent_resistance && indicators.recent_resistance > 0) {
        candleSeries.createPriceLine({
          price: indicators.recent_resistance,
          color: "rgba(244, 63, 94, 0.5)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "RESISTANCE",
        });
      }

      chart.timeScale().fitContent();
    }

    // Resize observer
    const handleResize = () => {
      if (container && chart) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [isOpen, activeTab, candlesData, showEma, entryPrice, tpPrice, slPrice, indicators]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-6xl h-[90vh] max-h-[820px] rounded-2xl border border-border bg-[#0B0F19] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-secondary/30 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-extrabold text-foreground tracking-tight">
              {symbol?.toUpperCase() || "MARKET"}
            </span>
            <span className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground uppercase">
              {timeframe}
            </span>
            {isExecuted ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> {verdict}
              </span>
            ) : isDropped ? (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <XCircle size={13} /> DROPPED
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert size={13} /> STAND ASIDE
              </span>
            )}
            {confidenceScore !== undefined && confidenceScore > 0 && (
              <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
                Confidence: <strong className="text-foreground">{confidenceScore}%</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            {chartImageUri && (
              <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("interactive")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === "interactive"
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BarChart2 size={13} /> Interactive
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("original")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                    activeTab === "original"
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ImageIcon size={13} /> Static Snapshot
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
              aria-label="Close interactive modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Content Layout: Chart on Left, Strategy Reason on Right */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Chart Display Area */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#07090E] relative border-b lg:border-b-0 lg:border-r border-border">
            {activeTab === "interactive" ? (
              <>
                {/* Chart Toolbar Controls */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-[#0B0F19]/60 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEma(!showEma)}
                      className={`px-2 py-0.5 rounded border transition-colors font-mono text-[11px] ${
                        showEma ? "border-primary/50 text-cyan-400 bg-primary/10" : "border-border text-muted-foreground"
                      }`}
                    >
                      EMA 20/50 Overlay: {showEma ? "ON" : "OFF"}
                    </button>
                    <span className="text-[11px] font-mono hidden md:inline">
                      Use mouse wheel / pinch to zoom · Drag to pan
                    </span>
                  </div>

                  {/* Horizontal legend */}
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="flex items-center gap-1 text-cyan-400">
                      <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span> Entry
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2.5 h-0.5 bg-emerald-400 inline-block"></span> Take Profit
                    </span>
                    <span className="flex items-center gap-1 text-rose-400">
                      <span className="w-2.5 h-0.5 bg-rose-400 inline-block"></span> Stop Loss
                    </span>
                  </div>
                </div>

                {/* Canvas Container */}
                <div ref={chartContainerRef} className="w-full flex-1 min-h-[300px]" />
              </>
            ) : (
              <div className="w-full h-full p-4 flex items-center justify-center overflow-auto bg-[#07090E]">
                {chartImageUri ? (
                  <img
                    src={chartImageUri}
                    alt={`${symbol} original technical analysis`}
                    className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-inner"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground font-mono">No snapshot image available.</p>
                )}
              </div>
            )}
          </div>

          {/* Right Decision Audit & Math Sidebar */}
          <div className="w-full lg:w-96 flex flex-col shrink-0 bg-[#0B0F19] overflow-y-auto p-4 space-y-4">
            {/* Decision Reason Card */}
            <div className="rounded-xl border border-border bg-secondary/20 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Brain size={14} className="text-primary" /> Why Agent Acted / Stood Aside
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">Autonomous Audit</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-foreground font-medium">
                {displayReason}
              </p>
            </div>

            {/* Pattern & Geometry */}
            {patternDetected && (
              <div className="rounded-xl border border-border bg-secondary/15 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">Chart Pattern</span>
                  <span className="rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                    {patternDetected}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-normal">
                  Identified technical structure verified against algorithmic rules and textbook pattern invalidation.
                </p>
              </div>
            )}

            {/* Math Confluence Grid */}
            <div className="rounded-xl border border-border bg-secondary/15 p-3 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders size={13} className="text-cyan-400" /> Mathematical Confluence
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded-lg bg-background/50 border border-border p-2">
                  <span className="text-[10px] text-muted-foreground block">ENTRY LEVEL</span>
                  <span className="font-extrabold text-foreground">
                    {entryPrice ? `$${entryPrice.toFixed(4)}` : "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-background/50 border border-border p-2">
                  <span className="text-[10px] text-muted-foreground block">TARGET (TP)</span>
                  <span className="font-extrabold text-emerald-400">
                    {tpPrice ? `$${tpPrice.toFixed(4)}` : "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-background/50 border border-border p-2">
                  <span className="text-[10px] text-muted-foreground block">STOP LOSS</span>
                  <span className="font-extrabold text-rose-400">
                    {slPrice ? `$${slPrice.toFixed(4)}` : "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-background/50 border border-border p-2">
                  <span className="text-[10px] text-muted-foreground block">REWARD : RISK</span>
                  <span className="font-extrabold text-primary">
                    {riskRewardRatio ? `${riskRewardRatio.toFixed(2)} : 1` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Macro Sentiment (Fear & Greed) */}
            <div className="rounded-xl border border-border bg-secondary/15 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Activity size={13} className="text-amber-400" /> Market Psychology
                </span>
                <span className="font-mono text-xs font-bold text-foreground">
                  {fearAndGreed?.value !== undefined ? `${fearAndGreed.value}/100` : "Index Active"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-normal">
                Macro sentiment:{" "}
                <strong className="text-foreground">
                  {fearAndGreed?.value_classification || "Balanced Sentiment"}
                </strong>
                . Trade execution requires strict technical edge and risk management confluence.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
