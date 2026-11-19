"use client";
// Velo — the app shell: sign-in, the four tabs (💬 Chat, ☀️ Today, 🧠 Memory,
// ⚙️ Settings), the 📞 call screen, and due-reminder pop-ups.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readPlace, savePlace, type Place } from "./lib/place";
import { useBack } from "./lib/back";
import { api, data } from "./lib/api";
import { VersionCard, UpdateBanner } from "./version";
import { confirmAsk, currentAsk, subscribeAsk } from "./lib/dialog";
import { VeloLogo, VeloLookPicker, applyVeloLook, useVeloLook } from "./avatar";
import VeloCall, { canCallVelo, primeSpeech } from "./call";
import Chat, { type ChatAdd } from "./chat";
type DropIn = { id: string; characterId: string; who: string; portrait: string | null; kind: "door" | "back" | "over"; line: string; hosting: { id: string; name: string } | null; away: { name: string } | null };
import { CallMedia, type Media } from "./media";
import Picagram from "./picagram";
import { CharacterStrip, CharacterEditor, CharacterFace, NewCharacterSheet, type Character } from "./characters";
import Gifts from "./gifts";
import { GroupChat, GroupMaker, type Group } from "./groups";
import Gallery from "./gallery";
import AboutCard from "./about";
import CheckinsCard from "./notify";
import Today from "./today";
import Memory from "./memory";
import { timeZone } from "./lib/tz";
import ProCard, { AdminCard, GiftsAdminCard, BrainCard, PersonalityCard, ReplyLengthCard, VideoCard, WordingCard, type Profile } from "./pro";

type Tab = "chat" | "pica" | "gifts" | "today" | "memory" | "settings";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "pica", icon: "📸", label: "Picagram" },
  { id: "gifts", icon: "🎁", label: "Gifts" },
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
          <VeloLogo size={128} />
          <h1 style={{ margin: 0, fontSize: 32 }}>Velo 2</h1>
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

const urlParam = (k: string) => (typeof location === "undefined" ? null : new URLSearchParams(location.search).get(k));

