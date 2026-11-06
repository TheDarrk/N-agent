import { normalizeSymbol, type BookLevel, type FlowResponse, type Tape } from "@/lib/market/market";

export const dynamic = "force-dynamic";

const BINANCE = "https://data-api.binance.vision/api/v3";
const COINBASE = "https://api.exchange.coinbase.com";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

async function fromBinance(symbol: string): Promise<Omit<FlowResponse, "symbol">> {
  const [book, trades] = await Promise.all([
    getJson<{ bids: string[][]; asks: string[][] }>(`${BINANCE}/depth?symbol=${symbol}USDT&limit=25`),
    getJson<{ id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }[]>(`${BINANCE}/trades?symbol=${symbol}USDT&limit=40`),
  ]);
  const level = (r: string[]): BookLevel => ({ price: Number(r[0]), size: Number(r[1]) });
  const tape: Tape[] = trades
    .map((t) => ({ id: String(t.id), time: t.time, price: Number(t.price), size: Number(t.qty), side: t.isBuyerMaker ? ("sell" as const) : ("buy" as const) }))
    .reverse();
  return { source: "binance", bids: book.bids.map(level), asks: book.asks.map(level), trades: tape };
}

async function fromCoinbase(symbol: string): Promise<Omit<FlowResponse, "symbol">> {
  const [book, trades] = await Promise.all([
    getJson<{ bids: string[][]; asks: string[][] }>(`${COINBASE}/products/${symbol}-USD/book?level=2`),
    getJson<{ trade_id: number; price: string; size: string; time: string; side: "buy" | "sell" }[]>(`${COINBASE}/products/${symbol}-USD/trades?limit=40`),
  ]);
  const level = (r: string[]): BookLevel => ({ price: Number(r[0]), size: Number(r[1]) });
  const tape: Tape[] = trades.map((t) => ({
    id: String(t.trade_id),
    time: Date.parse(t.time),
    price: Number(t.price),
    size: Number(t.size),
    // Coinbase reports the maker side, so the taker is the opposite.
    side: t.side === "buy" ? "sell" : "buy",
  }));
  return { source: "coinbase", bids: book.bids.slice(0, 25).map(level), asks: book.asks.slice(0, 25).map(level), trades: tape };
}

export async function GET(request: Request) {
  const symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol"));
  if (!symbol) return Response.json({ error: "Unsupported symbol" }, { status: 400 });

  for (const load of [fromBinance, fromCoinbase]) {
    try {
      const flow = await load(symbol);
      return Response.json({ symbol, ...flow });
    } catch {
      // try the next source
    }
  }
  return Response.json({ symbol, source: "none", bids: [], asks: [], trades: [] }, { status: 404 });
}
