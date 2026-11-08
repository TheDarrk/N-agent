"use client"

import { useEffect, useRef, useState } from "react"

const INITIAL_MAX_WAIT_MS = 7000
const TRANSITION_MAX_WAIT_MS = 4500
const MIN_VISIBLE_MS = 600
const SETTLE_MS = 450
const POLL_MS = 120
const FADE_MS = 450

const TRANSITION_EVENT = "neptune:page-transition"

const TAGLINE_MS = 2200

const TAGLINES = [
  "Aligning the orbits",
  "Waking up your agents",
  "Charting the deep blue",
  "Syncing the cosmos with the chain",
  "Neptune never sleeps, neither do your agents",
  "Warming up the trading floor",
]

type Phase = "loading" | "leaving" | "done"

/** Call right before switching tabs/pages so the loader covers the incoming view while its images load. */
export function startPageTransition() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(TRANSITION_EVENT))
}

function pendingImages(): HTMLImageElement[] {
  return Array.from(document.images).filter((img) => !img.complete && img.loading !== "lazy")
}

/**
 * Covers the app until the window has loaded, fonts are ready and every image on screen has
 * finished loading, with a progress bar along the top edge. It runs on first load and again
 * whenever `startPageTransition()` is called (tab/page switches). Falls back after a max wait so a
 * slow image can never trap the user behind the loader.
 */
export function PageLoader() {
  const [phase, setPhase] = useState<Phase>("loading")
  const [progress, setProgress] = useState(8)
  const [runId, setRunId] = useState(0)
  const [tagline, setTagline] = useState(0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (phase !== "loading") return
    const id = window.setInterval(() => setTagline((t) => (t + 1) % TAGLINES.length), TAGLINE_MS)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    const onTransition = () => {
      setProgress(8)
      setPhase("loading")
      setRunId((id) => id + 1)
    }
    window.addEventListener(TRANSITION_EVENT, onTransition)
    return () => window.removeEventListener(TRANSITION_EVENT, onTransition)
  }, [])

  useEffect(() => {
    const isTransition = runId > 0
    startedAt.current = performance.now()
    let cancelled = false

    const trickle = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(0.6, (90 - p) * 0.06) : p))
    }, 120)

    const windowLoaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve()
      else window.addEventListener("load", () => resolve(), { once: true })
    })

    const fontsReady = document.fonts?.ready?.then(() => undefined) ?? Promise.resolve()

    const imagesSettled = new Promise<void>((resolve) => {
      // Start "busy" so the incoming view has time to mount and begin requesting its images.
      let lastBusyAt = performance.now()
      const check = () => {
        if (cancelled) return resolve()
        if (pendingImages().length > 0) lastBusyAt = performance.now()
        const quietFor = performance.now() - lastBusyAt
        if (quietFor >= SETTLE_MS) resolve()
        else window.setTimeout(check, POLL_MS)
      }
      check()
    })

    const maxWait = isTransition ? TRANSITION_MAX_WAIT_MS : INITIAL_MAX_WAIT_MS
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, maxWait))

    Promise.race([Promise.all([windowLoaded, fontsReady, imagesSettled]), timeout]).then(() => {
      if (cancelled) return
      const elapsed = performance.now() - startedAt.current
      window.setTimeout(
        () => {
          if (cancelled) return
          window.clearInterval(trickle)
          setProgress(100)
          window.setTimeout(() => !cancelled && setPhase("leaving"), 220)
        },
        Math.max(0, MIN_VISIBLE_MS - elapsed),
      )
    })

    return () => {
      cancelled = true
      window.clearInterval(trickle)
    }
  }, [runId])

  useEffect(() => {
    if (phase !== "leaving") return
    const id = window.setTimeout(() => setPhase("done"), FADE_MS)
    return () => window.clearTimeout(id)
  }, [phase])

  if (phase === "done") return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Neptune AI"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background transition-opacity duration-[450ms] ease-out ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary/10">
        <div
          className="h-full rounded-r-full bg-primary shadow-[0_0_12px_var(--primary)] transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-col items-center gap-8 px-6">
        <div className="relative flex size-36 items-center justify-center">
          <span className="page-loader-orbit-reverse absolute inset-0 rounded-full border border-dashed border-primary/25" />
          <span className="page-loader-orbit absolute inset-3 rounded-full border border-primary/15">
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
          </span>
          <span className="page-loader-ring absolute inset-7 rounded-full border-2 border-primary/15 border-t-primary" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/neptune-logo.png"
            alt=""
            width={56}
            height={56}
            className="page-loader-logo size-14 object-contain"
          />
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold uppercase tracking-[0.4em] text-foreground">
            Neptune <span className="text-primary">AI</span>
          </p>
          <p
            key={tagline}
            className="page-loader-line h-5 text-sm text-muted-foreground text-balance"
          >
            {TAGLINES[tagline]}
          </p>
        </div>

        <p className="font-mono text-xs tabular-nums text-muted-foreground/70" aria-hidden="true">
          {Math.round(progress)}%
        </p>
      </div>
      <span className="sr-only">{Math.round(progress)}% loaded</span>
    </div>
  )
}
