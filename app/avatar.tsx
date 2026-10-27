"use client";
import { useSyncExternalStore, type CSSProperties } from "react";
import { data } from "./lib/api";
import { VELO_LOOKS, DEFAULT_VELO_LOOK, veloLook } from "./lib/veloAvatars";

// ── Velo's chosen look, shared across the app ──
// Saved per person (users.look), cached on this device so it shows right away.
const LOCAL_KEY = "velo_look";
const listeners = new Set<() => void>();
let current: string | null = null;

function readLocal(): string {
  try { return veloLook(localStorage.getItem(LOCAL_KEY)).id; } catch { return DEFAULT_VELO_LOOK; }
}
/** Use this look everywhere (from the saved profile or a pick). */
export function applyVeloLook(id: string) {
  current = veloLook(id).id;
  try { localStorage.setItem(LOCAL_KEY, current); } catch { /* private mode — fine */ }
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => (current ??= readLocal());

export const useVeloLook = (): string => useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_VELO_LOOK);

/** Change Velo's look and save it for this person. */
export async function setVeloLook(id: string) {
  applyVeloLook(id);
  try { await data("profile.update", { look: veloLook(id).id }); } catch { /* saved on this device at least */ }
}

/** Velo as a person: her chosen picture in a circle. */
export function VeloAvatar({ size = 32, style, look: lookId }: { size?: number; style?: CSSProperties; look?: string }) {
  const chosen = useVeloLook();
  const look = veloLook(lookId ?? chosen);
  const round = look.round !== false;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={size >= 48 ? look.src256 : look.src96} width={size} height={size} alt="Velo" draggable={false}
      style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: round ? "cover" : "contain", borderRadius: "50%", ...style }} />
  );
}

/** Settings → Velo's look: tap a face to pick (each face has its own voice on calls). */
export function VeloLookPicker() {
  const chosen = useVeloLook();
  return (
    <div role="radiogroup" aria-label="Velo's look" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {VELO_LOOKS.map(l => {
        const on = l.id === chosen;
        return (
          <button key={l.id} role="radio" aria-checked={on} aria-label={`${l.label} look, ${l.voiceName} voice`}
            onClick={() => { if (!on) setVeloLook(l.id); }}
            style={{ background: "none", border: "none", padding: 0, cursor: on ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "inherit" }}>
            <span style={{ display: "block", borderRadius: "50%", padding: 3, border: `3px solid ${on ? "var(--accent)" : "transparent"}` }}>
              <VeloAvatar size={56} look={l.id} />
            </span>
            <span style={{ fontSize: 12, fontWeight: on ? 800 : 600, color: on ? "var(--accent)" : "var(--muted)" }}>{on ? "✓ " : ""}{l.voiceName}</span>
          </button>
        );
      })}
    </div>
  );
}
