"use client";
// 💬 The chat with Velo. Messages are saved to velo_messages (so the chat
// follows them across devices). When they leave the app after chatting, Velo
// files a short summary and any new goals/facts in her memory ("memo").
import { useCallback, useEffect, useRef, useState } from "react";
import { api, data, uploadFile } from "./lib/api";
import { VeloAvatar } from "./avatar";
import DraftCard, { type Draft } from "./drafts";
import { hideSecrets } from "./lib/secrets";
import { timeZone } from "./lib/tz";
import { confirmAsk } from "./lib/dialog";
import { useDictation } from "./dictate";
import { CharacterFace } from "./characters";
import { MediaView, ReactionBar, type Media } from "./media";

/** Who this chat is with: Velo (no character) or one of their characters. */
export type ChatWith = { id: string; name: string; portrait_url: string | null; romantic?: boolean };

export type ChatFile = { id: string; url: string; thumb?: string | null; name: string; type: string };
export type ChatMsg = { id?: string; role: "user" | "assistant"; content: string; peek?: boolean; draft?: Draft; file?: ChatFile; media?: Media; reaction?: string | null; theirReaction?: string | null };
/** How a sent photo/video reads in the history the AI sees. */
export const mediaNote = (m: Media) => {
  const what = m.kind === "image" ? "photo" : "video", d = m.description ? `"${m.description}"` : "";
  return m.status === "offered" ? `(offered to send a ${what}${d ? `: ${d}` : ""} — waiting for their OK)` : m.status === "declined" ? `(offered a ${what}${d ? ` (${d})` : ""} — they said no thanks)` : `(sent a ${what}${d ? `: ${d}` : ""})`;
};
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain";
/** What Velo sees: real messages only (draft cards are local to the screen). */
// Their messages since the last memo. Kept outside the component so switching tabs doesn't reset it.
// One count per chat (Velo's and each character's), since each keeps its own memory.
const unsavedBy = new Map<string, number>();
// Reactions travel with the history, so she knows what they reacted to (and what she did).
const withReactions = (x: ChatMsg) => x.role === "assistant" && x.reaction ? `${x.content}\n(they reacted ${x.reaction} to this)` : x.role === "user" && x.theirReaction ? `${x.content}\n(you reacted ${x.theirReaction})` : x.content;
const realMsgs = (m: ChatMsg[]) => m.filter(x => !x.draft && !x.peek).map(x => ({ role: x.role, content: withReactions(x), ...(x.file ? { fileId: x.file.id } : {}) }));
const INTRO = "Hi, I'm Velo! 👋 I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
const HELLO = (n: string) => [`Hey${n ? ` ${n}` : ""}! What's on your mind?`, `Hi${n ? ` ${n}` : ""} — how's your day going?`, `Hey${n ? ` ${n}` : ""}, good to see you. What can I do for you?`];
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

/** A message to drop into one chat (a call recap): cid null = Velo's chat. */
export type ChatAdd = { msg: ChatMsg; cid: string | null };

