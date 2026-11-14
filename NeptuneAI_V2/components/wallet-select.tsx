"use client";

import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type WalletSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type Accent = "primary" | "emerald" | "blue";

const ACCENT_STYLES: Record<Accent, { ring: string; open: string; check: string; item: string }> = {
  primary: {
    ring: "focus-visible:border-primary/60 focus-visible:ring-primary/20",
    open: "data-[state=open]:border-primary/60 data-[state=open]:ring-primary/20",
    check: "text-primary",
    item: "data-[highlighted]:bg-primary/10 data-[state=checked]:bg-primary/10",
  },
  emerald: {
    ring: "focus-visible:border-emerald-400/60 focus-visible:ring-emerald-400/20",
    open: "data-[state=open]:border-emerald-400/60 data-[state=open]:ring-emerald-400/20",
    check: "text-emerald-400",
    item: "data-[highlighted]:bg-emerald-400/10 data-[state=checked]:bg-emerald-400/10",
  },
  blue: {
    ring: "focus-visible:border-blue-400/60 focus-visible:ring-blue-400/20",
    open: "data-[state=open]:border-blue-400/60 data-[state=open]:ring-blue-400/20",
    check: "text-blue-400",
    item: "data-[highlighted]:bg-blue-400/10 data-[state=checked]:bg-blue-400/10",
  },
};

// Radix reserves "" for "no selection", so an empty option value is mapped to a sentinel.
const EMPTY = "__empty__";
const toInternal = (v: string) => (v === "" ? EMPTY : v);
const fromInternal = (v: string) => (v === EMPTY ? "" : v);

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: WalletSelectOption[];
  accent?: Accent;
  ariaLabel: string;
  className?: string;
};

export function WalletSelect({ value, onChange, options, accent = "primary", ariaLabel, className }: Props) {
  const styles = ACCENT_STYLES[accent];

  return (
    <Select value={toInternal(value)} onValueChange={(v) => onChange(fromInternal(v))}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-11 rounded-xl border-border bg-background/70 px-3.5 text-xs font-medium text-foreground shadow-sm transition-all",
          "hover:border-foreground/25 hover:bg-background focus:ring-2 focus:ring-offset-0 focus-visible:ring-2",
          "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:transition-transform data-[state=open]:[&>svg]:rotate-180",
          styles.ring,
          styles.open,
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={6}
        className="z-[70] min-w-[var(--radix-select-trigger-width)] max-w-[min(26rem,calc(100vw-2rem))] rounded-2xl border-border bg-popover p-1.5 shadow-2xl shadow-black/40"
      >
        {options.map((option) => (
          <SelectPrimitive.Item
            key={option.value || EMPTY}
            value={toInternal(option.value)}
            className={cn(
              "relative flex w-full cursor-pointer select-none items-start gap-3 rounded-xl py-2.5 pl-3.5 pr-9 text-xs outline-none transition-colors",
              "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
              styles.item,
            )}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <SelectPrimitive.ItemText>
                <span className="block truncate font-semibold text-foreground">{option.label}</span>
              </SelectPrimitive.ItemText>
              {option.description && (
                <span className="block text-[11px] leading-snug text-muted-foreground">{option.description}</span>
              )}
            </div>
            <SelectPrimitive.ItemIndicator className="absolute right-3 top-1/2 -translate-y-1/2">
              <Check className={cn("h-4 w-4", styles.check)} />
            </SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>
        ))}
      </SelectContent>
    </Select>
  );
}

export default WalletSelect;
