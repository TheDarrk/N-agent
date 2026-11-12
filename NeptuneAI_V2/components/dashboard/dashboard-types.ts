export type AgentKey = "trader" | "rebalancer" | "research" | "moderator";

export interface AgentStatus {
  name: string;
  role: string;
  status: string;
  is_active: boolean;
  activity_pct?: number;
  summary?: string;
  today_trades?: number;
  max_trades_day?: number;
  trades_remaining_today?: number;
  metric_label?: string;
  metric_value?: string;
  metric_sub?: string;
  health_score?: number;
  dropped_trades_count?: number;
}

export interface ActivityItem {
  id: number | string;
  agent_name: string;
  trigger_type?: string;
  reasoning_text?: string;
  action_taken?: string;
  cid_reference?: string | null;
  tx_hash?: string | null;
  status?: string;
  created_at?: string;
}

export interface FleetResponse {
  user_wallet: string;
  kill_switch_active: boolean;
  agents: Record<AgentKey, AgentStatus>;
  recent_activity?: ActivityItem[];
}

export interface TraceLite {
  cid: string;
  symbol?: string;
  verdict?: string;
  stage?: string;
  confidence_score?: number;
  expected_roi_pct?: number;
  reasoning?: string;
  pattern_detected?: string;
  drop_reason?: string;
  stored_at?: string;
}

export interface DroppedTrade {
  id: number | string;
  symbol: string;
  amount_usd?: number;
  drop_reason?: string;
  created_at?: string;
  is_cross_chain?: boolean | number;
}

export interface TraderSettings {
  trader_timeframe?: string;
  trader_min_confidence?: number | string | null;
  trader_risk_profile?: string;
  max_tx_amount?: number | string | null;
  trader_max_trades_per_day?: number | string | null;
  trader_coin_mode?: string;
  trader_custom_coins?: string;
  trader_enable_researcher?: number | boolean;
}

export interface Notice {
  tone: "good" | "bad" | "info";
  text: string;
}

export interface TradeRow {
  id: number;
  symbol: string;
  action: string;
  entry_price: number;
  current_price: number;
  tp_price: number;
  amount_usd: number;
  status: string;
  created_at: string;
}

export interface TradesResponse {
  open_trades: TradeRow[];
  history: TradeRow[];
  dropped_trades: DroppedTrade[];
}

export type ModeratorStatus = Record<string, unknown>;

export interface DriftStatus {
  status?: string;
  max_drift_pct?: number;
  total_portfolio_usd?: number;
  action_taken?: string;
}

export interface ActiveStrategy {
  allocations?: Record<string, number>;
  market_regime?: string;
  overall_strategy?: string;
  status?: string;
  selected_coins?: string[];
}

export interface ReportLite {
  title: string;
  regime?: string;
  summary?: string;
  cid: string;
  fee_paid_near: number;
  created_at: string;
  actionable_signal?: {
    action: string;
    target_asset: string;
    confidence: number;
    recommended_timeframe?: string;
  };
}

export interface DashboardData {
  fleet: FleetResponse | null;
  trades: TradesResponse | null;
  moderator: ModeratorStatus | null;
  drift: DriftStatus | null;
  strategy: ActiveStrategy | null;
  reports: ReportLite[];
  activity: ActivityItem[];
  traces: TraceLite[];
  settings: TraderSettings | null;
}

export const EMPTY_DASHBOARD: DashboardData = {
  fleet: null,
  trades: null,
  moderator: null,
  drift: null,
  strategy: null,
  reports: [],
  activity: [],
  traces: [],
  settings: null,
};

export function agentIdFromName(name: string): AgentKey {
  const n = (name || "").toLowerCase();
  if (n.includes("moderator")) return "moderator";
  if (n.includes("research")) return "research";
  if (n.includes("rebalanc")) return "rebalancer";
  return "trader";
}

export function timeAgo(value?: string): string {
  if (!value) return "just now";
  const iso = value.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" UTC", "").replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return value;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export type HelpTopic = "overview" | "profit" | "risk" | "change" | "drift" | "research";

