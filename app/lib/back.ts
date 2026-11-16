"use client";
// ⬅️ The phone's back button goes back ONE step, never straight out of the app: it closes whatever
// is on top — a picture, a sheet, her card, a DM thread — and from any other tab it returns to
// Chat. Only when nothing is open does it leave.
//
// How: while anything is open there's exactly ONE spare history entry, and the back button spends
// it on the topmost thing. Close that thing another way (the ✕, a tap outside) and the entry is
// put back, so one press is always one step — and a screen that mounts twice (React does that
// while developing) never spends it by accident.
import { useEffect, useRef } from "react";

type Step = { id: number; close: () => void };

const stack: Step[] = [];
let n = 0;
let listening = false;
let held = false; // we have a spare history entry out there
let skipPop = false; // the next popstate is one we caused ourselves

function hold() {
  if (held || typeof window === "undefined") return;
  held = true;
  history.pushState({ velo: true }, "");
}

/** Nothing open any more: hand the spare entry back, so the next press leaves the app. */
function release() {
  if (!held) return;
  held = false;
  skipPop = true;
  history.back();
}

function onPop() {
  if (skipPop) { skipPop = false; return; }
  held = false; // the entry has been spent
  const top = stack[stack.length - 1];
  if (!top) return; // nothing of ours: the browser does what it likes (leave the app)
  top.close();
  // Something's still open underneath: put a fresh entry out for the next press.
  if (stack.length > 1) hold();
}

/** While `open`, the back button runs `close()` instead of leaving the app. */
export function useBack(open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const step: Step = { id: ++n, close: () => latest.current() };
    stack.push(step);
    if (!listening) { listening = true; window.addEventListener("popstate", onPop); }
    hold();
    return () => {
      const i = stack.indexOf(step);
      if (i >= 0) stack.splice(i, 1);
      // Give the spare entry back only once everything really is closed — a moment later, so a
      // screen that mounts, unmounts and mounts again keeps it.
      setTimeout(() => { if (!stack.length) release(); }, 0);
    };
  }, [open]);
}
