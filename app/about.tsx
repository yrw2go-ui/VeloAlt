"use client";
// 👤 Settings → About you (all optional): a few words about yourself, a photo, birthday or
// age, and the state you live in. Velo and your characters use it to know you — e.g.
// "those glasses suit you" or "40 looks good on you". Your photo is only described in
// words for them; it's never used to make pictures.
import { useEffect, useRef, useState } from "react";
import { data, uploadFile } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { US_STATES } from "./lib/states";
import type { Profile } from "./pro";
import { BIO_SECTIONS, BIO_MAX, type BioMore } from "./lib/bioSections";

export type MyPhoto = { id: string; url: string; note: string; main: boolean };
export type Bio = { text: string; birthday: string; age: number | null; town?: string; state: string; photo: string; photoNote: string; photos?: MyPhoto[]; more?: BioMore };

export default function AboutCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const bio: Bio = profile.bio || { text: "", birthday: "", age: null, town: "", state: "", photo: "", photoNote: "" };
  const [text, setText] = useState(bio.text);
  const [birthday, setBirthday] = useState(bio.birthday);
  const [age, setAge] = useState(bio.age ? String(bio.age) : "");
  const [town, setTown] = useState(bio.town || "");
  const [state, setState] = useState(bio.state);
  const moreJson = JSON.stringify(bio.more || {});
  const [more, setMore] = useState<BioMore>(bio.more || {});
  // 📕 Always starts closed, filled in or not: the card stays short until you ask for the rest.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // ✍️ Whatever arrives from the server fills these boxes in — but never over something you've
  // typed and not saved yet. The profile reloads for all sorts of reasons, and when it did so
  // mid-sentence it put the old copy back and your words were simply gone.
  const typing = useRef(false);
  useEffect(() => {
    if (typing.current) return;
    setText(bio.text); setBirthday(bio.birthday); setAge(bio.age ? String(bio.age) : ""); setTown(bio.town || ""); setState(bio.state); setMore(JSON.parse(moreJson));
  }, [bio.text, bio.birthday, bio.age, bio.town, bio.state, moreJson]);
  const clean = (m: BioMore) => JSON.stringify(Object.fromEntries(BIO_SECTIONS.map(s => [s.key, (m[s.key] || "").trim()]).filter(([, v]) => v)));
  const dirty = text !== bio.text || birthday !== bio.birthday || (birthday ? false : age !== (bio.age ? String(bio.age) : "")) || town !== (bio.town || "") || state !== bio.state || clean(more) !== clean(bio.more || {});
  typing.current = dirty;
  const ageNum = Number(age);
  const ageBad = !birthday && age !== "" && !(Number.isInteger(ageNum) && ageNum >= 13 && ageNum <= 120);

  // 💾 It saves itself three seconds after you stop typing, as the character cards do — the Save
  // button stays for when you'd rather not wait. Whatever was last sent is remembered, so nothing
  // is sent twice over.
  const [sent, setSent] = useState("");
  const mine = JSON.stringify([text, birthday, age, town, state, clean(more)]);
  const saving = useRef(false);
  useEffect(() => {
    if (!dirty || busy || ageBad || mine === sent) return;
    const t = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      const snap = mine;
      const ok = await save();
      saving.current = false;
      if (ok) setSent(snap);
    }, 3000);
    return () => clearTimeout(t);
  }, [mine, dirty, busy, ageBad, sent]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (ageBad) { setErr("Age should be a number between 13 and 120."); return false; }
    setBusy(true); setErr("");
    try { await data("profile.update", { bio: { text, birthday, age: birthday ? null : age ? ageNum : null, town, state, more } }); setSaved(true); setTimeout(() => setSaved(false), 1500); onChange(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); return false; }
    finally { setBusy(false); }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr("");
    try { await uploadFile(f, "bio"); onChange(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload didn't go through."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const removePhoto = async (id?: string) => {
    if (!(await confirmAsk(id ? "Remove this photo? Are you sure?" : "Remove your photos? Are you sure?"))) return;
    setBusy(true);
    try { await data("bio.photoRemove", id ? { id } : {}); onChange(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't remove it."); }
    finally { setBusy(false); }
  };
  const photos = bio.photos || [];
  const lab = { fontSize: 13, fontWeight: 700, display: "block" } as const;

  return (
    <div className="card" data-testid="about-you" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700 }}>👤 About you <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· all optional</span></div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Velo and your characters use this to know you — like noticing your glasses or your birthday. Your photos are only described to them in words, never used to make pictures of you in chat. Add a few (up to 6) and Picagram uses them to keep photos of you looking like you.</div>
      </div>
      {photos.length > 1 && (
        <div data-testid="about-photos" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map(p => (
            <span key={p.id} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="You" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", display: "block" }} />
              <button type="button" aria-label="Remove this photo" data-testid="about-photo-remove" disabled={busy} onClick={() => removePhoto(p.id)}
                style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--bad)", color: "#fff", fontSize: 12, cursor: "pointer", lineHeight: "22px", padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {bio.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={bio.photo} alt="Your photo" data-testid="about-photo" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 72, height: 72, borderRadius: "50%", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🙂</div>}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ghost" disabled={busy || photos.length >= 6} onClick={() => input.current?.click()} data-testid="about-upload" style={{ padding: "6px 12px", fontSize: 13 }}>{photos.length ? `Add another photo (${photos.length}/6)` : "Add a photo"}</button>
            {bio.photo && <button type="button" className="ghost" disabled={busy} onClick={() => removePhoto()} style={{ padding: "6px 12px", fontSize: 13, color: "var(--bad)" }}>Remove all</button>}
          </div>
          {bio.photoNote && <div className="muted" data-testid="about-photo-note" style={{ fontSize: 12 }}>They&apos;ll know: {bio.photoNote}</div>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => upload(e.target.files?.[0])} data-testid="about-file-input" />
      </div>
      <label style={lab}>A few words about you
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={3} aria-label="About you"
          placeholder="e.g. Tall, glasses, a beard I'm proud of. Dog dad, coffee snob, work in construction, love fishing." style={{ marginTop: 4, resize: "vertical" }} />
      </label>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <label style={{ ...lab, flex: "1 1 150px" }}>Birthday
          <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} aria-label="Birthday" max={new Date().toISOString().slice(0, 10)} style={{ marginTop: 4 }} />
        </label>
        <label style={{ ...lab, flex: "1 1 90px" }}>Age
          <input type="number" inputMode="numeric" min={13} max={120} value={birthday ? "" : age} disabled={!!birthday} onChange={e => setAge(e.target.value)} aria-label="Age"
            placeholder={birthday ? "from birthday" : "e.g. 40"} style={{ marginTop: 4 }} />
        </label>
      </div>
      <label style={lab}>Hometown <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· the city you live in — most new characters and Picagram women live near it</span>
        <input value={town} onChange={e => setTown(e.target.value)} maxLength={80} aria-label="Hometown" data-testid="about-town" placeholder="e.g. Valparaiso" style={{ marginTop: 4 }} />
      </label>
      <label style={lab}>State you live in
        <select value={state} onChange={e => setState(e.target.value)} aria-label="State you live in" style={{ marginTop: 4, display: "block", width: "100%" }}>
          <option value="">— Not set —</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button type="button" className="ghost" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="about-more-toggle" style={{ textAlign: "left", fontWeight: 700 }}>
        {open ? "▾" : "▸"} More about you <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· work, hobbies, favorites, family, goals…</span>
      </button>
      {open && BIO_SECTIONS.map(sct => (
        <label key={sct.key} style={lab}>{sct.label}
          <textarea value={more[sct.key] || ""} onChange={e => setMore(m => ({ ...m, [sct.key]: e.target.value }))} maxLength={BIO_MAX} rows={2} aria-label={sct.label.replace(/^\S+\s/, "")}
            data-testid={`about-${sct.key}`} placeholder={sct.placeholder} style={{ marginTop: 4, resize: "vertical" }} />
        </label>
      ))}
      {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button className="btn" disabled={!dirty || busy} onClick={() => void save()} data-testid="about-save">{saved ? "Saved ✓" : busy ? "…" : "Save"}</button>
        <span data-testid="about-autosave" className="muted" style={{ fontSize: 12 }}>{busy ? "Saving…" : saved ? "✓ Saved" : dirty && mine !== sent ? "Saves on its own…" : ""}</span>
      </div>
    </div>
  );
}