export default function Chat({ userId, name, onChanged, added, onAdded, character, adult = false, onAdult }: { userId: string; name: string; onChanged: () => void; added: ChatAdd | null; onAdded?: () => void; character?: ChatWith | null; adult?: boolean; onAdult?: () => void }) {
  const cid = character?.id || null;
  const thread = cid ? { characterId: cid } : {};
  const who = character?.name || "Velo";
  const key = cid || "velo";
  const unsaved = { get current() { return unsavedBy.get(key) || 0; }, set current(v: number) { unsavedBy.set(key, v); } };
  const face = (size: number) => (character ? <CharacterFace c={character} size={size} /> : <VeloAvatar size={size} />);
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState("");
  const mic = useDictation(setText);
  // The box grows with the message (typed or spoken), up to about 5 lines.
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }, [text]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 📎 A file picked to go with the next message (already saved; sent with Send).
  const [attach, setAttach] = useState<ChatFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true); setErr("");
    try { const s = await uploadFile(f, "chat"); setAttach({ id: s.id, url: s.url, thumb: s.thumb_url || null, name: s.name, type: s.content_type }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload didn't go through."); }
    finally { setUploading(false); if (picker.current) picker.current.value = ""; }
  };
  // A call finished: Velo's report landed in the chat (draft cards stay where they are).
  const reload = useCallback(() => {
    data<{ messages: ChatMsg[] }>("messages.list", thread).then(r => setMsgs(m => {
      // Fresh history from the server; each card goes back after the message it followed.
      const out = [...r.messages];
      let anchor: ChatMsg | undefined;
      const after = new Map<ChatMsg | undefined, ChatMsg[]>();
      for (const x of m || []) { if (x.draft) after.set(anchor, [...(after.get(anchor) || []), x]); else anchor = x; }
      for (const [a, cards] of after) {
        const i = a ? out.map(x => x.content).lastIndexOf(a.content) : -1;
        out.splice(i >= 0 ? i + 1 : out.length, 0, ...cards);
      }
      return out;
    })).catch(() => {});
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>([]);
  const [hello] = useState(() => Math.floor(Math.random() * 3));
  msgsRef.current = msgs || [];

  useEffect(() => {
    // History, then drafts still waiting for a Send and calls still going.
    Promise.all([
      data<{ messages: ChatMsg[] }>("messages.list", thread).then(r => r.messages).catch(() => [] as ChatMsg[]),
      // Drafts (texts, calls, posts) are Velo's; characters can't send anything.
      cid ? Promise.resolve([] as Draft[]) : data<{ drafts: Draft[] }>("drafts.list").then(r => r.drafts).catch(() => [] as Draft[]),
    ]).then(([m, d]) => setMsgs([...m, ...d.filter(x => x.status === "pending" || x.status === "calling").map(draft => ({ role: "assistant" as const, content: "", draft }))]));
  }, [userId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  // A call recap lands in the chat.
  useEffect(() => {
    if (!added || added.cid !== cid) return;
    setMsgs(m => [...(m || []), added.msg]);
    // Saved, then the chat refreshes (brings in photos/videos sent during a call).
    data("messages.add", { ...thread, messages: [added.msg] }).then(() => reload()).catch(() => {});
    onAdded?.();
  }, [added, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🧠 Leaving the app after a chat: Velo remembers what mattered.
  useEffect(() => {
    // 🧠 Each chat files into its own memory: Velo's, or this character's.
    const memo = () => {
      if (unsaved.current < 2 || document.visibilityState !== "hidden") return;
      unsaved.current = 0;
      api("/api/velo", { mode: "memo", messages: realMsgs(msgsRef.current).slice(-40), timeZone: timeZone(), name, ...thread }).catch(() => {});
    };
    document.addEventListener("visibilitychange", memo);
    return () => document.removeEventListener("visibilitychange", memo);
  }, [name, cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (raw: string) => {
    if (mic.listening) mic.stop();
    // 🔒 Passwords and codes are hidden right here, before anything leaves the phone.
    const t = hideSecrets(raw.trim()).text;
    const file = attach;
    if ((!t && !file) || busy || uploading || !msgs) return;
    // 👀 Scene peek: "let me see her", "I wanna see her", or "*peek*" — silent image of the moment. She never knows.
    if (cid && scene && !file && /^\s*(\*peek\*|let me see (her|you|him)|i wanna see (her|you|him)|show me (her|you|him))\s*[.!?]*$/i.test(t)) {
      const mine: ChatMsg = { role: "user", content: t, peek: true };
      setMsgs([...msgs, mine]); setText(""); setBusy(true); setErr("");
      try {
        const r = await data<{ media: Media; userMsgId: string; mediaMsgId: string }>("scene.peek", { characterId: cid });
        setMsgs(list => [...(list || []).map(x => (x === mine ? { ...x, id: r.userMsgId } : x)), { id: r.mediaMsgId, role: "assistant", content: "(peek)", media: r.media, peek: true }]);
      } catch (e) {
        setMsgs(list => (list || []).filter(x => x !== mine));
        setErr(e instanceof Error ? e.message : "Couldn't peek right now.");
      } finally { setBusy(false); }
      return;
    }
    const opener: ChatMsg[] = msgs.length || cid ? [] : [{ role: "assistant", content: openingLine }];
    const mine: ChatMsg = { role: "user", content: t || "📎", ...(file ? { file } : {}) };
    const next = [...msgs, ...opener, mine];
    setMsgs(next); setText(""); setAttach(null); setBusy(true); setErr("");
    unsaved.current++;
    const saved = await data<{ ids?: string[] }>("messages.add", { ...thread, messages: [...opener, { role: "user", content: mine.content, ...(file ? { fileId: file.id } : {}) }] }).catch(() => ({ ids: [] as string[] }));
    // Their message gets its id (for reactions), so a reaction from her can land on it.
    const myId = saved.ids?.at(-1);
    if (myId) { mine.id = myId; setMsgs(list => (list || []).map(x => (x === mine ? { ...x, id: myId } : x))); }
    await respond(next, myId);
  };

  /** Her reply to the chat so far (after their message, or after a 🎬 scene note). */
  const respond = async (next: ChatMsg[], myId?: string) => {
    setBusy(true); setErr("");
    try {
      const r = await api<{ reply: string; changed?: boolean; drafts?: Draft[]; media?: Media[]; react?: string }>("/api/velo", { mode: "chat", messages: realMsgs(next), timeZone: timeZone(), name, ...thread, ...(myId ? { replyTo: myId } : {}) });
      if (r.react) setMsgs(list => (list || []).map(x => (x.id && x.id === myId ? { ...x, theirReaction: r.react } : x)));
      // 🎨 Photos/videos being made show up right under the reply and fill in when ready.
      const sent: ChatMsg[] = (r.media || []).filter(x => x.status !== "failed").map(media => ({ role: "assistant", content: mediaNote(media), media }));
      const replyMsg: ChatMsg = { role: "assistant", content: r.reply };
      setMsgs(m => [...(m || []), replyMsg, ...sent, ...(r.drafts || []).map(draft => ({ role: "assistant" as const, content: "", draft }))]);
      // Free the box as soon as her reply shows; saving it can finish in the background.
      setBusy(false);
      const s2 = await data<{ ids?: string[] }>("messages.add", { ...thread, messages: [{ role: "assistant", content: r.reply }] }).catch(() => ({ ids: [] as string[] }));
      const replyId = s2.ids?.[0];
      if (replyId) setMsgs(list => (list || []).map(x => (x === replyMsg ? { ...x, id: replyId } : x)));
      if (r.changed) onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${who} didn't answer.`);
    } finally { setBusy(false); }
  };

  // 🎬 Scenes: a date or outing, played out here, or something that already happened.
  const [scene, setScene] = useState<{ id: string; title: string; details: string } | null>(null);
  const [sceneSheet, setSceneSheet] = useState(false);
  // 📅 A hangout/date you two planned for today: set the scene for it.
  type Plan = { id: string; title: string; details: string; day: string };
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fromPlan, setFromPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!cid) return;
    data<{ scene: { id: string; title: string; details: string } | null }>("scene.active", { characterId: cid }).then(r => setScene(r.scene)).catch(() => {});
    data<{ plans: Plan[] }>("plans.due", { characterId: cid, today: todayYmd() }).then(r => setPlans(r.plans)).catch(() => {});
  }, [cid, userId]);
  const skipPlan = async (p: Plan) => {
    setPlans(ps => ps.filter(x => x.id !== p.id));
    await data("plans.skip", { planId: p.id }).catch(() => {});
  };
  const startScene = async (kind: "live" | "past", title: string, details: string) => {
    const r = await data<{ scene?: { id: string; title: string; details: string }; marker: ChatMsg }>(kind === "live" ? "scene.start" : "scene.past", { characterId: cid, title, details, ...(fromPlan ? { planId: fromPlan.id } : {}) });
    if (fromPlan) setPlans(ps => ps.filter(x => x.id !== fromPlan.id));
    setFromPlan(null);
    setSceneSheet(false);
    if (kind === "live" && r.scene) setScene(r.scene);
    unsaved.current++;
    const next = [...msgsRef.current, r.marker];
    setMsgs(next);
    await respond(next);
  };
  const endScene = async () => {
    if (!(await confirmAsk(`End the scene "${scene?.title}"? It'll become a memory you both have.`, { yes: "End scene" }))) return;
    try {
      const r = await data<{ marker: ChatMsg }>("scene.end", { characterId: cid });
      setScene(null);
      const next = [...msgsRef.current, r.marker];
      setMsgs(next);
      // She files it away (summary, feelings, trust), then says something about it.
      api("/api/velo", { mode: "memo", messages: realMsgs(next).slice(-40), timeZone: timeZone(), name, ...thread }).catch(() => {});
      unsaved.current = 0;
      await respond(next);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't end the scene."); }
  };

  // 🤝 Her trust in them (a small meter at the top of a character's chat).
  const [trust, setTrust] = useState<number | null>(null);
  useEffect(() => {
    if (!cid) return;
    data<{ trust: number | null }>("relationship.get", { characterId: cid }).then(r => setTrust(r.trust)).catch(() => {});
  }, [cid, userId]);

  // 😮 React to one of her messages (tap it). Tap the same one again to take it back.
  const reactMsg = async (id: string, emoji: string) => {
    const cur = msgsRef.current.find(x => x.id === id);
    if (!cur) return;
    const next = cur.reaction === emoji ? null : emoji;
    const set = (r: string | null) => setMsgs(list => (list || []).map(x => (x.id === id ? { ...x, reaction: r } : x)));
    set(next);
    try { await data("messages.react", { id, reaction: next }); } catch { set(cur.reaction || null); }
  };

  // 💬 A photo/video arrived: they say something about it ("What do you think?"), right under it.
  const mediaArrived = (x: Media) => {
    setMsgs(list => (list || []).map(y => (y.media?.id === x.id ? { ...y, media: { ...y.media, ...x } } : y)));
    if (x.caption) setMsgs(list => {
      const all = list || [];
      const at = all.findIndex(y => y.media?.id === x.id);
      if (at < 0 || all[at + 1]?.content === x.caption) return all;
      return [...all.slice(0, at + 1), { role: "assistant", content: x.caption! }, ...all.slice(at + 1)];
    });
    setTimeout(() => end.current?.scrollIntoView({ block: "end" }), 50);
  };
  // ❤️ They reacted to a photo/video: it's saved where Velo/the character sees it, and sometimes they answer.
  const react = async (id: string, emoji: string) => {
    const msg = msgsRef.current.find(x => x.media?.id === id);
    const cur = msg?.media;
    if (!cur) return;
    // Peeks are silent — she never sees them or reacts to them.
    if (msg?.peek) {
      const next = cur.reaction === emoji ? null : emoji;
      setMsgs(list => (list || []).map(x => (x.media?.id === id ? { ...x, media: { ...x.media!, reaction: next } } : x)));
      await data("media.react", { id, reaction: next }).catch(() => {});
      return;
    }
    const next = cur.reaction === emoji ? null : emoji;
    const set = (reaction: string | null, content?: string) => setMsgs(list => (list || []).map(x => (x.media?.id === id ? { ...x, ...(content ? { content } : {}), media: { ...x.media!, reaction } } : x)));
    set(next);
    let note = "";
    try { note = (await data<{ note: string }>("media.react", { id, reaction: next })).note; set(next, note); }
    catch { set(cur.reaction || null); return; }
    if (!next || busy || Math.random() > 0.55) return;
    setBusy(true);
    try {
      const history = realMsgs(msgsRef.current.map(x => (x.media?.id === id ? { ...x, content: note } : x)));
      const ask = `(They just reacted ${next} to the ${cur.kind === "image" ? "photo" : "video"} you sent. React back naturally in one short line — a few words or an emoji is fine. Don't send anything new.)`;
      const r = await api<{ reply: string }>("/api/velo", { mode: "chat", messages: [...history, { role: "user", content: ask }], timeZone: timeZone(), name, ...thread });
      if (r.reply) {
        setMsgs(list => [...(list || []), { role: "assistant", content: r.reply }]);
        await data("messages.add", { ...thread, messages: [{ role: "assistant", content: r.reply }] }).catch(() => {});
      }
    } catch { /* a reaction reply is a bonus; skip it on errors */ }
    finally { setBusy(false); }
  };
  // 💕 A romantic character: romance (PG-13) needs a one-time 18+ confirmation; until then it's friendly.
  const [skipRomance, setSkipRomance] = useState(false);
  const confirmAdult = async () => {
    if (!(await confirmAsk(`${character?.name} is a romantic character (PG-13: flirty and affectionate, never explicit). Romance is for adults. Are you 18 or older?`, { yes: "I'm 18 or older" }))) return;
    try { await data("profile.update", { adultConfirmed: true }); onAdult?.(); } catch { setErr("Couldn't save that. Try again."); }
  };
  const openingLine = msgs && !msgs.length && !name ? INTRO : HELLO(name.split(" ")[0])[hello];
  const shown: ChatMsg[] = msgs && !msgs.length && !cid ? [{ role: "assistant", content: openingLine }] : msgs || [];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {character?.romantic && !adult && !skipRomance && (
        <div data-testid="romance-confirm" className="row" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(236,72,153,0.10)", fontSize: 13, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>💕 {character.name} is a romantic character. Confirm you&apos;re 18+ to unlock romance (PG-13) — until then {character.name} keeps it friendly.</div>
          <button className="btn" onClick={confirmAdult} style={{ padding: "6px 12px", fontSize: 13 }}>I&apos;m 18+</button>
          <button className="ghost" onClick={() => setSkipRomance(true)} aria-label="Keep it friendly" style={{ padding: "6px 10px", fontSize: 13 }}>Not now</button>
        </div>
      )}
      {character && trust !== null && (
        <div data-testid="trust-meter" title="How much she trusts you — it grows with honesty and consistency" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <span>🤝 {character.name}&apos;s trust</span>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
            <div style={{ width: `${trust}%`, height: "100%", borderRadius: 999, background: trust >= 70 ? "#10b981" : trust >= 40 ? "#f59e0b" : "#ef4444", transition: "width .4s" }} />
          </div>
          <span className="muted" style={{ minWidth: 30, textAlign: "right" }}>{trust}%</span>
        </div>
      )}
      {character && scene && (
        <div data-testid="scene-banner" className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.12))", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🎬 <b>{scene.title}</b></span>
          <button className="ghost" onClick={endScene} disabled={busy} data-testid="scene-end" style={{ padding: "4px 10px", fontSize: 12 }}>End scene</button>
        </div>
      )}
      {character && !scene && plans[0] && (
        <div data-testid="plan-card" style={{ margin: "10px 14px 0", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(236,72,153,.4)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.14))", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14 }}>📅 <b>{plans[0].day === todayYmd() ? "Today" : "You had plans"}:</b> {plans[0].title}{plans[0].details ? <span className="muted"> — {plans[0].details}</span> : null}</div>
          <div className="muted" style={{ fontSize: 12 }}>Describe the scene — where you are, the vibe, what you&apos;re wearing — and play it out with {character.name}.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="plan-start" disabled={busy || !msgs} onClick={() => { setFromPlan(plans[0]); setSceneSheet(true); }} style={{ padding: "8px 14px", fontSize: 13 }}>🎬 Set the scene</button>
            <button className="ghost" data-testid="plan-skip" onClick={() => skipPlan(plans[0])} style={{ padding: "8px 12px", fontSize: 13 }}>Not today</button>
          </div>
        </div>
      )}
      {sceneSheet && character && <SceneSheet key={fromPlan?.id || "new"} who={character.name} plan={fromPlan} onClose={() => { setSceneSheet(false); setFromPlan(null); }} onStart={startScene} />}
      <div data-testid="chat-log" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((m, i) => m.draft ? <DraftCard key={m.draft.id} d={m.draft} onReport={reload} /> : <Bubble key={m.media?.id || m.id || i} m={m} onReactMsg={reactMsg} face={face(28)} onMedia={mediaArrived} onReact={react} who={who} onAnswer={x => setMsgs(list => (list || []).map(y => (y.media?.id === x.id ? { ...y, content: mediaNote({ ...y.media!, ...x }), media: { ...y.media!, ...x } } : y)))} />)}
        {character && msgs && !msgs.length && (
          <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {face(72)}<div>Say hi to {character.name} 👋</div>
          </div>
        )}
        {busy && <div className="row">{face(28)}<div className="muted" style={{ fontSize: 14 }}>{who} is typing…</div></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>⚠️ {err}</div>}
        {msgs && msgs.length === 0 && !cid && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {SUGGESTIONS.map(s => <button key={s} className="ghost" onClick={() => send(s)} style={{ borderRadius: 999, fontSize: 14, padding: "8px 12px" }}>{s}</button>)}
          </div>
        )}
        <div ref={end} />
      </div>
      {attach && (
        <div className="row" data-testid="chat-attachment" style={{ padding: "8px 12px 0", gap: 8 }}>
          <FileThumb f={attach} size={44} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attach.name}</div>
          <button type="button" className="ghost" onClick={() => setAttach(null)} aria-label="Remove attachment" style={{ padding: "4px 10px", fontSize: 13 }}>✕</button>
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); send(text); }} className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} data-testid="chat-file-input" />
        {cid && !scene && <button type="button" onClick={() => setSceneSheet(true)} disabled={!msgs || busy} aria-label="Start a scene" data-testid="scene-open"
          style={{ borderRadius: 999, width: 36, height: 46, padding: 0, flexShrink: 0, cursor: "pointer", fontSize: 19, border: "none", background: "transparent", color: "var(--muted)" }}>🎬</button>}
        <button type="button" onClick={() => picker.current?.click()} disabled={!msgs || busy || uploading} aria-label="Attach a photo or file" data-testid="chat-attach"
          style={{ borderRadius: 999, width: 40, height: 46, padding: 0, flexShrink: 0, cursor: "pointer", fontSize: 20, border: "none", background: "transparent", color: "var(--muted)" }}>
          {uploading ? "⏳" : "📎"}
        </button>
        <textarea ref={box} rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={msgs ? `Message ${who}…` : "Loading…"} aria-label={`Message ${who}`} disabled={!msgs}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          style={{ resize: "none", maxHeight: 140, borderRadius: 20 }} />
        {mic.supported && (
          <button type="button" onClick={() => (mic.listening ? mic.stop() : mic.start(text))} disabled={!msgs || busy}
            aria-label={mic.listening ? "Stop listening" : "Talk instead of typing"} aria-pressed={mic.listening} data-testid="chat-mic"
            style={{ borderRadius: 999, width: 46, height: 46, padding: 0, flexShrink: 0, cursor: "pointer", fontSize: 20,
              border: `1px solid ${mic.listening ? "var(--bad)" : "var(--border)"}`, background: mic.listening ? "rgba(248,113,113,0.18)" : "var(--surface2)", color: "var(--text)",
              animation: mic.listening ? "micPulse 1.4s infinite" : undefined }}>
            {mic.listening ? "⏹" : "🎙️"}
          </button>
        )}
        <button className="btn" disabled={(!text.trim() && !attach) || busy || uploading} aria-label="Send" style={{ borderRadius: 999, width: 46, height: 46, padding: 0, flexShrink: 0 }}>➤</button>
      </form>
      {(mic.listening || mic.error) && (
        <div style={{ padding: "0 14px 8px", fontSize: 12, color: mic.error ? "var(--bad)" : "var(--muted)" }}>
          {mic.error ? `⚠️ ${mic.error}` : "Listening… tap ⏹ when you're done, then Send."}
        </div>
      )}
      <style>{`@keyframes micPulse { 0% { box-shadow: 0 0 0 0 rgba(248,113,113,.5) } 70% { box-shadow: 0 0 0 10px rgba(248,113,113,0) } 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0) } }`}</style>
    </div>
  );
}

