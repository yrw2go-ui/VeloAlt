"use client";
// 🎭 Characters: a row of chips above the chat (Velo + each character, and New for admins),
// and the admin editor: personality, backstory, relation to the user, call voice, and a
// portrait (Atlas Cloud Seedream). Every character follows Velo's safety rules.
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { VeloAvatar } from "./avatar";
import { CHARACTER_VOICES } from "./lib/voices";

export type Character = { id: string; name: string; personality: string; backstory: string; relation: string; appearance: string; voice: string; portrait_url: string | null; portrait_job: string | null };

/** A character's picture in a circle (their initial until a portrait exists). */
export function CharacterFace({ c, size }: { c: Pick<Character, "name" | "portrait_url">; size: number }) {
  if (c.portrait_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.portrait_url} alt={c.name} width={size} height={size} style={{ display: "block", flexShrink: 0, width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top" }} />;
  }
  return <span aria-label={c.name} style={{ display: "flex", flexShrink: 0, width: size, height: size, borderRadius: "50%", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, var(--accent), var(--accent2))", color: "#fff", fontWeight: 800, fontSize: size * 0.42 }}>{c.name.slice(0, 1).toUpperCase()}</span>;
}

const chip = (on: boolean) => ({ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "4px 10px 4px 4px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "rgba(124,140,255,0.15)" : "var(--surface2)", color: "var(--text)" } as const);

/** The chips above the chat. Tap a chip to switch chats; admins tap the open one again to edit it. */
export function CharacterStrip({ characters, active, admin, onPick, onNew, onEdit }: {
  characters: Character[]; active: string | null; admin: boolean; onPick: (id: string | null) => void; onNew: () => void; onEdit: (c: Character) => void;
}) {
  if (!characters.length && !admin) return null;
  return (
    <div data-testid="character-strip" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
      <button style={chip(active === null)} onClick={() => onPick(null)} aria-pressed={active === null}><VeloAvatar size={26} /> Velo</button>
      {characters.map(c => (
        <button key={c.id} style={chip(active === c.id)} aria-pressed={active === c.id} onClick={() => (active !== c.id ? onPick(c.id) : admin ? onEdit(c) : undefined)}>
          <CharacterFace c={c} size={26} /> {c.name}{admin && active === c.id ? " ✎" : ""}
        </button>
      ))}
      {admin && <button style={{ ...chip(false), padding: "4px 12px" }} onClick={onNew} data-testid="character-new">＋ New</button>}
    </div>
  );
}

/** Create or edit a character, and generate their portrait. */
export function CharacterEditor({ initial, portraits, onClose, onSaved, onDeleted }: {
  initial: Character | null; portraits: boolean; onClose: () => void; onSaved: (c: Character) => void; onDeleted: (id: string) => void;
}) {
  const [c, setC] = useState<Character | null>(initial);
  const [name, setName] = useState(initial?.name || "");
  const [personality, setPersonality] = useState(initial?.personality || "");
  const [backstory, setBackstory] = useState(initial?.backstory || "");
  const [relation, setRelation] = useState(initial?.relation || "");
  const [appearance, setAppearance] = useState(initial?.appearance || "");
  const [voice, setVoice] = useState(initial?.voice || CHARACTER_VOICES[0].id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const working = !!c?.portrait_job;
  const dirty = !c || name !== c.name || personality !== c.personality || backstory !== c.backstory || relation !== c.relation || appearance !== c.appearance || voice !== c.voice;

  // A portrait in progress: check back every few seconds until it's ready.
  useEffect(() => {
    if (!c?.portrait_job) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ status: string; character: Character }>("/api/characters", { action: "portrait.check", id: c.id });
        if (r.status !== "working") { setC(r.character); onSaved(r.character); if (r.status === "failed") setMsg("The portrait didn't work out — try again or change the description."); }
      } catch { /* keep checking */ }
    }, 4000);
    return () => clearInterval(t);
  }, [c?.id, c?.portrait_job]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ character: Character }>("/api/characters", { action: c ? "update" : "create", id: c?.id, name, personality, backstory, relation, appearance, voice });
      setC(r.character); onSaved(r.character);
      return r.character;
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); return null; }
    finally { setBusy(false); }
  };
  const portrait = async () => {
    const saved = dirty ? await save() : c;
    if (!saved) return;
    setBusy(true); setMsg("");
    try { await api("/api/characters", { action: "portrait.start", id: saved.id }); const next = { ...saved, portrait_job: "working" }; setC(next); onSaved(next); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't start the portrait."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!c || !(await confirmAsk(`Delete ${c.name}? Are you sure? Everyone's chats and memories with them, and their portrait, are deleted too.`))) return;
    setBusy(true);
    try { await api("/api/characters", { action: "delete", id: c.id }); onDeleted(c.id); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't delete."); setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" data-testid="character-editor" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }}>
      <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "92dvh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{c ? `Edit ${c.name}` : "New character"}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          {working ? <div style={{ width: 84, height: 84, borderRadius: "50%", border: "2px dashed var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, textAlign: "center" }} className="muted">Painting…<br />up to a minute</div>
            : <CharacterFace c={{ name: name || "?", portrait_url: c?.portrait_url || null }} size={84} />}
          <div style={{ flex: 1, fontSize: 13 }} className="muted">
            {portraits ? "Describe what they look like, then generate a portrait." : "Portraits aren't set up yet — you can still create and chat."}
          </div>
        </div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Name
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. Captain Mira" aria-label="Character name" style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Personality
          <textarea value={personality} onChange={e => setPersonality(e.target.value)} maxLength={2000} rows={3} placeholder="How do they talk and act? e.g. gruff but kind, loves bad puns, never gives up" aria-label="Personality" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Backstory
          <textarea value={backstory} onChange={e => setBackstory(e.target.value)} maxLength={3000} rows={4} placeholder="Where they come from, what they've been through, what they care about" aria-label="Backstory" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Relation to the user
          <textarea value={relation} onChange={e => setRelation(e.target.value)} maxLength={600} rows={2} placeholder="Who they are to the person chatting, e.g. an old friend from the navy, a mentor, a big sister" aria-label="Relation to the user" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Voice on calls
          <select value={voice} onChange={e => setVoice(e.target.value)} aria-label="Voice on calls" style={{ marginTop: 4, display: "block", width: "100%" }}>
            {CHARACTER_VOICES.map(v => <option key={v.id} value={v.id}>{v.name} — {v.kind}, {v.about}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Appearance (for the portrait)
          <textarea value={appearance} onChange={e => setAppearance(e.target.value)} maxLength={600} rows={2} placeholder="e.g. weathered sea captain, silver braid, navy coat, warm smile" aria-label="Appearance" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <div className="muted" style={{ fontSize: 12 }}>Everyone can chat with and call this character. Each person gets their own chats and memories with them. Characters are fictional: no real people and no sexual content (a quick safety check runs when you save).</div>
        {msg && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {msg}</div>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || !name.trim() || (!dirty && !!c)} onClick={save}>{busy ? "…" : c ? "Save" : "Create"}</button>
          {portraits && <button className="ghost" disabled={busy || working || !name.trim() || !appearance.trim()} onClick={portrait} data-testid="character-portrait">{c?.portrait_url ? "🎨 New portrait" : "🎨 Generate portrait"}</button>}
          {c && <button className="ghost" disabled={busy} onClick={remove} style={{ marginLeft: "auto", color: "var(--bad)" }}>Delete</button>}
        </div>
      </div>
    </div>
  );
}
