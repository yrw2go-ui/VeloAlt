"use client";
// ↻ Redo a picture from the prompt that made it — a Picagram woman's, or a character's.
import { useEffect, useState } from "react";
import { useBack } from "./lib/back";
import { api } from "./lib/api";

/** ↻ Redo one of her pictures: the prompt that made it, yours to send as it is or tweak.
 *  Whatever you send goes to the picture service exactly as written, like a peek. */
export function RedoSheet({ mediaId, who, where = "/api/pica", onClose, onGoing }: { mediaId: string; who: string; where?: "/api/pica" | "/api/data"; onClose: () => void; onGoing: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [prompt, setPrompt] = useState("");
  const [what, setWhat] = useState("photo");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ prompt: string; what: string }>(where, { action: "redo.draft", id: mediaId })
      .then(r => { setPrompt(r.prompt); setWhat(r.what); })
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't read that picture."))
      .finally(() => setLoading(false));
  }, [mediaId]);
  const go = async () => {
    setBusy(true); setErr("");
    try { await api(where, { action: "redo", id: mediaId, prompt }); onGoing(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start it."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-redo" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2800 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>↻ Redo {what === "photo" ? "this photo" : `${who}'s ${what}`}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>This is the prompt that made it. Send it as it is for another go at the same picture, or change it to anything you like — it goes to the picture service exactly as written. The new one takes this one&apos;s place and this one is deleted for good.</div>
        <textarea value={loading ? "Reading the prompt…" : prompt} onChange={e => setPrompt(e.target.value)} disabled={loading || busy} rows={8} maxLength={1500}
          aria-label="The prompt" data-testid="pica-redo-prompt" style={{ resize: "vertical", fontSize: 13, lineHeight: 1.45 }} />
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }} data-testid="pica-redo-err">⚠️ {err}</div>}
        <button className="btn" onClick={go} disabled={loading || busy || prompt.trim().length < 10} data-testid="pica-redo-go">{busy ? "Making it…" : "↻ Redo it"}</button>
      </div>
    </div>
  );
}
