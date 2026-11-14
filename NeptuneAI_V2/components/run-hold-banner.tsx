"use client";

import React, { useEffect, useState } from "react";
import { PauseCircle } from "lucide-react";

/**
 * Global notice shown while an agent run is "on hold" because the database is busy.
 * The backend never fails the run for that: it waits, then continues automatically.
 * Events arrive from streamRun() via window events; the banner hides itself when the run resumes
 * (or if no hold update arrives for 20s).
 */
export default function RunHoldBanner() {
  const [hold, setHold] = useState<{ message: string; seconds?: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onHold = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setHold({
        message: d.message || "On hold - waiting for the database. Your run continues automatically.",
        seconds: d.held_seconds,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setHold(null), 20000);
    };
    const onResume = () => {
      if (timer) clearTimeout(timer);
      setHold(null);
    };
    window.addEventListener("neptune-run-hold", onHold);
    window.addEventListener("neptune-run-resume", onResume);
    return () => {
      window.removeEventListener("neptune-run-hold", onHold);
      window.removeEventListener("neptune-run-resume", onResume);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!hold) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 shadow-lg backdrop-blur"
    >
      <PauseCircle size={14} className="animate-pulse" />
      <span>
        {hold.message}
        {hold.seconds ? ` (${hold.seconds}s)` : ""}
      </span>
    </div>
  );
}
