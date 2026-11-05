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

export type Bio = { text: string; birthday: string; age: number | null; state: string; photo: string; photoNote: string };

export default function AboutCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const bio: Bio = profile.bio || { text: "", birthday: "", age: null, state: "", photo: "", photoNote: "" };
  const [text, setText] = useState(bio.text);
  const [birthday, setBirthday] = useState(bio.birthday);
  const [age, setAge] = useState(bio.age ? String(bio.age) : "");
  const [state, setState] = useState(bio.state);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(bio.text); setBirthday(bio.birthday); setAge(bio.age ? String(bio.age) : ""); setState(bio.state); }, [bio.text, bio.birthday, bio.age, bio.state]);
  const dirty = text !== bio.text || birthday !== bio.birthday || (birthday ? false : age !== (bio.age ? String(bio.age) : "")) || state !== bio.state;
  const ageNum = Number(age);
  const ageBad = !birthday && age !== "" && !(Number.isInteger(ageNum) && ageNum >= 13 && ageNum <= 120);

  const save = async () => {
    if (ageBad) { setErr("Age should be a number between 13 and 120."); return; }
    setBusy(true); setErr("");
    try { await data("profile.update", { bio: { text, birthday, age: birthday ? null : age ? ageNum : null, state } }); setSaved(true); setTimeout(() => setSaved(false), 1500); onChange(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr("");
    try { await uploadFile(f, "bio"); onChange(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload didn't go through."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const removePhoto = async () => {
    if (!(await confirmAsk("Remove your photo? Are you sure?"))) return;
    setBusy(true);
    try { await data("bio.photoRemove"); onChange(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't remove it."); }
    finally { setBusy(false); }
  };
  const lab = { fontSize: 13, fontWeight: 700, display: "block" } as const;

  return (
    <div className="card" data-testid="about-you" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700 }}>👤 About you <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· all optional</span></div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Velo and your characters use this to know you — like noticing your glasses or your birthday. Your photo is only described to them in words; it&apos;s never used to make pictures.</div>
      </div>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        {bio.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={bio.photo} alt="Your photo" data-testid="about-photo" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 72, height: 72, borderRadius: "50%", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🙂</div>}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ghost" disabled={busy} onClick={() => input.current?.click()} data-testid="about-upload" style={{ padding: "6px 12px", fontSize: 13 }}>{bio.photo ? "Change photo" : "Add a photo"}</button>
            {bio.photo && <button type="button" className="ghost" disabled={busy} onClick={removePhoto} style={{ padding: "6px 12px", fontSize: 13, color: "var(--bad)" }}>Remove</button>}
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
      <label style={lab}>State you live in
        <select value={state} onChange={e => setState(e.target.value)} aria-label="State you live in" style={{ marginTop: 4, display: "block", width: "100%" }}>
          <option value="">— Not set —</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
      <button className="btn" disabled={!dirty || busy} onClick={save} data-testid="about-save">{saved ? "Saved ✓" : busy ? "…" : "Save"}</button>
    </div>
  );
}
