"use client";

import { POLL_HISTORY_MS, POLL_LIVE_MS } from "@/lib/poll-config";
import { useCallback, useEffect, useRef, useState } from "react";
import { setVisibleInterval } from "@/lib/visible-interval";
import {
  EMPTY_DASHBOARD,
  type ActiveStrategy,
  type ActivityItem,
  type AgentKey,
  type DashboardData,
  type DriftStatus,
  type FleetResponse,
  type ModeratorStatus,
  type Notice,
  type ReportLite,
  type TraceLite,
  type TraderSettings,
  type TradesResponse,
} from "./dashboard-types";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: any }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

export type DashboardActions = {
  pending: string | null;
  notice: Notice | null;
  dismissNotice: () => void;
  toggleKillSwitch: (activate: boolean) => Promise<void>;
  toggleAgent: (agent: AgentKey, active: boolean) => Promise<void>;
  scanMarket: () => Promise<void>;
  checkDrift: () => Promise<void>;
  setKillThreshold: (value: number) => Promise<void>;
  setCadence: (frequency: string) => Promise<void>;
};

const dashKey = (w: string) => `neptune_dash_${w.trim().toLowerCase()}`;

function readDashSnapshot(wallet: string): DashboardData | null {
  if (typeof window === "undefined" || !wallet) return null;
  try {
    const raw = localStorage.getItem(dashKey(wallet));
    return raw ? ({ ...EMPTY_DASHBOARD, ...JSON.parse(raw) } as DashboardData) : null;
  } catch {
    return null;
  }
}

function writeDashSnapshot(wallet: string, data: DashboardData) {
  try {
    // keep it small: drop heavy chart images from cached traces
    const slim = { ...data, traces: (data.traces || []).slice(0, 8).map((t: any) => ({ ...t, chart_image: undefined })) };
    localStorage.setItem(dashKey(wallet), JSON.stringify(slim));
  } catch {
    /* quota: best effort */
  }
}

