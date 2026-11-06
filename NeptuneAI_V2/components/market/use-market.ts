"use client";

import useSWR from "swr";
import type { CandlesResponse, FlowResponse, Interval, TickersResponse } from "@/lib/market/market";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
};

export function useCandles(symbol: string, interval: Interval) {
  return useSWR<CandlesResponse>(`/api/market/candles?symbol=${symbol}&interval=${interval}&limit=400`, fetcher, {
    refreshInterval: interval === "1m" ? 2500 : 4000,
    keepPreviousData: false,
    dedupingInterval: 1500,
    errorRetryInterval: 5000,
  });
}

export function useTickers(symbols: string[]) {
  const key = symbols.length > 0 ? `/api/market/tickers?symbols=${symbols.join(",")}` : null;
  return useSWR<TickersResponse>(key, fetcher, { refreshInterval: 6000, keepPreviousData: true, dedupingInterval: 2000 });
}

export function useFlow(symbol: string) {
  return useSWR<FlowResponse>(`/api/market/flow?symbol=${symbol}`, fetcher, {
    refreshInterval: 2500,
    keepPreviousData: false,
    dedupingInterval: 1000,
    errorRetryInterval: 5000,
  });
}
