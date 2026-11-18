"use client";
// 📍 Where they are in the app — the tab, the chat or group they had open, how far down they'd
// scrolled, and which Picagram screen they were on (the inbox, a DM thread, someone's profile).
// A refresh, an update, or coming back later puts them right back there instead of at the top.

export type PicaPlace = { inbox?: boolean; thread?: string | null; profile?: string | null; following?: boolean; saved?: boolean; mine?: boolean };
export type Tab = "chat" | "pica" | "gifts" | "today" | "memory" | "settings";
export type Place = { tab?: Tab; withId?: string | null; groupId?: string | null; scroll?: Partial<Record<Tab, number>>; pica?: PicaPlace };

const placeKey = (userId: string) => `velo:place:${userId}`;

export function readPlace(userId: string): Place {
  try { const p = JSON.parse(localStorage.getItem(placeKey(userId)) || "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

export function savePlace(userId: string, patch: Place) {
  try { localStorage.setItem(placeKey(userId), JSON.stringify({ ...readPlace(userId), ...patch })); } catch { /* private mode: fine */ }
}