function Main({ userId, onOut }: { userId: string; onOut: () => void }) {
  // Back from Stripe checkout / billing: open Settings. A tapped notification opens that chat. Otherwise: right where they were.
  const [place] = useState<Place>(() => (typeof window === "undefined" ? {} : readPlace(userId)));
  const [tab, setTab] = useState<Tab>(() => (urlParam("tab") === "settings" ? "settings" : urlParam("chat") ? "chat" : place.tab && TABS.some(t => t.id === place.tab) ? place.tab : "chat"));
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileTick, setProfileTick] = useState(0);
  const [calling, setCalling] = useState(false);
  const [firstCall, setFirstCall] = useState(false);
  const [due, setDue] = useState<DueReminder[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [chatAdd, setChatAdd] = useState<ChatAdd | null>(null);
  const look = useVeloLook();
  // 🎭 Their characters: a chip row above the chat; the open chat is Velo (null) or one character.
  const [chars, setChars] = useState<Character[]>([]);
  const [portraits, setPortraits] = useState(false);
  const [brains, setBrains] = useState<string[]>([]);
  const [brainModels, setBrainModels] = useState<{ id: string; model: string }[]>([]);
  const [admin, setAdmin] = useState(false);
  // ⬅️ Back from any other tab goes to Chat first, and only then out of the app.
  useBack(tab !== "chat", () => setTab("chat"));
  // A tapped notification opens that chat (?chat=<character id>, or "velo").
  const [withId, setWithId] = useState<string | null>(() => { const c = urlParam("chat"); return c ? (c !== "velo" ? c : null) : place.withId || null; });
  const [editing, setEditing] = useState<Character | "new" | null>(null);
  // ✨ ＋ New first asks: make one for me (a filled-in draft), or start from scratch.
  const [newChar, setNewChar] = useState(false);
  const [draft, setDraft] = useState<Partial<Character> | null>(null);
  const [gallery, setGallery] = useState(false);
  const [chatTick, setChatTick] = useState(0);
  useEffect(() => {
    api<{ characters: Character[]; portraits: boolean; admin: boolean; brains?: string[]; brainModels?: { id: string; model: string }[] }>("/api/characters", { action: "list" })
      .then(r => { setChars(r.characters); setPortraits(r.portraits); setAdmin(r.admin); setBrains(r.brains || []); setBrainModels(r.brainModels || []); }).catch(() => {});
  }, [userId, refresh]);
  const withChar = chars.find(c => c.id === withId) || null;
  // 👥 Group chats (you and 2–6 characters).
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(() => (urlParam("chat") ? null : place.groupId || null));
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [makingGroup, setMakingGroup] = useState(false);
  useEffect(() => { if (userId) api<{ groups: Group[] }>("/api/groups", { action: "list" }).then(r => setGroups(r.groups)).catch(() => {}).finally(() => setGroupsLoaded(true)); }, [userId]);
  // 📍 Remember where they are.
  useEffect(() => { savePlace(userId, { tab, withId, groupId }); }, [userId, tab, withId, groupId]);
  // …and how far down they'd scrolled (Today, Memory, Settings): put back once the page has loaded after a reload.
  const mainRef = useRef<HTMLElement>(null);
  const scrollSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoring = useRef(true);
  const onMainScroll = () => {
    if (tab === "chat" || restoring.current) return;
    if (scrollSave.current) clearTimeout(scrollSave.current);
    scrollSave.current = setTimeout(() => { const y = mainRef.current?.scrollTop || 0; savePlace(userId, { scroll: { ...readPlace(userId).scroll, [tab]: y } }); }, 250);
  };
  useEffect(() => {
    const y = tab !== "chat" ? place.scroll?.[tab] || 0 : 0;
    if (!y) { restoring.current = false; return; }
    const started = Date.now();
    const t = setInterval(() => {
      const el = mainRef.current;
      if (el && el.scrollHeight - el.clientHeight >= y - 4) el.scrollTop = y;
      if ((el && Math.abs(el.scrollTop - y) < 4) || Date.now() - started > 4000) { clearInterval(t); restoring.current = false; }
    }, 100);
    return () => { clearInterval(t); restoring.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const inGroup = tab === "chat" && groups.find(g => g.id === groupId) || null;
  const pickChat = (id: string | null) => { setGroupId(null); setWithId(id); };
  // 🔴 Unread counts per chat ("velo" or character id). The open chat is marked read as it updates.
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [picaNew, setPicaNew] = useState(0);
  const [picaOpen, setPicaOpen] = useState<string | null>(null); // a Picagram profile to open
  useEffect(() => {
    const key = withId || "velo";
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (tab === "chat") await data("chats.read", withId ? { characterId: withId } : {}).catch(() => {});
      // 📸 New Picagram posts since they last looked (the tab clears it).
      if (tab !== "pica") api<{ n: number; dms?: number }>("/api/pica", { action: "new" }).then(x => setPicaNew(x.n + (x.dms || 0))).catch(() => {});
      else setPicaNew(0);
      const r = await data<{ unread: Record<string, number> }>("chats.unread").catch(() => null);
      if (!r) return;
      const u = { ...r.unread };
      if (tab === "chat") delete u[key];
      setUnread(u);
      try { const total = Object.values(u).reduce((a, b) => a + b, 0); const n = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }; if (total) n.setAppBadge?.(total); else n.clearAppBadge?.(); } catch { /* no app badge */ }
    };
    tick();
    const t = setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [userId, withId, tab, refresh]);
  const savedChar = (c: Character) => {
    setChars(cs => (cs.some(x => x.id === c.id) ? cs.map(x => (x.id === c.id ? { ...x, ...c } : x)) : [...cs, c]));
    setWithId(c.id);
    // Her chip also shows things the server works out (at work, in class, home) — ask for those again.
    api<{ characters: Character[] }>("/api/characters", { action: "list" }).then(r => setChars(r.characters)).catch(() => {});
  };
  const bump = useCallback(() => setRefresh(r => r + 1), []);

  // Their profile: name, look, and the time zone they're in now.
  useEffect(() => {
    (async () => {
      const p = await data<Profile & { timeZone: string | null; hadCall: boolean }>("profile.get");
      setProfile(p);
      setName(p.name);
      applyVeloLook(p.look, p.customFace || "");
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

  // 🔔 Neighbours. While you're marked home, someone a few doors down might knock, or spot your
  // car and ask you over. Checked every minute; leaving it costs nothing with her.
  const [dropIn, setDropIn] = useState<DropIn | null>(null);
  const hasNeighbor = chars.some(c => c.neighbor && !c.live_in);
  useEffect(() => {
    if (!hasNeighbor) return;
    let stop = false;
    const check = async () => {
      const r = await data<{ dropIn: DropIn | null }>("dropin.check").catch(() => ({ dropIn: null }));
      if (!stop && r.dropIn) setDropIn(d => d || r.dropIn);
    };
    check();
    const t = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [userId, hasNeighbor]);
  // ⏰ A plan whose time has come: start it here, whichever tab you're on.
  type PlanNow = { id: string; title: string; details: string; time?: string; kind: "video" | "person"; character_id?: string; who?: string; portrait?: string | null };
  const [planNow, setPlanNow] = useState<PlanNow | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const r = await data<{ plan: PlanNow | null }>("plan.now").catch(() => ({ plan: null }));
      if (!stop && r.plan) setPlanNow(p => p || r.plan);
    };
    check();
    const t = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [userId]);
  const startPlan = async () => {
    const p = planNow; setPlanNow(null);
    if (!p?.character_id) return;
    setTab("chat"); setGroupId(null); setWithId(p.character_id); setChatTick(t => t + 1);
    setStartPlan({ id: p.id, kind: p.kind, title: p.title, details: p.details });
  };
  const planLater = async () => {
    const p = planNow; setPlanNow(null);
    if (p) await data("plan.later", { id: p.id }).catch(() => {});
  };
  // What the chat should open once it's on screen: the scene sheet, or the in-person one.
  const [startingPlan, setStartPlan] = useState<{ id: string; kind: "video" | "person"; title: string; details: string } | null>(null);

  const answerDoor = async () => {
    if (!dropIn) return;
    const d = dropIn; setDropIn(null);
    const r = await data<{ characterId: string; groupId?: string }>("dropin.answer", { id: d.id }).catch(() => null);
    if (!r) return;
    setTab("chat");
    // 👥 The two of them met in the doorway: everyone carries on together.
    if (r.groupId) { bump(); setWithId(null); setGroupId(r.groupId); return; }
    setGroupId(null); setWithId(r.characterId); setChatTick(t => t + 1);
  };
  const leaveIt = async () => {
    const d = dropIn; setDropIn(null);
    if (d) await data("dropin.ignore", { id: d.id }).catch(() => {});
  };

  const doneDue = async (id: string) => {
    setDue(d => d.filter(x => x.id !== id));
    await data("reminders.dismiss", { id }).catch(() => {});
    bump();
  };

  // 📞 Calls whoever's chat is open: Velo, or that character (in their own voice, with their own memory).
  const [callWith, setCallWith] = useState<Character | null>(null);
  const [callMini, setCallMini] = useState(false);
  // 🎨 Photos/videos sent during the call: shown on the call screen, and saved to that chat.
  const [callMedia, setCallMedia] = useState<Media[]>([]);
  // 📞 She doesn't always pick up: at work, in class, or she just can't talk — then she texts back
  // instead, and the call never starts. (Velo always answers.)
  const [ringing, setRinging] = useState(false);
  const startCall = async () => {
    const who = tab === "chat" ? withChar : null;
    primeSpeech();
    if (who) {
      setRinging(true);
      try {
        const r = await data<{ ok: boolean; say?: string }>("call.try", { characterId: who.id, timeZone: timeZone() });
        if (!r.ok) { setRinging(false); setChatTick(t => t + 1); await confirmAsk(`${who.name} didn't pick up.\n\n"${r.say}"`, { yes: "OK" }); return; }
      } catch { /* if the check itself fails, let the call through */ }
      setRinging(false);
    }
    setCallOpener(null); setCallWith(who); setCallMedia([]); setCallMini(false); setCallBrain(null); setCalling(true);
  };
  // 📞↩ Continue in call: the call picks up the chat — her first line follows on from the last 12 messages.
  const chatHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [callOpener, setCallOpener] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const CONTINUE_MIN = 12;
  const continueCall = async () => {
    if (continuing || chatHistory.current.length < CONTINUE_MIN) return;
    primeSpeech(); setContinuing(true);
    const who = tab === "chat" ? withChar : null;
    const context = chatHistory.current.slice(-CONTINUE_MIN);
    try {
      // Her chat with them comes along on every call; here she just picks up where the last 12 messages left off.
      const r = await api<{ reply: string }>("/api/velo", { mode: "talk", messages: [...context, { role: "user", content: "(They just called you to keep talking — you're on the phone now. Say your first line: pick up naturally right where the chat left off, short and warm. Don't mention apps or that you were told to.)" }], timeZone: timeZone(), name, ...(who ? { characterId: who.id } : {}) });
      setCallOpener(r.reply || null);
      setCallWith(who); setCallMedia([]); setCallMini(false); setCallBrain(null); setCalling(true);
    } catch (e) { await confirmAsk(e instanceof Error ? e.message : "Couldn't start the call.", { yes: "OK" }); }
    finally { setContinuing(false); }
  };
  // Unfinished photos/videos keep getting finished in the background while the app is open.
  useEffect(() => {
    const sweep = () => { if (document.visibilityState === "visible") data("media.sweep").catch(() => {}); };
    const t = setInterval(sweep, 30_000);
    sweep();
    return () => clearInterval(t);
  }, [userId]);
  const [callBrain, setCallBrain] = useState<"👍" | "⏰" | null>(null);
  const callRequest = async (turns: { role: "user" | "assistant"; content: string }[], mode: "talk" | "recap" | "remember") => {
    const thread = callWith ? { characterId: callWith.id } : {};
    // (The server gives every call her text chat with them, so the call only sends its own turns.)
    const r = await api<{ reply: string; changed?: boolean; media?: Media[]; by?: "claude" | "alt" }>("/api/velo", { mode, messages: turns, timeZone: timeZone(), name, ...thread });
    // 👍 her own brain (Qwen / DeepSeek) answered, ⏰ Claude stepped in.
    if (mode === "talk" && callWith?.brain && callWith.brain !== "claude" && r.by) setCallBrain(r.by === "alt" ? "👍" : "⏰");
    if (r.changed) bump();
    const sent = (r.media || []).filter(m => m.status !== "failed");
    if (sent.length) setCallMedia(list => [...list, ...sent]);
    return r.reply;
  };
  const fetchVoice = async (text: string, _voice: string, lookId: string) => {
    try {
      const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, look: lookId, ...(callWith ? { characterId: callWith.id } : {}) }) });
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  };

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", width: "100%", minWidth: 0, maxWidth: "min(720px, 100%)", margin: "0 auto" }}>
      {calling && callMini && <div aria-hidden style={{ height: "calc(max(8px, env(safe-area-inset-top)) + 50px)", flexShrink: 0 }} />}
      <header className="row" style={{ gap: 8, width: "100%", minWidth: 0, maxWidth: "100%", flexShrink: 0, padding: "max(6px, env(safe-area-inset-top)) 12px 6px", borderBottom: "1px solid var(--border)" }}>
        <VeloLogo size={32} />
        <div className="row" style={{ flex: 1, minWidth: 0, gap: 6, alignItems: "baseline" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Velo 2</div>
          <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name ? `Here for you, ${name.split(" ")[0]}` : "Your assistant & companion"}</div>
        </div>
        {canCallVelo() && !calling && tab === "chat" && !inGroup && (
          <button className="ghost" onClick={continueCall} disabled={continuing || historyCount < CONTINUE_MIN} data-testid="continue-call"
            title={historyCount < CONTINUE_MIN ? `Chat a little more first (${historyCount}/${CONTINUE_MIN} messages)` : "Call and pick up where the chat left off"}
            aria-label={`Continue the chat in a call with ${withChar ? withChar.name : "Velo"}`} style={{ borderRadius: 999, padding: "4px 10px", fontSize: 12, lineHeight: 1.1, whiteSpace: "nowrap", flexShrink: 0 }}>
            {continuing ? "…" : "📞↩ Continue"}</button>
        )}
        {canCallVelo() && !calling && !inGroup && <button className="btn" onClick={startCall} disabled={ringing} aria-label={`Call ${tab === "chat" && withChar ? withChar.name : "Velo"}`} data-testid="call-velo" style={{ borderRadius: 999, padding: "6px 14px", fontSize: 14 }}>{ringing ? "📞 …" : "📞 Call"}</button>}
      </header>

      <UpdateBanner />
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

        {planNow && (
        <div role="dialog" aria-modal="true" data-testid="plan-now" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 4000 }}>
            <div className="card" style={{ maxWidth: 380, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{planNow.kind === "person" ? "🧍" : "🎥"} It&apos;s time{planNow.time ? ` — ${planNow.time}` : ""}</div>
              <div style={{ fontSize: 15 }}>{planNow.title}{planNow.who ? ` with ${planNow.who}` : ""}</div>
              {planNow.details && <div className="muted" style={{ fontSize: 13 }}>{planNow.details}</div>}
              <div className="muted" style={{ fontSize: 12 }}>{planNow.kind === "person" ? "You two are meeting up — she'll be there with you." : "You two are getting on a video chat."}</div>
              <div className="row" style={{ gap: 8 }}>
                <button className="ghost" onClick={planLater} data-testid="plan-now-later" style={{ flex: 1, padding: "10px 14px" }}>Not now</button>
                <button className="btn" onClick={startPlan} data-testid="plan-now-start" style={{ flex: 1, padding: "10px 14px" }}>{planNow.kind === "person" ? "Meet up" : "Start the video chat"}</button>
              </div>
            </div>
          </div>
        )}
      {dropIn && (
        <div role="dialog" aria-modal="true" data-testid="dropin" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 2700 }}>
          <div className="card" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              {dropIn.portrait
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={dropIn.portrait} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
                : <span style={{ fontSize: 34 }}>{dropIn.kind === "door" ? "🔔" : "🏡"}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{dropIn.kind === "over" ? `${dropIn.who} saw your car` : dropIn.kind === "back" ? `${dropIn.who} is at your back door` : `${dropIn.who} is at your door`}</div>
                <div className="muted" style={{ fontSize: 12 }}>{dropIn.kind === "over" ? "She's asking you over." : dropIn.kind === "back" ? "Round the back, where nobody sees her." : "She lives a few doors down."}</div>
              </div>
            </div>
            <div data-testid="dropin-line" style={{ fontSize: 15, padding: "10px 12px", borderRadius: 12, background: "var(--surface2)" }}>{dropIn.line}</div>
            {dropIn.hosting && dropIn.kind !== "over" && (
              <div data-testid="dropin-hosting" style={{ fontSize: 12, padding: "8px 10px", borderRadius: 10, background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.45)" }}>
                ⚠️ {dropIn.hosting.name} is here with you. Open that door and they might end up meeting.
              </div>
            )}
            {/* 🚶 You're round at someone else's: you can't answer your own door from there. */}
            {dropIn.away && (
              <div data-testid="dropin-away" style={{ fontSize: 12, padding: "8px 10px", borderRadius: 10, background: "rgba(96,165,250,.15)", border: "1px solid rgba(96,165,250,.45)" }}>
                🚶 You&apos;re round at {dropIn.away.name}&apos;s — you&apos;re not home to answer it.
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="ghost" onClick={leaveIt} data-testid="dropin-no" style={{ flex: 1, padding: "10px 14px" }}>{dropIn.away ? "OK" : "Not right now"}</button>
              {!dropIn.away && <button className="btn" onClick={answerDoor} data-testid="dropin-yes" style={{ flex: 1, padding: "10px 14px" }}>{dropIn.kind === "over" ? "🚶 Head over" : "🚪 Answer the door"}</button>}
            </div>
            <div className="muted" style={{ fontSize: 11, textAlign: "center" }}>{dropIn.away ? `${dropIn.who} will text to say she called by.` : "Leaving it is fine — she never knows you were standing there."}</div>
          </div>
        </div>
      )}

      <main ref={mainRef} onScroll={onMainScroll} style={{ flex: 1, width: "100%", minWidth: 0, maxWidth: "100%", minHeight: 0, overflowX: "hidden", overflowY: tab === "chat" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        {tab === "chat" && <CharacterStrip characters={chars} active={withChar?.id || null} admin={admin} onPick={pickChat} onNew={() => setNewChar(true)} onEdit={setEditing} onGallery={() => setGallery(true)} unread={unread}
          groups={groups} activeGroup={inGroup?.id || null} onPickGroup={setGroupId} onNewGroup={() => setMakingGroup(true)} />}
        {inGroup && <GroupChat key={inGroup.id} group={inGroup} chars={chars} name={name} brains={brains} onDeleted={id => { setGroups(gs => gs.filter(g => g.id !== id)); setGroupId(null); }} />}
        {tab === "chat" && !inGroup && !(groupId && !groupsLoaded) && <Chat key={`${withChar?.id || "velo"}-${chatTick}`} startPlan={startingPlan} onPlanStarted={() => setStartPlan(null)} brains={brains} userId={userId} name={name} onChanged={bump} added={chatAdd} onAdded={() => setChatAdd(null)} character={withChar} adult={!!profile?.adultConfirmed} onAdult={() => setProfileTick(t => t + 1)} onHistory={h => { chatHistory.current = h; setHistoryCount(h.length); }}
          onNewCharacter={() => api<{ characters: Character[] }>("/api/characters", { action: "list" }).then(r => setChars(r.characters)).catch(() => {})}
          others={chars.map(c => ({ id: c.id, name: c.name, pica_handle: c.pica_handle || null }))} onSocial={id => { setPicaOpen(id); setTab("pica"); }} onGroup={g => { setGroups(gs => [g, ...gs.filter(x => x.id !== g.id)]); setGroupId(g.id); }} />}
        {tab === "pica" && <Picagram name={name} userId={userId} openProfile={picaOpen} onProfileOpened={() => setPicaOpen(null)} onChat={id => api<{ characters: Character[] }>("/api/characters", { action: "list" }).then(r => { setChars(r.characters); setTab("chat"); pickChat(id); }).catch(() => {})} />}
        {tab === "gifts" && <Gifts />}
        {tab === "today" && <Today refresh={refresh} />}
        {tab === "memory" && <Memory refresh={refresh} />}
        {tab === "settings" && <Settings name={name} setName={setName} onOut={onOut} profile={profile} onProfile={() => setProfileTick(t => t + 1)}
          chars={chars} admin={admin} brains={brains} brainModels={brainModels} onCharChange={c => setChars(cs => cs.map(x => (x.id === c.id ? { ...x, brain: c.brain } : x)))} />}
      </main>

      <nav style={{ display: "flex", width: "100%", minWidth: 0, maxWidth: "100%", flexShrink: 0, borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)", background: "var(--surface)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
            style={{ flex: "1 1 0", minWidth: 0, maxWidth: "100%", overflow: "hidden", background: "none", border: "none", padding: "10px 0 12px", color: tab === t.id ? "var(--accent)" : "var(--muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 700 }}>
            <span style={{ fontSize: 20, position: "relative" }}>{t.icon}
              {t.id === "pica" && picaNew > 0 && tab !== "pica" && <span data-testid="pica-badge" aria-label={`${picaNew} new posts`} style={{ position: "absolute", top: -6, right: -14, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: "18px", textAlign: "center" }}>{picaNew > 99 ? "99+" : picaNew}</span>}
            </span>{t.label}
          </button>
        ))}
      </nav>

      {calling && (
        <VeloCall key={look + (callWith?.id || "")} name={name} firstCall={!callWith && firstCall} request={callRequest} fetchVoice={fetchVoice} brainBadge={callBrain}
          voice={callWith ? callWith.voice_kind : undefined}
          opener={callOpener || (callWith ? `Hey${name ? ` ${name.split(" ")[0]}` : ""}, it's ${callWith.name}! What's going on?` : undefined)}
          who={callWith ? { name: callWith.name, face: (size: number) => <CharacterFace c={callWith} size={size} /> } : undefined}
          mini={callMini} onMinimize={() => setCallMini(true)} onExpand={() => setCallMini(false)}
          onEnd={(recap) => {
            setCalling(false); setCallMini(false); if (!callWith) setFirstCall(false);
            // Photos/videos from the call are in the chat: show them right away.
            if (!recap) setChatTick(t => t + 1);
            if (recap) { setChatAdd({ msg: { role: "assistant", content: recap }, cid: callWith?.id || null }); setWithId(callWith?.id || null); setTab("chat"); }
          }} />
      )}
      {calling && <CallMedia items={callMedia} name={callWith?.name || "Velo"} />}
      {gallery && <Gallery key={withChar?.id || "velo"} characterId={withChar?.id || null} name={withChar?.name || "Velo"} onClose={() => setGallery(false)} />}
      {editing && (
        <CharacterEditor key={editing === "new" ? `new-${draft?.name || ""}` : editing.id} initial={editing === "new" ? null : editing} draft={editing === "new" ? draft : null} portraits={portraits} brains={brains} brainModels={brainModels}
          onClose={() => setEditing(null)} onSaved={savedChar}
          onSocial={id => { setEditing(null); setPicaOpen(id); setTab("pica");
            api<{ characters: Character[] }>("/api/characters", { action: "list" }).then(r => setChars(r.characters)).catch(() => {}); }}
          onDeleted={id => { setChars(cs => cs.filter(c => c.id !== id)); setWithId(null); setEditing(null); }}
          onDuplicated={c => { setChars(cs => [...cs, c]); setEditing(c); }} />
      )}
      {makingGroup && <GroupMaker chars={chars} name={name} onClose={() => setMakingGroup(false)} onMade={g => { setGroups(gs => [g, ...gs]); setGroupId(g.id); setMakingGroup(false); }} />}
      {newChar && <NewCharacterSheet onClose={() => setNewChar(false)} onBlank={() => { setDraft(null); setNewChar(false); setEditing("new"); }} onDraft={d => { setDraft(d); setNewChar(false); setEditing("new"); }} />}
      <ConfirmHost />
    </div>
  );
}

function Settings({ name, setName, onOut, profile, onProfile, chars = [], admin = false, brains = [], brainModels = [], onCharChange }: { name: string; setName: (n: string) => void; onOut: () => void; profile: Profile | null; onProfile: () => void; chars?: Character[]; admin?: boolean; brains?: string[]; brainModels?: { id: string; model: string }[]; onCharChange?: (c: { id: string; brain?: string }) => void }) {
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
    <div style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>What should Velo call you?</div>
        <div className="row">
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
          <button className="btn" disabled={!dirty} onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700 }}>🧑 Velo&apos;s look</div>
        <div className="muted" style={{ fontSize: 13, margin: "2px 0 12px" }}>Each face has her own voice on calls. You can also upload your own picture (she keeps the default voice).</div>
        <VeloLookPicker />
      </div>
      {profile && <AboutCard profile={profile} onChange={onProfile} />}
      {profile && <CheckinsCard profile={profile} onChange={onProfile} />}
      {profile && <PersonalityCard profile={profile} onChange={onProfile} />}
      {profile && <BrainCard profile={profile} onChange={onProfile} chars={chars} admin={admin} brains={brains} brainModels={brainModels} onCharChange={onCharChange} />}
      {profile && <ReplyLengthCard profile={profile} onChange={onProfile} />}
      {profile && <VideoCard profile={profile} onChange={onProfile} />}
      <WordingCard />
      {admin && <GiftsAdminCard />}
      {admin && <AdminCard />}
      {profile && <ProCard profile={profile} onChange={onProfile} />}
      <button className="ghost" onClick={() => api("/api/auth", { action: "signout" }).finally(onOut)}>Sign out</button>
      <VersionCard />
    </div>
  );
}

function ConfirmHost() {
  const ask = useSyncExternalStore(subscribeAsk, currentAsk, () => null);
  useBack(!!ask, () => ask?.resolve(false)); // back is the same as Cancel
  if (!ask) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 5000 }}>
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
