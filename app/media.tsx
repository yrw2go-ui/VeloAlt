"use client";
// 🎨 A photo or video Velo or a character sent. While it's being made it shows a
// placeholder and keeps checking (never gives up on its own — the server decides).
// Once ready the chat shows a small thumbnail (fast, light on data) that fits on
// screen; the full photo or the video loads only when tapped (full screen).
import { useEffect, useState } from "react";
import { data } from "./lib/api";

export type Media = { id: string; kind: "image" | "video"; status: "offered" | "declined" | "working" | "done" | "failed"; url: string | null; thumb?: string | null; caption?: string | null; reaction?: string | null; description?: string | null; kept?: boolean; subject?: string | null };

// ❤️ Reactions they can leave on a photo/video.
import { REACTIONS } from "./lib/reactions";
export { REACTIONS };

/** The reaction row right under a photo/video. Tap one to react; tap it again to take it back. */
export function ReactionBar({ value, onPick }: { value: string | null | undefined; onPick: (r: string) => void }) {
  return (
    <div role="group" aria-label="React" data-testid="reactions" style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
      {REACTIONS.map(r => {
        const on = value === r;
        return (
          <button key={r} type="button" onClick={e => { e.stopPropagation(); onPick(r); }} aria-pressed={on} aria-label={`React ${r}`}
            style={{ fontSize: 18, lineHeight: 1, padding: "6px 8px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
              background: on ? "rgba(124,140,255,0.22)" : "var(--surface2)", transform: on ? "scale(1.12)" : "none", transition: "transform .15s" }}>{r}</button>
        );
      })}
    </div>
  );
}

