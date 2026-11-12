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
import { CharacterFace, LinkBackForm } from "./characters";
import { MediaView, ReactionBar, type Media } from "./media";

/** Who this chat is with: Velo (no character) or one of their characters. */
export type ChatWith = { id: string; name: string; portrait_url: string | null; romantic?: boolean; brain?: string };

export type ChatFile = { id: string; url: string; thumb?: string | null; name: string; type: string };
export type ChatMsg = { id?: string; role: "user" | "assistant"; content: string; peek?: boolean; draft?: Draft; file?: ChatFile; media?: Media; reaction?: string | null; theirReaction?: string | null };
/** How a sent photo/video reads in the history the AI sees. */
export const mediaNote = (m: Media) => {
  const other = m.subject && m.subject !== "me" && m.subject !== "none" ? m.subject.replace(/^me\+/, "") : "";
  const what = (m.kind === "image" ? "photo" : "video") + (m.subject?.startsWith("me+") ? ` of you with ${other}` : other ? ` of ${other} (you're not in it)` : m.subject === "none" ? " (you're not in it)" : ""), d = m.description ? `"${m.description}"` : "";
  return m.status === "offered" ? `(offered to send a ${what}${d ? `: ${d}` : ""} — waiting for their OK)` : m.status === "declined" ? `(offered a ${what}${d ? ` (${d})` : ""} — they said no thanks)` : `(sent a ${what}${d ? `: ${d}` : ""})`;
};
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain";
/** What Velo sees: real messages only (draft cards are local to the screen). */
// Their messages since the last memo. Kept outside the component so switching tabs doesn't reset it.
// One count per chat (Velo's and each character's), since each keeps its own memory.
const unsavedBy = new Map<string, number>();
// Reactions travel with the history, so she knows what they reacted to (and what she did).
const withReactions = (x: ChatMsg) => x.role === "assistant" && x.reaction ? `${x.content}\n(they reacted ${x.reaction} to this)` : x.role === "user" && x.theirReaction ? `${x.content}\n(you reacted ${x.theirReaction})` : x.content;
// 👀 Peeks are only theirs: she never sees them.
const realMsgs = (m: ChatMsg[]) => m.filter(x => !x.draft && !x.peek).map(x => ({ role: x.role, content: withReactions(x), ...(x.file ? { fileId: x.file.id } : {}) }));
const INTRO = "Hi, I'm Velo! 👋 I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
const HELLO = (n: string) => [`Hey${n ? ` ${n}` : ""}! What's on your mind?`, `Hi${n ? ` ${n}` : ""} — how's your day going?`, `Hey${n ? ` ${n}` : ""}, good to see you. What can I do for you?`];
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

/** A message to drop into one chat (a call recap): cid null = Velo's chat. */
export type ChatAdd = { msg: ChatMsg; cid: string | null };

