const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 600;
const KEY_PREFIX = "neptune:history:v1";

export type HistoryBucket = "trades" | "dropped" | "traces" | "logs";

interface StoredEntry<T> {
  id: string;
  seenAt: number;
  value: T;
}

function storageKey(wallet: string, bucket: HistoryBucket) {
  return `${KEY_PREFIX}:${wallet.toLowerCase()}:${bucket}`;
}

function parseTime(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw) return null;
  const hasZone = raw.endsWith("Z") || raw.includes("UTC") || /[+-]\d{2}:?\d{2}$/.test(raw);
  const normalized = hasZone ? raw.replace(" UTC", "Z").replace(" ", "T") : `${raw.replace(" ", "T")}Z`;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : time;
}

function readEntries<T>(wallet: string, bucket: HistoryBucket): StoredEntry<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(wallet, bucket));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredEntry<T>[]) : [];
  } catch {
    return [];
  }
}

function writeEntries<T>(wallet: string, bucket: HistoryBucket, entries: StoredEntry<T>[]) {
  try {
    window.localStorage.setItem(storageKey(wallet, bucket), JSON.stringify(entries));
  } catch {
    // Storage full or blocked: keep working with live data only.
  }
}

/**
 * Merges fresh backend items into the per-wallet cache and returns everything
 * from the last 30 days. Fresh items win over cached copies with the same id,
 * so history survives logout/login and backend gaps.
 */
export function mergeHistory<T>(
  wallet: string,
  bucket: HistoryBucket,
  fresh: T[],
  getId: (item: T) => string,
  getTimestamp: (item: T) => string | undefined,
): T[] {
  if (typeof window === "undefined") return fresh;

  const now = Date.now();
  const cutoff = now - RETENTION_MS;
  const merged = new Map<string, StoredEntry<T>>();

  for (const entry of readEntries<T>(wallet, bucket)) {
    merged.set(entry.id, entry);
  }

  for (const item of fresh) {
    const id = getId(item);
    const existing = merged.get(id);
    merged.set(id, { id, seenAt: existing?.seenAt ?? now, value: item });
  }

  const alive = Array.from(merged.values())
    .map((entry) => ({
      entry,
      time: parseTime(getTimestamp(entry.value)) ?? entry.seenAt,
    }))
    .filter(({ time }) => time >= cutoff)
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_ENTRIES);

  writeEntries(
    wallet,
    bucket,
    alive.map(({ entry }) => entry),
  );

  return alive.map(({ entry }) => entry.value);
}

/** Cached items for a wallet, newest first, without touching the network. */
export function readCachedHistory<T>(
  wallet: string,
  bucket: HistoryBucket,
  getTimestamp: (item: T) => string | undefined,
): T[] {
  const cutoff = Date.now() - RETENTION_MS;
  return readEntries<T>(wallet, bucket)
    .map((entry) => ({
      value: entry.value,
      time: parseTime(getTimestamp(entry.value)) ?? entry.seenAt,
    }))
    .filter(({ time }) => time >= cutoff)
    .sort((a, b) => b.time - a.time)
    .map(({ value }) => value);
}
