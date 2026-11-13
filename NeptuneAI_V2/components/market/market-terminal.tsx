"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, CandlestickChart, ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp, GripHorizontal, Maximize2, Minimize2, ScanLine, WifiOff } from "lucide-react";
import type { DashboardData } from "@/components/dashboard/dashboard-types";
import { Panel } from "@/components/dashboard/dashboard-ui";
import { INTERVALS, fmtCompact, fmtPrice, normalizeSymbol, parseTimestamp, type Interval } from "@/lib/market/market";
import AgentPositions from "./agent-positions";
import MarketMovers from "./market-movers";
import OrderFlow from "./order-flow";
import PriceChart, { type ChartLine, type ChartMarker, type ChartType } from "./price-chart";
import { useCandles, useFlow, useTickers } from "./use-market";
import Watchlist, { TokenIcon, type WatchRow } from "./watchlist";

const GRID_COLUMNS = {
  both: "xl:grid-cols-[250px_minmax(0,1fr)_320px]",
  flowOnly: "xl:grid-cols-[44px_minmax(0,1fr)_320px]",
  marketsOnly: "xl:grid-cols-[250px_minmax(0,1fr)_44px]",
  neither: "xl:grid-cols-[44px_minmax(0,1fr)_44px]",
} as const;

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
];

const HEIGHT_PRESETS = [
  { label: "S", value: 400 },
  { label: "M", value: 560 },
  { label: "L", value: 740 },
];

type RangeId = "30m" | "1h" | "4h" | "1d" | "all";

const RANGES: { id: RangeId; label: string; seconds: number | null; interval: Interval | null }[] = [
  { id: "30m", label: "30m", seconds: 1800, interval: "1m" },
  { id: "1h", label: "1H", seconds: 3600, interval: "1m" },
  { id: "4h", label: "4H", seconds: 14400, interval: "1m" },
  { id: "1d", label: "1D", seconds: 86400, interval: "5m" },
  { id: "all", label: "All", seconds: null, interval: null },
];