export default function Chat({ userId, name, onChanged, added, onAdded, character, adult = false, onAdult, onHistory, onNewCharacter, others = [], onGroup }: { others?: { id: string; name: string }[]; onGroup?: (g: { id: string; title: string; member_ids: string[]; updated_at: string; in_person_place?: string | null }) => void; userId: string; name: string; onChanged: () => void; added: ChatAdd | null; onAdded?: () => void; character?: ChatWith | null; adult?: boolean; onAdult?: () => void; onHistory?: (m: { role: "user" | "assistant"; content: string }[]) => void; onNewCharacter?: (c: { id: string; name: string; portrait_url: string | null }) => void }) {
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
  // 📞 The chat so far (what she sees), for "Continue in call".
  useEffect(() => { onHistory?.(realMsgs(msgs || []).map(m => ({ role: m.role, content: m.content }))); }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // 👀 "*peek*" during a scene: first the picture's description pops up to check or tweak, then exactly that is made.
    // 👁️ "ICU" when you're together in person (no scene): the same pop-up, for what you see right now.
    const icu = !scene && /^\s*\*?\s*icu\s*\*?\s*[.!]?\s*$/i.test(t);
    if (cid && !file && icu && !inPerson) { setErr("ICU works when you two are together in person — tap 🧍 first."); return; }
    if (cid && !file && ((scene && /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i.test(t)) || icu)) {
      setText(""); openPeek(!scene);
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
    if (cid && t) checkLinks(t);
    await respond(next, myId);
  };

  // 👋 Someone she wants them to meet: the card shows once her headshot is ready (checked every 15s).
  type Intro = { id: string; name: string; age: number | null; kind: string; introducer: string; about: string; portrait_url: string | null };
  const [intro, setIntro] = useState<Intro | null>(null);
  const [introBusy, setIntroBusy] = useState(false);
  useEffect(() => {
    if (!cid) return;
    let stop = false;
    const look = () => data<{ intros: Intro[] }>("intros.ready", { characterId: cid }).then(r => { if (!stop) setIntro(r.intros[0] || null); }).catch(() => {});
    look();
    const t = setInterval(look, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, [cid]);
  const answerIntro = async (yes: boolean) => {
    if (!intro) return;
    setIntroBusy(true);
    try {
      if (yes) { const r = await data<{ character: { id: string; name: string; portrait_url: string | null } }>("intros.accept", { id: intro.id }); onNewCharacter?.(r.character); }
      else await data("intros.decline", { id: intro.id });
      setIntro(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't do that."); }
    setIntroBusy(false);
  };

  // 👭 They mentioned someone who knows her, but she doesn't know them back: offer to link that way too (admins).
  const [linkAsk, setLinkAsk] = useState<{ id: string; name: string; kind: string; story: string } | null>(null);
  const askedKey = (other: string) => `velo:linkask:${cid}:${other}`;
  const checkLinks = (t: string) => {
    api<{ suggest: { id: string; name: string; kind: string; story: string }[] }>("/api/characters", { action: "link.suggest", id: cid, text: t }).then(r => {
      const s = (r.suggest || []).find(x => { try { return !localStorage.getItem(askedKey(x.id)); } catch { return true; } });
      if (s) setLinkAsk(s);
    }).catch(() => {});
  };
  const notNow = () => { if (linkAsk) { try { localStorage.setItem(askedKey(linkAsk.id), "1"); } catch { /* fine */ } } setLinkAsk(null); };

  // ⏰ Her own brain (Atlas) is down: she says she'll be right back, it retries; still down → ⏰ (she never sees it)
  // and it keeps trying quietly; when it's back → 👍 and her reply. Anything new they send takes over.
  const turn = useRef(0);
  const marker = async (kind: "wait" | "back") => {
    const m: ChatMsg = { role: "assistant", content: kind === "wait" ? "⏰" : "👍", peek: true };
    setMsgs(list => [...(list || []), m]);
    const s = await data<{ ids?: string[] }>("messages.add", { ...thread, messages: [{ marker: kind }] }).catch(() => ({ ids: [] as string[] }));
    if (s.ids?.[0]) setMsgs(list => (list || []).map(x => (x === m ? { ...x, id: s.ids![0] } : x)));
  };
  useEffect(() => () => { turn.current++; }, []);

  /** Her reply to the chat so far (after their message, or after a 🎬 scene note). */
  const respond = async (next: ChatMsg[], myId?: string, retry = 0) => {
    const me = retry ? turn.current : ++turn.current;
    if (!retry || retry === 1) { setBusy(true); setErr(""); }
    // Fire the request and always save the result, even if the user switches chats.
    const saveReply = async (reply: string, media?: Media[]) => {
      try {
        await data("messages.add", { ...thread, messages: [{ role: "assistant", content: reply }] });
        // Media messages are added by the media flow; just ensure the text is saved.
      } catch { /* already saved or network */ }
    };
    try {
      const r = await api<{ reply: string; changed?: boolean; drafts?: Draft[]; media?: Media[]; react?: string; brainDown?: boolean; by?: "claude" | "alt" }>("/api/velo", { mode: "chat", messages: realMsgs(next), timeZone: timeZone(), name, ...thread, ...(myId ? { replyTo: myId } : {}), ...(retry ? { retry: true } : {}) });
      // Always save, even if this chat is no longer visible.
      if (r.reply) saveReply(r.reply, r.media).catch(() => {});
      if (turn.current !== me) return;
      if (r.brainDown) {
        setBusy(false);
        if (!retry && r.reply) {
          const hold: ChatMsg = { role: "assistant", content: r.reply };
          setMsgs(m => [...(m || []), hold]);
          data("messages.add", { ...thread, messages: [{ role: "assistant", content: r.reply }] }).catch(() => {});
        }
        if (retry === 1) await marker("wait");
        setTimeout(() => { if (turn.current === me) respond(next, myId, retry ? 2 : 1); }, retry ? 30_000 : 5_000);
        return;
      }
      if (retry >= 2) await marker("back");
      // 🔗 The Qwen chain: ⏰ when Claude had to take over, 👍 when Qwen's back (once per switch; she never sees them).
      if (character?.brain === "qwen-chain" && r.by) {
        const lastMark = [...msgsRef.current].reverse().find(x => x.peek && !x.media && (x.content === "⏰" || x.content === "👍"))?.content;
        if (r.by === "claude" && lastMark !== "⏰") await marker("wait");
        if (r.by === "alt" && lastMark === "⏰") await marker("back");
      }
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
  const resendImage = async (msgId: string) => {
    if (!cid || resendFor) return;
    setResendFor(msgId);
    try {
      const r = await data<{ media: Media }>("media.resend", { characterId: cid });
      if (r.media) setMsgs(list => [...(list || []), { role: "assistant", content: mediaNote(r.media), media: r.media }]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not resend."); }
    setResendFor(null);
  };


  // 🎬 Scenes: a date or outing, played out here, or something that already happened.
  const [scene, setScene] = useState<{ id: string; title: string; details: string } | null>(null);
  const [sceneSheet, setSceneSheet] = useState(false);
  // 🧍 Together in person (not a scene): she talks face to face, and 👁️ ICU works.
  type InPerson = { place: string; started_at: string };
  const [inPerson, setInPerson] = useState<InPerson | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteSelected = async () => {
    if (!selected.size) return;
    const ids = [...selected];
    setMsgs(list => (list || []).filter(x => !x.id || !selected.has(x.id)));
    setSelected(new Set()); setSelectMode(false);
    try { await data("messages.delete", { ids }); } catch { /* removed locally */ }
    const remaining = (msgsRef.current || []).filter(x => !x.id || !selected.has(x.id));
    if (remaining.length && remaining[remaining.length - 1]?.role === "user") await respond(remaining);
  };
  const [togetherSheet, setTogetherSheet] = useState<{ place: string; busy: boolean; error?: string } | null>(null);
  const startTogether = async (place: string) => {
    setTogetherSheet(t => (t ? { ...t, busy: true, error: undefined } : t));
    try {
      const r = await data<{ inPerson: InPerson; marker: ChatMsg }>("inperson.start", { characterId: cid, place });
      setTogetherSheet(null); setInPerson(r.inPerson);
      unsaved.current++;
      const next = [...msgsRef.current, r.marker];
      setMsgs(next);
      await respond(next);
    } catch (e) { setTogetherSheet(t => (t ? { ...t, busy: false, error: e instanceof Error ? e.message : "Try again." } : t)); }
  };
  // 👥 Meet up: bring others along (or go see them) — a group chat, in person, picking up from everyone's one-on-ones.
  const [meetSheet, setMeetSheet] = useState<{ ids: string[]; place: string; busy: boolean; error?: string } | null>(null);
  const meetUp = async () => {
    if (!meetSheet || !meetSheet.ids.length || !onGroup) return;
    setMeetSheet(m => (m ? { ...m, busy: true, error: undefined } : m));
    try {
      const r = await api<{ group: { id: string; title: string; member_ids: string[]; updated_at: string; in_person_place?: string | null } }>("/api/groups", { action: "bring", fromId: cid, ids: meetSheet.ids, place: meetSheet.place.trim(), name });
      setMeetSheet(null); setInPerson(null);
      onGroup(r.group);
    } catch (e) { setMeetSheet(m => (m ? { ...m, busy: false, error: e instanceof Error ? e.message : "Try again." } : m)); }
  };
  const endTogether = async () => {
    try {
      const r = await data<{ marker: ChatMsg }>("inperson.end", { characterId: cid });
      setInPerson(null);
      setMsgs([...msgsRef.current, r.marker]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Try again."); }
  };
  // 👀 The peek being set up: its description (editable) before the picture is made.
  const [peekSheet, setPeekSheet] = useState<{ description: string; loading: boolean; error?: string; icu?: boolean } | null>(null);
  const [resendFor, setResendFor] = useState<string | null>(null);
  const openPeek = async (icu: boolean) => {
    setErr(""); setPeekSheet({ description: "", loading: true, icu });
    try { setPeekSheet({ description: (await data<{ description: string }>(icu ? "icu.draft" : "scene.peek.draft", { characterId: cid })).description, loading: false, icu }); }
    catch (e) { setPeekSheet(null); setErr(e instanceof Error ? e.message : "Couldn't peek right now."); }
  };
  const rewritePeek = async () => {
    const icu = !!peekSheet?.icu;
    setPeekSheet(p => (p ? { ...p, loading: true, error: undefined } : p));
    try { const r = await data<{ description: string }>(icu ? "icu.draft" : "scene.peek.draft", { characterId: cid }); setPeekSheet({ description: r.description, loading: false, icu }); }
    catch (e) { setPeekSheet(p => (p ? { ...p, loading: false, error: e instanceof Error ? e.message : "Couldn't rewrite it." } : p)); }
  };
  const sendPeek = async (description: string) => {
    setPeekSheet(p => (p ? { ...p, loading: true, error: undefined } : p));
    try {
      const icu = !!peekSheet?.icu;
      const r = await data<{ media: Media; userMsgId: string; mediaMsgId: string }>(icu ? "icu" : "scene.peek", { characterId: cid, description });
      setPeekSheet(null);
      setMsgs(list => [...(list || []), { id: r.userMsgId, role: "user", content: icu ? "*ICU*" : "*peek*", peek: true }, { id: r.mediaMsgId, role: "assistant", content: "(peek)", media: r.media, peek: true }]);
    } catch (e) { setPeekSheet(p => (p ? { ...p, loading: false, error: e instanceof Error ? e.message : "Couldn't peek right now." } : p)); }
  };
  // 📅 A hangout/date you two planned for today: set the scene for it.
  type Plan = { id: string; title: string; details: string; day: string; time?: string };
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fromPlan, setFromPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!cid) return;
    data<{ scene: { id: string; title: string; details: string } | null }>("scene.active", { characterId: cid }).then(r => setScene(r.scene)).catch(() => {});
    setInPerson(null);
    data<{ inPerson: InPerson | null }>("inperson.get", { characterId: cid }).then(r => setInPerson(r.inPerson)).catch(() => {});
    data<{ plans: Plan[] }>("plans.due", { characterId: cid, today: todayYmd() }).then(r => setPlans(r.plans)).catch(() => {});
  }, [cid, userId]);
  const skipPlan = async (p: Plan) => {
    setPlans(ps => ps.filter(x => x.id !== p.id));
    await data("plans.skip", { planId: p.id }).catch(() => {});
  };
  const startScene = async (kind: "live" | "past", title: string, details: string, clock?: SceneClockChoice) => {
    const r = await data<{ scene?: { id: string; title: string; details: string }; marker: ChatMsg }>(kind === "live" ? "scene.start" : "scene.past", { characterId: cid, title, details, ...(fromPlan ? { planId: fromPlan.id } : {}), ...(clock ? clock : {}) });
    if (fromPlan) setPlans(ps => ps.filter(x => x.id !== fromPlan.id));
    setFromPlan(null);
    setSceneSheet(false);
    if (kind === "live" && r.scene) { setScene(r.scene); setInPerson(null); }
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
    const holder = msgsRef.current.find(x => x.media?.id === id);
    const cur = holder?.media;
    if (!cur) return;
    const next = cur.reaction === emoji ? null : emoji;
    const set = (reaction: string | null, content?: string) => setMsgs(list => (list || []).map(x => (x.media?.id === id ? { ...x, ...(content ? { content } : {}), media: { ...x.media!, reaction } } : x)));
    set(next);
    let note = "";
    try { note = (await data<{ note: string }>("media.react", { id, reaction: next })).note; set(next, note); }
    catch { set(cur.reaction || null); return; }
    // A peek is theirs alone: she never sees it, or their reaction to it.
    if (!next || busy || holder?.peek || Math.random() > 0.55) return;
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
        <div data-testid="romance-confirm" className="row" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(236,72,153,0.10)", fontSize: 15, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>💕 {character.name} is a romantic character. Confirm you&apos;re 18+ to unlock romance (PG-13) — until then {character.name} keeps it friendly.</div>
          <button className="btn" onClick={confirmAdult} style={{ padding: "6px 12px", fontSize: 15 }}>I&apos;m 18+</button>
          <button className="ghost" onClick={() => setSkipRomance(true)} aria-label="Keep it friendly" style={{ padding: "6px 10px", fontSize: 15 }}>Not now</button>
        </div>
      )}
      {character && trust !== null && (
        <div data-testid="trust-meter" title="How much she trusts you — it grows with honesty and consistency" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
          <span>🤝 {character.name}&apos;s trust</span>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
            <div style={{ width: `${trust}%`, height: "100%", borderRadius: 999, background: trust >= 70 ? "#10b981" : trust >= 40 ? "#f59e0b" : "#ef4444", transition: "width .4s" }} />
          </div>
          <span className="muted" style={{ minWidth: 30, textAlign: "right" }}>{trust}%</span>
        </div>
      )}
      {character && scene && (
        <div data-testid="scene-banner" className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.12))", fontSize: 15 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🎬 <b>{scene.title}</b></span>
          <button className="ghost" onClick={endScene} disabled={busy} data-testid="scene-end" style={{ padding: "4px 10px", fontSize: 14 }}>End scene</button>
        </div>
      )}
      {character && !scene && inPerson && (
        <div data-testid="inperson-banner" className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "linear-gradient(90deg, rgba(16,185,129,.16), rgba(124,140,255,.12))", fontSize: 15 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🧍 <b>Together in person</b>{inPerson.place ? <span className="muted"> · {inPerson.place}</span> : null}</span>
          <button className="ghost" onClick={() => setMeetSheet({ ids: [], place: inPerson.place, busy: false })} disabled={busy} data-testid="meetup-open" style={{ padding: "4px 10px", fontSize: 14 }}>👥 Meet up</button>
          <button className="ghost" onClick={endTogether} disabled={busy} data-testid="inperson-end" style={{ padding: "4px 10px", fontSize: 14 }}>Leave</button>
        </div>
      )}
      {character && !scene && plans[0] && (
        <div data-testid="plan-card" style={{ margin: "10px 14px 0", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(236,72,153,.4)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.14))", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14 }}>📅 <b>{plans[0].day === todayYmd() ? "Today" : "You had plans"}:</b> {plans[0].title}{plans[0].details ? <span className="muted"> — {plans[0].details}</span> : null}</div>
          <div className="muted" style={{ fontSize: 14 }}>Describe the scene — where you are, the vibe, what you&apos;re wearing — and play it out with {character.name}.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="plan-start" disabled={busy || !msgs} onClick={() => { setFromPlan(plans[0]); setSceneSheet(true); }} style={{ padding: "8px 14px", fontSize: 15 }}>🎬 Set the scene</button>
            <button className="ghost" data-testid="plan-skip" onClick={() => skipPlan(plans[0])} style={{ padding: "8px 12px", fontSize: 15 }}>Not today</button>
          </div>
        </div>
      )}
      {meetSheet && character && (
        <div role="dialog" aria-modal="true" data-testid="meetup-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => setMeetSheet(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); meetUp(); }} style={{ width: "100%", maxWidth: 560, maxHeight: "80dvh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: 19 }}>👥 Meet up with {character.name} and…</div>
              <button type="button" className="ghost" onClick={() => setMeetSheet(null)} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
            </div>
            <div className="muted" style={{ fontSize: 14 }}>Moves you all into one group chat, together in person. Everyone picks up from their own recent chat with you — so if you told {character.name} you were bringing someone, she&apos;ll know who just walked in.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {others.filter(o => o.id !== cid).map(o => {
                const on = meetSheet.ids.includes(o.id);
                return <button type="button" key={o.id} className={on ? "btn" : "ghost"} aria-pressed={on} data-testid="meetup-pick" onClick={() => setMeetSheet(m => (m ? { ...m, ids: on ? m.ids.filter(x => x !== o.id) : [...m.ids, o.id].slice(0, 5) } : m))} style={{ padding: "6px 12px", fontSize: 15 }}>{on ? "✓ " : ""}{o.name}</button>;
              })}
            </div>
            <input value={meetSheet.place} onChange={e => setMeetSheet(m => (m ? { ...m, place: e.target.value } : m))} maxLength={120} aria-label="Where?" placeholder="Where? e.g. my place" data-testid="meetup-place" />
            {meetSheet.error && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠️ {meetSheet.error}</div>}
            <button className="btn" disabled={meetSheet.busy || !meetSheet.ids.length} data-testid="meetup-go">{meetSheet.busy ? "…" : "👥 Meet up"}</button>
          </form>
        </div>
      )}
      {togetherSheet && character && (
        <div role="dialog" aria-modal="true" data-testid="inperson-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => setTogetherSheet(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); startTogether(togetherSheet.place.trim()); }} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: 19 }}>🧍 Together with {character.name}</div>
              <button type="button" className="ghost" onClick={() => setTogetherSheet(null)} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
            </div>
            <div className="muted" style={{ fontSize: 14 }}>You&apos;re with her in person — she&apos;ll talk face to face instead of texting, and 👁️ ICU shows what you see. Not a planned outing (that&apos;s 🎬).</div>
            <input value={togetherSheet.place} onChange={e => setTogetherSheet(t => (t ? { ...t, place: e.target.value } : t))} maxLength={120} autoFocus aria-label="Where are you?" placeholder="Where? (optional) e.g. on her couch, in my car" data-testid="inperson-place" />
            {togetherSheet.error && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠️ {togetherSheet.error}</div>}
            <button className="btn" disabled={togetherSheet.busy} data-testid="inperson-go">{togetherSheet.busy ? "…" : "🧍 We're together"}</button>
          </form>
        </div>
      )}
      {peekSheet && character && <PeekSheet who={character.name} sheet={peekSheet} onChange={d => setPeekSheet(p => (p ? { ...p, description: d } : p))} onRewrite={rewritePeek} onSend={sendPeek} onClose={() => setPeekSheet(null)} />}
      {sceneSheet && character && <SceneSheet key={fromPlan?.id || "new"} who={character.name} plan={fromPlan} onClose={() => { setSceneSheet(false); setFromPlan(null); }} onStart={startScene} />}
      <div data-testid="chat-log" style={{ flex: 1, overflowY: "auto", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {shown.map((m, i) => m.draft ? <DraftCard key={m.draft.id} d={m.draft} onReport={reload} /> : <Bubble key={m.media?.id || m.id || i} m={m} onReactMsg={reactMsg} selectMode={selectMode} selected={!!(m.id && selected.has(m.id))} onToggle={toggleSelect} face={face(36)} onMedia={mediaArrived} onFailed={reload} onReact={react} who={who} onResend={resendImage} resending={resendFor === m.id} onAnswer={x => setMsgs(list => (list || []).map(y => (y.media?.id === x.id ? { ...y, content: mediaNote({ ...y.media!, ...x }), media: { ...y.media!, ...x } } : y)))} />)}
        {character && msgs && !msgs.length && (
          <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {face(72)}<div>Say hi to {character.name} 👋</div>
          </div>
        )}
        {busy && <div className="row">{face(28)}<div className="muted" style={{ fontSize: 14 }}>{who} is typing…</div></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>⚠️ {err}</div>}
        {intro && character && (
          <div className="card" data-testid="intro-card" style={{ display: "flex", gap: 12, alignItems: "center", border: "1px solid var(--accent)", borderRadius: 14, padding: 12 }}>
            {intro.portrait_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={intro.portrait_url} alt={intro.name} style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", objectPosition: "top", flexShrink: 0 }} />
              : null}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 15 }} className="muted">👋 {intro.introducer} wants you to meet her {intro.kind}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{intro.name}{intro.age ? `, ${intro.age}` : ""}</div>
              {intro.about && <div className="muted" style={{ fontSize: 14 }}>{intro.about}</div>}
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button onClick={() => answerIntro(true)} disabled={introBusy} data-testid="intro-yes">Meet her</button>
                <button className="ghost" onClick={() => answerIntro(false)} disabled={introBusy} data-testid="intro-no">Not now</button>
              </div>
            </div>
          </div>
        )}
        {linkAsk && character && (
          <div className="card" data-testid="link-ask" style={{ display: "grid", gap: 8, border: "1px solid var(--accent)", borderRadius: 12, padding: 12, fontSize: 14 }}>
            <div>👭 <b>{linkAsk.name}</b> knows {character.name}, but {character.name} doesn&apos;t know {linkAsk.name} yet. Link them so {character.name} knows {linkAsk.name} too? Check how they&apos;re related first.</div>
            <LinkBackForm key={linkAsk.id} id={character.id} who={character.name} other={linkAsk} onLinked={() => setLinkAsk(null)} onCancel={notNow} cancelLabel="Not now" />
          </div>
        )}
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
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attach.name}</div>
          <button type="button" className="ghost" onClick={() => setAttach(null)} aria-label="Remove attachment" style={{ padding: "4px 10px", fontSize: 15 }}>✕</button>
        </div>
      )}
      {selectMode && <div className="row" style={{ padding: "8px 12px", gap: 8, borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
        <span style={{ flex: 1, fontSize: 15 }}>{selected.size} selected</span>
        <button type="button" className="btn ghost" onClick={() => { setSelectMode(false); setSelected(new Set()); }} style={{ fontSize: 15 }}>Cancel</button>
        <button type="button" className="btn" onClick={deleteSelected} disabled={!selected.size} style={{ fontSize: 15 }}>Delete</button>
      </div>}
      <form onSubmit={e => { e.preventDefault(); send(text); }} className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} data-testid="chat-file-input" />
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setMoreMenu(m => !m)} aria-label="More" title="More" style={{ borderRadius: 999, width: 36, height: 46, padding: 0, flexShrink: 0, cursor: "pointer", fontSize: 18, border: "none", background: "transparent", color: moreMenu ? "var(--accent)" : "var(--muted)" }}>⋯</button>
          {moreMenu && <div style={{ position: "absolute", bottom: 50, left: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 6, minWidth: 140, boxShadow: "0 4px 12px rgba(0,0,0,.3)", zIndex: 10 }}>
            {cid && !scene && <button type="button" onClick={() => { setSceneSheet(true); setMoreMenu(false); }} disabled={!msgs || busy} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>🎬 Scene</button>}
            {cid && !scene && !inPerson && <button type="button" onClick={() => { setTogetherSheet({ place: "", busy: false }); setMoreMenu(false); }} disabled={!msgs || busy} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>🧍 Together</button>}
            {cid && !scene && inPerson && <button type="button" onClick={() => { openPeek(true); setMoreMenu(false); }} disabled={!msgs || busy || !!peekSheet} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>👁️ ICU</button>}
            <button type="button" onClick={() => { setSelectMode(s => !s); setMoreMenu(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>☑ Select</button>
          </div>}
        </div>
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
        <div style={{ padding: "0 14px 8px", fontSize: 14, color: mic.error ? "var(--bad)" : "var(--muted)" }}>
          {mic.error ? `⚠️ ${mic.error}` : "Listening… tap ⏹ when you're done, then Send."}
        </div>
      )}
      <style>{`@keyframes micPulse { 0% { box-shadow: 0 0 0 0 rgba(248,113,113,.5) } 70% { box-shadow: 0 0 0 10px rgba(248,113,113,0) } 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0) } }`}</style>
    </div>
  );
}