export const POSITIVE = "hsl(158 64% 52%)";
export const NEGATIVE = "hsl(350 89% 60%)";
export const PRIMARY = "hsl(210 100% 56%)";
export const WARNING = "hsl(38 92% 56%)";

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  const body = abs.toLocaleString(undefined, { maximumFractionDigits: abs < 100 ? 2 : 0 });
  return `${n < 0 ? "-" : ""}$${body}`;
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function pickText(o: Record<string, unknown> | null | undefined, key: string): string {
  const v = o?.[key];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

export function pickNum(o: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = o?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function pickList(o: Record<string, unknown> | null | undefined, key: string): string[] {
  const v = o?.[key];
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? JSON.stringify(x) : String(x)))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Scores arrive on either a 0-10 or a 0-100 scale; normalise to a 0-100 percentage. */
export function scoreToPct(v: number | null): number | null {
  if (v === null) return null;
  return Math.max(0, Math.min(100, v <= 10 ? v * 10 : v));
}

export interface Fill {
  id: string;
  symbol: string;
  pnl: number;
  pct: number;
  t: number;
  open: boolean;
  amount: number;
}

export function tradeFill(t: TradeRow, open: boolean): Fill {
  const short = /SELL|SHORT/i.test(String(t.action));
  const entry = Number(t.entry_price) || 0;
  const cur = Number(t.current_price) || 0;
  const amount = Number(t.amount_usd) || 0;
  const pct = entry > 0 ? (short ? entry - cur : cur - entry) / entry : 0;
  const time = Date.parse(t.created_at);
  return {
    id: `${open ? "o" : "h"}-${t.id}`,
    symbol: t.symbol,
    pnl: pct * amount,
    pct: pct * 100,
    t: Number.isFinite(time) ? time : 0,
    open,
    amount,
  };
}

export interface TradeStats {
  fills: Fill[];
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  wins: number;
  losses: number;
  winRate: number | null;
  exposure: number;
  best: Fill | null;
  worst: Fill | null;
  bySymbol: { symbol: string; pnl: number }[];
}

export function computeStats(trades: TradesResponse | null): TradeStats {
  const open = (trades?.open_trades ?? []).filter((t) => t.status === "OPEN");
  const validClosedStatuses = new Set(["CLOSED_TP", "CLOSED_SL", "CLOSED", "COMPLETED"]);
  const history = (trades?.history ?? []).filter((t) => validClosedStatuses.has(String(t.status).toUpperCase()));
  const fills = [...history.map((t) => tradeFill(t, false)), ...open.map((t) => tradeFill(t, true))].sort(
    (a, b) => a.t - b.t,
  );
  const closed = fills.filter((f) => !f.open);
  const wins = closed.filter((f) => f.pnl > 0.001).length;
  const losses = closed.filter((f) => f.pnl < -0.001).length;
  const realizedPnl = closed.reduce((s, f) => s + f.pnl, 0);
  const unrealizedPnl = fills.filter((f) => f.open).reduce((s, f) => s + f.pnl, 0);
  const exposure = open.reduce((s, t) => s + (Number(t.amount_usd) || 0), 0);
  const bySymbolMap = new Map<string, number>();
  for (const f of fills) bySymbolMap.set(f.symbol, (bySymbolMap.get(f.symbol) ?? 0) + f.pnl);
  const bySymbol = [...bySymbolMap.entries()]
    .map(([symbol, pnl]) => ({ symbol, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
  const ranked = [...fills].sort((a, b) => b.pnl - a.pnl);
  return {
    fills,
    totalPnl: realizedPnl + unrealizedPnl,
    realizedPnl,
    unrealizedPnl,
    wins,
    losses,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
    exposure,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    bySymbol,
  };
}

export interface CurvePoint {
  t: number;
  label: string;
  value: number;
}

export function buildCurve(fills: Fill[], rangeMs: number | null): CurvePoint[] {
  const cutoff = rangeMs ? Date.now() - rangeMs : 0;
  let running = 0;
  const points: CurvePoint[] = [];
  for (const f of fills) {
    running += f.pnl;
    if (f.t >= cutoff) {
      points.push({
        t: f.t,
        label: new Date(f.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" }),
        value: Number(running.toFixed(2)),
      });
    }
  }
  return points;
}

export const AGENT_ORDER: AgentKey[] = ["trader", "rebalancer", "research", "moderator"];

export const AGENT_INFO: Record<AgentKey, { label: string; job: string }> = {
  trader: { label: "Trader", job: "Looks for trades and buys or sells within the limits you set." },
  rebalancer: { label: "Portfolio", job: "Keeps your holdings close to the mix you chose." },
  research: { label: "Research", job: "Reads the market and writes reports with a clear signal." },
  moderator: { label: "Moderator", job: "Watches the other three, scores them and can stop them." },
};
