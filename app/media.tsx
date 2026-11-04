"use client";
// 🎨 A photo or video Velo or a character sent. While it's being made it shows a
// placeholder and keeps checking (never gives up on its own — the server decides);
// once ready it fits on screen without scrolling, and a tap opens it full screen.
import { useEffect, useState } from "react";
import { data } from "./lib/api";

export type Media = { id: string; kind: "image" | "video"; status: "working" | "done" | "failed"; url: string | null };

/** Keeps checking a photo/video until it's done (backs off from 4s to 15s; retries through errors). */
export function useMedia(initial: Media, onReady?: (m: Media) => void): Media {
  const [m, setM] = useState(initial);
  useEffect(() => {
    if (m.status !== "working") return;
    let stop = false, wait = 4000, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await data<{ media: Media }>("media.check", { id: m.id });
        if (stop) return;
        if (r.media.status !== "working") { setM(r.media); if (r.media.status === "done") onReady?.(r.media); return; }
      } catch { /* offline or a hiccup: try again */ }
      if (!stop) { wait = Math.min(15000, wait * 1.4); t = setTimeout(tick, wait); }
    };
    t = setTimeout(tick, wait);
    return () => { stop = true; clearTimeout(t); };
  }, [m.id, m.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

const fit = { display: "block", width: "100%", maxHeight: "min(62dvh, 560px)", height: "auto", objectFit: "contain", borderRadius: 14, margin: "0 auto", background: "#000" } as const;

/** The photo/video itself (or its placeholder). */
export function MediaView({ media, onReady, big = false }: { media: Media; onReady?: (m: Media) => void; big?: boolean }) {
  const m = useMedia(media, onReady);
  const [full, setFull] = useState(false);
  if (m.status === "failed") return <div className="muted" data-testid="media-failed" style={{ fontSize: 13 }}>⚠️ That {m.kind === "image" ? "photo" : "video"} didn&apos;t come through.</div>;
  if (m.status !== "done" || !m.url) return (
    <div data-testid="media-working" style={{ width: big ? "min(80vw, 320px)" : 220, aspectRatio: "2 / 3", maxHeight: "min(50dvh, 420px)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", fontSize: 13, background: "linear-gradient(135deg, rgba(124,140,255,.18), rgba(236,72,153,.14))", animation: "mediaPulse 1.8s ease-in-out infinite" }}>
      <span style={{ fontSize: 28 }}>{m.kind === "image" ? "📸" : "🎬"}</span>
      <span>{m.kind === "image" ? "Sending a photo…" : "Making a video…"}</span>
      <span className="muted" style={{ fontSize: 11 }}>{m.kind === "image" ? "about half a minute" : "a few minutes"}</span>
      <style>{`@keyframes mediaPulse { 0%,100% { opacity: .75 } 50% { opacity: 1 } }`}</style>
    </div>
  );
  const el = m.kind === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={m.url} alt="Photo" data-testid="media-image" style={big ? { ...fit, maxHeight: "min(58dvh, 620px)" } : fit} onLoad={() => onReady?.(m)} />
    : <video src={m.url} data-testid="media-video" style={big ? { ...fit, maxHeight: "min(58dvh, 620px)" } : fit} controls playsInline loop autoPlay muted onLoadedData={() => onReady?.(m)} />;
  return (
    <>
      <div style={{ width: big ? "min(86vw, 420px)" : "min(72vw, 320px)", ...(m.kind === "image" ? { cursor: "zoom-in" } : {}) }} onClick={e => { if (m.kind === "image") { e.stopPropagation(); setFull(true); } }}>{el}</div>
      {full && <Viewer m={m} onClose={() => setFull(false)} />}
    </>
  );
}

/** Full screen: centered, the whole picture visible, no scrolling. */
function Viewer({ m, onClose }: { m: Media; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const style = { display: "block", maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 96px)", objectFit: "contain", borderRadius: 12 } as const;
  return (
    <div role="dialog" aria-label="Photo" data-testid="media-viewer" onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.kind === "image" ? <img src={m.url!} alt="Photo" style={style} /> : <video src={m.url!} style={style} controls playsInline autoPlay loop />}
      <button aria-label="Close" onClick={onClose} style={{ position: "fixed", top: "max(14px, env(safe-area-inset-top))", right: 14, width: 40, height: 40, borderRadius: 999, border: "none", background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
    </div>
  );
}

/** 📞 On a call: the newest photo/video pops up in the middle of the screen when ready (the call keeps going). */
export function CallMedia({ items, name }: { items: Media[]; name: string }) {
  const [shown, setShown] = useState<Media | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const latest = [...items].reverse().find(m => !closed.has(m.id));
  if (!latest) return null;
  const open = shown?.id === latest.id ? shown : null;
  return (
    <>
      {!open && <Watch key={latest.id} m={latest} name={name} onReady={setShown} />}
      {open && (
        <div data-testid="call-media" onClick={e => e.stopPropagation()} onPointerDownCapture={e => e.stopPropagation()}
          style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(0,0,0,.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom))", gap: 12 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{name} sent you a {latest.kind === "image" ? "photo" : "video"}</div>
          <MediaView media={open} big />
          <button onClick={() => { setClosed(s => new Set(s).add(latest.id)); setShown(null); }} style={{ background: "#1f2937", color: "#fff", border: "1px solid #374151", borderRadius: 999, padding: "10px 22px", fontWeight: 700, cursor: "pointer" }}>Back to call</button>
        </div>
      )}
    </>
  );
}
/** A small "on its way" chip on the call screen while it's being made. */
function Watch({ m, name, onReady }: { m: Media; name: string; onReady: (m: Media) => void }) {
  const cur = useMedia(m, onReady);
  useEffect(() => { if (m.status === "done") onReady(m); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (cur.status === "done") return null;
  if (cur.status === "failed") return null;
  return <div data-testid="call-media-working" style={{ position: "fixed", top: "max(70px, calc(env(safe-area-inset-top) + 56px))", left: "50%", transform: "translateX(-50%)", zIndex: 2050, background: "rgba(59,130,246,.2)", border: "1px solid rgba(59,130,246,.4)", color: "#dbeafe", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{cur.kind === "image" ? "📸" : "🎬"} {name} is sending a {cur.kind === "image" ? "photo" : "video"}…</div>;
}
