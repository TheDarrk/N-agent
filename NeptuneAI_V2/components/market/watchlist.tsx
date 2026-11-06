"use client";

import { memo, useState } from "react";
import { getTokenLogoUrl } from "@/lib/near/token-logos";
import { fmtCompact, fmtPrice, type Ticker } from "@/lib/market/market";

export function TokenIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = getTokenLogoUrl(symbol);
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        className="flex shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-bold text-foreground"
      >
        {symbol.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url || "/placeholder.svg"}
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-secondary"
      style={{ width: size, height: size }}
    />
  );
}

export interface WatchRow {
  symbol: string;
  fromAgents: boolean;
  ticker?: Ticker;
}

type Props = {
  rows: WatchRow[];
  selected: string;
  loading: boolean;
  onSelect: (symbol: string) => void;
};

function changeColor(n: number) {
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-muted-foreground";
}

function RangeBar({ ticker }: { ticker: Ticker }) {
  const span = ticker.high - ticker.low;
  const pos = span > 0 ? Math.min(100, Math.max(0, ((ticker.price - ticker.low) / span) * 100)) : 50;
  return (
    <span className="relative block h-1 w-full rounded-full bg-secondary" aria-hidden="true">
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary/40" style={{ width: `${pos}%` }} />
      <span className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-primary" style={{ left: `calc(${pos}% - 1px)` }} />
    </span>
  );
}

const Row = memo(function Row({ row, active, onSelect }: { row: WatchRow; active: boolean; onSelect: (s: string) => void }) {
  const t = row.ticker;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.symbol)}
        aria-current={active ? "true" : undefined}
        className={`flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
          active ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-secondary/60"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <TokenIcon symbol={row.symbol} size={26} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{row.symbol}</span>
              {row.fromAgents && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">Agent</span>
              )}
            </span>
            <span className="block text-[11px] text-muted-foreground">{t ? `Vol ${fmtCompact(t.quoteVolume)}` : "No data"}</span>
          </span>
          {t && (
            <span className="text-right">
              <span className="block font-mono text-sm font-semibold tabular-nums text-foreground">{fmtPrice(t.price)}</span>
              <span className={`block font-mono text-xs font-semibold tabular-nums ${changeColor(t.changePct)}`}>
                {`${t.changePct > 0 ? "+" : ""}${t.changePct.toFixed(2)}%`}
              </span>
            </span>
          )}
        </span>
        {t && <RangeBar ticker={t} />}
      </button>
    </li>
  );
});

export default function Watchlist({ rows, selected, loading, onSelect }: Props) {
  return (
    <>
      <ul className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 xl:flex" aria-label="Markets">
        {loading && rows.every((r) => !r.ticker)
          ? Array.from({ length: 8 }).map((_, i) => <li key={i} className="h-[66px] animate-pulse rounded-xl bg-secondary/50" aria-hidden="true" />)
          : rows.map((row) => <Row key={row.symbol} row={row} active={row.symbol === selected} onSelect={onSelect} />)}
      </ul>

      <ul className="flex gap-2 overflow-x-auto pb-1 xl:hidden" aria-label="Markets">
        {rows.map((row) => {
          const active = row.symbol === selected;
          const t = row.ticker;
          return (
            <li key={row.symbol} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(row.symbol)}
                aria-current={active ? "true" : undefined}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? "border-primary/50 bg-primary/10" : "border-border bg-secondary/40"}`}
              >
                <TokenIcon symbol={row.symbol} size={22} />
                <span className="text-sm font-semibold text-foreground">{row.symbol}</span>
                {t && <span className={`font-mono text-xs font-semibold tabular-nums ${changeColor(t.changePct)}`}>{`${t.changePct > 0 ? "+" : ""}${t.changePct.toFixed(1)}%`}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
