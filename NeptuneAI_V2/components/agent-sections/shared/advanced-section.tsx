"use client";

import React, { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import InfoTip from "./info-tip";

type Props = {
  title?: string;
  /** Tooltip text for the (i) next to the title. */
  tip?: React.ReactNode;
  /** Small summary shown while collapsed, e.g. "5 settings". */
  summary?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Collapsed-by-default container for secondary settings. Animates open and closed. */
export default function AdvancedSection({
  title = "Advanced Configurations",
  tip,
  summary,
  defaultOpen = false,
  className = "",
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`rounded-xl border border-border bg-secondary/20 ${className}`}>
      <div className="flex items-center gap-1 pr-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <SlidersHorizontal size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {summary && !open && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
        </button>
        {tip && <InfoTip label={`About ${title}`}>{tip}</InfoTip>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          tabIndex={-1}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t border-border px-3.5 py-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Two-column grid of compact setting boxes. Boxes marked `span` take the full row. */
export function SettingGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

/** One setting in its own small vertical box: label on top, control underneath. */
export function SettingBox({
  span = false,
  className = "",
  children,
}: {
  span?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-background/40 p-3 ${
        span ? "col-span-2" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Titled group inside Advanced Configurations. */
export function AdvancedGroup({
  title,
  tip,
  children,
}: {
  title: string;
  tip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {tip && <InfoTip label={`About ${title}`}>{tip}</InfoTip>}
      </div>
      {children}
    </div>
  );
}
