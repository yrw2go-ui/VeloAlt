"use client";
// A tiny in-app "Are you sure?" so deletes never happen on one tap (no browser confirm()).
type Ask = { text: string; resolve: (ok: boolean) => void } | null;
let ask: Ask = null;
const listeners = new Set<() => void>();
export const subscribeAsk = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const currentAsk = () => ask;
export function confirmAsk(text: string): Promise<boolean> {
  return new Promise(resolve => { ask = { text, resolve: ok => { ask = null; listeners.forEach(l => l()); resolve(ok); } }; listeners.forEach(l => l()); });
}
