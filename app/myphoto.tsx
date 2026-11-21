"use client";
// 📸 A photo of you to send her — in a text or in a DM, the same sheet in both.
import { useState } from "react";
import { useBack } from "./lib/back";

/** Say what you want a photo of: have it written for you, or write it yourself. */
export function MyPhotoSheet({ title, draft, onMake, onClose }: { title: string; draft: (about: string) => Promise<string>; onMake: (d: string) => Promise<void>; onClose: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [about, setAbout] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const write = async () => {
    setBusy(true); setErr("");
    try { setDesc(await draft(about)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't write it."); }
    setBusy(false);
  };
  const make = async () => {
    setBusy(true); setErr("");
    try { await onMake(desc); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make it."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="my-photo-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2700 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📸 {title}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Say what you want a photo of. You&apos;ll see the description first and can fix anything before it&apos;s made — your &quot;About you&quot; photos keep it looking like you.</div>
        <div className="row" style={{ gap: 8 }}>
          <input value={about} onChange={e => setAbout(e.target.value)} maxLength={300} aria-label="What photo" data-testid="my-photo-about" placeholder="e.g. me at the gym after leg day" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); write(); } }} />
          <button className="ghost" onClick={write} disabled={busy} data-testid="my-photo-write" style={{ flexShrink: 0 }}>{busy && !desc ? "…" : "✍️ Write it"}</button>
        </div>
        {/* ✍️ Yours to write. Tap "Write it" to have one written from the line above, or just
            type the photo you want here — it was only ever shown after the AI had written one,
            so writing your own from scratch wasn't possible. */}
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} maxLength={1500} aria-label="Photo description" placeholder="…or write the photo yourself: what's in it, where, what you're wearing" data-testid="my-photo-desc" style={{ resize: "vertical" }} />
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" onClick={make} disabled={busy || desc.trim().length < 5} data-testid="my-photo-go">{busy ? "Making it…" : "📸 Make this photo"}</button>
      </div>
    </div>
  );
}
