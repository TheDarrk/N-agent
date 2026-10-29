import type { PointerEvent } from "react";

/**
 * Spread onto an element that has the `tilt3d` class. Writes the cursor position
 * straight to CSS variables, so there is no React state and no re-render while
 * the mouse moves.
 */
export function tilt3d(maxDeg = 5) {
  return {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      e.currentTarget.dataset.hovered = "true";
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      // Skip touch, and skip while a button is held so sliders can be dragged without the card wobbling.
      if (e.pointerType === "touch" || e.buttons !== 0) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--ry", `${((px - 0.5) * 2 * maxDeg).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-(py - 0.5) * 2 * maxDeg).toFixed(2)}deg`);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      delete el.dataset.hovered;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    },
  };
}
