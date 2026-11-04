"use client";
// 🎭 Characters: a row of chips above the chat (Velo + each character, and New for admins),
// and the admin editor: personality, backstory, relation to the user, call voice, and a
// portrait (Atlas Cloud Seedream). Every character follows Velo's safety rules.
import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { VeloAvatar } from "./avatar";
import { CHARACTER_VOICES } from "./lib/voices";

type VoiceOption = { id: string; name: string; kind: "female" | "male"; about: string; preview: string; owner?: string };

export type Character = { id: string; name: string; personality: string; backstory: string; relation: string; appearance: string; voice: string; voice_name: string; voice_kind: "female" | "male"; romantic: boolean; reference_ids: string[]; portrait_url: string | null; portrait_job: string | null };

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
export function CharacterStrip({ characters, active, admin, onPick, onNew, onEdit, onGallery }: {
  characters: Character[]; active: string | null; admin: boolean; onPick: (id: string | null) => void; onNew: () => void; onEdit: (c: Character) => void; onGallery: () => void;
}) {
  return (
    <div data-testid="character-strip" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
      <button style={chip(active === null)} onClick={() => onPick(null)} aria-pressed={active === null}><VeloAvatar size={26} /> Velo</button>
      {characters.map(c => (
        <button key={c.id} style={chip(active === c.id)} aria-pressed={active === c.id} onClick={() => (active !== c.id ? onPick(c.id) : admin ? onEdit(c) : undefined)}>
          <CharacterFace c={c} size={26} /> {c.name}{admin && active === c.id ? " ✎" : ""}
        </button>
      ))}
      {admin && <button style={{ ...chip(false), padding: "4px 12px" }} onClick={onNew} data-testid="character-new">＋ New</button>}
      <button style={{ ...chip(false), padding: "4px 12px", marginLeft: "auto" }} onClick={onGallery} data-testid="gallery-open" aria-label="Gallery">🖼️ Gallery</button>
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
  const first = CHARACTER_VOICES[0];
  const [romantic, setRomantic] = useState(!!initial?.romantic);
  const [shots, setShots] = useState(0); // finished portraits (refreshes the reference picker)
  const [refIds, setRefIds] = useState<string[]>(initial?.reference_ids || []);
  const [voice, setVoice] = useState<VoiceOption>(initial ? { id: initial.voice, name: initial.voice_name || "Voice", kind: initial.voice_kind, about: "", preview: "" } : { id: first.voiceId, name: first.name, kind: first.kind, about: first.about, preview: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const working = !!c?.portrait_job;
  const dirty = !c || name !== c.name || personality !== c.personality || backstory !== c.backstory || relation !== c.relation || appearance !== c.appearance || voice.id !== c.voice || romantic !== !!c.romantic || refIds.join() !== (c.reference_ids || []).join();

  // A portrait in progress: check back every few seconds until it's ready.
  useEffect(() => {
    if (!c?.portrait_job) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ status: string; character: Character }>("/api/characters", { action: "portrait.check", id: c.id });
        if (r.status !== "working") { setC(r.character); onSaved(r.character); setShots(n => n + 1); if (r.status === "failed") setMsg("The portrait didn't work out — try again or change the description."); }
      } catch { /* keep checking */ }
    }, 4000);
    return () => clearInterval(t);
  }, [c?.id, c?.portrait_job]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ character: Character }>("/api/characters", { action: c ? "update" : "create", id: c?.id, name, personality, backstory, relation, appearance, voice: { id: voice.id, name: voice.name, kind: voice.kind, owner: voice.owner }, romantic, referenceIds: refIds });
      setC(r.character); onSaved(r.character);
      // A library voice is saved as a copy in their ElevenLabs account: follow its new id.
      setVoice(v => ({ ...v, id: r.character.voice, owner: undefined }));
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
        <VoicePicker value={voice} onChange={setVoice} />
        <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start" }}>
          <input type="checkbox" checked={romantic} onChange={e => setRomantic(e.target.checked)} aria-label="Romantic" style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
          <span>💕 Romantic (PG-13) <span className="muted" style={{ fontWeight: 500, display: "block" }}>Flirty and affectionate with adults who confirmed they&apos;re 18+, never explicit. Others get a friendly, platonic version.</span></span>
        </label>
        {c && <ReferencePicker characterId={c.id} value={refIds} onChange={setRefIds} refresh={shots} />}
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

