"use client";
// ⭐ Settings → Velo Pro: upgrade / manage billing, Velo's own number, your
// phone (verified by a text code, so Velo knows it's you), and contacts.
import { useEffect, useState } from "react";
import { api, data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { formatPhone, contactProblem } from "./lib/contact";

export type Profile = { name: string; look: string; plan: "free" | "pro"; proForSale: boolean; phone: string; phoneVerified: boolean; veloNumber: string };
type Contact = { id: string; name: string; phone: string };

const PERKS = [
  "📱 Velo gets her own phone number",
  "✉️ She texts people for you",
  "📞 She calls businesses and people for you — bookings, appointments, questions — and reports back",
  "💬 Text or call Velo any time, like a person",
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
