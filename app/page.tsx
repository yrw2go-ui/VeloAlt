"use client";
// Velo — the app shell: sign-in, the four tabs (💬 Chat, ☀️ Today, 🧠 Memory,
// ⚙️ Settings), the 📞 call screen, and due-reminder pop-ups.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, data } from "./lib/api";
import { currentAsk, subscribeAsk } from "./lib/dialog";
import { VeloLogo, VeloLookPicker, applyVeloLook, useVeloLook } from "./avatar";
import VeloCall, { canCallVelo, primeSpeech } from "./call";
import Chat, { type ChatMsg } from "./chat";
import Today from "./today";
import Memory from "./memory";
import { timeZone } from "./lib/tz";
import ProCard, { BrainCard, PersonalityCard, type Profile } from "./pro";

type Tab = "chat" | "today" | "memory" | "settings";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "today", icon: "☀️", label: "Today" },
  { id: "memory", icon: "🧠", label: "Memory" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];
type User = { id: string; email: string };

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: User | null }>("/api/auth", { action: "me" }).then(r => setUser(r.user)).catch(() => setUser(null));
    const out = () => setUser(null);
    window.addEventListener("velo:signed-out", out);
    return () => window.removeEventListener("velo:signed-out", out);
  }, []);
  if (user === undefined) return <Center><VeloLogo size={96} /></Center>;
  if (!user) return <SignIn onIn={setUser} />;
  return <Main key={user.id} userId={user.id} onOut={() => setUser(null)} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>{children}</div>;
}

