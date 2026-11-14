import React from "react";
import { RefreshCw } from "lucide-react";

/** Small loader shown only where data comes from the database (history lists), not for static UI. */
export function HistoryLoader({ label = "Loading history..." }: { label?: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw size={13} className="animate-spin" />
        <span>{label}</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 rounded-xl bg-secondary/40 border border-border animate-pulse" />
      ))}
    </div>
  );
}

export default HistoryLoader;