/** Keeps checking a photo/video until it's done (backs off from 4s to 15s; retries through errors). */
export function useMedia(initial: Media, onReady?: (m: Media) => void, onFailed?: () => void): Media {
  const [m, setM] = useState(initial);
  useEffect(() => {
    if (m.status !== "working") return;
    let stop = false, wait = 4000, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await data<{ media: Media }>("media.check", { id: m.id });
        if (stop) return;
        if (r.media.status !== "working") { setM(r.media); if (r.media.status === "done") onReady?.(r.media); if (r.media.status === "failed") onFailed?.(); return; }
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
export function MediaView({ media, onReady, onFailed, onAnswer, big = false, who = "Velo" }: { media: Media; onReady?: (m: Media) => void; onFailed?: () => void; onAnswer?: (m: Media) => void; big?: boolean; who?: string }) {
  const [cur, setCur] = useState(media);
  // 📸 Offered on their own: nothing is made until they accept.
  if (cur.status === "offered" || cur.status === "declined") return <OfferCard m={cur} who={who} big={big} onAnswer={x => { setCur(x); onAnswer?.(x); }} />;
  return <MediaShown key={cur.id + cur.status} media={cur} onReady={onReady} onFailed={onFailed} big={big} />;
}

/** "Mira wants to send you a photo: 'my view from the balcony'" — Accept / No thanks. */
function OfferCard({ m, who, big, onAnswer }: { m: Media; who: string; big: boolean; onAnswer: (m: Media) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const what = m.kind === "image" ? "photo" : "video";
  const answer = async (yes: boolean) => {
    setBusy(true); setErr("");
    try { onAnswer((await data<{ media: Media }>(yes ? "media.accept" : "media.decline", { id: m.id })).media); }
    catch (e) { setErr(e instanceof Error ? e.message : "Try again."); setBusy(false); }
  };
  return (
    <div data-testid={m.status === "offered" ? "media-offer" : "media-declined"} onClick={e => e.stopPropagation()}
      style={{ width: big ? "min(86vw, 360px)" : "min(72vw, 300px)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--border, #374151)",
        background: m.status === "offered" ? "linear-gradient(135deg, rgba(124,140,255,.16), rgba(236,72,153,.12))" : "var(--surface2, #1f2937)", color: big ? "#fff" : "var(--text)" }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{m.kind === "image" ? "📸" : "🎬"} {who} wants to send you a {what}</div>
      {m.description && <div style={{ fontSize: 13, opacity: 0.85, fontStyle: "italic" }}>“{m.description}”</div>}
      {m.status === "offered" ? (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => answer(true)} data-testid="offer-accept" style={{ flex: 1, padding: "8px 12px" }}>Accept</button>
          <button className="ghost" disabled={busy} onClick={() => answer(false)} data-testid="offer-decline" style={{ flex: 1, padding: "8px 12px" }}>No thanks</button>
        </div>
      ) : <div className="muted" style={{ fontSize: 12 }}>You said no thanks to this one.</div>}
      {err && <div style={{ color: "var(--bad)", fontSize: 12 }}>⚠️ {err}</div>}
    </div>
  );
}

function MediaShown({ media, onReady, onFailed, big = false }: { media: Media; onReady?: (m: Media) => void; onFailed?: () => void; big?: boolean }) {
  const m = useMedia(media, onReady, onFailed);
  const [full, setFull] = useState(false);
  if (m.status === "failed") return <div className="muted" data-testid="media-failed" style={{ fontSize: 13 }}>📵 That {m.kind === "image" ? "photo" : "video"} didn&apos;t send.</div>;
  if (m.status !== "done" || !m.url) return (
    <div data-testid="media-working" style={{ width: big ? "min(80vw, 320px)" : 220, aspectRatio: "2 / 3", maxHeight: "min(50dvh, 420px)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", fontSize: 13, background: "linear-gradient(135deg, rgba(124,140,255,.18), rgba(236,72,153,.14))", animation: "mediaPulse 1.8s ease-in-out infinite" }}>
      <span style={{ fontSize: 28 }}>{m.kind === "image" ? "📸" : "🎬"}</span>
      <span>{m.kind === "image" ? "Sending a photo…" : "Making a video…"}</span>
      <span className="muted" style={{ fontSize: 11 }}>{m.kind === "image" ? "about a minute" : "a few minutes"}</span>
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
      {full && <Viewer m={m} onClose={() => setFull(false)}><SaveButton m={m} /></Viewer>}
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

/** 📞 On a call: every photo/video they send is tracked (not just the newest). Each one pops up in the
 *  middle of the screen as soon as it's ready, one at a time in the order they arrive; the call keeps going. */
export function CallMedia({ items, name }: { items: Media[]; name: string }) {
  const [ready, setReady] = useState<Media[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set()); // closed, declined or failed
  const [answered, setAnswered] = useState<Record<string, Media>>({});
  const close = (id: string) => setGone(s => new Set(s).add(id));
  const all = items.map(m => answered[m.id] || m).filter(m => !gone.has(m.id));
  // 📸 An offer waits for Accept / No thanks; everything accepted or asked for is tracked until ready.
  const offer = all.find(m => m.status === "offered" || m.status === "declined") || null;
  const pending = all.filter(m => (m.status === "working" || m.status === "done") && !ready.some(r => r.id === m.id));
  const open = ready.find(r => !gone.has(r.id)) || null;
  const images = pending.filter(m => m.kind === "image").length, videos = pending.length - images;
  return (
    <>
      {pending.map(m => <Watch key={m.id + m.status} m={m} onReady={x => setReady(r => (r.some(y => y.id === x.id) ? r : [...r, x]))} onFail={() => close(m.id)} />)}
      {offer && !open && (
        <div data-testid="call-offer" onClick={e => e.stopPropagation()} onPointerDownCapture={e => e.stopPropagation()}
          style={{ position: "fixed", left: 0, right: 0, bottom: "max(130px, calc(env(safe-area-inset-bottom) + 120px))", zIndex: 2100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <MediaView key={offer.id} media={offer} who={name} big onAnswer={x => { setAnswered(a => ({ ...a, [x.id]: x })); if (x.status === "declined") setTimeout(() => close(x.id), 1200); }} />
        </div>
      )}
      {pending.length > 0 && !open && (
        <div data-testid="call-media-working" style={{ position: "fixed", top: "max(70px, calc(env(safe-area-inset-top) + 56px))", left: "50%", transform: "translateX(-50%)", zIndex: 2050, background: "rgba(59,130,246,.2)", border: "1px solid rgba(59,130,246,.4)", color: "#dbeafe", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {images ? "📸" : "🎬"} {name} is sending {images && videos ? `${images} photo${images > 1 ? "s" : ""} and ${videos} video${videos > 1 ? "s" : ""}` : images > 1 ? `${images} photos` : videos > 1 ? `${videos} videos` : images ? "a photo" : "a video"}…
        </div>
      )}
      {open && (
        <div data-testid="call-media" onClick={e => e.stopPropagation()} onPointerDownCapture={e => e.stopPropagation()}
          style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(0,0,0,.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom))", gap: 12 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, textAlign: "center" }}>{name}: {open.caption || `sent you a ${open.kind === "image" ? "photo" : "video"}`}</div>
          <MediaView key={open.id} media={open} big />
          <CallReactions m={open} />
          <SaveButton m={open} />
          <button onClick={() => close(open.id)} style={{ background: "#1f2937", color: "#fff", border: "1px solid #374151", borderRadius: 999, padding: "10px 22px", fontWeight: 700, cursor: "pointer" }}>
            {ready.filter(r => !gone.has(r.id)).length > 1 ? "Next" : "Back to call"}
          </button>
        </div>
      )}
    </>
  );
}
/** Keeps checking one photo/video until it's ready (no screen of its own). */
function Watch({ m, onReady, onFail }: { m: Media; onReady: (m: Media) => void; onFail: () => void }) {
  const cur = useMedia(m, onReady);
  useEffect(() => { if (m.status === "done") onReady(m); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cur.status === "failed") onFail(); }, [cur.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** ⭐ Save to their gallery favorites (everything is in the gallery already; Saved ones are kept and easy to find). */
export function SaveButton({ m }: { m: Media }) {
  const [kept, setKept] = useState(!!m.kept);
  const toggle = async () => {
    const next = !kept; setKept(next);
    try { await data("gallery.keep", { id: m.id, kept: next }); } catch { setKept(!next); }
  };
  return (
    <button type="button" onClick={e => { e.stopPropagation(); toggle(); }} data-testid="media-save" aria-pressed={kept}
      style={{ background: kept ? "#f59e0b" : "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
      {kept ? "⭐ Saved to gallery" : "☆ Save to gallery"}
    </button>
  );
}

/** ❤️ React to a photo/video right on the call pop-up (saved like in chat; she sees it). */
function CallReactions({ m }: { m: Media }) {
  const [r, setR] = useState<string | null>(m.reaction || null);
  const pick = async (e: string) => {
    const next = r === e ? null : e; setR(next);
    try { await data("media.react", { id: m.id, reaction: next }); } catch { setR(r); }
  };
  return <div onClick={e => e.stopPropagation()} style={{ display: "flex", justifyContent: "center" }}><ReactionBar value={r} onPick={pick} /></div>;
}
