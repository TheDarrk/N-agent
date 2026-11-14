/**
 * Persist each agent's user-editable form config (prompts, coins, cadence...) in the DB
 * so it survives tab switches, refreshes and devices.
 *
 * Fast path: the last known config + its server hash are cached in localStorage. Opening an
 * agent renders instantly from the cache and sends ONE tiny hash request; the full config is
 * only pulled when the DB hash differs from the cached one. Concurrent loads share one request.
 */
import { useEffect, useRef } from "react";
import { dedupedGetJson, invalidateFetch } from "@/lib/dedupe-fetch";

type CachedConfig = { hash: string; config: Record<string, any> };

const cacheKey = (wallet: string, agentId: string) =>
  `neptune_cfg_${wallet.trim().toLowerCase()}_${agentId}`;
const base = (wallet: string, agentId: string) =>
  `/api/agent-config/${encodeURIComponent(wallet.trim().toLowerCase())}/${agentId}`;

function readCache(wallet: string, agentId: string): CachedConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(wallet, agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.hash === "string" && parsed.config ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(wallet: string, agentId: string, value: CachedConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(wallet, agentId), JSON.stringify(value));
  } catch {}
}

/** Synchronous read of the cached config (lets a panel skip its skeleton on re-open). */
export function peekAgentConfig(wallet: string | null, agentId: string): Record<string, any> | null {
  if (!wallet) return null;
  return readCache(wallet, agentId)?.config ?? null;
}

/**
 * Resolves with the config. With a warm cache it resolves immediately and revalidates in the
 * background (hash check); `onFresh` fires only if the DB copy changed.
 */
export async function loadAgentConfig(
  wallet: string,
  agentId: string,
  signal?: AbortSignal,
  onFresh?: (config: Record<string, any>) => void
): Promise<Record<string, any> | null> {
  const cached = readCache(wallet, agentId);

  const revalidate = async (): Promise<Record<string, any> | null> => {
    if (cached) {
      const h = await dedupedGetJson<{ hash: string }>(`${base(wallet, agentId)}/hash`, 5000);
      if (h && h.hash === cached.hash) return cached.config; // unchanged: no full pull
    }
    const full = await dedupedGetJson<{ config: Record<string, any>; hash: string }>(
      base(wallet, agentId),
      3000
    );
    if (!full) return cached ? cached.config : null;
    const config = full.config && Object.keys(full.config).length ? full.config : {};
    writeCache(wallet, agentId, { hash: full.hash, config });
    return config;
  };

  if (cached) {
    revalidate()
      .then((fresh) => {
        if (fresh && fresh !== cached.config && !signal?.aborted) onFresh?.(fresh);
      })
      .catch(() => {});
    return cached.config;
  }
  return revalidate();
}

export async function saveAgentConfig(wallet: string, agentId: string, config: Record<string, any>) {
  try {
    const res = await fetch(base(wallet, agentId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.hash) writeCache(wallet, agentId, { hash: data.hash, config });
      invalidateFetch(base(wallet, agentId));
    }
  } catch (e) {
    console.warn(`[AGENT CONFIG] save failed for ${agentId}:`, e);
  }
}

/** Debounced auto-save; does nothing until `enabled` (i.e. after the initial DB load). */
export function useAutoSaveAgentConfig(
  wallet: string | null,
  agentId: string,
  config: Record<string, any>,
  enabled: boolean,
  delayMs = 800
) {
  const serialized = JSON.stringify(config);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !wallet) return;
    if (lastSaved.current === null) {
      // first run after load: this is the loaded/default state, don't write it back
      lastSaved.current = serialized;
      return;
    }
    if (lastSaved.current === serialized) return;
    const t = setTimeout(() => {
      lastSaved.current = serialized;
      saveAgentConfig(wallet, agentId, JSON.parse(serialized));
    }, delayMs);
    return () => clearTimeout(t);
  }, [serialized, enabled, wallet, agentId, delayMs]);

  useEffect(() => {
    lastSaved.current = null;
  }, [wallet]);
}
