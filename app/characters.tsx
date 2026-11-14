"use client";
// 🎭 Characters: a row of chips above the chat (Velo + each character, and New for admins),
// and the admin editor: personality, backstory, relation to the user, call voice, and a
// portrait (Atlas Cloud Seedream). Every character follows Velo's safety rules.
import { useEffect, useRef, useState } from "react";
import { api, uploadCharacterPicture } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { VeloAvatar } from "./avatar";
import { CHARACTER_VOICES } from "./lib/voices";
import { TRAITS, PRESETS, DEFAULT_TRAITS, cleanTraits, type TraitKey } from "./lib/traits";
import { CHARACTER_ZONES } from "./lib/states";
import { GroupFaces, type Group } from "./groups";
import { BRAIN_OPTIONS } from "./lib/brainOptions";

type VoiceOption = { id: string; name: string; kind: "female" | "male"; about: string; preview: string; owner?: string };

export type Character = { id: string; name: string; personality: string; backstory: string; relation: string; appearance: string; job: string; casual_wear: string; hobbies: string; voice: string; voice_name: string; voice_kind: "female" | "male"; romantic: boolean; romance_arc: string; reference_ids: string[]; time_zone: string; traits: Record<string, number>; preset: string; birthday: string; brain?: string; work_attire?: string; work_days?: number[]; work_start?: string; work_end?: string; part_time?: boolean; poly_ok?: boolean; sapphic?: boolean; explicit_ok?: boolean; gender?: "female" | "male"; live_in?: boolean; portrait_url: string | null; portrait_job: string | null };

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
/** 🔴 A small number on a chip: their unread messages there. */
const Badge = ({ n }: { n?: number }) => (n ? <span data-testid="unread-badge" aria-label={`${n} unread`} style={{ position: "absolute", top: -6, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg, #0b0d17)" }}>{n > 99 ? "99+" : n}</span> : null);

export function CharacterStrip({ characters, active, admin, onPick, onNew, onEdit, onGallery, unread = {}, groups = [], activeGroup = null, onPickGroup, onNewGroup }: {
  characters: Character[]; active: string | null; admin: boolean; onPick: (id: string | null) => void; onNew: () => void; onEdit: (c: Character) => void; onGallery: () => void; unread?: Record<string, number>;
  groups?: Group[]; activeGroup?: string | null; onPickGroup?: (id: string) => void; onNewGroup?: () => void;
}) {
  if (activeGroup) active = "__group";
  return (
    <div data-testid="character-strip" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px 12px 8px", borderBottom: "1px solid var(--border)" }}>
      <button style={{ ...chip(active === null), position: "relative" }} onClick={() => onPick(null)} aria-pressed={active === null}><VeloAvatar size={26} /> Velo<Badge n={active === null ? 0 : unread.velo} /></button>
      {characters.map(c => (
        <button key={c.id} style={{ ...chip(active === c.id), position: "relative" }} aria-pressed={active === c.id} onClick={() => (active !== c.id ? onPick(c.id) : admin ? onEdit(c) : undefined)}>
          <CharacterFace c={c} size={26} /> {c.name}{admin && active === c.id ? " ✎" : ""}<Badge n={active === c.id ? 0 : unread[c.id]} />
        </button>
      ))}
      {(groups || []).map(g => (
        <button key={g.id} style={chip(activeGroup === g.id)} aria-pressed={activeGroup === g.id} onClick={() => onPickGroup?.(g.id)} data-testid={`group-chip-${g.title}`}>
          <GroupFaces g={g} chars={characters} size={22} /> {g.title.length > 18 ? g.title.slice(0, 17) + "…" : g.title}
        </button>
      ))}
      {onNewGroup && characters.length >= 2 && <button style={{ ...chip(false), padding: "4px 12px" }} onClick={onNewGroup} data-testid="group-new">👥 Group</button>}
      {admin && <button style={{ ...chip(false), padding: "4px 12px" }} onClick={onNew} data-testid="character-new">＋ New</button>}
      <button style={{ ...chip(false), padding: "4px 12px", marginLeft: "auto" }} onClick={onGallery} data-testid="gallery-open" aria-label="Gallery">🖼️ Gallery</button>
    </div>
  );
}

/** Create or edit a character, and generate their portrait. */
export function CharacterEditor({ initial, draft, portraits, brains = [], brainModels = [], onClose, onSaved, onDeleted, onDuplicated }: {
  initial: Character | null; draft?: Partial<Character> | null; portraits: boolean; brains?: string[]; brainModels?: { id: string; model: string }[]; onClose: () => void; onSaved: (c: Character) => void; onDeleted: (id: string) => void; onDuplicated?: (c: Character) => void;
}) {
  const [c, setC] = useState<Character | null>(initial);
  // ✨ A "make one for me" draft fills everything in; nothing is saved until Save.
  const seed: Partial<Character> | null = initial || draft || null;
  const [name, setName] = useState(seed?.name || "");
  const [personality, setPersonality] = useState(seed?.personality || "");
  const [backstory, setBackstory] = useState(seed?.backstory || "");
  const [relation, setRelation] = useState(seed?.relation || "");
  const [appearance, setAppearance] = useState(seed?.appearance || "");
  const [job, setJob] = useState(seed?.job || "");
  // 💼 Her work week.
  const [attire, setAttire] = useState(seed?.work_attire || "");
  const [workDays, setWorkDays] = useState<number[]>(seed?.work_days || []);
  const [workStart, setWorkStart] = useState(seed?.work_start || "");
  const [workEnd, setWorkEnd] = useState(seed?.work_end || "");
  const [partTime, setPartTime] = useState(!!seed?.part_time);
  // 💞🌈 Romance options.
  const [polyOk, setPolyOk] = useState(!!seed?.poly_ok);
  const [sapphic, setSapphic] = useState(!!seed?.sapphic);
  const [explicitOk, setExplicitOk] = useState(!!seed?.explicit_ok);
  const [gender, setGender] = useState<"female" | "male">(seed?.gender || "female");
  const [liveIn, setLiveIn] = useState(!!seed?.live_in);
  const [wear, setWear] = useState(seed?.casual_wear || "");
  const [hobbies, setHobbies] = useState(seed?.hobbies || "");
  const first = CHARACTER_VOICES[0];
  const [romantic, setRomantic] = useState(!!seed?.romantic);
  const [arc, setArc] = useState(seed?.romance_arc || "");
  const [traits, setTraits] = useState<Record<TraitKey, number>>(cleanTraits(seed?.traits && Object.keys(seed.traits).length ? seed.traits : DEFAULT_TRAITS));
  const [preset, setPreset] = useState(seed?.preset || "");
  const [zone, setZone] = useState(seed?.time_zone || "");
  const [bday, setBday] = useState(seed?.birthday || "");
  const [brain, setBrain] = useState(seed?.brain || "");
  // 📄 Duplicate: a copy under a new name (her pictures stay with her).
  const [copying, setCopying] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [copyErr, setCopyErr] = useState("");
  const duplicate = async () => {
    if (!c) return;
    setCopyErr("");
    try { const r = await api<{ character: Character }>("/api/characters", { action: "duplicate", id: c.id, name: copyName.trim() }); setCopying(false); onDuplicated?.(r.character); }
    catch (e) { setCopyErr(e instanceof Error ? e.message : "Couldn't copy her."); }
  };
  // 🎚️ A preset sets the sliders (and the personality, if it's empty or still another preset's text).
  const applyPreset = (id: string) => {
    setPreset(id);
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    setTraits({ ...p.traits });
    if (!personality.trim() || PRESETS.some(x => x.about === personality)) setPersonality(p.about);
  };
  const [shots, setShots] = useState(0);
  const [pending, setPending] = useState<{ files: File[]; headshot: boolean; fictional: boolean }>({ files: [], headshot: true, fictional: false }); // finished portraits (refreshes the reference picker)
  const [refIds, setRefIds] = useState<string[]>(initial?.reference_ids || []);
  const [voice, setVoice] = useState<VoiceOption>(seed?.voice ? { id: seed.voice, name: seed.voice_name || "Voice", kind: seed.voice_kind || "female", about: "", preview: "" } : { id: first.voiceId, name: first.name, kind: first.kind, about: first.about, preview: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const working = !!c?.portrait_job;
  const dirty = !c || name !== c.name || personality !== c.personality || backstory !== c.backstory || relation !== c.relation || appearance !== c.appearance || job !== (c.job || "") || wear !== (c.casual_wear || "") || hobbies !== (c.hobbies || "") || voice.id !== c.voice || JSON.stringify(traits) !== JSON.stringify(cleanTraits(c.traits && Object.keys(c.traits).length ? c.traits : DEFAULT_TRAITS)) || preset !== (c.preset || "") || zone !== (c.time_zone || "") || bday !== (c.birthday || "") || romantic !== !!c.romantic || (romantic ? arc : "") !== (c.romance_arc || "") || refIds.join() !== (c.reference_ids || []).join() || brain !== (c.brain || "")
    || attire !== (c.work_attire || "") || [...workDays].sort().join() !== [...(c.work_days || [])].sort().join() || workStart !== (c.work_start || "") || workEnd !== (c.work_end || "") || partTime !== !!c.part_time
    || (romantic && polyOk) !== !!c.poly_ok || (romantic && sapphic) !== !!c.sapphic || (romantic && explicitOk) !== !!c.explicit_ok || gender !== (c.gender || "female") || liveIn !== !!c.live_in;

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
      const fields = { name, personality, backstory, relation, appearance, job, casualWear: wear, hobbies, voice: { id: voice.id, name: voice.name, kind: voice.kind, owner: voice.owner }, romantic, romanceArc: romantic ? arc : "", traits, preset, timeZone: zone, birthday: bday, brain,
        workAttire: attire, workDays, workStart: workStart && workEnd ? workStart : "", workEnd: workStart && workEnd ? workEnd : "", partTime, polyOk: romantic && polyOk, sapphic: romantic && sapphic, explicitOk: romantic && explicitOk, gender, liveIn };
      const r = await api<{ character: Character }>("/api/characters", { action: c ? "update" : "create", id: c?.id, ...fields, referenceIds: refIds });
      // 🖼️ Pictures picked while making a new character: upload them now (first one as headshot), as references.
      if (!c && pending.files.length && pending.fictional) {
        const ids: string[] = [];
        for (const [i, f] of pending.files.entries()) {
          try { ids.push((await uploadCharacterPicture(f, r.character.id, i === 0 && pending.headshot)).mediaId); }
          catch (e) { setMsg(e instanceof Error ? e.message : "A picture didn't upload."); }
        }
        if (ids.length) {
          const r2 = await api<{ character: Character }>("/api/characters", { action: "update", id: r.character.id, ...fields, voice: { id: r.character.voice, name: r.character.voice_name, kind: r.character.voice_kind }, referenceIds: ids.slice(0, 4) });
          r.character = r2.character; setRefIds(r2.character.reference_ids || []);
        }
        setPending({ files: [], headshot: true, fictional: false });
        setShots(n => n + 1);
      }
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
        <label style={{ fontSize: 13, fontWeight: 700 }}>Personality preset <span className="muted" style={{ fontWeight: 500 }}>· optional starting point</span>
          <select value={preset} onChange={e => applyPreset(e.target.value)} aria-label="Personality preset" style={{ marginTop: 4, display: "block", width: "100%" }}>
            <option value="">— Custom —</option>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {preset && <span className="muted" style={{ fontWeight: 500, display: "block", marginTop: 4 }}>{PRESETS.find(p => p.id === preset)?.about}</span>}
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Personality
          <textarea value={personality} onChange={e => setPersonality(e.target.value)} maxLength={2000} rows={3} placeholder="How do they talk and act? e.g. gruff but kind, loves bad puns, never gives up" aria-label="Personality" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Backstory
          <textarea value={backstory} onChange={e => setBackstory(e.target.value)} maxLength={3000} rows={4} placeholder="Where they come from, what they've been through, what they care about. Type @Name to have them know another character (e.g. 'Her best friend since college is @Mia')." aria-label="Backstory" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Relation to the user
          <textarea value={relation} onChange={e => setRelation(e.target.value)} maxLength={600} rows={2} placeholder="Who they are to the person chatting, e.g. an old friend from the navy, a mentor, a big sister" aria-label="Relation to the user" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <div data-testid="character-life" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>💼 Their everyday life</div>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Job
            <input value={job} onChange={e => setJob(e.target.value)} maxLength={300} placeholder="e.g. Yoga instructor at a small studio downtown, teaches mornings" aria-label="Job" style={{ marginTop: 4 }} />
          </label>
          <WorkWeek attire={attire} setAttire={setAttire} days={workDays} setDays={setWorkDays} start={workStart} setStart={setWorkStart} end={workEnd} setEnd={setWorkEnd} part={partTime} setPart={setPartTime} />
          <label style={{ fontSize: 13, fontWeight: 700 }}>Preferred casual wear
            <textarea value={wear} onChange={e => setWear(e.target.value)} maxLength={400} rows={2} placeholder="e.g. Oversized hoodies, high-waisted jeans, white sneakers, gold hoops" aria-label="Preferred casual wear" style={{ marginTop: 4, resize: "vertical" }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Favorite hobbies
            <textarea value={hobbies} onChange={e => setHobbies(e.target.value)} maxLength={600} rows={2} placeholder="e.g. Hiking on weekends, baking sourdough, thrift shopping, horror movies" aria-label="Favorite hobbies" style={{ marginTop: 4, resize: "vertical" }} />
          </label>
          <span className="muted" style={{ fontSize: 12 }}>They&apos;ll talk about their work and hobbies, and usually wear their casual style in everyday photos.</span>
        </div>
        <BrainPick value={brain} onChange={setBrain} available={brains} models={brainModels} />
        {c && <FriendsCard id={c.id} />}
        <TraitSliders value={traits} romantic={romantic} onChange={(k, v) => { setTraits(t => ({ ...t, [k]: v })); }} />
        <label style={{ fontSize: 13, fontWeight: 700 }}>Where they live (time zone)
          <select value={zone} onChange={e => setZone(e.target.value)} aria-label="Character time zone" style={{ marginTop: 4, display: "block", width: "100%" }}>
            {CHARACTER_ZONES.map(([id, label]) => <option key={id || "same"} value={id}>{label}</option>)}
          </select>
          <span className="muted" style={{ fontWeight: 500, display: "block", marginTop: 4 }}>They always know your local time too — and notice when it&apos;s late for one of you.</span>
        </label>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🎂 Their birthday <span className="muted" style={{ fontWeight: 500 }}>· optional</span>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <select value={bday.slice(0, 2)} aria-label="Birthday month" onChange={e => setBday(e.target.value ? `${e.target.value}-${bday.slice(3) || "01"}` : "")} style={{ flex: 2 }}>
              <option value="">— Month —</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((mo, i) => <option key={mo} value={String(i + 1).padStart(2, "0")}>{mo}</option>)}
            </select>
            <select value={bday.slice(3)} aria-label="Birthday day" disabled={!bday} onChange={e => setBday(`${bday.slice(0, 2)}-${e.target.value}`)} style={{ flex: 1 }}>
              {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(d => <option key={d} value={d}>{Number(d)}</option>)}
            </select>
          </div>
        </div>
        <VoicePicker value={voice} onChange={setVoice} />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={() => setGender("female")} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--line)", background: gender === "female" ? "var(--accent)" : "transparent", color: gender === "female" ? "#fff" : "var(--text)" }}>Female</button>
          <button type="button" onClick={() => setGender("male")} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--line)", background: gender === "male" ? "var(--accent)" : "transparent", color: gender === "male" ? "#fff" : "var(--text)" }}>Male</button>
        </div>
        <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start" }}>
          <input type="checkbox" checked={romantic} onChange={e => setRomantic(e.target.checked)} aria-label="Romantic" style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
          <span>💕 Romantic (unrated) <span className="muted" style={{ fontWeight: 500, display: "block" }}>Romance becomes possible with adults who confirmed they&apos;re 18+  — but their personality still leads. Others get a friendly, platonic version.</span></span>
        </label>
        <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start", marginTop: 8 }}>
          <input type="checkbox" checked={liveIn} onChange={e => setLiveIn(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
          <span>🏠 Live-in <span className="muted" style={{ fontWeight: 500, display: "block" }}>When home, they're at your house. Toggle home/away in chat.</span></span>
        </label>
        {romantic && gender === "female" && (
          <label style={{ fontSize: 13, fontWeight: 700 }}>💕 Romance arc
            <textarea value={arc} onChange={e => setArc(e.target.value)} maxLength={1500} rows={3} aria-label="Romance arc"
              placeholder="How their feelings start and can grow, e.g. Not interested in them at first and a bit cold — but if they're patient and kind, she slowly starts to care and could fall for them."
              style={{ marginTop: 4, resize: "vertical" }} />
            <span className="muted" style={{ fontWeight: 500, display: "block", marginTop: 4 }}>Each person&apos;s relationship develops on its own from here, a little after every chat and call. Edit this any time to add new turns.</span>
          </label>
        )}
        {romantic && (
          <div style={{ display: "grid", gap: 8 }}>
            <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start" }}>
              <input type="checkbox" checked={polyOk} onChange={e => setPolyOk(e.target.checked)} data-testid="poly-ok" style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
              <span>💞 Polyamory possible <span className="muted" style={{ fontWeight: 500, display: "block" }}>Open to sharing you with others over time — possible, never guaranteed. More likely if you keep gently nudging that way. Unchecked: she isn&apos;t into sharing you.</span></span>
            </label>
            <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start" }}>
              <input type="checkbox" checked={sapphic} onChange={e => setSapphic(e.target.checked)} data-testid="sapphic" style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
              <span>🌈 Kinda lesbian leaning <span className="muted" style={{ fontWeight: 500, display: "block" }}>Men always stay her main attraction and she never goes fully lesbian — but with another romantic character who has this checked too, something could slowly develop (PG-13).</span></span>
            </label>
            <label className="row" style={{ gap: 10, fontSize: 13, fontWeight: 700, alignItems: "flex-start" }}>
              <input type="checkbox" checked={explicitOk} onChange={e => setExplicitOk(e.target.checked)} data-testid="explicit-ok" style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
              <span>🔞 Can send explicit <span className="muted" style={{ fontWeight: 500, display: "block" }}>She can send nudes or explicit pics on her own. Off = suggestive only.</span></span>
            </label>
          </div>
        )}
        {c && <ReferencePicker characterId={c.id} value={refIds} onChange={setRefIds} refresh={shots}
          onPortrait={ch => { setC(ch); onSaved(ch); }} />}
        {!c && <PendingPictures value={pending} onChange={setPending} />}
        <label style={{ fontSize: 13, fontWeight: 700 }}>Appearance (for the portrait)
          <textarea value={appearance} onChange={e => setAppearance(e.target.value)} maxLength={600} rows={2} placeholder="e.g. weathered sea captain, silver braid, navy coat, warm smile" aria-label="Appearance" style={{ marginTop: 4, resize: "vertical" }} />
        </label>
        <div className="muted" style={{ fontSize: 12 }}>Everyone can chat with and call this character. Each person gets their own chats and memories with them. Characters are fictional: no real people and nothing explicit — romantic characters can be PG-13 (flirty, suggestive, never explicit). A quick safety check runs when you save.</div>
        {msg && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {msg}</div>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || !name.trim() || (!dirty && !!c)} onClick={save}>{busy ? "…" : c ? "Save" : "Create"}</button>
          {portraits && <button className="ghost" disabled={busy || working || !name.trim() || !appearance.trim()} onClick={portrait} data-testid="character-portrait">{c?.portrait_url ? "🎨 New portrait" : "🎨 Generate portrait"}</button>}
          {c && onDuplicated && <button className="ghost" disabled={busy || dirty} onClick={() => { setCopyName(`${c.name} 2`); setCopying(true); }} data-testid="duplicate-open" title={dirty ? "Save first" : "Make a copy under a new name"}>📄 Duplicate</button>}
          {c && <button className="ghost" disabled={busy} onClick={remove} style={{ marginLeft: "auto", color: "var(--bad)" }}>Delete</button>}
        </div>
        {copying && c && (
          <div className="card" data-testid="duplicate-sheet" style={{ display: "grid", gap: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>📄 Copy {c.name} — everything except her pictures</div>
            <input value={copyName} onChange={e => { setCopyName(e.target.value); setCopyErr(""); }} onKeyDown={e => { if (e.key === "Enter" && copyName.trim()) duplicate(); }} maxLength={60} autoFocus aria-label="Name for the copy" placeholder="New name" data-testid="duplicate-name" />
            {copyErr && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {copyErr}</div>}
            <div className="row">
              <button className="btn" disabled={!copyName.trim()} onClick={duplicate} data-testid="duplicate-go">Make copy</button>
              <button className="ghost" onClick={() => { setCopying(false); setCopyErr(""); }}>Cancel</button>
            </div>
          </div>
        )}
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
function ReferencePicker({ characterId, value, onChange, refresh, onPortrait }: { characterId: string; value: string[]; onChange: (ids: string[]) => void; refresh: number; onPortrait: (c: Character) => void }) {
  const [items, setItems] = useState<{ id: string; thumb: string | null; url: string }[] | null>(null);
  const [reload, setReload] = useState(0);
  const [fictional, setFictional] = useState(false);
  const [asHeadshot, setAsHeadshot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<{ items: { id: string; thumb: string | null; url: string }[] }>("/api/characters", { action: "gallery", id: characterId }).then(r => setItems(r.items)).catch(() => setItems([]));
  }, [characterId, refresh, reload]);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const r = await uploadCharacterPicture(f, characterId, asHeadshot);
      setReload(n => n + 1);
      if (value.length < 4) onChange([...value, r.mediaId]);
      if (asHeadshot) { const g = await api<{ character: Character }>("/api/characters", { action: "portrait.set", id: characterId, mediaId: r.mediaId }); onPortrait(g.character); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload didn't go through."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const makeHeadshot = async (mediaId: string) => {
    setBusy(true); setErr("");
    try { const g = await api<{ character: Character }>("/api/characters", { action: "portrait.set", id: characterId, mediaId }); onPortrait(g.character); setSelected(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't set it."); }
    finally { setBusy(false); }
  };
  const uploader = (
    <div data-testid="char-upload" style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", flexDirection: "column", gap: 6, fontWeight: 500 }}>
      <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={fictional} onChange={e => setFictional(e.target.checked)} aria-label="AI-made or fictional" style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
        <span>This picture is AI-made or fictional (e.g. from Atlas Cloud) — not a photo of a real person.</span>
      </label>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={asHeadshot} onChange={e => setAsHeadshot(e.target.checked)} aria-label="Use as headshot" style={{ width: 18, height: 18, flexShrink: 0 }} />
        <span>Also make it her main headshot</span>
      </label>
      <button type="button" className="ghost" disabled={!fictional || busy} onClick={() => input.current?.click()} data-testid="char-upload-btn" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 13 }}>{busy ? "Uploading…" : "⬆️ Upload a picture"}</button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => upload(e.target.files?.[0])} data-testid="char-upload-input" />
      {err && <div style={{ color: "var(--bad)", fontSize: 12 }}>⚠️ {err}</div>}
    </div>
  );
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : value.length >= 4 ? value : [...value, id]);
  return (
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      Reference pictures <span className="muted" style={{ fontWeight: 500 }}>· {value.length}/4 picked (2–4 keeps them looking the same)</span>
      {!items ? <div className="muted" style={{ fontWeight: 500, marginTop: 6 }}>Loading…</div>
        : !items.length ? <div className="muted" style={{ fontWeight: 500, marginTop: 6 }}>Upload pictures you made (e.g. in Atlas Cloud), generate a few portraits, or ask them for selfies in chat — then pick the best 2–4 here.</div>
        : (
          <div data-testid="reference-picker" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6, maxHeight: 230, overflowY: "auto" }}>
            {items.map(it => {
              const on = value.includes(it.id);
              return (
                <button key={it.id} type="button" onClick={() => { toggle(it.id); setSelected(it.id); }} aria-pressed={on} data-testid="reference-item"
                  style={{ position: "relative", padding: 0, borderRadius: 10, overflow: "hidden", aspectRatio: "2 / 3", cursor: "pointer", border: `3px solid ${on ? "var(--accent)" : "transparent"}`, background: "var(--surface2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.thumb || it.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: on ? 1 : 0.75 }} />
                  {on && <span style={{ position: "absolute", top: 3, right: 3, background: "var(--accent)", color: "#fff", borderRadius: 999, width: 20, height: 20, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{value.indexOf(it.id) + 1}</span>}
                </button>
              );
            })}
          </div>
        )}
      {selected && items?.some(x => x.id === selected) && (
        <button type="button" className="ghost" disabled={busy} onClick={() => makeHeadshot(selected)} data-testid="make-headshot" style={{ marginTop: 6, padding: "6px 12px", fontSize: 13 }}>⭐ Make the last one I tapped her headshot</button>
      )}
      {uploader}
    </div>
  );
}

/** 🎚️ Nine temperament sliders (0–10). Their mix makes each character unique; Flirty and Suggestive only count when Romantic is on. */
function TraitSliders({ value, romantic, onChange }: { value: Record<TraitKey, number>; romantic: boolean; onChange: (k: TraitKey, v: number) => void }) {
  return (
    <div data-testid="trait-sliders" style={{ fontSize: 13, fontWeight: 700 }}>
      Temperament <span className="muted" style={{ fontWeight: 500 }}>· tendencies, not a script — the personality text still leads</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {TRAITS.map(t => {
          const off = "romantic" in t && !romantic;
          return (
            <div key={t.key} style={{ opacity: off ? 0.5 : 1 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span>{t.icon} {t.label} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {off ? "only with Romantic on" : t.hint}</span></span>
                <span style={{ minWidth: 36, textAlign: "right" }}>{value[t.key]}/10</span>
              </div>
              <input type="range" min={0} max={10} step={1} value={value[t.key]} onChange={e => onChange(t.key, Number(e.target.value))} aria-label={t.label}
                style={{ width: "100%", accentColor: "var(--accent)", padding: 0, border: "none", background: "transparent" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 🖼️ New character: pick pictures (e.g. made in Atlas Cloud) now; they're uploaded when you tap Create. */
function PendingPictures({ value, onChange }: { value: { files: File[]; headshot: boolean; fictional: boolean }; onChange: (v: { files: File[]; headshot: boolean; fictional: boolean }) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = value.files.map(f => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(x => URL.revokeObjectURL(x));
  }, [value.files]);
  const add = (list: FileList | null) => {
    const picked = Array.from(list || []).filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    onChange({ ...value, files: [...value.files, ...picked].slice(0, 4) });
    if (input.current) input.current.value = "";
  };
  return (
    <div data-testid="pending-pictures" style={{ fontSize: 13, fontWeight: 700 }}>
      Pictures of her <span className="muted" style={{ fontWeight: 500 }}>· optional, up to 4 — uploaded when you tap Create</span>
      {urls.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
          {urls.map((u, i) => (
            <div key={u} style={{ position: "relative", aspectRatio: "2 / 3", borderRadius: 10, overflow: "hidden", border: `3px solid ${i === 0 && value.headshot ? "var(--accent)" : "transparent"}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button type="button" aria-label="Remove picture" onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
                style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 12, cursor: "pointer" }}>✕</button>
              {i === 0 && value.headshot && <span style={{ position: "absolute", bottom: 3, left: 3, fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "var(--accent)", color: "#fff" }}>Headshot</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", flexDirection: "column", gap: 6, fontWeight: 500 }}>
        <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={value.fictional} onChange={e => onChange({ ...value, fictional: e.target.checked })} aria-label="AI-made or fictional" style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
          <span>These pictures are AI-made or fictional (e.g. from Atlas Cloud) — not photos of a real person.</span>
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={value.headshot} onChange={e => onChange({ ...value, headshot: e.target.checked })} aria-label="Use as headshot" style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span>Use the first one as her main headshot</span>
        </label>
        <button type="button" className="ghost" disabled={!value.fictional || value.files.length >= 4} onClick={() => input.current?.click()} data-testid="pending-add" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 13 }}>⬆️ Add pictures</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => add(e.target.files)} data-testid="pending-input" />
      </div>
    </div>
  );
}

type Link = { id: string; name: string; kind: string; story: string };
/** 👭 Friends & family: other characters this one knows firsthand (one way — the other knows her only
 *  once linked from her side too). She can talk about them, but never learns how close the person is
 *  with them (only that they're friends, and any family tie). */
function FriendsCard({ id }: { id: string }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [knownBy, setKnownBy] = useState<Link[]>([]);
  const [backing, setBacking] = useState<string | null>(null);
  const show = (r: { links: Link[]; knownBy: Link[] }) => { setLinks(r.links); setKnownBy(r.knownBy || []); };
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);
  const [other, setOther] = useState("");
  const [kind, setKind] = useState("");
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ links: Link[]; knownBy: Link[] }>("/api/characters", { action: "links", id }).then(show).catch(() => {});
    api<{ characters: { id: string; name: string }[] }>("/api/characters", { action: "list" }).then(r => setOthers(r.characters.filter(x => x.id !== id).map(x => ({ id: x.id, name: x.name })))).catch(() => {});
  }, [id]);
  const add = async (otherId = other, k = kind.trim() || "friends") => {
    if (!otherId) return;
    setBusy(true); setErr("");
    try {
      show(await api<{ links: Link[]; knownBy: Link[] }>("/api/characters", { action: "link.set", id, otherId, kind: k, story: otherId === other ? story : "" }));
      if (otherId === other) { setOther(""); setKind(""); setStory(""); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't link them."); }
    setBusy(false);
  };
  const remove = async (l: Link) => {
    if (!(await confirmAsk(`Unlink ${l.name}? Are you sure? She'll no longer know ${l.name} (unless an @mention in her backstory links them).`, { yes: "Yes, unlink", danger: true }))) return;
    try { show(await api<{ links: Link[]; knownBy: Link[] }>("/api/characters", { action: "link.remove", id, otherId: l.id })); } catch { /* keep */ }
  };
  const free = others.filter(o => !links.some(l => l.id === o.id));
  return (
    <div data-testid="friends-card" style={{ display: "grid", gap: 8, border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <b style={{ fontSize: 13 }}>👭 Friends &amp; family</b>
      <span className="muted" style={{ fontSize: 12 }}>Who she knows firsthand (one way: they only know her back if linked from their side too). She can talk about them with you, but only knows you&apos;re friends with them, not how close you are (unless you tell her). Family ties to you are shared.</span>
      {links.map(l => (
        <div key={l.id} data-testid={`friend-${l.name}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, fontSize: 13 }}><b>{l.name}</b> · {l.kind}{l.story && <div className="muted" style={{ fontSize: 12 }}>{l.story}</div>}</div>
          <button className="ghost" style={{ padding: "2px 10px" }} onClick={() => remove(l)} aria-label={`Unlink ${l.name}`}>✕</button>
        </div>
      ))}
      {knownBy.map(l => (
        <div key={l.id} data-testid={`knownby-${l.name}`} style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ flex: 1 }}>{l.name} knows her ({l.kind}), but she doesn&apos;t know {l.name} yet.</span>
            {backing !== l.id && <button className="ghost" style={{ padding: "2px 10px" }} disabled={busy} onClick={() => setBacking(l.id)}>Link back</button>}
          </div>
          {backing === l.id && <LinkBackForm id={id} other={l} onLinked={r => { show(r); setBacking(null); }} onCancel={() => setBacking(null)} />}
        </div>
      ))}
      {free.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={other} onChange={e => setOther(e.target.value)} aria-label="Character to link" data-testid="friend-pick" style={{ flex: 1 }}>
              <option value="">Add someone…</option>
              {free.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input value={kind} onChange={e => setKind(e.target.value)} maxLength={60} placeholder="friends, sister…" aria-label="How they're related" data-testid="friend-kind" style={{ flex: 1 }} />
          </div>
          {other && <textarea value={story} onChange={e => setStory(e.target.value)} maxLength={600} rows={2} placeholder="How they know each other (optional — left blank, it's written for you)" aria-label="How they know each other" style={{ resize: "vertical" }} />}
          {other && <button disabled={busy} onClick={() => add()} data-testid="friend-add">{busy ? "Linking…" : "Link them"}</button>}
        </div>
      )}
      {err && <span style={{ color: "var(--bad)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}

/** ✍️ Linking back (she gets to know someone who already knows her): how they're related and their
 *  story are filled in (from the other side, or written for you) — edit or rewrite them, then link. */
export function LinkBackForm({ id, other, who, onLinked, onCancel, cancelLabel = "Cancel" }: {
  id: string; other: { id: string; name: string; kind: string; story: string }; who?: string;
  onLinked: (r: { links: Link[]; knownBy: Link[] }) => void; onCancel: () => void; cancelLabel?: string;
}) {
  const [kind, setKind] = useState(other.kind || "friends");
  const [story, setStory] = useState(other.story || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const write = async () => {
    setBusy(true); setErr("");
    try { setStory((await api<{ story: string }>("/api/characters", { action: "link.draft", id, otherId: other.id, kind })).story); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't write it."); }
    setBusy(false);
  };
  useEffect(() => { if (!other.story) write(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const link = async () => {
    setBusy(true); setErr("");
    try { onLinked(await api<{ links: Link[]; knownBy: Link[] }>("/api/characters", { action: "link.set", id, otherId: other.id, kind: kind.trim() || "friends", story: story.trim() })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't link them."); setBusy(false); }
  };
  return (
    <div data-testid="link-back-form" style={{ display: "grid", gap: 6, padding: 8, borderRadius: 10, border: "1px solid var(--border)" }}>
      <label style={{ fontSize: 12, fontWeight: 700 }}>{other.name} is {who ? `${who}'s` : "her"}…
        <input value={kind} onChange={e => setKind(e.target.value)} maxLength={60} aria-label="How they're related" style={{ marginTop: 4, display: "block", width: "100%" }} />
      </label>
      <label style={{ fontSize: 12, fontWeight: 700 }}>How they know each other
        <textarea value={story} onChange={e => setStory(e.target.value)} maxLength={600} rows={3} aria-label="How they know each other" disabled={busy && !story}
          placeholder={busy ? "Writing it…" : "How they met, what they do together"} style={{ marginTop: 4, resize: "vertical", width: "100%" }} />
      </label>
      {err && <span style={{ color: "var(--bad)", fontSize: 12 }}>{err}</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={link} disabled={busy} data-testid="link-back-save">Link them</button>
        <button className="ghost" onClick={write} disabled={busy} data-testid="link-back-rewrite">✍️ Rewrite it</button>
        <button className="ghost" onClick={onCancel} data-testid="link-back-cancel">{cancelLabel}</button>
      </div>
    </div>
  );
}

/** 🧠 Her brain: Claude, Qwen (fast), Qwen (big) or DeepSeek — check one, or none to use the same as Velo. */
function BrainPick({ value, onChange, available, models = [] }: { value: string; onChange: (v: string) => void; available: string[]; models?: { id: string; model: string }[] }) {
  return (
    <div data-testid="brain-pick" style={{ display: "grid", gap: 6, border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <b style={{ fontSize: 13 }}>🧠 Her brain</b>
      <span className="muted" style={{ fontSize: 12 }}>Check one to have it handle everything for her: chats, texts, calls, check-ins, her memories and peek descriptions. Leave all unchecked to use the same brain as Velo.</span>
      <div style={{ display: "grid", gap: 6 }}>
        {BRAIN_OPTIONS.map(o => {
          const ready = !o.atlas || available.includes(o.id), model = models.find(m => m.id === o.id)?.model;
          return (
            <label key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, fontWeight: 600, opacity: ready || value === o.id ? 1 : 0.5 }}>
              <input type="checkbox" checked={value === o.id} disabled={!ready && value !== o.id} onChange={e => onChange(e.target.checked ? o.id : "")} data-testid={`brain-${o.id}`} style={{ width: 18, height: 18, marginTop: 2 }} />
              <span>{o.label} <span className="muted" style={{ fontWeight: 400, fontSize: 12, display: "block" }}>{o.about}{model ? ` (${model})` : ""}{!ready ? " · not set up yet" : ""}</span></span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** 💼 Work clothes, which days, what hours (8 hours, or 5 for part-time — editable). */
function WorkWeek({ attire, setAttire, days, setDays, start, setStart, end, setEnd, part, setPart }: {
  attire: string; setAttire: (v: string) => void; days: number[]; setDays: (v: number[]) => void; start: string; setStart: (v: string) => void; end: string; setEnd: (v: string) => void; part: boolean; setPart: (v: boolean) => void;
}) {
  const plus = (hhmm: string, h: number) => { if (!hhmm) return ""; const [a, b] = hhmm.split(":").map(Number); const t = (a * 60 + b + h * 60) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div data-testid="work-week" style={{ display: "grid", gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 700 }}>Work attire
        <textarea value={attire} onChange={e => setAttire(e.target.value)} maxLength={400} rows={2} aria-label="Work attire" placeholder="e.g. Black scrubs and white sneakers, hair in a bun" style={{ marginTop: 4, resize: "vertical" }} />
      </label>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Work days
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {DAY.map((d, i) => (
            <label key={d} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, padding: "4px 8px", borderRadius: 999, border: `1px solid ${days.includes(i) ? "var(--accent)" : "var(--border)"}`, background: days.includes(i) ? "rgba(124,140,255,0.15)" : "transparent" }}>
              <input type="checkbox" checked={days.includes(i)} onChange={e => setDays(e.target.checked ? [...days, i].sort() : days.filter(x => x !== i))} data-testid={`work-day-${d}`} aria-label={`Works ${d}`} />{d}
            </label>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 13, fontWeight: 700, flex: "1 1 110px" }}>Starts
          <input type="time" value={start} onChange={e => { setStart(e.target.value); setEnd(plus(e.target.value, part ? 5 : 8)); }} aria-label="Work starts" data-testid="work-start" style={{ marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700, flex: "1 1 110px" }}>Ends
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} aria-label="Work ends" data-testid="work-end" style={{ marginTop: 4 }} />
        </label>
        <label className="row" style={{ gap: 6, fontSize: 13, fontWeight: 700, paddingBottom: 10 }}>
          <input type="checkbox" checked={part} onChange={e => { setPart(e.target.checked); if (start) setEnd(plus(start, e.target.checked ? 5 : 8)); }} data-testid="part-time" style={{ width: 18, height: 18 }} /> Part-time
        </label>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>She knows when she&apos;s at work (&quot;at work till 6&quot;) or off (&quot;I&apos;m off Tuesdays&quot;), texts like it, and wears her work clothes in photos taken at work. Times are in her time zone.</span>
    </div>
  );
}

/** ✨ ＋ New: make one for me (from a few optional hints), or start from scratch. */
export function NewCharacterSheet({ onDraft, onBlank, onClose }: { onDraft: (d: Partial<Character>) => void; onBlank: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("");
  const [job, setJob] = useState("");
  const [romantic, setRomantic] = useState(false);
  const [male, setMale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const make = async () => {
    setBusy(true); setErr("");
    try { onDraft((await api<{ draft: Partial<Character> }>("/api/characters", { action: "generate", name, vibe, job, romantic, male })).draft); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't come up with one — try again."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="new-character" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>✨ New character</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>Give a few details (all optional) and Velo makes up the rest — personality, backstory, look, job and work week, hobbies, voice, sliders. You&apos;ll see it all in the editor to change anything before you save.</div>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Name (optional)" aria-label="Name" data-testid="gen-name" />
        <textarea value={vibe} onChange={e => setVibe(e.target.value)} maxLength={300} rows={2} placeholder="Vibe (optional) — e.g. shy bookworm with a wild side, Texas girl, loves horror movies" aria-label="Vibe" data-testid="gen-vibe" style={{ resize: "vertical" }} />
        <input value={job} onChange={e => setJob(e.target.value)} maxLength={120} placeholder="Job (optional) — e.g. nurse, barista, real estate agent" aria-label="Job" data-testid="gen-job" />
        <div className="row" style={{ gap: 16, flexWrap: "wrap", fontSize: 14, fontWeight: 600 }}>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={romantic} onChange={e => setRomantic(e.target.checked)} data-testid="gen-romantic" style={{ width: 18, height: 18 }} /> 💕 Romantic (unrated)</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={male} onChange={e => setMale(e.target.checked)} data-testid="gen-male" style={{ width: 18, height: 18 }} /> Male</label>
        </div>
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" onClick={make} disabled={busy} data-testid="gen-make">{busy ? "Dreaming one up…" : "✨ Make one for me"}</button>
        <button className="ghost" onClick={onBlank} disabled={busy} data-testid="gen-blank">Start from scratch instead</button>
      </div>
    </div>
  );
}
