"use client";
// 🎨 A photo or video Velo or a character sent. While it's being made it shows a
// placeholder and keeps checking (never gives up on its own — the server decides).
// Once ready the chat shows a small thumbnail (fast, light on data) that fits on
// screen; the full photo or the video loads only when tapped (full screen).
import { useEffect, useState } from "react";
import { data } from "./lib/api";

export type Media = { id: string; kind: "image" | "video"; status: "working" | "done" | "failed"; url: string | null; thumb?: string | null; caption?: string | null };

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
  const st = big ? { ...fit, maxHeight: "min(58dvh, 620px)" } : fit;
  // Small screens show the thumbnail; the call pop-up shows the photo itself.
  const src = m.kind === "image" ? (big ? m.url : m.thumb || m.url) : null;
  const el = m.kind === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src!} alt="Photo" data-testid="media-image" style={st} />
    : big ? <video src={m.url} data-testid="media-video" style={st} controls playsInline loop autoPlay muted />
    : <VideoTile poster={m.thumb || null} />;
  return (
    <>
      <div style={{ width: big ? "min(86vw, 420px)" : "min(72vw, 320px)", cursor: "zoom-in" }} onClick={e => { e.stopPropagation(); setFull(true); }}>{el}</div>
      {full && <Viewer m={m} onClose={() => setFull(false)} />}
    </>
  );
}

/** A video before it's played: its picture (or 🎬) with a play button. The video loads only on tap. */
export function VideoTile({ poster, fill }: { poster: string | null; fill?: boolean }) {
  return (
    <div data-testid="media-video-tile" style={{ position: "relative", width: "100%", ...(fill ? { height: "100%" } : { aspectRatio: "2 / 3", maxHeight: "min(62dvh, 560px)" }), borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg, #1e293b, #312e81)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {poster && <img src={poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />}
      <span style={{ position: "relative", width: fill ? 30 : 56, height: fill ? 30 : 56, borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fill ? 14 : 24 }}>▶</span>
    </div>
  );
}

/** Full screen: centered, the whole picture visible, no scrolling. Loads the full photo / the video now. */
export function Viewer({ m, onClose, children }: { m: { kind: "image" | "video"; url: string | null }; onClose: () => void; children?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const style = { display: "block", maxWidth: "calc(100vw - 32px)", maxHeight: children ? "calc(100dvh - 150px)" : "calc(100dvh - 96px)", objectFit: "contain", borderRadius: 12 } as const;
  return (
    <div role="dialog" aria-label="Photo" data-testid="media-viewer" onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.kind === "image" ? <img src={m.url!} alt="Photo" data-testid="viewer-full" style={style} onClick={e => e.stopPropagation()} /> : <video src={m.url!} data-testid="viewer-video" style={style} controls playsInline autoPlay loop onClick={e => e.stopPropagation()} />}
      {children && <div className="row" style={{ gap: 10 }} onClick={e => e.stopPropagation()}>{children}</div>}
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
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, textAlign: "center" }}>{name}: {open.caption || `sent you a ${latest.kind === "image" ? "photo" : "video"}`}</div>
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
