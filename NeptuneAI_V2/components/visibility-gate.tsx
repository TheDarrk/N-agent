"use client"

import { useEffect } from "react"

/** Marks <html> with data-tab-hidden while the tab is in the background so CSS can pause animations. */
export function VisibilityGate() {
  useEffect(() => {
    const root = document.documentElement
    const sync = () => {
      if (document.visibilityState === "hidden") {
        root.setAttribute("data-tab-hidden", "true")
      } else {
        root.removeAttribute("data-tab-hidden")
      }
    }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])

  return null
}
