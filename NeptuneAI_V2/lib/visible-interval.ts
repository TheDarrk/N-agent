/**
 * setInterval that only ticks while the tab is visible.
 * When the tab becomes visible again after missing ticks, it fires once
 * immediately so data is fresh. Returns a cleanup function.
 */
export function setVisibleInterval(callback: () => void, delay: number): () => void {
  let missedTick = false

  const id = setInterval(() => {
    if (document.visibilityState === "visible") {
      callback()
    } else {
      missedTick = true
    }
  }, delay)

  const onVisible = () => {
    if (document.visibilityState === "visible" && missedTick) {
      missedTick = false
      callback()
    }
  }
  document.addEventListener("visibilitychange", onVisible)

  return () => {
    clearInterval(id)
    document.removeEventListener("visibilitychange", onVisible)
  }
}
