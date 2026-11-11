"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { INTERVALS, fmtCompact, fmtPrice, type Candle, type Interval } from "@/lib/market/market";

export interface ChartMarker {
  time: number;
  side: "buy" | "sell";
  label: string;
}

export interface ChartLine {
  price: number;
  tone: "entry" | "target" | "stop";
  title: string;
}

export type ChartType = "candles" | "line" | "area";

type Props = {
  symbol: string;
  interval: Interval;
  candles: Candle[];
  showVolume: boolean;
  showMa20: boolean;
  showMa50: boolean;
  markers: ChartMarker[];
  lines: ChartLine[];
  chartType?: ChartType;
  logScale?: boolean;
  fitSignal?: number;
  windowSec?: number | null;
  onRangeChange?: (range: { from: number; to: number }) => void;
  error?: boolean;
  onRetry?: () => void;
};

const TRANSPARENT = "rgba(0,0,0,0)";

const PALETTES = {
  dark: {
    text: "#8b95a8",
    grid: "rgba(148,163,184,0.07)",
    border: "rgba(148,163,184,0.16)",
    up: "#34d399",
    down: "#fb7185",
    crosshair: "rgba(148,163,184,0.55)",
    label: "#1b2233",
    ma20: "#38bdf8",
    ma50: "#fbbf24",
    entry: "#60a5fa",
    target: "#34d399",
    stop: "#fb7185",
  },
  light: {
    text: "#475569",
    grid: "rgba(71,85,105,0.09)",
    border: "rgba(71,85,105,0.22)",
    up: "#059669",
    down: "#e11d48",
    crosshair: "rgba(71,85,105,0.55)",
    label: "#e2e8f0",
    ma20: "#0284c7",
    ma50: "#d97706",
    entry: "#2563eb",
    target: "#059669",
    stop: "#e11d48",
  },
} as const;

type Palette = (typeof PALETTES)[keyof typeof PALETTES];

