"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isLight = mounted && resolvedTheme === "light"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={`theme-toggle group relative inline-flex h-8 w-[3.75rem] shrink-0 items-center rounded-full border border-border bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${className}`}
    >
      <Sun size={14} className="absolute left-2 text-muted-foreground" aria-hidden="true" />
      <Moon size={14} className="absolute right-2 text-muted-foreground" aria-hidden="true" />
      <span
        className="theme-toggle-knob absolute left-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground"
        style={{ transform: isLight ? "translateX(0)" : "translateX(1.75rem)" }}
      >
        <Sun
          size={14}
          aria-hidden="true"
          className="absolute transition-all duration-300"
          style={{ opacity: isLight ? 1 : 0, transform: isLight ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.4)" }}
        />
        <Moon
          size={14}
          aria-hidden="true"
          className="absolute transition-all duration-300"
          style={{ opacity: isLight ? 0 : 1, transform: isLight ? "rotate(90deg) scale(0.4)" : "rotate(0deg) scale(1)" }}
        />
      </span>
    </button>
  )
}