function formatSpan(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Number((seconds / 3600).toFixed(1))}h`;
  return `${Number((seconds / 86400).toFixed(1))}d`;
}

const MIN_CHART_HEIGHT = 320;
const MAX_CHART_HEIGHT = 1000;

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";

const DEFAULT_SYMBOLS = ["NEAR", "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "ARB"];

function collectAgentSymbols(data: DashboardData): string[] {
  const raw: (string | undefined)[] = [
    ...(data.trades?.open_trades ?? []).map((t) => t.symbol),
    ...(data.trades?.history ?? []).map((t) => t.symbol),
    ...data.traces.map((t) => t.symbol),
    ...data.reports.map((r) => r.actionable_signal?.target_asset),
    ...(data.strategy?.selected_coins ?? []),
    ...Object.keys(data.strategy?.allocations ?? {}),
  ];
  return [...new Set(raw.map((s) => normalizeSymbol(s)).filter((s): s is string => Boolean(s)))];
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-sm font-semibold tabular-nums ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

export default function MarketTerminal({ data }: { data: DashboardData }) {
  const agentSymbols = useMemo(() => collectAgentSymbols(data), [data]);
  const symbols = useMemo(() => [...new Set([...agentSymbols, ...DEFAULT_SYMBOLS])].slice(0, 14), [agentSymbols]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? agentSymbols[0] ?? "NEAR";
  const [interval, setIntervalId] = useState<Interval>("1m");
  const [rangeId, setRangeId] = useState<RangeId>("30m");
  const [viewRange, setViewRange] = useState<{ from: number; to: number } | null>(null);
  const windowSec = RANGES.find((r) => r.id === rangeId)?.seconds ?? null;
  const [showVolume, setShowVolume] = useState(true);
  const [showMa20, setShowMa20] = useState(true);
  const [showMa50, setShowMa50] = useState(false);
  const [showAgent, setShowAgent] = useState(true);
  const [showFlow, setShowFlow] = useState(true);
  const [showMarkets, setShowMarkets] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [logScale, setLogScale] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [chartHeight, setChartHeight] = useState(560);
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const clampHeight = (h: number) => Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, h));
  const fitChart = useCallback(() => setFitSignal((n) => n + 1), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const { data: candleData, error: candleError, mutate: mutateCandles } = useCandles(selected, interval);
  const { data: tickerData, isLoading: tickersLoading } = useTickers(symbols);
  const { data: flow, isLoading: flowLoading } = useFlow(selected);

  const candles = useMemo(() => (candleData && candleData.symbol === selected && candleData.interval === interval ? candleData.candles : []), [candleData, selected, interval]);
  const onRangeChange = useCallback((r: { from: number; to: number }) => {
    setViewRange((prev) => (prev && prev.from === r.from && prev.to === r.to ? prev : r));
  }, []);
  const pickRange = (id: RangeId) => {
    const next = RANGES.find((r) => r.id === id);
    setRangeId(id);
    if (next?.interval) setIntervalId(next.interval);
  };

  const viewStats = useMemo(() => {
    if (!viewRange || candles.length === 0) return null;
    const slice = candles.filter((c) => c.time >= viewRange.from && c.time <= viewRange.to);
    if (slice.length === 0) return null;
    let high = -Infinity;
    let low = Infinity;
    let quoteVolume = 0;
    for (const c of slice) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      quoteVolume += c.volume * c.close;
    }
    const open = slice[0].open;
    const close = slice[slice.length - 1].close;
    const step = INTERVALS.find((i) => i.id === interval)?.seconds ?? 60;
    return {
      high,
      low,
      open,
      close,
      quoteVolume,
      bars: slice.length,
      changePct: open > 0 ? ((close - open) / open) * 100 : 0,
      swingPct: low > 0 ? ((high - low) / low) * 100 : 0,
      span: formatSpan(viewRange.to - viewRange.from + step),
    };
  }, [viewRange, candles, interval]);

  const ticker = tickerData?.tickers.find((t) => t.symbol === selected);
  const livePrice = candles.length > 0 ? candles[candles.length - 1].close : (ticker?.price ?? null);

  const rows: WatchRow[] = useMemo(
    () => symbols.map((symbol) => ({ symbol, fromAgents: agentSymbols.includes(symbol), ticker: tickerData?.tickers.find((t) => t.symbol === symbol) })),
    [symbols, agentSymbols, tickerData],
  );

  const markers: ChartMarker[] = useMemo(() => {
    if (!showAgent) return [];
    const all = [...(data.trades?.open_trades ?? []), ...(data.trades?.history ?? [])];
    const seenTimes = new Set<number>();
    const res: ChartMarker[] = [];

    const validTrades = all.filter(
      (t) =>
        normalizeSymbol(t.symbol) === selected &&
        t.status !== "DROPPED" &&
        t.status !== "CANCELLED" &&
        t.status !== "REJECTED"
    );

    for (const t of validTrades) {
      const ms = parseTimestamp(t.created_at);
      if (ms === null) continue;
      // Round to nearest 60-second window to prevent stacked overlapping markers
      const timeSec = Math.floor(ms / 60000) * 60;
      if (seenTimes.has(timeSec)) continue;
      seenTimes.add(timeSec);

      const short = /SELL|SHORT/i.test(String(t.action));
      res.push({
        time: timeSec,
        side: short ? ("sell" as const) : ("buy" as const),
        label: short ? "Trader short" : "Trader buy"
      });
    }

    return res.sort((a, b) => a.time - b.time);
  }, [data.trades, selected, showAgent]);

  const lines: ChartLine[] = useMemo(() => {
    if (!showAgent) return [];
    return (data.trades?.open_trades ?? [])
      .filter((t) => normalizeSymbol(t.symbol) === selected)
      .flatMap((t) => [
        { price: Number(t.entry_price), tone: "entry" as const, title: `Entry #${t.id}` },
        ...(Number(t.tp_price) > 0 ? [{ price: Number(t.tp_price), tone: "target" as const, title: `Target #${t.id}` }] : []),
      ]);
  }, [data.trades, selected, showAgent]);

  const prevPrice = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  useEffect(() => {
    if (livePrice === null) return;
    if (prevPrice.current !== null && livePrice !== prevPrice.current) {
      setFlash({ dir: livePrice > prevPrice.current ? "up" : "down", n: Date.now() });
    }
    prevPrice.current = livePrice;
  }, [livePrice]);
  useEffect(() => {
    prevPrice.current = null;
    setFlash(null);
  }, [selected]);

  const changePct = ticker?.changePct ?? 0;
  const agentTouching = agentSymbols.includes(selected);
  const offline = Boolean(candleError) && candles.length === 0;

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: chartHeight };
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) setChartHeight(clampHeight(drag.startHeight + e.clientY - drag.startY));
  };
  const onHandleUp = () => {
    dragRef.current = null;
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") setChartHeight((h) => clampHeight(h + 24));
    else if (e.key === "ArrowUp") setChartHeight((h) => clampHeight(h - 24));
    else return;
    e.preventDefault();
  };

  const chartBox = (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "relative min-w-0 overflow-hidden rounded-xl border border-border bg-background/60"
      }
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? `${selected} chart, full screen` : undefined}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {expanded && (
          <div className="mr-2 flex items-center gap-2">
            <TokenIcon symbol={selected} size={24} />
            <span className="text-sm font-bold text-foreground">{`${selected} / USD`}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{livePrice !== null ? `$${fmtPrice(livePrice)}` : "--"}</span>
            <span className={`font-mono text-xs font-semibold tabular-nums ${changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{`${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}</span>
          </div>
        )}
        <div role="radiogroup" aria-label="Chart type" className="flex rounded-lg border border-border bg-background p-0.5">
          {CHART_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={chartType === t.id}
              onClick={() => setChartType(t.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${chartType === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">Range</span>
        <div role="radiogroup" aria-label="Visible time range" className="flex rounded-lg border border-border bg-background p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={rangeId === r.id}
              onClick={() => pickRange(r.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${rangeId === r.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">Candle</span>
        <div role="radiogroup" aria-label="Candle size" className="flex rounded-lg border border-border bg-background p-0.5">
          {INTERVALS.map((i) => (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={interval === i.id}
              onClick={() => {
                setIntervalId(i.id);
                setRangeId("all");
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${interval === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <Toggle label="Log scale" active={logScale} onChange={setLogScale} />
        <button type="button" onClick={fitChart} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <ScanLine size={14} aria-hidden="true" /> Reset view
        </button>
        <div className="ml-auto flex items-center gap-2">
          {!expanded && (
            <div role="radiogroup" aria-label="Chart height" className="hidden rounded-lg border border-border bg-background p-0.5 sm:flex">
              {HEIGHT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  role="radio"
                  aria-checked={chartHeight === p.value}
                  aria-label={`Chart height ${p.label === "S" ? "small" : p.label === "M" ? "medium" : "large"}`}
                  onClick={() => setChartHeight(p.value)}
                  className={`w-7 rounded-md py-1 text-xs font-semibold transition-colors ${chartHeight === p.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Exit full screen" : "Full screen chart"}
            className={iconButton}
          >
            {expanded ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className={expanded ? "relative min-h-0 flex-1" : "relative"} style={expanded ? undefined : { height: `min(${chartHeight}px, 85vh)` }}>
        <PriceChart
          symbol={selected}
          interval={interval}
          candles={candles}
          showVolume={showVolume}
          showMa20={showMa20}
          showMa50={showMa50}
          markers={markers}
          lines={lines}
          chartType={chartType}
          logScale={logScale}
          fitSignal={fitSignal}
          windowSec={windowSec}
          onRangeChange={onRangeChange}
          error={Boolean(candleError)}
          onRetry={() => void mutateCandles()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-sky-400" aria-hidden="true" />MA 20</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-amber-400" aria-hidden="true" />MA 50</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded border-t border-dashed border-blue-400" aria-hidden="true" />Agent entry and target</span>
        <span className="ml-auto hidden sm:inline">Drag to pan, scroll to zoom, drag the price axis to stretch</span>
      </div>

      {!expanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize chart height"
          aria-valuenow={chartHeight}
          aria-valuemin={MIN_CHART_HEIGHT}
          aria-valuemax={MAX_CHART_HEIGHT}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          className="flex h-4 cursor-ns-resize touch-none items-center justify-center border-t border-border bg-secondary/30 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <GripHorizontal size={16} aria-hidden="true" />
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Live market terminal" className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-3">
              <TokenIcon symbol={selected} size={36} />
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold leading-tight text-foreground">
                  {`${selected} / USD`}
                  {agentTouching && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Agents trading</span>
                  )}
                </h2>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {offline ? (
                    <>
                      <WifiOff size={12} aria-hidden="true" /> Reconnecting to market feed
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      {`Live · ${candleData?.source ?? "connecting"}`}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div>
              <p
                key={flash?.n ?? 0}
                className={`font-mono text-3xl font-bold tabular-nums text-foreground ${flash ? (flash.dir === "up" ? "tick-up" : "tick-down") : ""}`}
                aria-live="off"
              >
                {livePrice !== null ? `$${fmtPrice(livePrice)}` : "--"}
              </p>
              <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm font-semibold tabular-nums">
                {viewStats && (
                  <span className={viewStats.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {`${viewStats.changePct >= 0 ? "+" : ""}${viewStats.changePct.toFixed(2)}% · ${viewStats.span}`}
                  </span>
                )}
                {ticker && (
                  <span className={`text-xs ${changePct >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                    {`${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% 24h`}
                  </span>
                )}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-5 gap-y-2 sm:grid-cols-5">
              <Stat label={`High · ${viewStats?.span ?? "view"}`} value={viewStats ? fmtPrice(viewStats.high) : "-"} />
              <Stat label={`Low · ${viewStats?.span ?? "view"}`} value={viewStats ? fmtPrice(viewStats.low) : "-"} />
              <Stat label="Swing" value={viewStats ? `${viewStats.swingPct.toFixed(2)}%` : "-"} />
              <Stat label={`Volume · ${viewStats?.span ?? "view"}`} value={viewStats ? `$${fmtCompact(viewStats.quoteVolume)}` : "-"} />
              <Stat label="24h volume" value={ticker ? `$${fmtCompact(ticker.quoteVolume)}` : "-"} />
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Toggle label="MA 20" active={showMa20} onChange={setShowMa20} />
              <Toggle label="MA 50" active={showMa50} onChange={setShowMa50} />
              <Toggle label="Volume" active={showVolume} onChange={setShowVolume} />
              <Toggle label="Agent trades" active={showAgent} onChange={setShowAgent} />
              <Toggle label="Markets" active={showMarkets} onChange={setShowMarkets} />
              <Toggle label="Order book" active={showFlow} onChange={setShowFlow} />
            </div>
          </div>
        </div>

        <div
          className={`mt-3 grid grid-cols-1 gap-3 transition-[grid-template-columns] duration-300 ease-out ${
            GRID_COLUMNS[showMarkets ? (showFlow ? "both" : "marketsOnly") : showFlow ? "flowOnly" : "neither"]
          }`}
        >
          <div className="relative min-w-0 xl:overflow-hidden xl:rounded-xl xl:border xl:border-border xl:bg-background/60">
            <div
              id="markets-panel"
              inert={!showMarkets}
              className={`xl:absolute xl:inset-0 xl:flex xl:w-[250px] xl:flex-col xl:overflow-hidden xl:p-3 ${showMarkets ? "" : "hidden xl:pointer-events-none xl:opacity-0"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CandlestickChart size={14} aria-hidden="true" /> Markets
                </p>
                <button
                  type="button"
                  onClick={() => setShowMarkets(false)}
                  aria-label="Hide markets"
                  aria-controls="markets-panel"
                  aria-expanded={showMarkets}
                  className={iconButton}
                >
                  <ChevronsLeft size={16} aria-hidden="true" className="hidden xl:block" />
                  <ChevronsUp size={16} aria-hidden="true" className="xl:hidden" />
                </button>
              </div>
              <Watchlist rows={rows} selected={selected} loading={tickersLoading} onSelect={setPicked} />
            </div>
            {!showMarkets && (
              <button
                type="button"
                onClick={() => setShowMarkets(true)}
                aria-label="Show markets"
                aria-controls="markets-panel"
                aria-expanded={showMarkets}
                className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary max-xl:rounded-xl max-xl:border max-xl:border-border xl:absolute xl:inset-0 xl:flex-col xl:px-0 xl:py-4"
              >
                <ChevronsRight size={16} aria-hidden="true" className="hidden xl:block" />
                <ChevronsDown size={16} aria-hidden="true" className="xl:hidden" />
                <span className="xl:[writing-mode:vertical-rl] xl:rotate-180">Markets</span>
              </button>
            )}
          </div>

          <div className="min-w-0">
            {expanded ? (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
                Chart is open in full screen
                <button type="button" onClick={() => setExpanded(false)} className="ml-3 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:text-primary">
                  Exit full screen
                </button>
              </div>
            ) : null}
            {expanded ? createPortal(chartBox, document.body) : chartBox}
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-background/60">
            <div
              id="order-flow-panel"
              inert={!showFlow}
              className={`p-3 transition-opacity duration-200 xl:absolute xl:inset-0 xl:flex xl:w-[320px] xl:flex-col ${showFlow ? "opacity-100" : "hidden opacity-0 xl:pointer-events-none"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order book</p>
                <button
                  type="button"
                  onClick={() => setShowFlow(false)}
                  aria-label="Hide order book"
                  aria-controls="order-flow-panel"
                  aria-expanded={showFlow}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronsRight size={16} aria-hidden="true" />
                </button>
              </div>
              <OrderFlow flow={flow && flow.symbol === selected ? flow : undefined} loading={flowLoading} />
            </div>
            {!showFlow && (
              <button
                type="button"
                onClick={() => setShowFlow(true)}
                aria-label="Show order book"
                aria-controls="order-flow-panel"
                aria-expanded={showFlow}
                className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary xl:absolute xl:inset-0 xl:flex-col xl:px-0 xl:py-4"
              >
                <ChevronsLeft size={16} aria-hidden="true" className="hidden xl:block" />
                <ChevronsDown size={16} aria-hidden="true" className="xl:hidden" />
                <span className="xl:[writing-mode:vertical-rl] xl:rotate-180">Order book</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title={`Your agents on ${selected}`}
          subtitle="Positions are marked to the live price above, so profit and loss update as the market moves."
          className="lg:col-span-3"
          action={<Activity size={18} className="text-primary" aria-hidden="true" />}
        >
          <AgentPositions symbol={selected} livePrice={livePrice} data={data} />
        </Panel>
        <Panel title="Market movers" subtitle="24 hour change across your watchlist. Click a bar to open that market." className="lg:col-span-2">
          <MarketMovers tickers={tickerData?.tickers ?? []} selected={selected} onSelect={setPicked} />
        </Panel>
      </div>
    </section>
  );
}