export function useDashboardData(accountId: string | null) {
  const wallet = accountId || "";
  const [data, setData] = useState<DashboardData>(() => readDashSnapshot(accountId || "") ?? EMPTY_DASHBOARD);
  const [loading, setLoading] = useState<boolean>(() => !readDashSnapshot(accountId || ""));
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [deliberating, setDeliberating] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const refresh = useCallback(async () => {
    if (!wallet) {
      setData(EMPTY_DASHBOARD);
      setLoading(false);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      const [fleet, trades, moderator, drift, strategy, reports, logs, traces, settings] = await Promise.all([
        getJson<FleetResponse>(`/api/fleet/${encodeURIComponent(wallet)}`),
        getJson<TradesResponse>(`/api/trader/trades/${encodeURIComponent(wallet)}`),
        getJson<ModeratorStatus>(`/api/moderator/status/${encodeURIComponent(wallet)}`),
        getJson<DriftStatus>(`/api/rebalancer/status/${encodeURIComponent(wallet)}`),
        getJson<{ active_strategy?: ActiveStrategy }>(`/api/rebalancer/strategy/${encodeURIComponent(wallet)}`),
        getJson<{ reports?: ReportLite[] }>(`/api/research/reports/${encodeURIComponent(wallet)}`),
        getJson<ActivityItem[]>(`/api/logs/${encodeURIComponent(wallet)}`),
        getJson<{ traces?: TraceLite[] }>(`/api/trader/traces/${encodeURIComponent(wallet)}`),
        getJson<TraderSettings>(`/api/settings/${encodeURIComponent(wallet)}`),
      ]);
      const fleetActivity = fleet?.recent_activity;
      const activity =
        fleetActivity && fleetActivity.length > 0 ? fleetActivity : Array.isArray(logs) ? logs : null;
      setData((prev) => ({
        fleet: fleet ?? prev.fleet,
        trades: trades ?? prev.trades,
        moderator: moderator ?? prev.moderator,
        drift: drift ?? prev.drift,
        strategy: strategy ? (strategy.active_strategy ?? null) : prev.strategy,
        reports: reports?.reports ?? prev.reports,
        activity: activity ? activity.slice(0, 30) : prev.activity,
        traces: traces?.traces ?? prev.traces,
        settings: settings ?? prev.settings,
      }));
      setOffline(!fleet && !trades && !moderator);
      setUpdatedAt(Date.now());
      if (fleet || trades || moderator) {
        // persist the merged view for the next visit (read via ref so we store what is on screen)
        setTimeout(() => writeDashSnapshot(wallet, dataRef.current), 0);
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    // switch wallet => show that wallet's cached snapshot at once (skeleton only when nothing is cached)
    const cached = readDashSnapshot(wallet);
    setData(cached ?? EMPTY_DASHBOARD);
    setLoading(!cached);
    refresh();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const cleanupInterval = setVisibleInterval(refresh, POLL_HISTORY_MS);

    return () => {
      cleanupInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const runDeliberation = useCallback(async () => {
    setDeliberating(true);
    try {
      const res = await fetch("/api/moderator/deliberate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: wallet }),
      });
      if (res.ok) {
        const moderator = (await res.json()) as ModeratorStatus;
        setData((prev) => ({ ...prev, moderator }));
      }
    } catch {
      // The panel keeps showing the last verdict if the backend is unreachable.
    } finally {
      setDeliberating(false);
    }
  }, [wallet]);

  const run = useCallback(
    async (key: string, work: () => Promise<Notice>) => {
      setPending(key);
      try {
        setNotice(await work());
        await refresh();
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const needWallet = useCallback(() => {
    if (accountId) return false;
    setNotice({ tone: "info", text: "Connect your wallet first. Guest data is read-only." });
    return true;
  }, [accountId]);

  const toggleKillSwitch = useCallback(
    async (activate: boolean) => {
      if (needWallet()) return;
      await run("kill", async () => {
        const res = await postJson("/api/moderator/kill-switch", { user_wallet: wallet, activate });
        if (!res.ok) return { tone: "bad", text: "Could not change the kill switch. Try again." };
        return activate
          ? { tone: "bad", text: "Kill switch is ON. All agents are paused and no trades will run." }
          : { tone: "good", text: "Kill switch released. Agents can work again." };
      });
    },
    [needWallet, run, wallet],
  );

  const toggleAgent = useCallback(
    async (agent: AgentKey, active: boolean) => {
      if (needWallet()) return;
      await run(`agent-${agent}`, async () => {
        const res = await postJson("/api/fleet/config", {
          user_wallet: wallet,
          agent_id: agent,
          is_active: active,
          config: {},
        });
        if (!res.ok) return { tone: "bad", text: `Could not update the ${agent} agent.` };
        return { tone: "good", text: `${agent[0].toUpperCase()}${agent.slice(1)} agent is now ${active ? "active" : "on standby"}.` };
      });
    },
    [needWallet, run, wallet],
  );

  const scanMarket = useCallback(async () => {
    if (needWallet()) return;
    await run("scan", async () => {
      const s = dataRef.current.settings;
      const customCoins = (s?.trader_custom_coins || "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      const coinMode = s?.trader_coin_mode === "custom" ? "custom" : "auto";
      const res = await postJson("/api/trader/analyze", {
        user_wallet: wallet,
        coin_mode: coinMode,
        custom_coins: coinMode === "custom" ? customCoins : undefined,
        timeframe: s?.trader_timeframe || "1h",
        min_confidence: Number(s?.trader_min_confidence ?? 75),
        enable_researcher_plugin: Boolean(s?.trader_enable_researcher),
      });
      if (!res.ok) return { tone: "bad", text: "The market scan failed. Check the Trader agent and try again." };
      const verdict = res.json?.verdict || res.json?.decision?.verdict || res.json?.status;
      return {
        tone: "good",
        text: verdict ? `Market scan finished. Verdict: ${String(verdict).replace(/_/g, " ")}.` : "Market scan finished.",
      };
    });
  }, [needWallet, run, wallet]);

  const checkDrift = useCallback(async () => {
    if (needWallet()) return;
    await run("drift", async () => {
      const res = await postJson("/api/rebalancer/evaluate", {
        user_wallet: wallet,
        target_allocation: dataRef.current.strategy?.allocations || undefined,
        drift_threshold_pct: 5,
      });
      if (!res.ok) return { tone: "bad", text: "Could not check portfolio drift. Try again." };
      setData((prev) => ({ ...prev, drift: (res.json as DriftStatus) ?? prev.drift }));
      return { tone: "good", text: "Portfolio drift checked. Rebalancing runs only if the drift is above the limit." };
    });
  }, [needWallet, run, wallet]);

  const setKillThreshold = useCallback(
    async (value: number) => {
      if (needWallet()) return;
      const threshold = Math.max(0, Math.min(80, Math.round(value)));
      await run("threshold", async () => {
        const res = await postJson("/api/moderator/kill-threshold", { user_wallet: wallet, threshold });
        return res.ok
          ? { tone: "good", text: `Auto-pause score set to ${threshold}.` }
          : { tone: "bad", text: "Could not save the auto-pause score." };
      });
    },
    [needWallet, run, wallet],
  );

  const setCadence = useCallback(
    async (frequency: string) => {
      if (needWallet()) return;
      await run("cadence", async () => {
        const res = await postJson("/api/moderator/frequency", { user_wallet: wallet, frequency });
        return res.ok
          ? { tone: "good", text: "Moderator review schedule updated." }
          : { tone: "bad", text: "Could not save the review schedule." };
      });
    },
    [needWallet, run, wallet],
  );

  const actions: DashboardActions = {
    pending,
    notice,
    dismissNotice: () => setNotice(null),
    toggleKillSwitch,
    toggleAgent,
    scanMarket,
    checkDrift,
    setKillThreshold,
    setCadence,
  };

  return { data, loading, offline, updatedAt, refresh, runDeliberation, deliberating, wallet, actions };
}
