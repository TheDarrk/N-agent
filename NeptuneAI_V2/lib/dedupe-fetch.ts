/**
 * Single-flight GET helper: while a request for a URL is in flight every caller shares the
 * same promise (no pile-up when a panel is opened/closed repeatedly), and a short TTL cache
 * absorbs back-to-back re-opens. Mutations should call invalidateFetch() for related URLs.
 */
type Entry = { at: number; promise: Promise<any>; done: boolean };
const entries = new Map<string, Entry>();

export function dedupedGetJson<T = any>(url: string, ttlMs = 3000): Promise<T | null> {
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
      return (await res.json()) as T;
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
