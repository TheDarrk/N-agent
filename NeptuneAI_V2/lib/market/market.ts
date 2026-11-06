export type Interval = "1m" | "5m" | "15m" | "1h" | "1d";

export const INTERVALS: { id: Interval; label: string; seconds: number }[] = [
  { id: "1m", label: "1m", seconds: 60 },
  { id: "5m", label: "5m", seconds: 300 },
  { id: "15m", label: "15m", seconds: 900 },
  { id: "1h", label: "1H", seconds: 3600 },
  { id: "1d", label: "1D", seconds: 86400 },
];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlesResponse {
  symbol: string;
  interval: Interval;
  source: string;
  candles: Candle[];
}

export interface Ticker {
  symbol: string;
  price: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

export interface TickersResponse {
  source: string;
  tickers: Ticker[];
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface Tape {
  id: string;
  time: number;
  price: number;
  size: number;
  side: "buy" | "sell";
}

export interface FlowResponse {
  symbol: string;
  source: string;
  bids: BookLevel[];
  asks: BookLevel[];
  trades: Tape[];
}

const STABLES = new Set(["USDT", "USDC", "DAI", "USD", "BUSD", "FDUSD", "TUSD", "USDE"]);
const WRAPPED: Record<string, string> = { WNEAR: "NEAR", WBTC: "BTC", WETH: "ETH", WSOL: "SOL", STNEAR: "NEAR", LINEAR: "NEAR" };

/** Reduces whatever an agent wrote ("wNEAR", "near/usdc", "NEAR-USD") to a plain ticker, or null when it is not chartable. */
export function normalizeSymbol(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const head = raw.toUpperCase().trim().split(/[\s/:_-]/)[0] ?? "";
  const clean = head.replace(/[^A-Z0-9]/g, "");
  if (!clean || STABLES.has(clean)) return null;
  const mapped = WRAPPED[clean] ?? clean;
  return /^[A-Z0-9]{2,10}$/.test(mapped) ? mapped : null;
}

/** Backend timestamps are UTC but often lack a zone suffix; returns epoch milliseconds or null. */
export function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const iso = value.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" UTC", "").replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (abs >= 0.01) return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 5 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
}
