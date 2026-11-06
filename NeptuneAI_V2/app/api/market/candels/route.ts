import { INTERVALS, normalizeSymbol, type Candle, type Interval } from "@/lib/market/market";

export const dynamic = "force-dynamic";

const BINANCE = "https://data-api.binance.vision/api/v3";
const COINBASE = "https://api.exchange.coinbase.com";

async function fromBinance(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

async function fromCoinbase(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  const seconds = INTERVALS.find((i) => i.id === interval)?.seconds ?? 300;
  const res = await fetch(`${COINBASE}/products/${symbol}-USD/candles?granularity=${seconds}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`coinbase ${res.status}`);
  const rows = (await res.json()) as number[][];
  return rows
    .map((r) => ({ time: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] }))
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol"));
  const interval = (searchParams.get("interval") ?? "5m") as Interval;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 300, 20), 500);

  if (!symbol || !INTERVALS.some((i) => i.id === interval)) {
    return Response.json({ error: "Unsupported symbol or interval", candles: [] }, { status: 400 });
  }

  for (const [source, load] of [
    ["binance", fromBinance],
    ["coinbase", fromCoinbase],
  ] as const) {
    try {
      const candles = await load(symbol, interval, limit);
      if (candles.length > 0) return Response.json({ symbol, interval, source, candles });
    } catch {
      // try the next source
    }
  }
  return Response.json({ error: `No market data for ${symbol}`, symbol, interval, source: "none", candles: [] }, { status: 404 });
}
