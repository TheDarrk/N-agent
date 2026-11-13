/**
 * Neptune AI v2 — Resilient Agent Runs & Event Streaming Client
 * Decouples pipeline execution from client connection state.
 * Supports background continuation, reconnect on tab switch / page refresh,
 * and persistent history retrieval.
 */

export interface AgentRunMetadata {
  run_id: string;
  wallet: string;
  agent_type: string;
  status: "running" | "completed" | "failed";
  title?: string;
  params?: Record<string, any>;
  cid?: string;
  error?: string;
  created_at: string;
  finished_at?: string;
}

export interface AgentRunFull extends AgentRunMetadata {
  result?: Record<string, any>;
}

export function getActiveRun(agentType: string, wallet?: string | null): string | null {
  if (typeof window === "undefined") return null;
  const cleanWallet = (wallet || "global").trim().toLowerCase();
  try {
    return localStorage.getItem(`neptune_active_run_${agentType}_${cleanWallet}`);
  } catch {
    return null;
  }
}

export function setActiveRun(agentType: string, wallet: string | null | undefined, runId: string | null): void {
  if (typeof window === "undefined") return;
  const cleanWallet = (wallet || "global").trim().toLowerCase();
  const key = `neptune_active_run_${agentType}_${cleanWallet}`;
  try {
    if (runId) {
      localStorage.setItem(key, runId);
    } else {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`[AGENT RUNS] Could not persist active run key ${key}:`, e);
  }
}

export async function startRun(
  agentType: "research" | "rebalancer" | "trader" | "moderator",
  payload: Record<string, any>
): Promise<{ run_id: string }> {
  const res = await fetch(`/api/${agentType}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to start ${agentType} run: ${res.status} ${errText}`);
  }

  const data = await res.json();
  if (!data.run_id) {
    throw new Error("Invalid response from server: missing run_id");
  }

  return { run_id: data.run_id };
}

export async function getRun(runId: string, wallet?: string | null): Promise<AgentRunFull | null> {
  const url = wallet
    ? `/api/runs/${encodeURIComponent(runId)}?wallet=${encodeURIComponent(wallet.trim().toLowerCase())}`
    : `/api/runs/${encodeURIComponent(runId)}`;

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch run ${runId}: ${res.statusText}`);
  }

  const data = await res.json();
  return data.run || null;
}

export async function listRuns(
  wallet: string,
  agentType?: string,
  limit = 50,
  offset = 0
): Promise<AgentRunMetadata[]> {
  if (!wallet || !wallet.trim()) return [];
  const cleanWallet = wallet.trim().toLowerCase();
  let url = `/api/runs?wallet=${encodeURIComponent(cleanWallet)}&limit=${limit}&offset=${offset}`;
  if (agentType) {
    url += `&agent_type=${encodeURIComponent(agentType)}`;
  }

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.runs || [];
}

export async function streamRun(
  runId: string,
  onEvent: (event: any) => void,
  after = 0,
  signal?: AbortSignal,
  maxRetries = 5
): Promise<void> {
  let currentAfter = after;
  let attempts = 0;

  while (attempts <= maxRetries) {
    if (signal?.aborted) return;

    try {
      const url = `/api/runs/${encodeURIComponent(runId)}/stream?after=${currentAfter}`;
      const res = await fetch(url, {
        headers: { Accept: "application/x-ndjson" },
        signal,
      });

      if (!res.ok) {
        if (res.status === 404) return;
        throw new Error(`Stream error HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("ReadableStream not supported on response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal?.aborted) {
          reader.cancel().catch(() => {});
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed);
            if (typeof ev.seq === "number") {
              currentAfter = Math.max(currentAfter, ev.seq);
            }
            onEvent(ev);
            if (ev.type === "run_finished" || (ev.type === "done" && ev.status !== "in_progress")) {
              return;
            }
          } catch (pe) {
            console.warn("[STREAM READ ERROR] Parsing line failed:", trimmed, pe);
          }
        }
      }

      // Check if run is done on backend before retrying
      const run = await getRun(runId);
      if (!run || run.status !== "running") {
        return;
      }
    } catch (e: any) {
      if (signal?.aborted || e.name === "AbortError") return;
      attempts++;
      if (attempts > maxRetries) {
        console.error(`[STREAM] Exceeded max retries (${maxRetries}) for run ${runId}`);
        throw e;
      }
      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempts), 5000)));
    }
  }
}
