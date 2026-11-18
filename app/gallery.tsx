"use client";
// 🖼️ Gallery: every photo and video Velo or a character made for them. Thumbnails
// only (small and fast); the full photo or the video loads when one is opened.
// ⭐ Keep the ones they love; delete the rest (asks first).
import { useCallback, useEffect, useState } from "react";
import { data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { Viewer, VideoTile, setKeptEverywhere } from "./media";
import { RedoSheet } from "./redo";

type Item = { id: string; kind: "image" | "video"; kept: boolean; created_at: string; url: string; thumb: string | null };


/** 👆 Where the one you're looking at sits in the list, so you can swipe to the next and back. */
function step<T extends { id: string }>(list: T[] | null, open: T, go: (x: T) => void) {
  const all = list || [];
  const i = all.findIndex(x => x.id === open.id);
  if (i < 0 || all.length < 2) return {};
  return {
    ...(i > 0 ? { onPrev: () => go(all[i - 1]) } : {}),
    ...(i < all.length - 1 ? { onNext: () => go(all[i + 1]) } : {}),
  };
}

export default function Gallery({ characterId, name, onClose }: { characterId: string | null; name: string; onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [onlyKept, setOnlyKept] = useState(false);
  // ↻ Redo: the picture being replaced, and a note while the new one is on its way.
  const [redo, setRedo] = useState<string | null>(null);
  const [redoing, setRedoing] = useState("");
  const [err, setErr] = useState("");
  const thread = characterId ? { characterId } : {};
  const load = useCallback(async (before: string | null) => {
    try {
      const r = await data<{ items: Item[] }>("gallery.list", { ...thread, before });
      setItems(list => [...(before ? list || [] : []), ...r.items]);
      setMore(r.items.length === 30);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load the gallery."); setItems(list => list || []); }
  }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(null); }, [load]);

  const keep = async (it: Item) => {
    const kept = !it.kept;
    setItems(list => (list || []).map(x => (x.id === it.id ? { ...x, kept } : x)));
    setOpen(o => (o && o.id === it.id ? { ...o, kept } : o));
    setKeptEverywhere(it.id, kept); // ⭐ the ⭐ button in chat shows the same answer
    await data("gallery.keep", { id: it.id, kept }).catch(() => {});
  };
  const remove = async (it: Item) => {
    if (!(await confirmAsk(`Delete this ${it.kind === "image" ? "photo" : "video"}? Are you sure? It can't be undone.`))) return;
    try { await data("gallery.delete", { id: it.id }); setItems(list => (list || []).filter(x => x.id !== it.id)); setOpen(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete it."); }
  };
  const shown = (items || []).filter(x => !onlyKept || x.kept);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name}'s gallery`} data-testid="gallery" style={{ position: "fixed", inset: 0, zIndex: 2600, background: "var(--bg, #0b0b10)", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "max(12px, env(safe-area-inset-top)) 14px 10px", borderBottom: "1px solid var(--border)", gap: 10 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 18 }}>🖼️ {name}&apos;s gallery</div>
        <button className="ghost" onClick={() => setOnlyKept(k => !k)} aria-pressed={onlyKept} style={{ padding: "6px 12px", fontSize: 13 }}>{onlyKept ? "⭐ Kept" : "All"}</button>
        <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "6px 12px" }}>✕</button>
      </div>
      {err && <div style={{ color: "var(--bad)", fontSize: 13, padding: "8px 14px" }}>⚠️ {err}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {!items ? <div className="muted" style={{ padding: 20, textAlign: "center" }}>Loading…</div>
          : !shown.length ? <div className="muted" style={{ padding: 30, textAlign: "center", fontSize: 14 }}>{onlyKept ? "Nothing kept yet — tap ⭐ on one you love." : `No photos or videos yet. Ask ${name} for a selfie!`}</div>
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {shown.map(it => (
                <button key={it.id} onClick={() => setOpen(it)} data-testid="gallery-item" aria-label={it.kind === "image" ? "Photo" : "Video"}
                  style={{ position: "relative", padding: 0, border: "none", background: "var(--surface2)", borderRadius: 10, overflow: "hidden", aspectRatio: "2 / 3", cursor: "pointer" }}>
                  {it.kind === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.thumb || it.url} alt="" loading="lazy" decoding="async" data-testid="gallery-thumb" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <VideoTile poster={it.thumb} fill />}
                  {it.kept && <span style={{ position: "absolute", top: 4, right: 4, fontSize: 14 }}>⭐</span>}
                </button>
              ))}
            </div>
          )}
        {more && !onlyKept && <button className="ghost" style={{ display: "block", margin: "14px auto" }} onClick={() => load(items!.at(-1)!.created_at)}>Load more</button>}
      </div>
      {open && (
        <Viewer m={open} onClose={() => setOpen(null)}
          {...step(items, open, setOpen)}>
          <button className="btn" onClick={() => keep(open)} data-testid="gallery-keep" style={{ padding: "10px 16px" }}>{open.kept ? "⭐ Kept" : "☆ Keep"}</button>
          {open.kind === "image" && <button className="ghost" onClick={() => { setRedo(open.id); setOpen(null); }} data-testid="gallery-redo" style={{ padding: "10px 16px", background: "rgba(0,0,0,.4)" }}>↻ Redo</button>}
          <button className="ghost" onClick={() => remove(open)} data-testid="gallery-delete" style={{ padding: "10px 16px", color: "var(--bad)", background: "rgba(0,0,0,.4)" }}>Delete</button>
        </Viewer>
      )}
      {redo && <RedoSheet mediaId={redo} who={name} where="/api/data" onClose={() => setRedo(null)}
        onGoing={() => { setRedo(null); setRedoing("↻ Making the new one — about a minute. It takes the old one's place when it lands, and the old one goes."); setTimeout(() => { setRedoing(""); load(null); }, 60_000); }} />}
      {redoing && <div data-testid="gallery-redoing" className="muted" style={{ position: "absolute", bottom: 12, left: 12, right: 12, padding: "8px 12px", borderRadius: 12, background: "rgba(236,72,153,.18)", border: "1px solid rgba(236,72,153,.45)", fontSize: 12, textAlign: "center" }}>{redoing}</div>}
    </div>
  );
}
