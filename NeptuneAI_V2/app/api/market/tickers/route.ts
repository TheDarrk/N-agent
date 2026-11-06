import { normalizeSymbol, type Ticker } from "@/lib/market/market";

export const dynamic = "force-dynamic";

const BINANCE = "https://data-api.binance.vision/api/v3";
const COINBASE = "https://api.exchange.coinbase.com";

async function fromBinance(symbols: string[]): Promise<Ticker[]> {
  const pairs = encodeURIComponent(JSON.stringify(symbols.map((s) => `${s}USDT`)));
  const res = await fetch(`${BINANCE}/ticker/24hr?symbols=${pairs}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as Record<string, string>[];
  return rows.map((r) => ({
    symbol: r.symbol.replace(/USDT$/, ""),
    price: Number(r.lastPrice),
    changePct: Number(r.priceChangePercent),
    open: Number(r.openPrice),
    high: Number(r.highPrice),
    low: Number(r.lowPrice),
    volume: Number(r.volume),
    quoteVolume: Number(r.quoteVolume),
  }));
}

async function fromCoinbase(symbols: string[]): Promise<Ticker[]> {
  const rows = await Promise.all(
    symbols.map(async (s) => {
      try {
        const res = await fetch(`${COINBASE}/products/${s}-USD/stats`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const r = (await res.json()) as Record<string, string>;
        const open = Number(r.open);
        const last = Number(r.last);
        return {
          symbol: s,
          price: last,
          changePct: open > 0 ? ((last - open) / open) * 100 : 0,
          open,
          high: Number(r.high),
          low: Number(r.low),
          volume: Number(r.volume),
          quoteVolume: Number(r.volume) * last,
        } satisfies Ticker;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is Ticker => r !== null);
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = [...new Set(raw.split(",").map((s) => normalizeSymbol(s)).filter((s): s is string => Boolean(s)))].slice(0, 30);
  if (symbols.length === 0) return Response.json({ source: "none", tickers: [] });

  let tickers: Ticker[] = [];
  let source = "binance";
  try {
    tickers = await fromBinance(symbols);
  } catch {
    // Binance rejects the whole batch when one symbol is unknown, so retry each one individually.
    const each = await Promise.all(symbols.map((s) => fromBinance([s]).catch(() => [] as Ticker[])));
    tickers = each.flat();
  }

  const missing = symbols.filter((s) => !tickers.some((t) => t.symbol === s));
  if (missing.length > 0) {
    const extra = await fromCoinbase(missing);
    if (extra.length > 0) {
      tickers = [...tickers, ...extra];
      source = tickers.length === extra.length ? "coinbase" : "binance+coinbase";
    }
  }
  return Response.json({ source, tickers });
}