function Bubble({ m, face, who, onMedia, onReact, onAnswer, onReactMsg }: { m: ChatMsg; face: React.ReactNode; who: string; onMedia: (x: Media) => void; onReact: (id: string, r: string) => void; onAnswer: (x: Media) => void; onReactMsg: (id: string, r: string) => void }) {
  const mine = m.role === "user";
  const [picking, setPicking] = useState(false);
  // A small badge on the bubble's corner, like a text-message reaction.
  const badge = (r: string, who: string) => (
    <span data-testid={mine ? "their-reaction" : "my-reaction"} aria-label={`${who} reacted ${r}`}
      style={{ position: "absolute", bottom: -12, [mine ? "left" : "right"]: -6, fontSize: 15, lineHeight: 1, padding: "3px 5px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}>{r}</span>
  );
  if (m.content.startsWith("🎬 ")) return (
    <div data-testid="scene-note" style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 12, padding: "6px 12px", borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--border)" }} className="muted">{m.content}</div>
  );
  if (m.media) return (
    <div data-testid="chat-media" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {face}
      <div style={{ maxWidth: "min(80%, 380px)" }}>
        <MediaView media={m.media} onReady={onMedia} who={who} onAnswer={x => onAnswer(x)} />
        {m.media.status === "done" && <ReactionBar value={m.media.reaction} onPick={r => onReact(m.media!.id, r)} />}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: (mine ? m.theirReaction : m.reaction) ? 10 : 0 }}>
      {!mine && face}
      <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
      <div onClick={() => { if (!mine && m.id) setPicking(p => !p); }} data-testid={mine ? "my-bubble" : "her-bubble"}
        style={{ position: "relative", cursor: !mine && m.id ? "pointer" : undefined, padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18,
        background: mine ? "linear-gradient(135deg, var(--accent), var(--accent2))" : "var(--surface2)", color: "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.45, fontSize: 15 }}>
        {m.file && <div style={{ marginBottom: m.content && m.content !== "📎" ? 8 : 0 }}><FileThumb f={m.file} size={180} /></div>}
        {m.content !== "📎" && styled(m.content.replace(/\*\*(.+?)\*\*/g, "$1"))}
        {mine && m.theirReaction && badge(m.theirReaction, who)}
        {!mine && m.reaction && badge(m.reaction, "You")}
      </div>
      {picking && m.id && <ReactionBar value={m.reaction} onPick={r => { onReactMsg(m.id!, r); setPicking(false); }} />}
      </div>
    </div>
  );
}

/** *Actions in asterisks* show in italics (scenes); links stay tappable. */
function styled(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) => (i % 2 ? <em key={i} style={{ opacity: 0.85 }}>{part.slice(1, -1)}</em> : <span key={i}>{linkify(part)}</span>));
}

