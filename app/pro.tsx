"use client";
// ⭐ Settings → Velo Pro: upgrade / manage billing, Velo's own number, your
// phone (verified by a text code, so Velo knows it's you), contacts, and the
// Facebook Page Velo can post to.
import { useEffect, useState } from "react";
import { api, data } from "./lib/api";
import { BRAIN_OPTIONS } from "./lib/brainOptions";
import { confirmAsk } from "./lib/dialog";
import { formatPhone, contactProblem } from "./lib/contact";

export type Profile = {
  name: string; look: string; plan: "free" | "pro"; proForSale: boolean; phone: string; phoneVerified: boolean; veloNumber: string;
  chatModel: string; models: { id: string; label: string; by: string; where: string }[];
  personality: string; adultConfirmed: boolean; customFace?: string;
  videoModel?: string; videoModels?: { id: string; label: string }[]; checkins?: string; replyLength?: string;
  bio?: { text: string; birthday: string; age: number | null; state: string; photo: string; photoNote: string };
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
/** 🧠 Brains: which AI Velo chats with, and a tab for each character (their own brain through Atlas Cloud). */
type BrainChar = { id: string; name: string; brain?: string; portrait_url: string | null };
export function BrainCard({ profile, onChange, chars = [], admin = false, brains = [], brainModels = [], onCharChange }: {
  profile: Profile; onChange: () => void; chars?: BrainChar[]; admin?: boolean; brains?: string[]; brainModels?: { id: string; model: string }[]; onCharChange?: (c: BrainChar) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<string>("velo");
  const [err, setErr] = useState("");
  const showChars = chars.length > 0 && (brains.length > 0 || chars.some(c => c.brain));
  if (profile.models.length < 2 && !showChars) return null;
  const pick = async (id: string) => {
    if (id === profile.chatModel) return;
    setBusy(true);
    await data("profile.update", { chatModel: id }).catch(() => {});
    setBusy(false); onChange();
  };
  const setBrain = async (c: BrainChar, brain: string) => {
    if ((c.brain || "") === brain) return;
    setBusy(true); setErr("");
    try { const r = await api<{ character: BrainChar }>("/api/characters", { action: "brain.set", id: c.id, brain }); onCharChange?.(r.character); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't change it."); }
    setBusy(false);
  };
  const veloLabel = profile.models.find(m => m.id === profile.chatModel)?.label || "Claude";
  const ch = chars.find(c => c.id === tab) || null;
  const opt = (on: boolean) => ({ textAlign: "left" as const, background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", color: "var(--text)", cursor: on ? "default" : "pointer" });
  const tabStyle = (on: boolean) => ({ flexShrink: 0, padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "var(--text)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "rgba(124,140,255,0.15)" : "var(--surface2)" });
  return (
    <div className="card" data-testid="brain">
      <div style={{ fontWeight: 700 }}>🧠 Brains</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>The AI behind Velo and each character. Their memory and everything else stay the same. Passwords and codes are hidden from every one of them.</div>
      {showChars && (
        <div role="tablist" aria-label="Whose brain" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
          <button role="tab" aria-selected={tab === "velo"} onClick={() => setTab("velo")} style={tabStyle(tab === "velo")} data-testid="brain-tab-velo">Velo</button>
          {chars.map(c => <button key={c.id} role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)} style={tabStyle(tab === c.id)} data-testid={`brain-tab-${c.name}`}>{c.name}{c.brain ? " 🧠" : ""}</button>)}
        </div>
      )}
      {!ch && (
        <div role="radiogroup" aria-label="Velo's brain" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profile.models.map(m => {
            const on = m.id === profile.chatModel;
            return (
              <button key={m.id} role="radio" aria-checked={on} disabled={busy} onClick={() => pick(m.id)} style={opt(on)}>
                <div style={{ fontWeight: 700 }}>{on ? "✓ " : ""}{m.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>by {m.by}{m.id === "claude" ? " · default" : ""}</span></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.where}</div>
              </button>
            );
          })}
        </div>
      )}
      {ch && (
        <div role="radiogroup" aria-label={`${ch.name}'s brain`} style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="brain-char">
          {[{ id: "", label: `Same as Velo (${veloLabel})`, where: "Follows whatever Velo uses.", atlas: false },
            ...BRAIN_OPTIONS.map(o => ({ id: o.id as string, label: o.label as string, atlas: o.atlas as boolean, where: `${o.about}${brainModels.find(m => m.id === o.id) ? ` (${brainModels.find(m => m.id === o.id)!.model})` : ""}` }))].map(o => {
            const on = (ch.brain || "") === o.id, ready = !o.atlas || brains.includes(o.id);
            return (
              <button key={o.id || "same"} role="radio" aria-checked={on} disabled={busy || !admin || (!ready && !on)} onClick={() => setBrain(ch, o.id)} style={{ ...opt(on), opacity: ready || on ? 1 : 0.5 }} data-testid={`brain-opt-${o.id || "same"}`}>
                <div style={{ fontWeight: 700 }}>{on ? "✓ " : ""}{o.label}{!ready ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · not set up yet</span> : null}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{o.where}</div>
              </button>
            );
          })}
          {!admin && <span className="muted" style={{ fontSize: 12 }}>Only an admin can change a character&apos;s brain.</span>}
        </div>
      )}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>⚠️ {err}</div>}
    </div>
  );
}

/** 🎬 Which model makes the short videos Velo and characters send. */
/** 💬 How long replies usually are — for Velo and every character, in chats and on calls. */
export function ReplyLengthCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(profile.replyLength || "normal");
  const pick = async (id: string) => {
    if (id === cur) return;
    setBusy(true); setCur(id);
    await data("profile.update", { replyLength: id }).catch(() => setCur(profile.replyLength || "normal"));
    setBusy(false); onChange();
  };
  const opts = [{ id: "short", label: "Short", hint: "1–2 sentences" }, { id: "normal", label: "Normal", hint: "2–4 sentences" }, { id: "long", label: "Long", hint: "a paragraph or more" }];
  return (
    <div className="card" data-testid="reply-length">
      <div style={{ fontWeight: 700 }}>💬 Reply length</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>How long Velo&apos;s and your characters&apos; replies usually are, in chats and on calls (calls stay a bit shorter). They&apos;ll still go longer if you ask for a list or a story.</div>
      <div role="radiogroup" aria-label="Reply length" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {opts.map(o => {
          const on = o.id === cur;
          return (
            <button key={o.id} role="radio" aria-checked={on} disabled={busy} onClick={() => pick(o.id)} data-testid={`reply-length-${o.id}`}
              style={{ background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 999, padding: "8px 14px", color: "var(--text)", fontWeight: 700, cursor: on ? "default" : "pointer" }}>
              {on ? "✓ " : ""}{o.label} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VideoCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const list = profile.videoModels || [];
  if (!list.length) return null;
  const pick = async (id: string) => {
    if (id === profile.videoModel) return;
    setBusy(true);
    await data("profile.update", { videoModel: id }).catch(() => {});
    setBusy(false); onChange();
  };
  return (
    <div className="card" data-testid="video-model">
      <div style={{ fontWeight: 700 }}>🎬 Videos</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>The model that makes the short videos Velo and your characters send you. Photos are made with Seedream.</div>
      <div role="radiogroup" aria-label="Video model" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {list.map(m => {
          const on = m.id === profile.videoModel;
          return (
            <button key={m.id} role="radio" aria-checked={on} disabled={busy} onClick={() => pick(m.id)}
              style={{ background: on ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 999, padding: "8px 14px", color: "var(--text)", fontWeight: 700, cursor: on ? "default" : "pointer" }}>
              {on ? "✓ " : ""}{m.label}{m.id === "wan-2.6" ? " · default" : ""}
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
];

/** Settings → Velo's personality: how she talks with you. Romantic asks for 18+ first. */
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
    </div>
  );
}
