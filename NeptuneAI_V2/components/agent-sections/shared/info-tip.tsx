"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  /** Short, beginner-friendly explanation shown in the popover. */
  children: React.ReactNode;
  /** Accessible name of the trigger, e.g. "About drift threshold". */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
};

/**
 * Subtle (i) button. Opens on mouse hover or keyboard focus, and toggles on tap/click
 * so it also works on touch screens.
 */
export default function InfoTip({ children, label = "More info", side = "top", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("mouse");

  const clearTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const openNow = () => {
    clearTimer();
    setOpen(true);
  };
  const closeSoon = () => {
    clearTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") openNow();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") closeSoon();
          }}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) openNow();
          }}
          onBlur={closeSoon}
          onClick={(e) => {
            // With a mouse the popover is already open from hover; keep it open instead of toggling it shut.
            if (lastPointer.current === "mouse" && open) e.preventDefault();
          }}
          className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${className}`}
        >
          <Info size={13} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={openNow}
        onPointerLeave={closeSoon}
        className="w-64 max-w-[calc(100vw-2rem)] border-border bg-popover px-3 py-2.5 text-[13px] leading-snug text-popover-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Label text followed by an (i) button. */
export function LabelWithTip({
  children,
  tip,
  htmlFor,
  className = "text-sm font-semibold text-foreground",
}: {
  children: React.ReactNode;
  tip: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  const name = typeof children === "string" ? children : "this setting";
  return (
    <span className="inline-flex items-center gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
          {children}
        </label>
      ) : (
        <span className={className}>{children}</span>
      )}
      <InfoTip label={`About ${name}`}>{tip}</InfoTip>
    </span>
  );
}
