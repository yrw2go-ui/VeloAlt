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
  paused?: boolean;
  bio?: { text: string; birthday: string; age: number | null; state: string; photo: string; photoNote: string };
};
type Contact = { id: string; name: string; phone: string };

// The upgrade / billing card is hidden for now. Phone, contacts and Facebook stay for Pro accounts.
const SHOW_PRO_CARD = false;

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

  const tools = profile.plan === "pro" ? (
    <>
      <PhoneCard profile={profile} onChange={onChange} />
      <Contacts />
      <FacebookCard />
    </>
  ) : null;
  const card = profile.plan !== "pro" ? (
    <div className="card" data-testid="pro-upgrade" style={{ borderColor: "var(--accent)" }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>⭐ Velo Pro</div>
      <ul style={{ margin: "10px 0 14px", paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>{PERKS.map(p => <li key={p} style={{ listStyle: "none", marginLeft: -18 }}>{p}</li>)}</ul>
      {profile.proForSale
        ? <button className="btn" disabled={busy} onClick={() => go("checkout")} style={{ width: "100%" }}>{busy ? "…" : "Upgrade to Velo Pro"}</button>
        : <div className="muted" style={{ fontSize: 14 }}>Coming soon.</div>}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {err}</div>}
    </div>
  ) : (
    <div className="card" data-testid="pro-active">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>⭐ Velo Pro</div>
        <button className="ghost" disabled={busy} onClick={() => go("portal")} style={{ padding: "6px 12px", fontSize: 13 }}>Manage billing</button>
      </div>
      {profile.veloNumber && <div style={{ marginTop: 8 }}>Velo&apos;s number: <b>{profile.veloNumber}</b> <span className="muted" style={{ fontSize: 13 }}>— save it as &quot;Velo&quot;</span></div>}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {err}</div>}
    </div>
  );
  if (!SHOW_PRO_CARD && !tools) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {SHOW_PRO_CARD && card}
      {tools}
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
    <div className="card" data-testid="brain" style={{ minWidth: 0, maxWidth: "100%" }}>
      <div style={{ fontWeight: 700 }}>🧠 Brains</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>The AI behind Velo and each character. Their memory and everything else stay the same. Passwords and codes are hidden from every one of them.</div>
      {showChars && (
        <div role="tablist" aria-label="Whose brain" style={{ display: "flex", gap: 6, maxWidth: "100%", overflowX: "auto", overflowY: "hidden", paddingBottom: 8 }}>
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
  { id: "romantic", icon: "💕", label: "Romantic companion", about: "Confident, charming and flirty, with pet names. Adults only, and it can be explicit." },
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

type WordBit = { key: string; label: string; about: string; text: string; fallback: string };

/** 📝 Settings → Photo wording: every standing line that goes on every picture, theirs to edit. */
export function WordingCard() {
  const [open, setOpen] = useState(false);
  const [bits, setBits] = useState<WordBit[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = (b: { bits?: WordBit[] }) => {
    const list = b.bits || [];
    setBits(list);
    setDraft(Object.fromEntries(list.map(x => [x.key, x.text])));
  };
  useEffect(() => {
    if (!open || bits) return;
    data("wording.get").then(b => load(b as { bits?: WordBit[] })).catch(() => setBits([]));
  }, [open, bits]);
  // 🔒 House rule: saving only ever happens when something actually changed.
  const dirty = !!bits && bits.some(b => (draft[b.key] ?? "").trim() !== b.text.trim());
  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    const ok = await data("wording.set", { words: draft }).then(b => { load(b as { bits?: WordBit[] }); return true; }, () => false);
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };
  return (
    <div className="card" data-testid="wording">
      <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
        <span>
          <span style={{ fontWeight: 700 }}>📝 Photo wording</span>
          <span className="muted" style={{ fontSize: 13, display: "block", margin: "2px 0 0" }}>The lines put on every picture your characters and the Picagram people send — edit any of them for better results.</span>
        </span>
        <span aria-hidden style={{ marginLeft: 10 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (bits === null ? <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Loading…</div> : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="muted" style={{ fontSize: 12 }}>{"{her}, {other}, {who} are filled in with the names when the picture is made — keep them."}</div>
          {bits.map(b => {
            const changed = (draft[b.key] ?? "") .trim() !== b.fallback.trim();
            return (
              <div key={b.key}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.label}{changed ? " ·  edited" : ""}</div>
                <div className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>{b.about}</div>
                <textarea value={draft[b.key] ?? ""} aria-label={b.label} rows={3} maxLength={700}
                  onChange={e => setDraft(d => ({ ...d, [b.key]: e.target.value }))}
                  style={{ width: "100%", background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, fontSize: 13, fontFamily: "inherit" }} />
                {changed && <button className="ghost" style={{ marginTop: 4, fontSize: 12, padding: "4px 10px" }}
                  onClick={() => setDraft(d => ({ ...d, [b.key]: b.fallback }))}>Put the default back</button>}
              </div>
            );
          })}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" disabled={!dirty || busy} onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

type TalkSlot = { key: string; label: string; about: string; text: string; fallback: string; romantic: boolean };
type TalkSection = { key: string; title: string; about: string; slots: TalkSlot[]; fixed?: boolean };

/**
 * 🛠️ Settings → Admin → Messaging & wording. Every standing line that shapes how a character
 * talks, in plain boxes: edit one, save, and her next message uses it. Hard safety isn't here.
 */
export function AdminCard() {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<TalkSection[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const load = (b: { sections?: TalkSection[] }) => {
    const list = b.sections || [];
    setSections(list);
    setDraft(Object.fromEntries(list.filter(s => !s.fixed).flatMap(s => s.slots.map(x => [x.key, x.text]))));
  };
  useEffect(() => {
    if (!open || sections) return;
    data("talk.get").then(b => load(b as { sections?: TalkSection[] })).catch(e => { setErr(e instanceof Error ? e.message : "Couldn't open it."); setSections([]); });
  }, [open, sections]);
  const all = (sections || []).filter(s => !s.fixed).flatMap(s => s.slots);
  // 🔒 House rule: saving only ever happens when something actually changed.
  const dirty = all.some(x => (draft[x.key] ?? "").trim() !== x.text.trim());
  const changed = all.filter(x => (draft[x.key] ?? "").trim() !== x.fallback.trim()).length;
  const save = async () => {
    if (!dirty) return;
    setBusy(true); setErr("");
    const ok = await data("talk.set", { words: draft }).then(b => { load(b as { sections?: TalkSection[] }); return true; },
      e => { setErr(e instanceof Error ? e.message : "Couldn't save."); return false; });
    setBusy(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1600); }
  };
  return (
    <div className="card" data-testid="admin-card">
      <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
        <span>
          <span style={{ fontWeight: 700 }}>🛠️ Admin · Messaging &amp; wording</span>
          <span className="muted" style={{ fontSize: 13, display: "block", margin: "2px 0 0" }}>Every line that shapes how your characters talk — the voice, the length, the anti-rehearsed rule, caring without nagging. Edit any of them.{changed ? ` · ${changed} edited` : ""}</span>
        </span>
        <span aria-hidden style={{ marginLeft: 10 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (sections === null ? <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Loading…</div> : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>
          {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
          <div className="muted" style={{ fontSize: 12 }}>
            {"{them} is your name and {name} is hers — they're filled in when she answers, so keep them. Safety (being honest when you sincerely ask if she's an AI, secrets, self-harm, cruelty) isn't here and can't be edited."}
          </div>
          {sections.map(sec => (
            <div key={sec.key} data-testid={`talk-${sec.key}`}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{sec.title}</div>
              <div className="muted" style={{ fontSize: 12, margin: "2px 0 10px" }}>{sec.about}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {sec.fixed ? sec.slots.map(x => (
                  <div key={x.key} data-testid="talk-fixed">
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>🔒 {x.label}</div>
                    <div className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>{x.about}</div>
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, fontSize: 13, whiteSpace: "pre-wrap", opacity: 0.85 }}>{x.text}</div>
                  </div>
                )) : sec.slots.map(x => {
                  const edited = (draft[x.key] ?? "").trim() !== x.fallback.trim();
                  return (
                    <div key={x.key}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{x.label}{edited ? " ·  edited" : ""}</div>
                      <div className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>{x.about}</div>
                      <textarea value={draft[x.key] ?? ""} aria-label={x.label} rows={4} maxLength={2000}
                        onChange={e => setDraft(d => ({ ...d, [x.key]: e.target.value }))}
                        style={{ width: "100%", background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, fontSize: 13, fontFamily: "inherit" }} />
                      {edited && <button className="ghost" style={{ marginTop: 4, fontSize: 12, padding: "4px 10px" }}
                        onClick={() => setDraft(d => ({ ...d, [x.key]: x.fallback }))}>Put the default back</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="row" style={{ justifyContent: "flex-end", position: "sticky", bottom: 0, background: "var(--card)", paddingTop: 8 }}>
            <button className="btn" disabled={!dirty || busy} onClick={save} data-testid="talk-save">{saved ? "Saved ✓" : busy ? "…" : "Save"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const BOX = { background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5 };
const KIND_WORD: Record<string, string> = { jewellery: "jewelry" };
const kindWord = (k: string) => KIND_WORD[k] || k;
const KINDS = [
  { id: "clothes", label: "👗 Clothes (she can wear it)" },
  { id: "shoes", label: "👠 Shoes (she can wear it)" },
  { id: "jewellery", label: "📿 Jewelry (she can wear it)" },
  { id: "bag", label: "👜 Bag (she can wear it)" },
  { id: "beauty", label: "💄 Beauty" },
  { id: "tech", label: "🎧 Tech" },
  { id: "treat", label: "🍷 A treat" },
  { id: "home", label: "🕯️ For the home" },
  { id: "discreet", label: "🤫 Discreet (just between you two)" },
];

type AdminGift = { id: string; name: string; brand: string; kind: string; price: number; emoji: string; always?: true; slot?: string; edited?: boolean; inShop?: boolean; hidden?: boolean; mine?: true };

export function GiftsAdminCard() {
  const [open, setOpen] = useState(false);
  const [gifts, setGifts] = useState<AdminGift[] | null>(null);
  const [rotating, setRotating] = useState(30);
  const [pool, setPool] = useState(0);
  const [rotDraft, setRotDraft] = useState("30");
  const [draft, setDraft] = useState<Record<string, { brand: string; name: string; price: string }>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  // 🛠️ Things you add to the catalogue yourself.
  const [icons, setIcons] = useState<string[]>([]);
  const [maxMine, setMaxMine] = useState(20);
  const [mineCount, setMineCount] = useState(0);
  const [adding, setAdding] = useState({ name: "", brand: "", price: "", emoji: "🎁", kind: "treat", always: false });
  const load = (b: { gifts?: AdminGift[]; rotating?: number; pool?: number; icons?: string[]; maxMine?: number; mineCount?: number }) => {
    const list = b.gifts || [];
    if (b.icons?.length) setIcons(b.icons);
    if (typeof b.maxMine === "number") setMaxMine(b.maxMine);
    if (typeof b.mineCount === "number") setMineCount(b.mineCount);
    setGifts(list);
    if (typeof b.rotating === "number") { setRotating(b.rotating); setRotDraft(String(b.rotating)); }
    if (typeof b.pool === "number") setPool(b.pool);
    setDraft(Object.fromEntries(list.map(g => [g.id, { brand: g.brand, name: g.name, price: String(g.price) }])));
  };
  useEffect(() => {
    if (!open || gifts) return;
    api<{ gifts: AdminGift[]; rotating: number; pool: number; icons: string[]; maxMine: number; mineCount: number }>("/api/gifts", { action: "all" })
      .then(load).catch(e => { setErr(e instanceof Error ? e.message : "Couldn't open it."); setGifts([]); });
  }, [open, gifts]);

  const dirty = (g: AdminGift) => {
    const d = draft[g.id];
    return !!d && (d.brand.trim() !== g.brand || d.name.trim() !== g.name || d.price.trim() !== String(g.price));
  };
  const save = async (g: AdminGift) => {
    const d = draft[g.id];
    if (!d || !dirty(g)) return;
    setBusy(g.id); setErr("");
    if (g.mine) {
      await api<{ gifts: AdminGift[] }>("/api/gifts", { action: "extra.edit", giftId: g.id, brand: d.brand, name: d.name, price: Number(d.price) })
        .then(load).catch(e => setErr(e instanceof Error ? e.message : "Couldn't save that one."));
    } else {
      await api<{ gift: AdminGift }>("/api/gifts", { action: "edit", giftId: g.id, brand: d.brand, name: d.name, price: Number(d.price) })
        .then(r => setGifts(list => (list || []).map(x => (x.id === g.id && r?.gift ? r.gift : x))))
        .catch(e => setErr(e instanceof Error ? e.message : "Couldn't save that one."));
    }
    setBusy("");
  };
  // 🏷️ Relabel it: something she wears can become one of the private ones.
  const relabel = async (g: AdminGift, kind: string) => {
    if (kind === g.kind) return;
    setBusy(g.id); setErr("");
    await api<{ gift: AdminGift }>("/api/gifts", { action: g.mine ? "extra.edit" : "edit", giftId: g.id, kind })
      .then(r => { if (r?.gift) setGifts(l => (l || []).map(x => (x.id === g.id ? r.gift : x))); else setGifts(null); })
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't change that."));
    setBusy("");
  };
  // 🗑 Out of the shop. One of your own goes for good; one from the catalogue is only put away,
  // so it can come back.
  const drop = async (g: AdminGift) => {
    if (g.mine) return removeMine(g);
    if (!(await confirmAsk(`Take ${g.brand ? `${g.brand} ` : ""}${g.name} out of the shop? Nobody will be offered it or hope for it. You can put it back here any time.`, { yes: "Take it out", danger: true }))) return;
    setBusy(g.id); setErr("");
    await api<{ gift: AdminGift }>("/api/gifts", { action: "edit", giftId: g.id, hidden: true })
      .then(() => setGifts(null))
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't take it out."));
    setBusy("");
  };
  const putBack = async (g: AdminGift) => {
    setBusy(g.id); setErr("");
    await api<{ gift: AdminGift }>("/api/gifts", { action: "edit", giftId: g.id, hidden: false })
      .then(() => setGifts(null))
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't put it back."));
    setBusy("");
  };
  // 🔁 Whether one of yours stays in the shop every week or takes its turn.
  const flipStay = async (g: AdminGift) => {
    setBusy(g.id); setErr("");
    await api<{ gifts: AdminGift[] }>("/api/gifts", { action: "extra.edit", giftId: g.id, always: !g.always })
      .then(load).catch(e => setErr(e instanceof Error ? e.message : "Couldn't change that."));
    setBusy("");
  };
  const pickIcon = async (g: AdminGift, emoji: string) => {
    setBusy(g.id); setErr("");
    await api<{ gifts: AdminGift[] }>("/api/gifts", { action: "extra.edit", giftId: g.id, emoji })
      .then(load).catch(e => setErr(e instanceof Error ? e.message : "Couldn't change that."));
    setBusy("");
  };
  const addMine = async () => {
    if (!adding.name.trim() || !adding.price) return;
    setBusy("add"); setErr("");
    await api<{ gifts: AdminGift[] }>("/api/gifts", { action: "extra.add", ...adding, price: Number(adding.price) })
      .then(b => { load(b); setAdding({ name: "", brand: "", price: "", emoji: "🎁", kind: "treat", always: false }); })
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't add it."));
    setBusy("");
  };
  const removeMine = async (g: AdminGift) => {
    if (!(await confirmAsk(`Take "${g.name}" out of the catalogue? Are you sure?`))) return;
    setBusy(g.id); setErr("");
    await api<{ gifts: AdminGift[] }>("/api/gifts", { action: "extra.remove", giftId: g.id })
      .then(load).catch(e => setErr(e instanceof Error ? e.message : "Couldn't remove it."));
    setBusy("");
  };
  const saveRotating = async () => {
    if (Number(rotDraft) === rotating) return;
    setBusy("rotating"); setErr("");
    await api<{ gifts: AdminGift[]; rotating: number }>("/api/gifts", { action: "rotating", rotating: Number(rotDraft) })
      .then(r => load({ gifts: r.gifts, rotating: r.rotating, pool })).catch(e => setErr(e instanceof Error ? e.message : "Couldn't set that."));
    setBusy("");
  };

  const hunt = q.trim().toLowerCase();
  const shown = (gifts || []).filter(g => !hunt || `${g.brand} ${g.name} ${g.kind} ${kindWord(g.kind)}`.toLowerCase().includes(hunt));
  const changed = (gifts || []).filter(g => g.edited).length;

  return (
    <div className="card" data-testid="gift-admin-card">
      <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
        <span>
          <span style={{ fontWeight: 700 }}>🛠️ Admin · Gifts &amp; prices</span>
          <span className="muted" style={{ fontSize: 13, display: "block", margin: "2px 0 0" }}>Every gift there is, with its price. Change a price or a brand and it changes everywhere — the shop, her wishlist, and the bill.{changed ? ` · ${changed} edited` : ""}</span>
        </span>
        <span aria-hidden style={{ marginLeft: 10 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (gifts === null ? <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Loading…</div> : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}

          {/* 🔁 How many of the rotating ones are in the shop in a week. */}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 600 }} htmlFor="rot">In the shop each week</label>
            <input id="rot" data-testid="rotating" type="number" min={1} max={200} value={rotDraft} onChange={e => setRotDraft(e.target.value)}
              style={{ width: 80, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", fontSize: 13 }} />
            <span className="muted" style={{ fontSize: 12 }}>of {pool} on rotation (the staples and one of each slot are always in, on top)</span>
            <button className="btn" data-testid="rotating-save" disabled={Number(rotDraft) === rotating || busy === "rotating"} onClick={saveRotating}
              style={{ padding: "5px 12px", fontSize: 12 }}>{busy === "rotating" ? "…" : "Set"}</button>
          </div>


          {/* 🛠️ Add one of your own to the catalogue: your icon, your price, and whether it stays. */}
          <div data-testid="add-mine" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>➕ One of your own <span className="muted" style={{ fontWeight: 500 }}>· {mineCount} of {maxMine}</span></div>
            {mineCount >= maxMine ? <div className="muted" style={{ fontSize: 12 }}>That&apos;s all {maxMine}. Remove one to add another.</div> : (
              <>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <select data-testid="mine-icon" aria-label="Icon" value={adding.emoji} onChange={e => setAdding(a => ({ ...a, emoji: e.target.value }))}
                    style={{ ...BOX, width: 62, fontSize: 16 }}>
                    {icons.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <input data-testid="mine-brand" aria-label="Brand" placeholder="Brand" maxLength={60} value={adding.brand}
                    onChange={e => setAdding(a => ({ ...a, brand: e.target.value }))} style={{ ...BOX, width: 100 }} />
                  <input data-testid="mine-name" aria-label="What it is" placeholder="What it is" maxLength={80} value={adding.name}
                    onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} style={{ ...BOX, flex: 1, minWidth: 120 }} />
                  <span className="muted" style={{ fontSize: 12.5 }}>$</span>
                  <input data-testid="mine-price" aria-label="Price" type="number" min={1} max={1000000} placeholder="0" value={adding.price}
                    onChange={e => setAdding(a => ({ ...a, price: e.target.value }))} style={{ ...BOX, width: 78 }} />
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <select data-testid="mine-kind" aria-label="What sort of thing" value={adding.kind} onChange={e => setAdding(a => ({ ...a, kind: e.target.value }))} style={{ ...BOX }}>
                    {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                  <select data-testid="mine-stay" aria-label="In the shop" value={adding.always ? "stay" : "rotate"}
                    onChange={e => setAdding(a => ({ ...a, always: e.target.value === "stay" }))} style={{ ...BOX }}>
                    <option value="rotate">🔁 Takes its turn on rotation</option>
                    <option value="stay">⭐ Stays in the shop every week</option>
                  </select>
                  <button className="btn" data-testid="mine-add" disabled={!adding.name.trim() || !adding.price || busy === "add"}
                    onClick={addMine} style={{ padding: "5px 12px", fontSize: 12 }}>{busy === "add" ? "…" : "Add"}</button>
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>What sort of thing it is decides whether she can wear it in the photo she sends back.</div>
              </>
            )}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a gift…" aria-label="Find a gift" data-testid="gift-find"
            style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
          <div className="muted" style={{ fontSize: 12 }}>{shown.length} of {(gifts || []).length}. ⭐ never rotates · 🔁 in the shop this week.</div>

          <div data-testid="gift-admin-list" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {shown.map(g => (
              <div key={g.id} data-testid={`gift-row-${g.id}`} style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                {g.mine ? (
                  <select data-testid={`icon-${g.id}`} aria-label={`${g.name} icon`} value={g.emoji} disabled={busy === g.id}
                    onChange={e => pickIcon(g, e.target.value)} style={{ ...BOX, width: 56, fontSize: 15, padding: "3px 4px" }}>
                    {icons.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                ) : <span style={{ fontSize: 17, width: 24, textAlign: "center" }} title={kindWord(g.kind)}>{g.emoji}</span>}
                <input value={draft[g.id]?.brand ?? ""} aria-label={`${g.name} brand`} maxLength={60}
                  onChange={e => setDraft(d => ({ ...d, [g.id]: { ...d[g.id], brand: e.target.value } }))}
                  style={{ width: 110, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5 }} />
                <input value={draft[g.id]?.name ?? ""} aria-label={`${g.name} name`} maxLength={80}
                  onChange={e => setDraft(d => ({ ...d, [g.id]: { ...d[g.id], name: e.target.value } }))}
                  style={{ flex: 1, minWidth: 130, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5 }} />
                <span className="muted" style={{ fontSize: 12.5 }}>$</span>
                <input value={draft[g.id]?.price ?? ""} aria-label={`${g.name} price`} type="number" min={1} max={1000000}
                  onChange={e => setDraft(d => ({ ...d, [g.id]: { ...d[g.id], price: e.target.value } }))}
                  style={{ width: 78, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5 }} />
                <select data-testid={`gift-kind-${g.id}`} aria-label={`What sort of thing ${g.name} is`} value={g.kind} disabled={busy === g.id}
                  onChange={e => void relabel(g, e.target.value)} style={{ ...BOX, maxWidth: 104 }}>
                  {KINDS.map(k => <option key={k.id} value={k.id}>{k.label.replace(/ \(.*\)$/, "")}</option>)}
                </select>
                {g.mine ? (
                  <button className="ghost" data-testid={`stay-${g.id}`} onClick={() => flipStay(g)} disabled={busy === g.id}
                    title={g.always ? "Stays in the shop every week — tap to put it on rotation" : "Takes its turn on rotation — tap to make it stay"}
                    style={{ fontSize: 11, padding: "3px 7px" }}>{g.always ? "⭐ stays" : "🔁 rotates"}</button>
                ) : (
                  <span style={{ fontSize: 12, width: 20, textAlign: "center" }} title={g.always ? "never rotates" : g.inShop ? "in the shop this week" : "waiting its turn"}>{g.always ? "⭐" : g.inShop ? "🔁" : ""}</span>
                )}
                <button className="btn" data-testid={`gift-save-${g.id}`} disabled={!dirty(g) || busy === g.id} onClick={() => save(g)}
                  style={{ padding: "4px 10px", fontSize: 12 }}>{busy === g.id ? "…" : "Save"}</button>
                {g.hidden
                  ? <button className="ghost" data-testid={`gift-back-${g.id}`} disabled={busy === g.id} onClick={() => void putBack(g)}
                      title="Put it back in the shop" style={{ padding: "4px 8px", fontSize: 12 }}>↩︎ put back</button>
                  : <button className="ghost" data-testid={`gift-remove-${g.id}`} disabled={busy === g.id} onClick={() => void drop(g)}
                      title={g.mine ? "Take it out of the catalogue for good" : "Take it out of the shop — you can put it back"} style={{ padding: "4px 8px", fontSize: 12 }}>🗑</button>}
              </div>
            ))}
            {!shown.length && <div className="muted" style={{ fontSize: 13, paddingTop: 8 }}>Nothing matches that.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}


/**
 * ⏸️ Settings → Paused: stop the world where it stands.
 *
 * Nothing new happens while it is on — no posts, no check-ins, no text she promised, no
 * invitation, no photo coming back. Everything already there stays exactly as it is, and turning
 * it off lets things start up again.
 */
export function PauseCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const on = !!profile.paused;
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    await data("profile.update", { paused: !on }).catch(() => {});
    setBusy(false);
    onChange();
  };
  return (
    <div className="card" data-testid="pause-card" style={on ? { borderColor: "var(--accent)" } : undefined}>
      <div style={{ fontWeight: 700 }}>{on ? "⏸️ Paused" : "▶️ Everything is running"}</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>
        {on
          ? "Nothing new is happening: no posts, no check-ins, nothing anyone promised to send. Everything already here is just as you left it."
          : "Pause and nothing new happens — no posts, no check-ins, no texts first, no photos coming back. What is already here stays as it is."}
      </div>
      <button className={on ? "btn" : "ghost"} disabled={busy} onClick={() => void flip()} data-testid="pause-toggle" style={{ padding: "10px 16px" }}>
        {busy ? "…" : on ? "▶️ Start everything again" : "⏸️ Pause everything"}
      </button>
    </div>
  );
}
