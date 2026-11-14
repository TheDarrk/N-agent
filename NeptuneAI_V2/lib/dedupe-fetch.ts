/**
 * Single-flight GET helper: while a request for a URL is in flight every caller shares the
 * same promise (no pile-up when a panel is opened/closed repeatedly), and a short TTL cache
 * absorbs back-to-back re-opens. Mutations should call invalidateFetch() for related URLs.
 */
type Entry = { at: number; promise: Promise<any>; done: boolean };
const entries = new Map<string, Entry>();

const PERSIST_PREFIX = "neptune_swr_";
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Last good response for `url` from localStorage (instant first paint; survives refresh / new tab). */
export function peekCachedJson<T = any>(url: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + url);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < PERSIST_MAX_AGE_MS ? (v as T) : null;
  } catch {
    return null;
  }
}

export function storeCachedJson(url: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERSIST_PREFIX + url, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* quota / private mode: cache is best-effort */
  }
}

export function dedupedGetJson<T = any>(url: string, ttlMs = 3000, persist = false): Promise<T | null> {
  const now = Date.now();
  const hit = entries.get(url);
  // in flight => always share; finished => reuse only inside the TTL window
  if (hit && (!hit.done || now - hit.at < ttlMs)) return hit.promise as Promise<T | null>;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        entries.delete(url);
        return null;
      }
      const json = (await res.json()) as T;
      if (persist) storeCachedJson(url, json);
      return json;
    } catch {
      entries.delete(url);
      return null;
    }
  })();
  const entry: Entry = { at: now, promise, done: false };
  entries.set(url, entry);
  promise.finally(() => {
    entry.done = true;
    entry.at = Date.now();
  });
  return promise;
}

export function invalidateFetch(prefix: string) {
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