function readPalette(): Palette {
  if (typeof document === "undefined") return PALETTES.dark;
  return document.documentElement.classList.contains("light") ? PALETTES.light : PALETTES.dark;
}

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function sma(candles: Candle[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

function candleData(c: Candle) {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

export default function PriceChart({
  symbol,
  interval,
  candles,
  showVolume,
  showMa20,
  showMa50,
  markers,
  lines,
  chartType = "candles",
  logScale = false,
  fitSignal = 0,
  windowSec = null,
  onRangeChange,
  error = false,
  onRetry,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const loadedKeyRef = useRef<string>("");
  const lastBarTimeRef = useRef<number>(0);
  const [palette, setPalette] = useState<Palette>(PALETTES.dark);
  const [hover, setHover] = useState<Candle | null>(null);

  const candleMap = useMemo(() => new Map(candles.map((c) => [c.time, c])), [candles]);
  const candleMapRef = useRef(candleMap);
  candleMapRef.current = candleMap;

  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const windowRef = useRef(windowSec);
  windowRef.current = windowSec;
  const onRangeRef = useRef(onRangeChange);
  onRangeRef.current = onRangeChange;
  const lastEmitRef = useRef<{ from: number; to: number } | null>(null);

  const emitRange = useCallback(() => {
    const chart = chartRef.current;
    const list = candlesRef.current;
    if (!chart || list.length === 0) return;
    const logical = chart.timeScale().getVisibleLogicalRange();
    if (!logical) return;
    const i0 = Math.max(0, Math.ceil(logical.from));
    const i1 = Math.min(list.length - 1, Math.floor(logical.to));
    if (i1 < i0) return;
    const from = list[i0].time;
    const to = list[i1].time;
    const last = lastEmitRef.current;
    if (last && last.from === from && last.to === to) return;
    lastEmitRef.current = { from, to };
    onRangeRef.current?.({ from, to });
  }, []);

  const applyWindow = useCallback(() => {
    const chart = chartRef.current;
    const list = candlesRef.current;
    if (!chart || list.length === 0) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    const seconds = windowRef.current;
    if (seconds === null) {
      chart.timeScale().fitContent();
    } else {
      const step = INTERVALS.find((i) => i.id === intervalRef.current)?.seconds ?? 60;
      const bars = Math.max(10, Math.round(seconds / step));
      const n = list.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-0.5, n - bars - 0.5), to: n - 1 + 6 });
    }
    emitRange();
  }, [emitRange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const colors = readPalette();
    setPalette(colors);

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.label, style: LineStyle.Dashed },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.label, style: LineStyle.Dashed },
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: colors.entry,
      lineWidth: 2,
      topColor: TRANSPARENT,
      bottomColor: TRANSPARENT,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerRadius: 4,
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineWidth: 1,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const ma20 = chart.addSeries(LineSeries, { color: colors.ma20, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const ma50 = chart.addSeries(LineSeries, { color: colors.ma50, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });

    chartRef.current = chart;
    areaRef.current = areaSeries;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    ma20Ref.current = ma20;
    ma50Ref.current = ma50;
    markersRef.current = createSeriesMarkers(candleSeries, []) as ISeriesMarkersPluginApi<UTCTimestamp>;

    chart.subscribeCrosshairMove((param) => {
      const t = typeof param.time === "number" ? param.time : null;
      setHover(t !== null ? (candleMapRef.current.get(t) ?? null) : null);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(emitRange);

    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      areaRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      ma20Ref.current = null;
      ma50Ref.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
      loadedKeyRef.current = "";
      lastEmitRef.current = null;
    };
  }, [emitRange]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: palette.text },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: { color: palette.crosshair, labelBackgroundColor: palette.label },
        horzLine: { color: palette.crosshair, labelBackgroundColor: palette.label },
      },
    });
    const showCandles = chartType === "candles";
    candleRef.current?.applyOptions({
      upColor: showCandles ? palette.up : TRANSPARENT,
      downColor: showCandles ? palette.down : TRANSPARENT,
      borderUpColor: showCandles ? palette.up : TRANSPARENT,
      borderDownColor: showCandles ? palette.down : TRANSPARENT,
      wickUpColor: showCandles ? palette.up : TRANSPARENT,
      wickDownColor: showCandles ? palette.down : TRANSPARENT,
    });
    areaRef.current?.applyOptions({
      lineColor: palette.entry,
      topColor: chartType === "area" ? withAlpha(palette.entry, 0.32) : TRANSPARENT,
      bottomColor: chartType === "area" ? withAlpha(palette.entry, 0) : TRANSPARENT,
      lineWidth: showCandles ? 1 : 2,
      lineVisible: !showCandles,
      crosshairMarkerVisible: !showCandles,
    });
    ma20Ref.current?.applyOptions({ color: palette.ma20 });
    ma50Ref.current?.applyOptions({ color: palette.ma50 });
    if (volumeRef.current && candles.length > 0) {
      volumeRef.current.setData(
        candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: withAlpha(c.close >= c.open ? palette.up : palette.down, 0.35) })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, chartType]);

  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }, [logScale]);

  useEffect(() => {
    applyWindow();
  }, [fitSignal, windowSec, applyWindow]);

  useEffect(() => {
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart || candles.length === 0) return;

    const key = `${symbol}:${interval}`;
    const volumeColor = (c: Candle) => withAlpha(c.close >= c.open ? palette.up : palette.down, 0.35);

    if (loadedKeyRef.current !== key) {
      candleSeries.setData(candles.map(candleData));
      areaRef.current?.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
      volumeSeries.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: volumeColor(c) })));
      loadedKeyRef.current = key;
      lastBarTimeRef.current = candles[candles.length - 1].time;
      lastEmitRef.current = null;
      applyWindow();
    } else {
      // Series.update() only accepts the latest bar or newer, so skip bars already behind it.
      for (const c of candles.slice(-3)) {
        if (c.time < lastBarTimeRef.current) continue;
        candleSeries.update(candleData(c));
        areaRef.current?.update({ time: c.time as UTCTimestamp, value: c.close });
        volumeSeries.update({ time: c.time as UTCTimestamp, value: c.volume, color: volumeColor(c) });
        lastBarTimeRef.current = c.time;
      }
    }
    ma20Ref.current?.setData(sma(candles, 20));
    ma50Ref.current?.setData(sma(candles, 50));
    emitRange();
  }, [candles, symbol, interval, palette, applyWindow, emitRange]);

  useEffect(() => {
    volumeRef.current?.applyOptions({ visible: showVolume });
    ma20Ref.current?.applyOptions({ visible: showMa20 });
    ma50Ref.current?.applyOptions({ visible: showMa50 });
  }, [showVolume, showMa20, showMa50]);

  useEffect(() => {
    if (!markersRef.current || candles.length === 0) return;
    const step = INTERVALS.find((i) => i.id === interval)?.seconds ?? 300;
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    const mapped: SeriesMarker<UTCTimestamp>[] = markers
      .map((m) => ({ ...m, bucket: Math.floor(m.time / step) * step }))
      .filter((m) => m.bucket >= first && m.bucket <= last)
      .sort((a, b) => a.bucket - b.bucket)
      .map((m) => ({
        time: m.bucket as UTCTimestamp,
        position: m.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
        shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
        color: m.side === "buy" ? palette.up : palette.down,
        text: m.label,
      }));
    markersRef.current.setMarkers(mapped);
  }, [markers, candles, interval, palette]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = lines
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        series.createPriceLine({
          price: l.price,
          color: palette[l.tone],
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.title,
        }),
      );
  }, [lines, palette]);

  const shown = hover ?? candles[candles.length - 1] ?? null;
  const change = shown && shown.open > 0 ? ((shown.close - shown.open) / shown.open) * 100 : 0;
  const tone = change >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="relative h-full min-h-[360px] w-full">
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label={`${symbol} price chart, ${interval} candles`} />
      {shown && (
        <dl className="pointer-events-none absolute left-3 top-2 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-card/70 px-2 py-1 font-mono text-[11px] tabular-nums backdrop-blur-sm">
          {(
            [
              ["O", shown.open],
              ["H", shown.high],
              ["L", shown.low],
              ["C", shown.close],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={tone}>{fmtPrice(v)}</dd>
            </div>
          ))}
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Vol</dt>
            <dd className="text-foreground/80">{fmtCompact(shown.volume)}</dd>
          </div>
          <dd className={tone}>{`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</dd>
        </dl>
      )}
      {candles.length === 0 && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="animate-pulse text-sm text-muted-foreground">Loading {symbol} market data...</span>
        </div>
      )}
      {candles.length === 0 && error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
          <span className="text-sm text-rose-400">Failed to load {symbol} market data</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary/80"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