/** Web links in a message become tappable (https only; they open in a new tab). */
function linkify(text: string) {
  return text.split(/(https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g).map((part, i) =>
    i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{part.replace(/^https:\/\/(www\.)?/, "").slice(0, 60)}</a> : part);
}

/** A saved file: photos show as a picture, anything else as a tappable file chip. Opens full size in a new tab. */
/** Shows the small thumbnail (light on data); the full photo opens on tap. */
export function FileThumb({ f, size }: { f: { url: string; thumb?: string | null; name: string; type: string }; size: number }) {
  const isImage = f.type.startsWith("image/");
  return (
    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", color: "inherit", textDecoration: "none" }}>
      {isImage
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={f.thumb || f.url} alt={f.name} loading="lazy" style={{ display: "block", maxWidth: size, maxHeight: size, borderRadius: 10, objectFit: "cover" }} />
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: size < 60 ? "6px 8px" : "8px 12px", borderRadius: 10, background: "rgba(0,0,0,0.2)", fontSize: 13 }}>{f.type === "application/pdf" ? "📄" : "📝"} {size < 60 ? "" : f.name}</span>}
    </a>
  );
}

/** 🎬 Set up a scene: play it out now, or say it already happened. */
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function SceneSheet({ who, plan, onClose, onStart }: { who: string; plan?: { title: string; details: string } | null; onClose: () => void; onStart: (kind: "live" | "past", title: string, details: string) => Promise<void> }) {
  const [kind, setKind] = useState<"live" | "past">("live");
  const [title, setTitle] = useState(plan?.title || "");
  const [details, setDetails] = useState(plan?.details || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 🎙️ Say it instead of typing: a mic for each box (one listens at a time).
  const titleMic = useDictation(t => setTitle(t.slice(0, 120)));
  const detailsMic = useDictation(t => setDetails(t.slice(0, 1000)));
  const stopMics = () => { if (titleMic.active()) titleMic.stop(); if (detailsMic.active()) detailsMic.stop(); };
  const micBtn = ({ m, other, value, label, id }: { m: ReturnType<typeof useDictation>; other: ReturnType<typeof useDictation>; value: string; label: string; id: string }) => m.supported ? (
    <button type="button" onClick={e => { e.preventDefault(); if (m.active()) m.stop(); else { if (other.active()) other.stop(); m.start(value); } }}
      aria-label={m.listening ? "Stop listening" : label} aria-pressed={m.listening} data-testid={id}
      style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: `1px solid ${m.listening ? "var(--bad)" : "var(--border)"}`, background: m.listening ? "rgba(248,113,113,0.18)" : "var(--surface2)", color: "var(--text)", fontSize: 20, cursor: "pointer", alignSelf: "flex-start" }}>
      {m.listening ? "⏹️" : "🎙️"}
    </button>
  ) : null;
  const go = async () => {
    stopMics();
    setBusy(true); setErr("");
    try { await onStart(kind, title.trim(), details.trim()); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start it."); setBusy(false); }
  };
  const tab = (on: boolean) => ({ flex: 1, padding: "8px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "rgba(124,140,255,0.15)" : "transparent", color: "var(--text)" } as const);
  return (
    <div role="dialog" aria-modal="true" data-testid="scene-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => { stopMics(); onClose(); }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🎬 {plan ? `Your plans with ${who}` : `A scene with ${who}`}</div>
          <button className="ghost" onClick={() => { stopMics(); onClose(); }} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" style={tab(kind === "live")} onClick={() => setKind("live")} data-testid="scene-live">Play it out</button>
          <button type="button" style={tab(kind === "past")} onClick={() => setKind("past")} data-testid="scene-past">It already happened</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{kind === "live" ? `You two act it out here — ${who} sets the scene, you join in. *Actions in asterisks* show in italics. End it when you're done; it becomes a memory you both have.` : `Tell ${who} what you did together — she'll remember it as a real shared memory and talk about it.`}</div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>{kind === "live" ? "What's the plan?" : "What did you do?"}
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} aria-label="Scene" placeholder={kind === "live" ? "e.g. Dinner date at Luigi's" : "e.g. Went bowling downtown"} style={{ flex: 1, minWidth: 0 }} />
            {micBtn({ m: titleMic, other: detailsMic, value: title, label: "Say the plan", id: "scene-title-mic" })}
          </span>
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>{plan ? "Describe the scene" : "Details"} <span className="muted" style={{ fontWeight: 500 }}>· {plan ? "the more you write, the better" : "optional"}</span>
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} rows={3} aria-label="Scene details" style={{ flex: 1, minWidth: 0, resize: "vertical" }}
              placeholder={kind === "live" ? "Where, when, the vibe — e.g. Friday night, candlelit Italian place, she's wearing the red dress" : "What happened — e.g. you beat me twice, I threw a gutter ball, then we got ice cream"} />
            {micBtn({ m: detailsMic, other: titleMic, value: details, label: "Describe it out loud", id: "scene-details-mic" })}
          </span>
        </label>
        {(titleMic.listening || detailsMic.listening) && <div className="muted" style={{ fontSize: 12 }} data-testid="scene-listening">🎙️ Listening… tap ⏹️ when you&apos;re done.</div>}
        {(titleMic.error || detailsMic.error) && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {titleMic.error || detailsMic.error}</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" disabled={busy || !title.trim()} onClick={go} data-testid="scene-go">{busy ? "…" : kind === "live" ? "Start the scene" : `Tell ${who}`}</button>
      </div>
    </div>
  );
}
