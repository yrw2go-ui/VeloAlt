"use client";
// ⭐ Settings → Velo Pro: upgrade / manage billing, Velo's own number, your
// phone (verified by a text code, so Velo knows it's you), contacts, and the
// Facebook Page Velo can post to.
import { useEffect, useState } from "react";
import { api, data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { formatPhone, contactProblem } from "./lib/contact";

function picSrc(url: string) {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  return "/api/pic?u=" + encodeURIComponent(url);
}

export type Profile = {
  name: string; look: string; plan: "free" | "pro"; proForSale: boolean; phone: string; phoneVerified: boolean; veloNumber: string;
  chatModel: string; models: { id: string; label: string; by: string; where: string }[];
  personality: string; adultConfirmed: boolean; isAdmin?: boolean; mode?: string; customFace?: string;
  videoModel?: string; videoModels?: { id: string; label: string }[]; checkins?: string;
  bio?: { text: string; birthday: string; age: number | null; state: string; photo: string; photoNote: string };
  notifySpicy?: boolean; notifyProductivity?: boolean;
  spicyVoice?: string; secretVoice?: string; spicyApiVoice?: string; veloVoice?: string;
};
type Contact = { id: string; name: string; phone: string };

const PERKS = [
  "📱 Velo gets her own phone number",
  "✉️ She texts people for you",
  "📞 She calls businesses and people for you — bookings, appointments, questions — and reports back",
  "💬 Text or call Velo any time, like a person",
  "📣 She posts to your Facebook Page",
  "✅ Nothing goes out until you say Send",
];

export default function ProCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async (action: "checkout" | "portal") => {
    setBusy(true); setErr("");
    try { location.href = (await api<{ url: string }>("/api/billing", { action })).url; }
    catch (e) { setErr(e instanceof Error ? e.message : "Billing is unavailable."); setBusy(false); }
  };

  if (profile.plan !== "pro") {
    return (
      <div className="card" data-testid="pro-upgrade" style={{ borderColor: "var(--accent)" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>⭐ Velo Pro</div>
        <ul style={{ margin: "10px 0 14px", paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>{PERKS.map(p => <li key={p} style={{ listStyle: "none", marginLeft: -18 }}>{p}</li>)}</ul>
        {profile.proForSale
          ? <button className="btn" disabled={busy} onClick={() => go("checkout")} style={{ width: "100%" }}>{busy ? "…" : "Upgrade to Velo Pro"}</button>
          : <div className="muted" style={{ fontSize: 14 }}>Coming soon.</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {err}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" data-testid="pro-active">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>⭐ Velo Pro</div>
          <button className="ghost" disabled={busy} onClick={() => go("portal")} style={{ padding: "6px 12px", fontSize: 13 }}>Manage billing</button>
        </div>
        {profile.veloNumber && <div style={{ marginTop: 8 }}>Velo&apos;s number: <b>{profile.veloNumber}</b> <span className="muted" style={{ fontSize: 13 }}>— save it as &quot;Velo&quot;</span></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {err}</div>}
      </div>
      <PhoneCard profile={profile} onChange={onChange} />
      <Contacts />
      <FacebookCard />
    </div>
  );
}

function PhoneCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [phone, setPhone] = useState(profile.phone);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const call = async (body: Record<string, unknown>, then: () => void) => {
    setBusy(true); setMsg("");
    try { await api("/api/phone", body); then(); } catch (e) { setMsg(e instanceof Error ? e.message : "That didn't work."); } finally { setBusy(false); }
  };
  const send = () => { const p = contactProblem({ phone }, { phone: true }); if (p) return setMsg(p); call({ action: "send", phone }, () => setSent(true)); };

  return (
    <div className="card" data-testid="my-phone">
      <div style={{ fontWeight: 700 }}>📱 Your phone</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>So Velo knows it&apos;s you when you text or call her.</div>
      {profile.phoneVerified && !sent ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><b>{profile.phone}</b> <span style={{ color: "var(--good)", fontSize: 13 }}>✓ verified</span></div>
          <button className="ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={async () => { if (await confirmAsk("Remove your phone? Velo won't recognize your texts and calls. Are you sure?")) call({ action: "remove" }, onChange); }}>Remove</button>
        </div>
      ) : !sent ? (
        <div className="row">
          <input type="tel" inputMode="tel" placeholder="219-555-0142" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} aria-label="Your phone number" />
          <button className="btn" disabled={busy || !phone} onClick={send}>Send code</button>
        </div>
      ) : (
        <div className="row">
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Code" />
          <button className="btn" disabled={busy || code.length !== 6} onClick={() => call({ action: "verify", code }, () => { setSent(false); setCode(""); onChange(); })}>Verify</button>
        </div>
      )}
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
    </div>
  );
}

function Contacts() {
  const [list, setList] = useState<Contact[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { data<{ contacts: Contact[] }>("contacts.list").then(r => setList(r.contacts)).catch(() => setList([])); }, [tick]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    const p = name.trim() ? contactProblem({ phone }, { phone: true }) : "Add a name.";
    if (p) return setMsg(p);
    try { await data("contacts.add", { name, phone }); setName(""); setPhone(""); setTick(t => t + 1); }
    catch (e2) { setMsg(e2 instanceof Error ? e2.message : "Couldn't save."); }
  };
  const del = async (c: Contact) => {
    if (!(await confirmAsk(`Delete ${c.name}? Are you sure?`))) return;
    await data("contacts.delete", { id: c.id }).catch(() => {});
    setTick(t => t + 1);
  };
  return (
    <div className="card" data-testid="contacts">
      <div style={{ fontWeight: 700 }}>👥 Contacts</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>People Velo can text or call for you. You can also just tell her a number.</div>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Name (e.g. Mom)" value={name} onChange={e => setName(e.target.value)} aria-label="Contact name" maxLength={80} style={{ flex: "1 1 140px" }} />
        <input type="tel" inputMode="tel" placeholder="219-555-0142" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} aria-label="Contact phone" style={{ flex: "1 1 140px" }} />
        <button className="btn" disabled={!name.trim() || !phone}>Add</button>
      </form>
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
      {list?.map(c => (
        <div key={c.id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <div style={{ flex: 1 }}><b>{c.name}</b> <span className="muted">{c.phone}</span></div>
          <button onClick={() => del(c)} aria-label={`Delete ${c.name}`} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>🗑️</button>
        </div>
      ))}
    </div>
  );
}

type FbStatus = { configured: boolean; connected: boolean; pageName: string | null; choices: { id: string; name: string }[] };
const FB_RESULT: Record<string, string> = {
  connected: "", pick: "", nopages: "Facebook didn't share any Pages you can post to. Velo can post to Pages you manage (not personal profiles).",
  cancelled: "Connecting was cancelled.", error: "Couldn't connect Facebook. Please try again.",
};

function FacebookCard() {
  const [st, setSt] = useState<FbStatus | null>(null);
  const [busy, setBusy] = useState(false);
  // Back from Facebook Login (?fb=…), read before the address bar is cleaned.
  const [msg, setMsg] = useState(() => (typeof location !== "undefined" ? FB_RESULT[new URLSearchParams(location.search).get("fb") || ""] || "" : ""));
  const [tick, setTick] = useState(0);
  useEffect(() => { api<FbStatus>("/api/social", { action: "status" }).then(setSt).catch(() => {}); }, [tick]);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ url?: string }>("/api/social", body);
      if (r.url) { location.href = r.url; return; }
      setTick(t => t + 1);
    } catch (e) { setMsg(e instanceof Error ? e.message : "That didn't work."); }
    setBusy(false);
  };
  if (!st) return null;
  return (
    <div className="card" data-testid="facebook">
      <div style={{ fontWeight: 700 }}>📣 Facebook Page</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Velo can draft posts for a Facebook Page you manage — you approve each one. (Facebook doesn&apos;t allow apps to post to personal profiles.)</div>
      {!st.configured ? <div className="muted" style={{ fontSize: 14 }}>Coming soon.</div>
        : st.connected ? (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>Connected to <b>{st.pageName}</b> <span style={{ color: "var(--good)", fontSize: 13 }}>✓</span></div>
            <button className="ghost" disabled={busy} style={{ padding: "6px 12px", fontSize: 13 }} onClick={async () => { if (await confirmAsk(`Disconnect ${st.pageName}? Velo won't be able to post there. Are you sure?`)) run({ action: "disconnect" }); }}>Disconnect</button>
          </div>
        ) : st.choices.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14 }}>Which Page should Velo post to?</div>
            {st.choices.map(p => <button key={p.id} className="ghost" disabled={busy} onClick={() => run({ action: "pick", pageId: p.id })} style={{ textAlign: "left" }}>{p.name}</button>)}
          </div>
        ) : <button className="btn" disabled={busy} onClick={() => run({ action: "connect" })}>Connect Facebook</button>}
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}

    </div>
  );
}