function SignIn({ onIn }: { onIn: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8;
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMsg("");
    try {
      const r = await api<{ user: User }>("/api/auth", { action: signUp ? "signup" : "signin", email: email.trim().toLowerCase(), password });
      onIn(r.user);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  };
  return (
    <Center>
      <form onSubmit={go} style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <VeloLogo size={112} />
          <h1 style={{ margin: 0, fontSize: 32 }}>Velo</h1>
          <div className="muted" style={{ textAlign: "center" }}>Your personal assistant and companion.</div>
        </div>
        <input type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
        <input type="password" autoComplete={signUp ? "new-password" : "current-password"} placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" />
        <button className="btn" disabled={!valid || busy}>{busy ? "…" : signUp ? "Create account" : "Sign in"}</button>
        {msg && <div style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>{msg}</div>}
        <button type="button" className="ghost" onClick={() => { setSignUp(s => !s); setMsg(""); }}>{signUp ? "I have an account — sign in" : "New here? Create an account"}</button>
      </form>
    </Center>
  );
}

type DueReminder = { id: string; text: string };

function Main({ userId, onOut }: { userId: string; onOut: () => void }) {
  // Back from Stripe checkout / billing: open Settings.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "chat";
    const saved = localStorage.getItem("velo-tab") as Tab;
    const urlTab = new URLSearchParams(location.search).get("tab");
    return (urlTab === "settings" ? "settings" : saved) || "chat";
  });
  useEffect(() => { localStorage.setItem("velo-tab", tab); }, [tab]);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileTick, setProfileTick] = useState(0);
  const [calling, setCalling] = useState(false);
  const [continueTurns, setContinueTurns] = useState<{ role: "user" | "assistant"; content: string }[] | null>(null);
  const [firstCall, setFirstCall] = useState(false);
  const [due, setDue] = useState<DueReminder[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [chatAdd, setChatAdd] = useState<ChatMsg | null>(null);
  const look = useVeloLook();
  const [activeChar, setActiveChar] = useState<{ name: string; image: string }>({ name: "Velo", image: "" });
  useEffect(() => {
    const on = (e: Event) => setActiveChar((e as CustomEvent).detail || { name: "Velo", image: "" });
    window.addEventListener("velo:character", on);
    return () => window.removeEventListener("velo:character", on);
  }, []);
  const bump = useCallback(() => setRefresh(r => r + 1), []);

  // Their profile: name, look, and the time zone they're in now.
  useEffect(() => {
    (async () => {
      const p = await data<Profile & { timeZone: string | null; hadCall: boolean }>("profile.get");
      setProfile(p);
      setName(p.name);
      applyVeloLook(p.look);
      setFirstCall(!p.hadCall);
      if (p.timeZone !== timeZone()) await data("profile.update", { timeZone: timeZone() });
    })().catch(() => {});
  }, [userId, profileTick]);
  // Clean the Stripe return params off the address bar.
  useEffect(() => { if (location.search) history.replaceState(null, "", "/"); }, []);

  // ⏰ Due reminders pop up (checked every 30s and when the app comes back).
  useEffect(() => {
    const check = async () => {
      const { due: now } = await data<{ due: DueReminder[] }>("reminders.due").catch(() => ({ due: [] as DueReminder[] }));
      if (!now.length) return;
      setDue(d => [...d, ...now.filter(r => !d.some(x => x.id === r.id))]);
      bump();
      try { navigator.vibrate?.([120, 80, 120]); } catch { /* no vibration */ }
    };
    check();
    const t = setInterval(check, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [userId, bump]);

  const doneDue = async (id: string) => {
    setDue(d => d.filter(x => x.id !== id));
    await data("reminders.dismiss", { id }).catch(() => {});
    bump();
  };

  const startCall = () => { primeSpeech(); setContinueTurns(null); setCalling(true); };
  const continueCall = (turns: { role: "user" | "assistant"; content: string }[]) => { primeSpeech(); setContinueTurns(turns.slice(-12)); setCalling(true); };
  const callRequest = async (turns: { role: "user" | "assistant"; content: string }[], mode: "talk" | "recap" | "remember") => {
    const r = await api<{ reply: string; changed?: boolean }>("/api/velo", { mode, messages: turns, timeZone: timeZone(), name });
    if (r.changed) bump();
    return r.reply;
  };
  const fetchVoice = async (text: string, _voice: string, lookId: string) => {
    try {
      const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, look: lookId }) });
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", maxWidth: 720, margin: "0 auto" }}>
      <header className="row" style={{ padding: "max(12px, env(safe-area-inset-top)) 16px 12px", borderBottom: "1px solid var(--border)" }}>
        {activeChar.image
          ? <img src={"/api/pic?u=" + encodeURIComponent(activeChar.image)} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
          : <VeloLogo size={40} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{activeChar.name || "Velo"}</div>
          <div className="muted" style={{ fontSize: 12 }}>{name ? `Here for you, ${name.split(" ")[0]}` : "Your assistant & companion"}</div>
        </div>
        {canCallVelo() && <button className="btn" onClick={startCall} aria-label={"Call " + (activeChar.name || "Velo")} data-testid="call-velo" style={{ borderRadius: 999, padding: "10px 16px" }}>📞 {activeChar.name && activeChar.name !== "Velo" ? activeChar.name : "Call"}</button>}
      </header>

      {due.length > 0 && (
        <div data-testid="due-reminders" style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {due.map(r => (
            <div key={r.id} className="card row" style={{ padding: 12, borderColor: "var(--accent)" }}>
              <span style={{ fontSize: 22 }}>⏰</span>
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 12 }}>Reminder</div><div style={{ fontWeight: 700 }}>{r.text}</div></div>
              <button className="btn" onClick={() => doneDue(r.id)} style={{ padding: "8px 14px" }}>Done</button>
            </div>
          ))}
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, overflowY: tab === "chat" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        {tab === "chat" && <Chat userId={userId} name={name} onChanged={bump} added={chatAdd} onContinue={continueCall} />}
        {tab === "today" && <Today refresh={refresh} />}
        {tab === "memory" && <Memory refresh={refresh} />}
        {tab === "settings" && <Settings name={name} setName={setName} onOut={onOut} profile={profile} onProfile={() => setProfileTick(t => t + 1)} />}
      </main>

      <nav style={{ display: "flex", borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)", background: "var(--surface)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
            style={{ flex: 1, background: "none", border: "none", padding: "10px 0 12px", color: tab === t.id ? "var(--accent)" : "var(--muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 700 }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {calling && (
        <VeloCall key={activeChar.name || "Velo"} name={name} who={activeChar.name || "Velo"} faceUrl={activeChar.image} firstCall={firstCall && (activeChar.name || "Velo") === "Velo"} continueFrom={continueTurns || undefined} request={callRequest} fetchVoice={fetchVoice}
          onEnd={(recap) => {
            setCalling(false); setFirstCall(false); setContinueTurns(null);
            if (recap) { setChatAdd({ role: "assistant", content: recap }); setTab("chat"); }
          }} />
      )}
      <ConfirmHost />
    </div>
  );
}

function Settings({ name, setName, onOut, profile, onProfile }: { name: string; setName: (n: string) => void; onOut: () => void; profile: Profile | null; onProfile: () => void }) {
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(name), [name]);
  const dirty = draft.trim() !== name.trim();
  const save = async () => {
    const n = draft.trim().slice(0, 80);
    const ok = await data("profile.update", { name: n }).then(() => true, () => false);
    if (ok) { setName(n); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>What should Velo call you?</div>
        <div className="row">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
          <button className="btn" disabled={!dirty} onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700 }}>🧑 Velo&apos;s look</div>
        <div className="muted" style={{ fontSize: 13, margin: "2px 0 12px" }}>Each face has her own voice on calls.</div>
        <VeloLookPicker />
      </div>
            
            {profile && <PersonalityCard profile={profile} onChange={onProfile} />}
            {profile && <BrainCard profile={profile} onChange={onProfile} />}
      {profile && <ProCard profile={profile} onChange={onProfile} />}
      <button className="ghost" onClick={() => api("/api/auth", { action: "signout" }).finally(onOut)}>Sign out</button>
    </div>
  );
}

function ConfirmHost() {
  const ask = useSyncExternalStore(subscribeAsk, currentAsk, () => null);
  if (!ask) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 3000 }}>
      <div className="card" style={{ maxWidth: 360, width: "100%" }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>{ask.text}</div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => ask.resolve(false)}>Cancel</button>
          <button className="btn" style={ask.danger ? { background: "var(--bad)" } : undefined} onClick={() => ask.resolve(true)}>{ask.yes}</button>
        </div>
      </div>
    </div>
  );
}
