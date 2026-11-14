/**
 * Persist each agent's user-editable form config (prompts, coins, cadence...) in the DB
 * so it survives tab switches, refreshes and devices.
 */
import { useEffect, useRef } from "react";

export async function loadAgentConfig(
  wallet: string,
  agentId: string,
  signal?: AbortSignal
): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(
      `/api/agent-config/${encodeURIComponent(wallet.trim().toLowerCase())}/${agentId}`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.config && Object.keys(data.config).length ? data.config : {};
  } catch {
    return null;
  }
}

export async function saveAgentConfig(wallet: string, agentId: string, config: Record<string, any>) {
  try {
    await fetch(`/api/agent-config/${encodeURIComponent(wallet.trim().toLowerCase())}/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
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