/** Settings → Velo's brain: which AI she chats with (only shown when there's a choice). */
export function BrainCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const models = profile.models || [];
  if (models.length < 2) return null;
  const pick = async (id: string) => {
    if (id === profile.chatModel) return;
    setBusy(true);
    await data("profile.update", { chatModel: id }).catch(() => {});
    setBusy(false); onChange();
  };
  return (
    <div className="card" data-testid="brain">
      <div style={{ fontWeight: 700 }}>🧠 Velo&apos;s brain</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>The AI Velo chats with. Her memory, reminders and everything else stay the same. Passwords and codes are hidden from every one of them.</div>
      <div role="radiogroup" aria-label="Velo's brain" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {models.map(m => {
          const on = m.id === profile.chatModel;
          return (
            <button key={m.id} role="radio" aria-checked={on} disabled={busy} onClick={() => pick(m.id)}
              style={{ textAlign: "left", background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", color: "var(--text)", cursor: on ? "default" : "pointer" }}>
              <div style={{ fontWeight: 700 }}>{on ? "✓ " : ""}{m.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>by {m.by}{m.id === "claude" ? " · default" : ""}</span></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.where}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STYLES = [
  { id: "friend", icon: "😊", label: "Friend", about: "Warm, upbeat and casual — like a close friend." },
  { id: "professional", icon: "💼", label: "Professional assistant", about: "Polished, efficient and to the point." },
  { id: "sarcastic", icon: "😏", label: "Sarcastic assistant", about: "Dry wit and playful teasing — still helpful." },
  { id: "romantic", icon: "💕", label: "Romantic companion", about: "Confident, charming and flirty, with pet names. Light and non-sexual." },
];


/** Admin-only: generate and save looks for Velo. */
function VeloLookGenerator({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [genPrompt, setGenPrompt] = useState("");
  const [lookName, setLookName] = useState("Velo");
  const [provider, setProvider] = useState("atlas");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [url, setUrl] = useState("");
  const [looks, setLooks] = useState<{id:string; name:string; image_url:string; is_active:boolean}[]>([]);
  const loadLooks = async () => {
    try { const r = await data<{looks: typeof looks}>("profile.listLooks"); setLooks(r.looks || []); } catch {}
  };
  useEffect(() => { loadLooks(); }, []);
  if (!profile.isAdmin) return null;
  const upload = async (file: File) => {
    setBusy(true); setMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await data("profile.uploadLook", { imageData: dataUrl, name: lookName });
        setMsg("Uploaded and saved.");
        loadLooks();
        onChange();
        setBusy(false);
      };
      reader.readAsDataURL(file);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Upload failed."); setBusy(false); }
  };
  const gen = async () => {
    if (!genPrompt.trim()) return;
    setBusy(true); setMsg(""); setUrl("");
    try {
      const r = await data<{ url?: string }>("profile.generateLook", { prompt: genPrompt.trim(), provider, character: lookName.trim() || "Velo" });
      if (r.url) setUrl(r.url);
      else setMsg("No image returned.");
      loadLooks();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); }
    setBusy(false);
  };
  const save = async () => {
    if (!url) return;
    setBusy(true); setMsg("");
    try {
      await data("profile.saveLook", { imageUrl: url, name: "Velo" });
      setMsg("Saved as Velo look.");
      loadLooks();
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    setBusy(false);
  };
  return (
    <div className="card" data-testid="look-generator">
      <div style={{ fontWeight: 700 }}>🖼️ Saved pictures (admin)</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>This does not replace Rachel, Tiffany, or the other built-in faces. Pictures here are extras saved under the name you type. Set as face puts that picture on that character in Your characters. Delete removes it from the app and from storage.</div>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <input value={lookName} onChange={e => setLookName(e.target.value)} placeholder="Character name" style={{ width: 140 }} />
        <label style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13 }}>
          Upload photo
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => setProvider("atlas")} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${provider === "atlas" ? "var(--accent)" : "var(--border)"}`, background: provider === "atlas" ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>Atlas</button>
        <input value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="Describe her look…" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" disabled={busy || !genPrompt.trim()} onClick={gen}>{busy ? "…" : "Generate"}</button>
      </div>
      {url && (
        <div style={{ marginTop: 8 }}>
          <img src={picSrc(url)} alt="Generated" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} />
          <button className="btn" disabled={busy} onClick={save}>Save as Velo look</button>
        </div>
      )}
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
      {looks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Saved pictures</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {looks.map(l => (
              <div key={l.id} style={{ width: 110, textAlign: "center" }}>
                <img src={picSrc(l.image_url)} alt={l.name} style={{ width: 100, height: 100, objectFit: "contain", background: "#111", borderRadius: 8, border: "1px solid var(--border)" }} />
                <div style={{ fontSize: 11, marginTop: 2 }}>{l.name}</div>
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                  <button disabled={busy} onClick={async () => {
                    setBusy(true); setMsg("");
                    try {
                      await data("profile.setLookFace", { id: l.id });
                      setMsg(l.name + " face updated. Reload to see it under Your characters.");
                      onChange();
                    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not set face."); }
                    setBusy(false);
                  }} style={{ fontSize: 11 }}>Face</button>
                  <button disabled={busy} onClick={async () => {
                    if (!confirm("Delete this picture from the app and storage?")) return;
                    setBusy(true); setMsg("");
                    try {
                      await data("profile.deleteLook", { id: l.id });
                      setMsg("Deleted.");
                      loadLooks();
                    } catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed."); }
                    setBusy(false);
                  }} style={{ fontSize: 11 }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



export function CustomLookRow() {
  const [looks, setLooks] = useState<{ name: string; image: string }[]>([]);
  const [active, setActive] = useState("");
  useEffect(() => {
    data<{ looks: { name: string; image: string }[] }>("profile.listCharacterLooks")
      .then(r => setLooks(r.looks || []))
      .catch(() => {});
  }, []);
  if (!looks.length) return null;
  const pick = async (name: string) => {
    setActive(name);
    await data("profile.setCharacterLook", { name }).catch(() => {});
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Your characters</div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {looks.map(l => (
          <button key={l.name} onClick={() => pick(l.name)} style={{ background: "none", border: "none", color: "var(--text)", textAlign: "center", flexShrink: 0, padding: 0 }}>
            {l.image
              ? <img src={"/api/pic?u=" + encodeURIComponent(l.image)} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: active === l.name ? "3px solid var(--accent)" : "2px solid transparent" }} />
              : <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{l.name.slice(0, 1)}</div>}
            <div style={{ fontSize: 12, marginTop: 4 }}>{l.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}


export function StorageCard({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<{ url: string; pathname: string; size: number }[] | null>(null);
  const [used, setUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!profile.isAdmin) return null;
  const check = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await data<{ orphans: { url: string; pathname: string; size: number }[]; used: number }>("profile.listOrphans");
      setRows(r.orphans); setUsed(r.used);
      setMsg(r.orphans.length ? r.orphans.length + " orphaned files. " + r.used + " still in use." : "No orphaned files. " + r.used + " in use.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't check storage."); }
    setBusy(false);
  };
  const wipe = async () => {
    if (!rows?.length) return;
    if (!(await confirmAsk("Delete " + rows.length + " orphaned files from storage? This cannot be undone.", { yes: "Delete" }))) return;
    setBusy(true); setMsg("");
    try {
      const r = await data<{ deleted: number }>("profile.deleteOrphans", { urls: rows.map(x => x.url) });
      setMsg("Deleted " + r.deleted + ".");
      setRows([]);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed."); }
    setBusy(false);
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Storage cleanup</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Files in Blob that are not attached to a character or look.</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={busy} onClick={check}>{busy ? "…" : "Check for orphans"}</button>
        {!!rows?.length && <button className="ghost" disabled={busy} onClick={wipe} style={{ color: "var(--bad)" }}>Delete {rows.length}</button>}
      </div>
      {msg && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{msg}</div>}
      {!!rows?.length && (
        <div style={{ marginTop: 10, maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.slice(0, 40).map(r => (
            <div key={r.url} className="row" style={{ gap: 8, fontSize: 12 }}>
              <img src={picSrc(r.url)} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pathname}</div>
              <span className="muted">{Math.max(1, Math.round(r.size / 1024))} KB</span>
            </div>
          ))}
          {rows.length > 40 && <div className="muted" style={{ fontSize: 12 }}>+{rows.length - 40} more</div>}
        </div>
      )}
    </div>
  );
}

export function VeloVoiceCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const voices = [
    { id: "", name: "From look", about: "Uses the voice for her current face" },
    { id: "rachel", name: "Rachel", about: "calm, American" },
    { id: "sarah", name: "Sarah", about: "warm, young adult" },
    { id: "aria", name: "Aria", about: "expressive, American" },
    { id: "charlotte", name: "Charlotte", about: "smooth, Swedish-English" },
    { id: "jessica", name: "Jessica", about: "bright, playful" },
    { id: "lily", name: "Lily", about: "velvety, British" },
  ];
  const pick = async (id: string) => {
    if (id === (profile.veloVoice || "")) return;
    setBusy(true);
    await data("profile.update", { veloVoice: id }).catch(() => {});
    setBusy(false); onChange();
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>🔊 Velo's voice</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Her voice on calls. From look uses the voice for her current face.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {voices.map(v => {
          const on = (profile.veloVoice || "") === v.id;
          return (
            <button key={v.id} disabled={busy} onClick={() => pick(v.id)}
              style={{ background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 999, padding: "8px 14px", color: "var(--text)", fontWeight: 700, cursor: on ? "default" : "pointer" }}>
              {on ? "✓ " : ""}{v.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UpdateCard() {
  const update = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.update()));
    }
    window.location.reload();
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>App</div>
      <div className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>Reload to get the latest</div>
      <button className="btn" onClick={update} style={{ marginTop: 8 }}>Update app</button>
    </div>
  );
}

export function ModeCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const mode = profile.mode || "productivity";
  const notifySpicy = profile.notifySpicy || false;
  const notifyProd = profile.notifyProductivity !== false;
  const set = async (m: string) => {
    await data("profile.setMode", { mode: m });
    onChange();
  };
  const setNotify = async (side: string, on: boolean) => {
    await data("profile.setNotify", { side, on });
    onChange();
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>App mode</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Switch between spicy and productivity.</div>
      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button onClick={() => set("productivity")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: mode === "productivity" ? "var(--accent)" : "transparent", color: mode === "productivity" ? "white" : "var(--text)", fontWeight: 600 }}>Productivity</button>
        <button onClick={() => set("spicy")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: mode === "spicy" ? "var(--accent)" : "transparent", color: mode === "spicy" ? "white" : "var(--text)", fontWeight: 600 }}>Spicy</button>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Notifications</div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={notifyProd} onChange={e => setNotify("productivity", e.target.checked)} style={{ width: 18, height: 18 }} />
        Productivity alerts
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={notifySpicy} onChange={e => setNotify("spicy", e.target.checked)} style={{ width: 18, height: 18 }} />
        Spicy alerts
      </label>
    </div>
  );
}


export function CharacterGallery({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [chars, setChars] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [media, setMedia] = useState<{id:string; media_url:string; media_type?:string; is_reference:boolean}[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [createName, setCreateName] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const loadChars = async () => {
    try { const r = await data<{characters: string[]}>("profile.listCharacters"); setChars(r.characters || ["Velo"]); } catch { setChars(["Velo"]); }
  };
  const loadMedia = async (name: string) => {
    try { const r = await data<{media: typeof media}>("profile.listMedia", { character: name }); setMedia(r.media || []); } catch { setMedia([]); }
  };
  useEffect(() => { loadChars(); }, []);
  useEffect(() => { if (active) { setPage(0); loadMedia(active); setNewName(active); } }, [active]);
  useEffect(() => { setRefs(media.filter(m => m.is_reference).map(m => m.media_url)); }, [media]);
  const rename = async () => {
    const to = newName.trim();
    if (!active || !to || to === active) return;
    setBusy(true);
    await data("profile.renameCharacter", { from: active, to });
    setActive(to);
    loadChars();
    setBusy(false);
  };
  const create = async () => {
    const name = createName.trim();
    if (!name) return;
    setBusy(true);
    await data("profile.createCharacter", { name });
    setCreateName("");
    await loadChars();
    setActive(name);
    setBusy(false);
  };
  const removeChar = async () => {
    if (!active || !confirm("Delete " + active + " and all their media?")) return;
    setBusy(true);
    await data("profile.deleteCharacter", { name: active });
    setActive(null);
    loadChars();
    setBusy(false);
  };
  const toggleRef = async (m: { id: string; media_url: string; is_reference: boolean }) => {
    const on = !m.is_reference;
    const marked = media.filter(x => x.is_reference).length;
    if (on && marked >= 2) { setNote("Max 2 references. Unmark one first."); return; }
    setNote("");
    try {
      await data("profile.setReference", { id: m.id, on });
      setMedia(list => list.map(x => x.id === m.id ? { ...x, is_reference: on } : x));
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn't save reference."); }
  };
  const gen = async () => {
    if (!active || !genPrompt.trim()) return;
    setBusy(true); setNote("");
    try {
      const r = await data<{url?: string}>("profile.generateLook", { prompt: genPrompt.trim(), provider: "atlas", character: active, images: refs });
      if (r.url) { setNote("Saved."); loadMedia(active); }
      else setNote("No image returned.");
    } catch (e) { setNote(e instanceof Error ? e.message : "Generate failed."); }
    setBusy(false);
  };
  const upload = async (file: File) => {
    if (!active) return;
    setBusy(true); setNote("");
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((res, rej) => { reader.onload = () => res(String(reader.result)); reader.onerror = () => rej(new Error("Read failed")); reader.readAsDataURL(file); });
    try {
      await data("profile.uploadLook", { imageData: dataUrl, name: active });
      setNote("Uploaded.");
      loadMedia(active);
    } catch (e) { setNote(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false);
  };
  const removeOne = async (id: string) => {
    setNote("");
    try {
      await data("profile.deleteMedia", { id });
      if (active) loadMedia(active);
    } catch (e) { setNote(e instanceof Error ? e.message : "Delete failed."); }
  };
  const pageSize = 40;
  const shown = media.slice(page * pageSize, (page + 1) * pageSize);
  if (!active) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Characters</div>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="New character name" style={{ flex: 1 }} />
          <button className="btn" disabled={busy || !createName.trim()} onClick={create}>Create</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {chars.map(c => (
            <button key={c} onClick={() => setActive(c)} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", textAlign: "left", fontWeight: 600 }}>{c}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <button className="ghost" onClick={() => setActive(null)}>Back</button>
        <button className="ghost" onClick={removeChar} disabled={busy} style={{ color: "var(--bad)" }}>Delete character</button>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{active}</div>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Rename" style={{ flex: 1 }} />
        <button onClick={rename} disabled={busy || !newName.trim() || newName.trim() === active}>Save name</button>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <label className="btn" style={{ cursor: "pointer" }}>
          Upload
          <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <span className="muted" style={{ fontSize: 12 }}>{refs.length ? refs.length + " reference selected (max 2)" : "Pick up to 2 photos as references"}</span>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder={refs.length ? "Create more of her from the references…" : "Generate more of her…"} style={{ flex: 1 }} />
        <button className="btn" disabled={busy || !genPrompt.trim()} onClick={gen}>Create</button>
      </div>
      {note && <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{note}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
        {shown.map(m => (
          <div key={m.id} style={{ position: "relative", border: m.is_reference ? "2px solid var(--accent)" : "1px solid transparent", borderRadius: 8 }}>
            {String(m.media_type || "").startsWith("video") || /\.(mp4|webm|mov)(\?|$)/i.test(m.media_url)
              ? <video src={picSrc(m.media_url)} controls style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "#111", borderRadius: 6 }} />
              : <img src={picSrc(m.media_url)} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "#111", borderRadius: 6 }} />}
            <div style={{ display: "flex", gap: 4, marginTop: 4, fontSize: 11 }}>
              <button onClick={() => toggleRef(m)}>{m.is_reference ? "Ref" : "Use"}</button>
              <a href={picSrc(m.media_url)} download target="_blank" rel="noopener noreferrer">Save</a>
              <button onClick={() => removeOne(m.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {media.length > pageSize && (
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 10 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span style={{ fontSize: 13 }}>{page + 1} / {Math.ceil(media.length / pageSize)}</span>
          <button disabled={(page + 1) * pageSize >= media.length} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

export function LookGenerator(props: { profile: Profile; onChange: () => void }) { return <VeloLookGenerator {...props} />; }
export function PersonalityCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pick = async (id: string) => {
    if (id === profile.personality) return;
    let adult = false;
    if (id === "romantic" && !profile.adultConfirmed) {
      if (!(await confirmAsk("Romantic mode is for adults. Are you 18 or older?", { yes: "I'm 18 or older" }))) return;
      adult = true;
    }
    setBusy(true); setMsg("");
    try { await data("profile.update", { personality: id, ...(adult ? { adultConfirmed: true } : {}) }); onChange(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
    setBusy(false);
  };
  return (
    <div className="card" data-testid="personality">
      <div style={{ fontWeight: 700 }}>💬 Velo&apos;s personality</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>How she talks with you in chat, texts and calls.</div>
      <div role="radiogroup" aria-label="Velo's personality" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STYLES.map(st => {
          const on = st.id === profile.personality;
          return (
            <button key={st.id} role="radio" aria-checked={on} disabled={busy} onClick={() => pick(st.id)}
              style={{ textAlign: "left", background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", color: "var(--text)", cursor: on ? "default" : "pointer" }}>
              <div style={{ fontWeight: 700 }}>{st.icon} {on ? "✓ " : ""}{st.label}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{st.about}</div>
            </button>
          );
        })}
      </div>
            {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
      {profile.personality === "alternate" && profile.isAdmin && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Voice for spicy mode</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["secretvoice","fish","resemble","spicy"].map(v => (
              <button key={v} disabled={busy} onClick={async () => {
                setBusy(true); setMsg("");
                try { await data("profile.update", { spicyVoice: v }); onChange(); }
                catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
                setBusy(false);
              }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${profile.spicyVoice === v ? "var(--accent)" : "var(--border)"}`, background: profile.spicyVoice === v ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>
                {v}
              </button>
            ))}
          </div>
          {profile.spicyVoice === "secretvoice" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>SecretVoice voice</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["velvet","whisper","angel","jade","honey","crystal","diamond","sunny","star","candy","bubbles"].map(v => (
                  <button key={v} disabled={busy} onClick={async () => {
                    setBusy(true); setMsg("");
                    try { await data("profile.update", { secretVoice: v }); onChange(); }
                    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
                    setBusy(false);
                  }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${profile.secretVoice === v ? "var(--accent)" : "var(--border)"}`, background: profile.secretVoice === v ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
          {profile.spicyVoice === "spicy" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Spicy API voice</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Bella Bright","Sarah","Laura","Alice","Matilda","Jessica","Lily"].map(v => (
                  <button key={v} disabled={busy} onClick={async () => {
                    setBusy(true); setMsg("");
                    try { await data("profile.update", { spicyApiVoice: v }); onChange(); }
                    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
                    setBusy(false);
                  }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${profile.spicyApiVoice === v ? "var(--accent)" : "var(--border)"}`, background: profile.spicyApiVoice === v ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