function Bubble({ m, face, who, onMedia, onFailed, onReact, onAnswer, onReactMsg, selectMode, selected, onToggle, onResend, resending }: { m: ChatMsg; face: React.ReactNode; who: string; onMedia: (x: Media) => void; onFailed?: () => void; onReact: (id: string, r: string) => void; onAnswer: (x: Media) => void; onReactMsg: (id: string, r: string) => void; selectMode?: boolean; selected?: boolean; onToggle?: (id: string) => void; onResend?: (id: string) => void; resending?: boolean }) {
  const mine = m.role === "user";
  const [picking, setPicking] = useState(false);
  // A small badge on the bubble's corner, like a text-message reaction.
  const badge = (r: string, who: string) => (
    <span data-testid={mine ? "their-reaction" : "my-reaction"} aria-label={`${who} reacted ${r}`}
      style={{ position: "absolute", bottom: -12, [mine ? "left" : "right"]: -6, fontSize: 17, lineHeight: 1, padding: "3px 5px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}>{r}</span>
  );
  // ⏰ / 👍: her brain was down / is back — just for them; she never sees these.
  if (m.peek && !m.media && (m.content === "⏰" || m.content === "👍")) return (
    <div data-testid="brain-marker" title={m.content === "⏰" ? `${who} is having trouble — still trying` : `${who} is back`} style={{ alignSelf: "center", fontSize: 18, lineHeight: 1, padding: "4px 10px", borderRadius: 999, border: "1px dashed var(--border)" }}>{m.content}</div>
  );
  if (m.peek && mine) return (
    <div data-testid="peek-note" style={{ alignSelf: "flex-end", fontSize: 14, padding: "4px 10px", borderRadius: 999, border: "1px dashed var(--border)" }} className="muted">{m.content === "*ICU*" ? "👁️ you looked" : "👀 you peeked"}</div>
  );
  if (m.peek && m.media) return (
    <div data-testid="peek-media" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div className="muted" style={{ fontSize: 11 }}>👀 Peek · {who} doesn&apos;t know</div>
      <div style={{ maxWidth: "min(86%, 400px)" }}>
        <MediaView media={m.media} onReady={onMedia} onFailed={onFailed} who={who} onAnswer={x => onAnswer(x)} />
        {m.media.status === "done" && <ReactionBar value={m.media.reaction} onPick={r => onReact(m.media!.id, r)} />}
      </div>
    </div>
  );
  if (m.content.startsWith("🎬 ") || m.content.startsWith("🧍 ")) return (
    <div data-testid="scene-note" style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 14, padding: "6px 12px", borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--border)" }} className="muted">{m.content}</div>
  );
  if (m.media) return (
    <div data-testid="chat-media" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {face}
      <div style={{ maxWidth: "min(92%, 420px)" }}>
        <MediaView media={m.media} onReady={onMedia} onFailed={onFailed} who={who} onAnswer={x => onAnswer(x)} />
        {m.media.status === "done" && <ReactionBar value={m.media.reaction} onPick={r => onReact(m.media!.id, r)} />}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: (mine ? m.theirReaction : m.reaction) ? 10 : 0 }}>
      {!mine && face}
      <div style={{ maxWidth: "min(92%, 420px)", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
      {selectMode && m.id && <input type="checkbox" checked={!!selected} onChange={() => onToggle?.(m.id!)} style={{ marginRight: 4 }} />}
      <div onClick={() => { if (!mine && m.id) setPicking(p => !p); }} data-testid={mine ? "my-bubble" : "her-bubble"}
        style={{ position: "relative", cursor: !mine && m.id ? "pointer" : undefined, padding: "12px 16px", borderRadius: 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18,
        background: mine ? "linear-gradient(135deg, var(--accent), var(--accent2))" : "var(--surface2)", color: "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5, fontSize: 19 }}>
        {m.file && <div style={{ marginBottom: m.content && m.content !== "📎" ? 8 : 0 }}><FileThumb f={m.file} size={180} /></div>}
        {m.content !== "📎" && styled(m.content.replace(/\*\*(.+?)\*\*/g, "$1"))}
        {!mine && /sent.*(pic|photo|image|picture)|here.*(pic|photo)|sending you a/i.test(m.content) && !m.media && (
          <button type="button" onClick={e => { e.stopPropagation(); onResend?.(m.id || ""); }} disabled={resending}
            style={{ marginTop: 6, fontSize: 14, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>
            {resending ? "Resending…" : "↻ Resend image"}
          </button>
        )}
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
        : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: size < 60 ? "6px 8px" : "8px 12px", borderRadius: 10, background: "rgba(0,0,0,0.2)", fontSize: 15 }}>{f.type === "application/pdf" ? "📄" : "📝"} {size < 60 ? "" : f.name}</span>}
    </a>
  );
}

/** 🎬 Set up a scene: play it out now, or say it already happened. */
/** 👀 The peek, before it's made: the picture's description to check, tweak or rewrite. */
function PeekSheet({ who, sheet, onChange, onRewrite, onSend, onClose }: { who: string; sheet: { description: string; loading: boolean; error?: string; icu?: boolean }; onChange: (d: string) => void; onRewrite: () => void; onSend: (d: string) => void; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" data-testid="peek-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 19 }}>{sheet.icu ? `👁️ I see you, ${who}` : `👀 Peek at ${who}`}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>This is the picture that will be made, using her reference pictures. Fix anything that&apos;s off — where you are, what she&apos;s wearing, her pose or look. She won&apos;t know.</div>
        <textarea value={sheet.description} onChange={e => onChange(e.target.value)} maxLength={1500} rows={5} aria-label="Peek description" disabled={sheet.loading && !sheet.description}
          placeholder={sheet.loading ? "Writing what you'd see…" : "e.g. Her at a candlelit corner table in an emerald dress, laughing and glancing up at me"} style={{ resize: "vertical" }} />
        <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>{sheet.description.length}/1500</div>
        {sheet.error && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠️ {sheet.error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={onRewrite} disabled={sheet.loading} data-testid="peek-rewrite" style={{ flexShrink: 0 }}>↻ Rewrite</button>
          <button className="btn" onClick={() => onSend(sheet.description)} disabled={sheet.loading || sheet.description.trim().length < 10} data-testid="peek-go" style={{ flex: 1 }}>{sheet.loading ? "…" : sheet.icu ? "👁️ Look" : "👀 Peek"}</button>
        </div>
      </div>
    </div>
  );
}

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type SceneClockChoice = { clock: "now" | "set"; time: string };
export function SceneSheet({ who, plan, onClose, onStart }: { who: string; plan?: { title: string; details: string; time?: string } | null; onClose: () => void; onStart: (kind: "live" | "past", title: string, details: string, clock: SceneClockChoice) => Promise<void> }) {
  const [kind, setKind] = useState<"live" | "past">("live");
  // 🕒 Real time now, or the scene's own scheduled time (the plan's time, if it has one).
  const [clock, setClock] = useState<"now" | "set">("now");
  const [time, setTime] = useState(plan?.time || "");
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
    try { await onStart(kind, title.trim(), details.trim(), { clock: clock === "set" && time ? "set" : "now", time }); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start it."); setBusy(false); }
  };
  const tab = (on: boolean) => ({ flex: 1, padding: "8px 10px", borderRadius: 999, fontWeight: 700, fontSize: 15, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "rgba(124,140,255,0.15)" : "transparent", color: "var(--text)" } as const);
  return (
    <div role="dialog" aria-modal="true" data-testid="scene-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => { stopMics(); onClose(); }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 19 }}>🎬 {plan ? `Your plans with ${who}` : `A scene with ${who}`}</div>
          <button className="ghost" onClick={() => { stopMics(); onClose(); }} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" style={tab(kind === "live")} onClick={() => setKind("live")} data-testid="scene-live">Play it out</button>
          <button type="button" style={tab(kind === "past")} onClick={() => setKind("past")} data-testid="scene-past">It already happened</button>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>{kind === "live" ? `You two act it out here — ${who} sets the scene, you join in. *Actions in asterisks* show in italics. End it when you're done; it becomes a memory you both have.` : `Tell ${who} what you did together — she'll remember it as a real shared memory and talk about it.`}</div>
        <label style={{ fontSize: 15, fontWeight: 700 }}>{kind === "live" ? "What's the plan?" : "What did you do?"}
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} aria-label="Scene" placeholder={kind === "live" ? "e.g. Dinner date at Luigi's" : "e.g. Went bowling downtown"} style={{ flex: 1, minWidth: 0 }} />
            {micBtn({ m: titleMic, other: detailsMic, value: title, label: "Say the plan", id: "scene-title-mic" })}
          </span>
        </label>
        <label style={{ fontSize: 15, fontWeight: 700 }}>{plan ? "Describe the scene" : "Details"} <span className="muted" style={{ fontWeight: 500 }}>· {plan ? "the more you write, the better" : "optional"}</span>
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} rows={3} aria-label="Scene details" style={{ flex: 1, minWidth: 0, resize: "vertical" }}
              placeholder={kind === "live" ? "Where, when, the vibe — e.g. Friday night, candlelit Italian place, she's wearing the red dress" : "What happened — e.g. you beat me twice, I threw a gutter ball, then we got ice cream"} />
            {micBtn({ m: detailsMic, other: titleMic, value: details, label: "Describe it out loud", id: "scene-details-mic" })}
          </span>
        </label>
        {kind === "live" && (
          <div data-testid="scene-clock" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>🕒 When is it happening?</div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" style={tab(clock === "now")} onClick={() => setClock("now")} data-testid="scene-clock-now">Now (real time)</button>
              <button type="button" style={tab(clock === "set")} onClick={() => setClock("set")} data-testid="scene-clock-set">Scheduled time</button>
            </div>
            {clock === "set" && <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Scene time" data-testid="scene-time" />}
            <span className="muted" style={{ fontSize: 14 }}>{clock === "now"
              ? `It happens right now — the light and time of day are real.${plan?.time ? ` ${who} will know it got moved from the planned time (no big deal, unless it keeps happening).` : ""}`
              : `The scene keeps its own clock, starting at ${time || "the time you pick"} and moving on as you play. ${who} won't know it's out of sync with real time.`}</span>
          </div>
        )}
        {(titleMic.listening || detailsMic.listening) && <div className="muted" style={{ fontSize: 14 }} data-testid="scene-listening">🎙️ Listening… tap ⏹️ when you&apos;re done.</div>}
        {(titleMic.error || detailsMic.error) && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠️ {titleMic.error || detailsMic.error}</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 15 }}>⚠️ {err}</div>}
        <button className="btn" disabled={busy || !title.trim()} onClick={go} data-testid="scene-go">{busy ? "…" : kind === "live" ? "Start the scene" : `Tell ${who}`}</button>
      </div>
    </div>
  );
}

