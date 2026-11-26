"use client";
// 👈👉 Sideways flicks, for moving between threads.
import { useRef } from "react";
import type React from "react";

/**
 * 👈👉 A swipe across the messages moves to the thread before or after this one. A flick has to be
 * mostly sideways and a good distance, so scrolling up and down never counts as one.
 */
export function useSwipe(go?: (dir: 1 | -1) => void) {
  const from = useRef<{ x: number; y: number } | null>(null);
  if (!go) return {};
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; from.current = t ? { x: t.clientX, y: t.clientY } : null; },
    onTouchEnd: (e: React.TouchEvent) => {
      const a = from.current, b = e.changedTouches[0];
      from.current = null;
      if (!a || !b) return;
      const dx = b.clientX - a.x, dy = b.clientY - a.y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      go(dx < 0 ? 1 : -1);
    },
  };
}
