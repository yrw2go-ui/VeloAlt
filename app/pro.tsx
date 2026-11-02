"use client";
// ⭐ Settings → Velo Pro: upgrade / manage billing, Velo's own number, your
// phone (verified by a text code, so Velo knows it's you), contacts, and the
// Facebook Page Velo can post to.
import { useEffect, useState } from "react";
import { api, data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { formatPhone, contactProblem } from "./lib/contact";

export type Profile = {
  name: string; look: string; plan: "free" | "pro"; proForSale: boolean; phone: string; phoneVerified: boolean; veloNumber: string;
  chatModel: string; models: { id: string; label: string; by: string; where: string }[];
  personality: string; adultConfirmed: boolean; isAdmin?: boolean; spicyVoice?: string; secretVoice?: string; spicyApiVoice?: string;
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
      {looks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Saved looks</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {looks.map(l => (
              <div key={l.id} style={{ textAlign: "center" }}>
                <img src={l.image_url} alt={l.name} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: l.is_active ? "2px solid var(--accent)" : "1px solid var(--border)" }} />
                <div style={{ fontSize: 11, marginTop: 2 }}>{l.is_active ? "Active" : ""}</div>
                {!l.is_active && <button disabled={busy} onClick={async () => { setBusy(true); await data("profile.setActiveLook", { id: l.id }); loadLooks(); setBusy(false); }} style={{ fontSize: 11, marginTop: 2 }}>Set active</button>}
              </div>
            ))}
          </div>
        </div>
      )}
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
  if (profile.models.length < 2) return null;
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
        {profile.models.map(m => {
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
  { id: "romantic", icon: "💕", label: "Romantic companion", about: "Confident, charming and flirty, with pet names. Adults only, never sexual." },
  { id: "alternate", icon: "🌶️", label: "Alternate (spicy)", about: "Admin-only. Bold, flirty roleplay when you lead." },
];


/** Admin-only: generate and save looks for Velo. */
function VeloLookGenerator({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("spicy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [url, setUrl] = useState("");
  const [looks, setLooks] = useState<{id:string; name:string; image_url:string; is_active:boolean}[]>([]);
  const loadLooks = async () => {
    try { const r = await data<{looks: typeof looks}>("profile.listLooks"); setLooks(r.looks || []); } catch {}
  };
  useEffect(() => { loadLooks(); }, []);
  if (!profile.isAdmin) return null;
  const gen = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setMsg(""); setUrl("");
    try {
      const r = await data<{ url?: string }>("profile.generateLook", { prompt: prompt.trim(), provider });
      if (r.url) setUrl(r.url);
      else setMsg("No image returned.");
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
      <div style={{ fontWeight: 700 }}>🖼️ Create Velo look (admin)</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Generate an image of her, then save it so future pictures stay consistent.</div>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => setProvider("spicy")} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${provider === "spicy" ? "var(--accent)" : "var(--border)"}`, background: provider === "spicy" ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>Spicy</button>
        <button disabled={busy} onClick={() => setProvider("atlas")} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${provider === "atlas" ? "var(--accent)" : "var(--border)"}`, background: provider === "atlas" ? "rgba(124,140,255,0.12)" : "var(--surface2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>Atlas</button>
        <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe her look…" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" disabled={busy || !prompt.trim()} onClick={gen}>{busy ? "…" : "Generate"}</button>
      </div>
      {url && (
        <div style={{ marginTop: 8 }}>
          <img src={url} alt="Generated" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} />
          <button className="btn" disabled={busy} onClick={save}>Save as Velo look</button>
        </div>
      )}
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
      {looks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Saved looks</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {looks.map(l => (
              <div key={l.id} style={{ textAlign: "center" }}>
                <img src={l.image_url} alt={l.name} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: l.is_active ? "2px solid var(--accent)" : "1px solid var(--border)" }} />
                <div style={{ fontSize: 11, marginTop: 2 }}>{l.is_active ? "Active" : ""}</div>
                {!l.is_active && <button disabled={busy} onClick={async () => { setBusy(true); await data("profile.setActiveLook", { id: l.id }); loadLooks(); setBusy(false); }} style={{ fontSize: 11, marginTop: 2 }}>Set active</button>}
              </div>
            ))}
          </div>
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
        {STYLES.filter(st => st.id !== "alternate" || profile.isAdmin).map(st => {
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
            {["secretvoice","fish","spicy"].map(v => (
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
