"use client";
import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { data, uploadFile } from "./lib/api";
import { VELO_LOOKS, DEFAULT_VELO_LOOK, veloLook } from "./lib/veloAvatars";

// ── Velo's chosen look, shared across the app ──
// Saved per person (users.look), cached on this device so it shows right away.
// "custom" = a picture they uploaded (saved in Blob storage); she keeps the default voice.
const LOCAL_KEY = "velo_look";
const FACE_KEY = "velo_face";
const listeners = new Set<() => void>();
let current: string | null = null;
let customFace: string | null = null;

const isLook = (id: string | null) => id === "custom" || VELO_LOOKS.some(l => l.id === id);
function readLocal(): string {
  try { const id = localStorage.getItem(LOCAL_KEY); return isLook(id) ? id! : DEFAULT_VELO_LOOK; } catch { return DEFAULT_VELO_LOOK; }
}
function readFace(): string {
  try { return localStorage.getItem(FACE_KEY) || ""; } catch { return ""; }
}
const emit = () => listeners.forEach(l => l());

/** Use this look (and their uploaded face, if any) everywhere — from the saved profile or a pick. */
export function applyVeloLook(id: string, face?: string) {
  if (face !== undefined) {
    customFace = face;
    try { if (face) localStorage.setItem(FACE_KEY, face); else localStorage.removeItem(FACE_KEY); } catch { /* fine */ }
  }
  current = id === "custom" && !getFace() ? DEFAULT_VELO_LOOK : isLook(id) ? id : DEFAULT_VELO_LOOK;
  try { localStorage.setItem(LOCAL_KEY, current); } catch { /* private mode — fine */ }
  emit();
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => (current ??= readLocal());
const getFace = () => (customFace ??= readFace());

export const useVeloLook = (): string => useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_VELO_LOOK);
const useCustomFace = (): string => useSyncExternalStore(subscribe, getFace, () => "");

/** Change Velo's look and save it for this person. */
export async function setVeloLook(id: string) {
  applyVeloLook(id);
  try { await data("profile.update", { look: id }); } catch { /* saved on this device at least */ }
}

/** Velo as a person: her chosen picture in a circle. */
export function VeloAvatar({ size = 32, style, look: lookId }: { size?: number; style?: CSSProperties; look?: string }) {
  const chosen = useVeloLook();
  const face = useCustomFace();
  const id = lookId ?? chosen;
  if (id === "custom" && face) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={face} width={size} height={size} alt="Velo" draggable={false}
      style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: "cover", borderRadius: "50%", ...style }} />;
  }
  const look = veloLook(id);
  const round = look.round !== false;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={size >= 48 ? look.src256 : look.src96} width={size} height={size} alt="Velo" draggable={false}
      style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: round ? "cover" : "contain", borderRadius: "50%", ...style }} />
  );
}

/** Velo's logo: the "V" in the cloud (app icon, sign-in, header). Her chosen face stays in chats and calls. */
export function VeloLogo({ size = 40 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/velo.png" width={size} height={size} alt="Velo" draggable={false} style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: "contain" }} />;
}

const tile = (on: boolean) => ({ display: "block", borderRadius: "50%", padding: 3, border: `3px solid ${on ? "var(--accent)" : "transparent"}` } as const);
const tileBtn = (on: boolean) => ({ background: "none", border: "none", padding: 0, cursor: on ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "inherit" } as const);
const caption = (on: boolean) => ({ fontSize: 12, fontWeight: on ? 800 : 600, color: on ? "var(--accent)" : "var(--muted)" } as const);

/** Settings → Velo's look: tap a face to pick (each face has its own voice on calls), or upload your own picture. */
export function VeloLookPicker({ onFace }: { onFace?: () => void }) {
  const chosen = useVeloLook();
  const face = useCustomFace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr("");
    try { const s = await uploadFile(f, "face"); applyVeloLook("custom", s.url); onFace?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload didn't go through."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const remove = async () => {
    setBusy(true); setErr("");
    try { await data("face.remove"); applyVeloLook(chosen === "custom" ? DEFAULT_VELO_LOOK : chosen, ""); onFace?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't remove it."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Velo's look" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {VELO_LOOKS.map(l => {
          const on = l.id === chosen;
          return (
            <button key={l.id} role="radio" aria-checked={on} aria-label={`${l.label} look, ${l.voiceName} voice`}
              onClick={() => { if (!on) setVeloLook(l.id); }} style={tileBtn(on)}>
              <span style={tile(on)}><VeloAvatar size={56} look={l.id} /></span>
              <span style={caption(on)}>{on ? "✓ " : ""}{l.id === "classic" ? "Classic" : l.voiceName}</span>
            </button>
          );
        })}
        {face ? (
          <button role="radio" aria-checked={chosen === "custom"} aria-label="Your picture" onClick={() => { if (chosen !== "custom") setVeloLook("custom"); }} style={tileBtn(chosen === "custom")} data-testid="look-custom">
            <span style={tile(chosen === "custom")}><VeloAvatar size={56} look="custom" /></span>
            <span style={caption(chosen === "custom")}>{chosen === "custom" ? "✓ " : ""}Yours</span>
          </button>
        ) : null}
        <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={face ? "Upload a different picture" : "Upload your own picture"} style={tileBtn(false)} data-testid="look-upload">
          <span style={{ ...tile(false), width: 68, height: 68, display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--border)", fontSize: 22 }}>{busy ? "⏳" : "＋"}</span>
          <span style={caption(false)}>{face ? "Change" : "Upload"}</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={e => upload(e.target.files?.[0])} data-testid="look-file-input" />
      {face && <button type="button" className="ghost" onClick={remove} disabled={busy} style={{ marginTop: 10, padding: "6px 12px", fontSize: 13 }}>Remove your picture</button>}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {err}</div>}
    </div>
  );
}