/** 🔊 Pick a call voice: their ElevenLabs voices plus a search of ElevenLabs' shared library, with ▶ samples. */
function VoicePicker({ value, onChange }: { value: VoiceOption; onChange: (v: VoiceOption) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState<VoiceOption[] | null>(null);
  const [provider, setProvider] = useState<"elevenlabs" | "fish">(value.id.startsWith("fish:") ? "fish" : "elevenlabs");
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const search = async (text: string) => {
    setErr("");
    try { setList((await api<{ voices: VoiceOption[] }>("/api/voices", { provider, q: text })).voices); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load voices."); setList([]); }
  };
  useEffect(() => { if (open) { setList(null); search(q); } }, [open, provider]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { audio.current?.pause(); }, []);
  const play = (v: VoiceOption) => {
    audio.current?.pause();
    if (playing === v.id) { setPlaying(""); return; }
    const a = new Audio(v.preview); audio.current = a; setPlaying(v.id);
    a.onended = () => setPlaying(""); a.play().catch(() => setPlaying(""));
  };
  return (
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      Voice on calls
      <div className="row" style={{ marginTop: 4, gap: 8 }}>
        <div data-testid="voice-current" style={{ flex: 1, fontWeight: 600, padding: "10px 12px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
          {value.name} <span className="muted" style={{ fontWeight: 500 }}>· {value.kind}</span>
        </div>
        <button type="button" className="ghost" onClick={() => setOpen(o => !o)} data-testid="voice-change">{open ? "Done" : "Change"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 8 }}>
          <div role="tablist" className="row" style={{ gap: 6, marginBottom: 8 }}>
            {([["elevenlabs", "ElevenLabs"], ["fish", "🐟 Fish Audio (female)"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={provider === id} onClick={() => setProvider(id)} data-testid={`voices-${id}`}
                style={{ borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${provider === id ? "var(--accent)" : "var(--border)"}`, background: provider === id ? "rgba(124,140,255,0.15)" : "transparent", color: "var(--text)" }}>{label}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); search(q); }} className="row" style={{ gap: 8 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search voices: deep, British, old, cheerful…" aria-label="Search voices" />
            <button className="ghost" type="submit">Search</button>
          </form>
          {err && <div style={{ color: "var(--bad)", fontWeight: 500, marginTop: 6 }}>⚠️ {err}</div>}
          <div data-testid="voice-list" style={{ maxHeight: 260, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {!list ? <div className="muted" style={{ fontWeight: 500 }}>Loading voices…</div>
              : !list.length ? <div className="muted" style={{ fontWeight: 500 }}>No voices found.</div>
              : list.map(v => {
                const on = v.id === value.id;
                return (
                  <div key={v.id} className="row" style={{ gap: 8, padding: "6px 8px", borderRadius: 10, background: on ? "rgba(124,140,255,0.15)" : "transparent" }}>
                    {v.preview ? <button type="button" className="ghost" onClick={() => play(v)} aria-label={`Play ${v.name}`} style={{ padding: "4px 10px" }}>{playing === v.id ? "⏸" : "▶"}</button> : <span style={{ width: 38 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div>{v.name} <span className="muted" style={{ fontWeight: 500 }}>· {v.kind}{v.owner ? " · library" : v.id.startsWith("fish:") ? " · Fish Audio" : ""}</span></div>
                      {v.about && <div className="muted" style={{ fontWeight: 500, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.about}</div>}
                    </div>
                    <button type="button" className={on ? "btn" : "ghost"} onClick={() => onChange(v)} disabled={on} style={{ padding: "4px 12px" }}>{on ? "✓" : "Use"}</button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 🖼️ Pick 2–4 pictures of this character (portraits or photos it sent you) that keep it looking the same in new photos and videos. */
function ReferencePicker({ characterId, value, onChange, refresh }: { characterId: string; value: string[]; onChange: (ids: string[]) => void; refresh: number }) {
  const [items, setItems] = useState<{ id: string; thumb: string | null; url: string }[] | null>(null);
  useEffect(() => {
    api<{ items: { id: string; thumb: string | null; url: string }[] }>("/api/characters", { action: "gallery", id: characterId }).then(r => setItems(r.items)).catch(() => setItems([]));
  }, [characterId, refresh]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : value.length >= 4 ? value : [...value, id]);
  return (
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      Reference pictures <span className="muted" style={{ fontWeight: 500 }}>· {value.length}/4 picked (2–4 keeps them looking the same)</span>
      {!items ? <div className="muted" style={{ fontWeight: 500, marginTop: 6 }}>Loading…</div>
        : !items.length ? <div className="muted" style={{ fontWeight: 500, marginTop: 6 }}>Generate a few portraits (or ask them for selfies in chat), then pick the best 2–4 here.</div>
        : (
          <div data-testid="reference-picker" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6, maxHeight: 230, overflowY: "auto" }}>
            {items.map(it => {
              const on = value.includes(it.id);
              return (
                <button key={it.id} type="button" onClick={() => toggle(it.id)} aria-pressed={on} data-testid="reference-item"
                  style={{ position: "relative", padding: 0, borderRadius: 10, overflow: "hidden", aspectRatio: "2 / 3", cursor: "pointer", border: `3px solid ${on ? "var(--accent)" : "transparent"}`, background: "var(--surface2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.thumb || it.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: on ? 1 : 0.75 }} />
                  {on && <span style={{ position: "absolute", top: 3, right: 3, background: "var(--accent)", color: "#fff", borderRadius: 999, width: 20, height: 20, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{value.indexOf(it.id) + 1}</span>}
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
