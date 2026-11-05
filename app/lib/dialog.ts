"use client";
// A tiny in-app "Are you sure?" so deletes never happen on one tap (no browser confirm()).
type Ask = { text: string; yes: string; danger: boolean; resolve: (ok: boolean) => void } | null;
let ask: Ask = null;
const listeners = new Set<() => void>();
export const subscribeAsk = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const currentAsk = () => ask;
export function confirmAsk(text: string, opts: { yes?: string; danger?: boolean } = {}): Promise<boolean> {
  const yes = opts.yes || "Yes, delete", danger = opts.danger ?? !opts.yes;
  return new Promise(resolve => { ask = { text, yes, danger, resolve: ok => { ask = null; listeners.forEach(l => l()); resolve(ok); } }; listeners.forEach(l => l()); });
}
