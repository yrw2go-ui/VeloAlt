"use client";
// 💬 The chat with Velo. Messages are saved to velo_messages (so the chat
// follows them across devices). When they leave the app after chatting, Velo
// files a short summary and any new goals/facts in her memory ("memo").
import { useCallback, useEffect, useRef, useState } from "react";
import { useBack } from "./lib/back";
import { BRAIN_OPTIONS } from "./lib/brainOptions";
import { api, data, uploadFile } from "./lib/api";
import { VeloAvatar } from "./avatar";
import DraftCard, { type Draft } from "./drafts";
import { hideSecrets } from "./lib/secrets";
import { timeZone } from "./lib/tz";
import { stamp } from "./lib/when";
import { confirmAsk } from "./lib/dialog";
import { useDictation } from "./dictate";
import { CharacterFace, LinkBackForm } from "./characters";
import { MediaView, ReactionBar, type Media } from "./media";
import { isHot } from "./lib/reactions";
import { dropThoughts, noJargon, dropSentNote } from "./lib/text";
import { CLAIMS_MEDIA } from "./lib/mediaWords";

/** Who this chat is with: Velo (no character) or one of their characters. */
export type ChatWith = { id: string; name: string; portrait_url: string | null; romantic?: boolean; brain?: string; live_in?: boolean; neighbor?: boolean; home?: boolean };

export type ChatFile = { id: string; url: string; thumb?: string | null; name: string; type: string };
export type ChatMsg = { id?: string; at?: string; role: "user" | "assistant"; content: string; peek?: boolean; draft?: Draft; file?: ChatFile; media?: Media; reaction?: string | null; theirReaction?: string | null };
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
const realMsgs = (m: ChatMsg[]) => m.filter(x => !x.draft && !x.peek && !x.content.startsWith("💭 ")).map(x => ({ role: x.role, content: withReactions(x), ...(x.file ? { fileId: x.file.id } : {}) }));
const INTRO = "Hi, I'm Velo! 👋 I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
const HELLO = (n: string) => [`Hey${n ? ` ${n}` : ""}! What's on your mind?`, `Hi${n ? ` ${n}` : ""} — how's your day going?`, `Hey${n ? ` ${n}` : ""}, good to see you. What can I do for you?`];
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

/** A message to drop into one chat (a call recap): cid null = Velo's chat. */
export type ChatAdd = { msg: ChatMsg; cid: string | null };

export default function Chat({ userId, name, onChanged, added, onAdded, character, adult = false, onAdult, onHistory, onNewCharacter, others = [], onGroup, onSocial, brains = [], startPlan, onPlanStarted }: { startPlan?: { id: string; kind: "video" | "person"; title: string; details: string } | null; onPlanStarted?: () => void; brains?: string[]; onSocial?: (accountId: string) => void; others?: { id: string; name: string; pica_handle?: string | null }[]; onGroup?: (g: { id: string; title: string; member_ids: string[]; updated_at: string; in_person_place?: string | null }) => void; userId: string; name: string; onChanged: () => void; added: ChatAdd | null; onAdded?: () => void; character?: ChatWith | null; adult?: boolean; onAdult?: () => void; onHistory?: (m: { role: "user" | "assistant"; content: string }[]) => void; onNewCharacter?: (c: { id: string; name: string; portrait_url: string | null }) => void }) {
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
    ]).then(([m, d]) => {
      setMsgs([...m, ...d.filter(x => x.status === "pending" || x.status === "calling").map(draft => ({ role: "assistant" as const, content: "", draft }))]);
      // Back in a chat where she was still "typing…": her answer is on its way — keep an eye out for it.
      const last = [...m].reverse().find(x => !x.peek);
      if (last?.role === "user" && last.at && Date.now() - Date.parse(last.at) < 3 * 60_000) setWaiting(Date.now());
    });
  }, [userId, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⏳ Waiting for a reply that the server is still writing (or already saved while they were away).
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await data<{ messages: ChatMsg[] }>("messages.list", thread).catch(() => null);
      const last = r ? [...r.messages].reverse().find(x => !x.peek) : null;
      if (r && last?.role === "assistant") { reload(); setWaiting(0); clearInterval(t); }
      else if (n >= 30) { setWaiting(0); clearInterval(t); setErr(`${who} didn't answer — try sending again.`); }
    }, 4000);
    return () => clearInterval(t);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // At home with someone who lives with you, *peek* means the same as ICU: a picture of what you see.
    const icu = !scene && /^\s*\*?\s*(icu|pe(e|a)k)\s*\*?\s*[.!]?\s*$/i.test(t);
    if (cid && !file && icu && !inPerson) { setErr(character?.live_in ? `ICU and *peek* work when ${character.name}'s home — flip the 🏠 Home toggle.` : "ICU works when you two are together in person — tap 🧍 first."); return; }
    if (cid && !file && ((scene && /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i.test(t)) || icu)) {
      setText(""); openPeek(!scene);
      return;
    }
    // 💭 [In brackets] in a character's chat: written straight into how she feels about you,
    // not sent to her as a message. Anything wrapped end to end counts.
    const inner = t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1).trim() : "";
    if (cid && !file && inner) {
      if (inner.length < 5) { setErr("Say a little more about how she feels."); return; }
      setText(""); setErr("");
      try {
        const r = await data<{ marker: ChatMsg; note?: string }>("feelings.set", { characterId: cid, text: inner });
        setMsgs(list => [...(list || []), r.marker]);
        if (r.note) setErr(r.note);
      } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't set that."); }
      return;
    }
    const opener: ChatMsg[] = msgs.length || cid ? [] : [{ role: "assistant", content: openingLine }];
    const mine: ChatMsg = { at: new Date().toISOString(), role: "user", content: t || "📎", ...(file ? { file } : {}) };
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
    try {
      const r = await api<{ reply: string; replyId?: string; changed?: boolean; drafts?: Draft[]; media?: Media[]; react?: string; ask?: { kind: "image" | "video"; description: string; with_me: boolean; with_them: boolean; of_person: string; same_moment: boolean }; brainDown?: boolean; by?: "claude" | "alt" }>("/api/velo", { mode: "chat", messages: realMsgs(next), timeZone: timeZone(), name, ...thread, saveReply: true, asks: true, ...(myId ? { replyTo: myId } : {}), ...(retry ? { retry: true } : {}) });
      if (turn.current !== me) return;
      if (r.brainDown) {
        setBusy(false);
        if (!retry && r.reply) {
          const hold: ChatMsg = { at: new Date().toISOString(), role: "assistant", content: r.reply };
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
      if (r.ask) { setAsk(r.ask); setHidden(null); }
      // 🎨 Photos/videos being made show up right under the reply and fill in when ready.
      const sent: ChatMsg[] = (r.media || []).filter(x => x.status !== "failed").map(media => ({ at: new Date().toISOString(), role: "assistant", content: mediaNote(media), media }));
      // A reaction on its own (no words): the badge on their message is the whole answer.
      const replyMsg: ChatMsg = { at: new Date().toISOString(), role: "assistant", content: r.reply, ...(r.replyId ? { id: r.replyId } : {}) };
      setMsgs(m => [...(m || []), ...(r.reply ? [replyMsg] : []), ...sent, ...(r.drafts || []).map(draft => ({ role: "assistant" as const, content: "", draft }))]);
      // Free the box as soon as her reply shows; saving it can finish in the background.
      setBusy(false);
      // (The server saved it already; older servers didn't, so save it here then.)
      const replyId = !r.reply ? null : r.replyId || (await data<{ ids?: string[] }>("messages.add", { ...thread, messages: [{ role: "assistant", content: r.reply }] }).catch(() => ({ ids: [] as string[] }))).ids?.[0];
      if (replyId) setMsgs(list => (list || []).map(x => (x === replyMsg ? { ...x, id: replyId } : x)));
      if (r.changed) onChanged();
    } catch (e) {
      // The connection dropped (they left the app, or the phone slept): her answer may still be on its way — look for it.
      if (e instanceof TypeError || /fetch|network|load failed/i.test(String((e as Error)?.message))) { setWaiting(Date.now()); return; }
      setErr(e instanceof Error ? e.message : `${who} didn't answer.`);
    } finally { setBusy(false); }
  };

  // 🎬 Scenes: a date or outing, played out here, or something that already happened.
  const [scene, setScene] = useState<{ id: string; title: string; details: string } | null>(null);
  const [sceneSheet, setSceneSheet] = useState(false);
  // 🧍 Together in person (not a scene): she talks face to face, and 👁️ ICU works.
  type InPerson = { place: string; started_at: string };
  const [inPerson, setInPerson] = useState<InPerson | null>(null);
  // 📸 A picture you asked for: the prompt comes to you first, like a peek.
  const [ask, setAsk] = useState<{ kind: "image" | "video"; description: string; with_me: boolean; with_them: boolean; of_person: string; same_moment: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  // 📸 Put away, not lost: a bar brings it back so her "sending it now" never hangs.
  const [hidden, setHidden] = useState<typeof ask>(null);
  const sendAsk = async (description: string) => {
    if (!ask) return;
    setAsking(true);
    try {
      const r = await data<{ media: Media; messageId: string }>("photo.make", { ...ask, description, ...thread });
      setAsk(null); setHidden(null);
      setMsgs(list => [...(list || []), { id: r.messageId, at: new Date().toISOString(), role: "assistant", content: mediaNote(r.media), media: r.media }]);
    } catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't go through."); setAsk(null); }
    setAsking(false);
  };

  const [togetherSheet, setTogetherSheet] = useState<{ place: string; busy: boolean; error?: string } | null>(null);
  const startTogether = async (place: string) => {
    setTogetherSheet(t => (t ? { ...t, busy: true, error: undefined } : t));
    try {
      const r = await data<{ inPerson: InPerson; marker: ChatMsg; no?: string }>("inperson.start", { characterId: cid, place, timeZone: timeZone() });
      // 🙋‍♀️ She can't right now (work, class, or just not tonight): her text lands in the chat.
      if (r.no) { setTogetherSheet(null); setMsgs(list => [...(list || []), r.marker]); return; }
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
  const [peekSheet, setPeekSheet] = useState<{ description: string; loading: boolean; error?: string; icu?: boolean; writer: string } | null>(null);
  // It opens empty: nothing is written until they tap ↻ Write (and ↻ again to redo it).
  const openPeek = (icu: boolean) => {
    setErr(""); setPeekSheet({ description: "", loading: false, icu, writer: character?.brain === "claude" ? "" : character?.brain || "" });
  };
  const rewritePeek = async () => {
    const icu = !!peekSheet?.icu, writer = peekSheet?.writer || "";
    setPeekSheet(p => (p ? { ...p, loading: true, error: undefined } : p));
    try { const r = await data<{ description: string }>(icu ? "icu.draft" : "scene.peek.draft", { characterId: cid, writer }); setPeekSheet({ description: r.description, loading: false, icu, writer }); }
    catch (e) { setPeekSheet(p => (p ? { ...p, loading: false, error: e instanceof Error ? e.message : "Couldn't write it." } : p)); }
  };
  const sendPeek = async (description: string) => {
    setPeekSheet(p => (p ? { ...p, loading: true, error: undefined } : p));
    try {
      const icu = !!peekSheet?.icu;
      const r = await data<{ media: Media; userMsgId: string; mediaMsgId: string }>(icu ? "icu" : "scene.peek", { characterId: cid, description });
      setPeekSheet(null);
      setMsgs(list => [...(list || []), { id: r.userMsgId, at: new Date().toISOString(), role: "user", content: icu ? "*ICU*" : "*peek*", peek: true }, { id: r.mediaMsgId, at: new Date().toISOString(), role: "assistant", content: "(peek)", media: r.media, peek: true }]);
    } catch (e) { setPeekSheet(p => (p ? { ...p, loading: false, error: e instanceof Error ? e.message : "Couldn't peek right now." } : p)); }
  };
  // 📅 A hangout/date you two planned for today: set the scene for it.
  type Plan = { id: string; title: string; details: string; day: string; time?: string; kind?: "video" | "person" };
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fromPlan, setFromPlan] = useState<Plan | null>(null);
  // ⏰ The pop-up said it's time: open the right thing — the scene sheet for a 🎥 video chat, the
  // in-person one for 🧍 meeting up — with what you two had already agreed filled in.
  useEffect(() => {
    if (!startPlan || !character || character.id !== cid) return;
    if (startPlan.kind === "person") setTogetherSheet({ place: startPlan.details || startPlan.title, busy: false });
    else { setFromPlan({ id: startPlan.id, title: startPlan.title, details: startPlan.details, day: "", kind: "video" }); setSceneSheet(true); }
    onPlanStarted?.();
  }, [startPlan, character, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cid) return;
    data<{ scene: { id: string; title: string; details: string } | null }>("scene.active", { characterId: cid }).then(r => setScene(r.scene)).catch(() => {});
    setInPerson(character?.live_in && character.home ? { place: "home", started_at: new Date().toISOString() } : null);
    data<{ inPerson: InPerson | null }>("inperson.get", { characterId: cid }).then(r => setInPerson(r.inPerson)).catch(() => {});
    data<{ plans: Plan[] }>("plans.due", { characterId: cid, today: todayYmd() }).then(r => setPlans(r.plans)).catch(() => {});
  }, [cid, userId]);
  // 🏠 She lives here: in or out? While she's in, you're in the same house (so it's the
  // in-person state, with "home" as the place) — she talks to you instead of texting.
  const atHome = !!character?.live_in && inPerson?.place === "home";
  // 🏘️ Are YOU in? One switch for the whole street — a neighbour only comes by when you're home.
  const [iAmHome, setIAmHome] = useState<boolean | null>(null);
  useEffect(() => {
    if (!character?.neighbor || character.live_in) return;
    data<{ home: boolean }>("athome.get").then(r => setIAmHome(r.home)).catch(() => {});
  }, [character?.id, character?.neighbor, character?.live_in]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMyHome = async (v: boolean) => { setIAmHome(v); await data("athome.set", { home: v }).catch(() => setIAmHome(!v)); };
  const setHome = async (home: boolean) => {
    if (!cid || busy) return;
    setInPerson(home ? { place: "home", started_at: new Date().toISOString() } : null);
    try {
      const r = await data<{ home: boolean; marker?: ChatMsg }>("home.set", { characterId: cid, home });
      if (r.marker) setMsgs(m => [...(m || []), r.marker!]);
      setInPerson(r.home ? { place: "home", started_at: new Date().toISOString() } : null);
      onChanged();
    } catch { setInPerson(home ? null : { place: "home", started_at: new Date().toISOString() }); }
  };
  const skipPlan = async (p: Plan) => {
    setPlans(ps => ps.filter(x => x.id !== p.id));
    await data("plans.skip", { planId: p.id }).catch(() => {});
  };
  const startScene = async (kind: "live" | "past", title: string, details: string, clock?: SceneClockChoice) => {
    const r = await data<{ scene?: { id: string; title: string; details: string }; marker: ChatMsg; no?: string }>(kind === "live" ? "scene.start" : "scene.past", { characterId: cid, title, details, timeZone: timeZone(), ...(fromPlan ? { planId: fromPlan.id } : {}), ...(clock ? clock : {}) });
    // 🙋‍♀️ She'd rather another time: her text lands in the chat and nothing starts.
    if (r.no) { setSceneSheet(false); setFromPlan(null); setMsgs(list => [...(list || []), r.marker]); return; }
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
    if (!(await confirmAsk(`End the video chat "${scene?.title}"? It'll become a memory you both have.`, { yes: "Hang up" }))) return;
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
  // 😊 And how happy she is with them (every character has one).
  const [happy, setHappy] = useState<number | null>(null);
  // 💗 And how much she loves them (romantic characters only).
  const [love, setLove] = useState<number | null>(null);
  useEffect(() => {
    if (!cid) return;
    data<{ trust: number | null; happy: number | null; love: number | null }>("relationship.get", { characterId: cid })
      .then(r => { setTrust(r.trust); setHappy(r.happy ?? null); setLove(r.love ?? null); }).catch(() => {});
  }, [cid, userId]);

  // 😮 React to one of her messages (tap it). Tap the same one again to take it back.
  // 📸 She said a photo/video was coming but it never showed up: a button to make her actually send it.
  const lastReal = [...(msgs || [])].reverse().find(m => !m.draft && !(m.peek && !m.media));
  const pendingPic = !!character && !busy && !!lastReal && lastReal.role === "assistant" && !lastReal.media
    // 📣 The same words the server uses to spot a claim, so the button shows whenever she says
    // one went out — "here's a sneaky peek…" counts too.
    && CLAIMS_MEDIA.test(lastReal.content);
  const [picBusy, setPicBusy] = useState(false);
  const sendPic = async () => {
    setPicBusy(true); setErr("");
    try {
      const r = await api<{ media?: Media[]; note?: string; ask?: typeof ask }>("/api/velo", { mode: "chat", messages: realMsgs(msgsRef.current), timeZone: timeZone(), name, ...thread, sendPhoto: true, asks: true });
      // 📸 The prompt comes to you first, the same as any photo you asked for.
      if (r.ask) { setAsk(r.ask); setPicBusy(false); return; }
      const sent: ChatMsg[] = (r.media || []).filter(x => x.status !== "failed").map(media => ({ role: "assistant", content: mediaNote(media), media }));
      if (sent.length) setMsgs(m => [...(m || []), ...sent]);
      else setErr(r.note || `${who} couldn't send it — try again in a moment.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it."); }
    setPicBusy(false);
  };
  // 🗑 Long-press a message to select it (then tap up to 10); deleting also makes her forget what was in them.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  // ＋ The chat's extras (🎬 scene, 🧍 together / 👁️ ICU, 📎 attach) live in one menu, so the typing box gets the room.
  const [moreOpen, setMoreOpen] = useState(false);
  // ✨ A photo she sent of someone new (not a character): make her a Picagram account from it.
  // (Named: not one of your characters. Unnamed or older photos: the description shows a woman and names none of your characters.)
  // 🙋 Someone the app already knows who's on Picagram: the button opens her instead of making her.
  const already = (md?: Media) => {
    const sub = String(md?.subject || "");
    const who = sub && sub !== "none" && !sub.startsWith("me") ? others.find(o => o.name.toLowerCase() === sub.toLowerCase()) : null;
    return who?.pica_handle || null;
  };
  const socialOk = (md?: Media) => {
    if (md?.status !== "done" || md.kind !== "image") return false;
    const sub = String(md.subject || ""), desc = String(md.description || "");
    if (sub === "me" || sub.startsWith("me+")) return false;
    // One of your characters: only worth a button when she's already on Picagram — then it opens her.
    if (sub && sub !== "none") return !others.some(o => o.name.toLowerCase() === sub.toLowerCase()) || !!already(md);
    return /\b(woman|girl|lady|she|her|blonde|brunette|redhead|model|babe)\b/i.test(desc)
      && !others.some(o => new RegExp(`\\b${o.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(desc));
  };
  const createSocial = async (md: Media) => {
    setErr("");
    try {
      const r = await api<{ accountId: string }>("/api/pica", { action: "fromPhoto", id: md.id });
      // Done: the button stays, greyed out.
      setMsgs(list => (list || []).map(x => (x.media?.id === md.id ? { ...x, media: { ...x.media!, social: true } } : x)));
      onSocial?.(r.accountId);
    }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make her account."); }
  };
  const [pickGallery, setPickGallery] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toggleSelect = (id: string) => setSelected(sel => {
    if (!sel) return sel;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else if (next.size < 10) next.add(id);
    return next.size ? next : null;
  });
  const deleteSelected = async () => {
    if (!selected?.size) return;
    const n = selected.size;
    if (!(await confirmAsk(`Delete ${n === 1 ? "this message" : `these ${n} messages`}? Are you sure? ${who} will forget what was in ${n === 1 ? "it" : "them"}.`, { yes: "Delete", danger: true }))) return;
    setDeleting(true); setErr("");
    try {
      await data("messages.delete", { ...thread, ids: [...selected] });
      const gone = selected;
      const next = msgsRef.current.filter(m => !(m.id && gone.has(m.id)));
      setMsgs(next); setSelected(null);
      // If your message is now the latest, she answers it again.
      const last = [...next].reverse().find(m => !m.draft && !m.peek);
      if (last && last.role === "user" && !busy) await respond(next, last.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete."); }
    setDeleting(false);
  };
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
    // 🔥 A reaction that says something (🔥 🥵 🤤 💦 😈) always gets an answer; a plain one
    // only about a third of the time — most of the time a ❤️ just sits there, like it would.
    const hot = isHot(next);
    if (!next || busy || holder?.peek || (!hot && Math.random() > 0.35)) return;
    setBusy(true);
    try {
      const history = realMsgs(msgsRef.current.map(x => (x.media?.id === id ? { ...x, content: note } : x)));
      const what = cur.kind === "image" ? "photo" : "video";
      const ask = hot
        ? `(They just reacted ${next} to the ${what} you sent — that's them saying they really liked it. Answer in ONE short line, pleased and a bit smug, the way YOU would: something like "glad you liked it", "thought you might like that one", "you really liked that one, huh?" — or just 😏 😉 😜 👌 👀 😈 on its own. Your words, not those exactly. Don't send anything new and don't describe the ${what} again.)`
        : `(They just reacted ${next} to the ${what} you sent. React back naturally in one short line — a few words or an emoji is fine. Don't send anything new.)`;
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
  const NOTE_ONLY = /^\s*\((sent|sending) an? (photo|video|picture)\b/i;
  const shown: ChatMsg[] = (msgs && !msgs.length && !cid ? [{ role: "assistant" as const, content: openingLine }] : msgs || [])
    .filter(m => m.media || m.file || m.draft || !NOTE_ONLY.test(m.content || ""));

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
      {character && happy !== null && (
        <div data-testid="happy-meter" title="How happy she is with you — attention and time together lift it; being left alone lowers it. The happier she is, the more she takes in her stride" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <span>😊 {character.name}&apos;s happiness</span>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
            <div style={{ width: `${happy}%`, height: "100%", borderRadius: 999, background: happy >= 75 ? "#10b981" : happy >= 45 ? "#f59e0b" : "#ef4444", transition: "width .4s" }} />
          </div>
          <span className="muted" style={{ minWidth: 30, textAlign: "right" }}>{happy}%</span>
        </div>
      )}
      {character && love !== null && (
        <div data-testid="love-meter" title="How much she loves you — it grows slowly with how you treat her and the time you spend together, and it can cool off" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <span>💗 {character.name}&apos;s love</span>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
            <div style={{ width: `${love}%`, height: "100%", borderRadius: 999, background: love >= 60 ? "#ec4899" : love >= 30 ? "#f59e0b" : "#64748b", transition: "width .4s" }} />
          </div>
          <span className="muted" style={{ minWidth: 30, textAlign: "right" }}>{love}%</span>
        </div>
      )}
      {character && scene && (
        <div data-testid="scene-banner" className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.12))", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🎥 <b>{scene.title}</b></span>
          <button className="ghost" onClick={endScene} disabled={busy} data-testid="scene-end" style={{ padding: "4px 10px", fontSize: 12 }}>End video chat</button>
        </div>
      )}
      {character?.live_in && !scene && (
        <div data-testid="live-in-bar" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", background: atHome ? "rgba(74,222,128,.12)" : "var(--surface2)", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {atHome ? <>🏠 <b>{character.name}&apos;s home</b> <span className="muted">· you&apos;re in the house together</span></> : <>🚪 <b>{character.name}&apos;s out</b> <span className="muted">· you&apos;re texting</span></>}
          </span>
          <div className="row" style={{ gap: 0, borderRadius: 999, border: "1px solid var(--border)", overflow: "hidden" }}>
            {([[true, "🏠 Home"], [false, "🚪 Out"]] as const).map(([v, label]) => (
              <button key={label} type="button" onClick={() => setHome(v)} disabled={busy} aria-pressed={atHome === v}
                data-testid={v ? "home-on" : "home-off"}
                style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", color: "var(--text)",
                  background: atHome === v ? (v ? "rgba(74,222,128,.3)" : "rgba(124,140,255,.22)") : "transparent" }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {character?.neighbor && !character.live_in && !scene && (
        <div data-testid="neighbor-bar" className="row" style={{ gap: 8, padding: "6px 14px", borderBottom: "1px solid var(--border)", background: iAmHome ? "rgba(74,222,128,.12)" : "var(--surface2)", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {iAmHome ? <>🏠 <b>You&apos;re home</b> <span className="muted">· {character.name} lives a few doors down</span></> : <>🚪 <b>You&apos;re out</b> <span className="muted">· nobody comes by</span></>}
          </span>
          <div className="row" style={{ gap: 0, borderRadius: 999, border: "1px solid var(--border)", overflow: "hidden" }}>
            {([[true, "🏠 I'm home"], [false, "🚪 Out"]] as const).map(([v, label]) => (
              <button key={label} type="button" onClick={() => setMyHome(v)} aria-pressed={iAmHome === v}
                data-testid={v ? "iam-home-on" : "iam-home-off"}
                style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", color: "var(--text)",
                  background: iAmHome === v ? (v ? "rgba(74,222,128,.3)" : "rgba(124,140,255,.22)") : "transparent" }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {character && !scene && inPerson && !atHome && (
        <div data-testid="inperson-banner" className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "linear-gradient(90deg, rgba(16,185,129,.16), rgba(124,140,255,.12))", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🧍 <b>Together in person</b>{inPerson.place ? <span className="muted"> · {inPerson.place}</span> : null}</span>
          {onGroup && others.length > 0 && <button className="ghost" onClick={() => setMeetSheet({ ids: [], place: inPerson.place, busy: false })} disabled={busy} data-testid="meetup-open" style={{ padding: "4px 10px", fontSize: 12 }}>👥 Meet up</button>}
          <button className="ghost" onClick={endTogether} disabled={busy} data-testid="inperson-end" style={{ padding: "4px 10px", fontSize: 12 }}>Leave</button>
        </div>
      )}
      {character && !scene && plans[0] && (
        <div data-testid="plan-card" style={{ margin: "10px 14px 0", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(236,72,153,.4)", background: "linear-gradient(90deg, rgba(124,140,255,.16), rgba(236,72,153,.14))", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14 }}>{plans[0].kind === "person" ? "🧍" : "🎥"} <b>{plans[0].day === todayYmd() ? "Today" : "You had plans"}:</b> {plans[0].title}{plans[0].details ? <span className="muted"> — {plans[0].details}</span> : null}</div>
          <div className="muted" style={{ fontSize: 12 }}>Describe the scene — where you are, the vibe, what you&apos;re wearing — and play it out with {character.name}.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="plan-start" disabled={busy || !msgs}
              onClick={() => { if (plans[0].kind === "person") setTogetherSheet({ place: plans[0].details || plans[0].title, busy: false }); else { setFromPlan(plans[0]); setSceneSheet(true); } }} style={{ padding: "8px 14px", fontSize: 13 }}>🎥 Video chat</button>
            <button className="ghost" data-testid="plan-skip" onClick={() => skipPlan(plans[0])} style={{ padding: "8px 12px", fontSize: 13 }}>Not today</button>
          </div>
        </div>
      )}
      {pickGallery && <GalleryPicker onClose={() => setPickGallery(false)} onPick={f => { setAttach(f); setPickGallery(false); box.current?.focus(); }} />}
      {meetSheet && character && (
        <div role="dialog" aria-modal="true" data-testid="meetup-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => setMeetSheet(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); meetUp(); }} style={{ width: "100%", maxWidth: 560, maxHeight: "80dvh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>👥 Meet up with {character.name} and…</div>
              <button type="button" className="ghost" onClick={() => setMeetSheet(null)} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Moves you all into one group chat, together in person. Everyone picks up from their own recent chat with you — so if you told {character.name} you were bringing someone, she&apos;ll know who just walked in.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {others.filter(o => o.id !== cid).map(o => {
                const on = meetSheet.ids.includes(o.id);
                return <button type="button" key={o.id} className={on ? "btn" : "ghost"} aria-pressed={on} data-testid="meetup-pick" onClick={() => setMeetSheet(m => (m ? { ...m, ids: on ? m.ids.filter(x => x !== o.id) : [...m.ids, o.id].slice(0, 5) } : m))} style={{ padding: "6px 12px", fontSize: 13 }}>{on ? "✓ " : ""}{o.name}</button>;
              })}
            </div>
            <input value={meetSheet.place} onChange={e => setMeetSheet(m => (m ? { ...m, place: e.target.value } : m))} maxLength={120} aria-label="Where?" placeholder="Where? e.g. my place" data-testid="meetup-place" />
            {meetSheet.error && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {meetSheet.error}</div>}
            <button className="btn" disabled={meetSheet.busy || !meetSheet.ids.length} data-testid="meetup-go">{meetSheet.busy ? "…" : "👥 Meet up"}</button>
          </form>
        </div>
      )}
      {togetherSheet && character && (
        <div role="dialog" aria-modal="true" data-testid="inperson-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => setTogetherSheet(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); startTogether(togetherSheet.place.trim()); }} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>🧍 Together with {character.name}</div>
              <button type="button" className="ghost" onClick={() => setTogetherSheet(null)} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>You&apos;re with her in person — she&apos;ll talk face to face instead of texting, and 👁️ ICU shows what you see. Not a video chat (that&apos;s 🎥).</div>
            <input value={togetherSheet.place} onChange={e => setTogetherSheet(t => (t ? { ...t, place: e.target.value } : t))} maxLength={120} autoFocus aria-label="Where are you?" placeholder="Where? (optional) e.g. on her couch, in my car" data-testid="inperson-place" />
            {togetherSheet.error && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {togetherSheet.error}</div>}
            <button className="btn" disabled={togetherSheet.busy} data-testid="inperson-go">{togetherSheet.busy ? "…" : "🧍 We're together"}</button>
          </form>
        </div>
      )}
      {ask && <AskSheet who={who} ask={ask} busy={asking} onChange={d => setAsk(a => (a ? { ...a, description: d } : a))} onSend={sendAsk}
        onClose={() => { setAsk(null); setHidden(null); }} onHide={() => { setHidden(ask); setAsk(null); }} />}
      {!ask && hidden && (
        <div style={{ padding: "0 12px 6px" }}>
          <button className="ghost" onClick={() => { setAsk(hidden); setHidden(null); }} data-testid="ask-waiting" style={{ padding: "6px 12px", fontSize: 13, borderColor: "#ec4899" }}>
            📸 {who}&apos;s {hidden.kind === "image" ? "photo" : "video"} is waiting on you — look it over
          </button>
        </div>
      )}
      {peekSheet && character && <PeekSheet who={character.name} sheet={peekSheet} brains={brains} theirs={character.brain === "claude" ? "" : character.brain || ""} onChange={d => setPeekSheet(p => (p ? { ...p, description: d } : p))} onWriter={w => setPeekSheet(p => (p ? { ...p, writer: w } : p))} onRewrite={rewritePeek} onSend={sendPeek} onClose={() => setPeekSheet(null)} />}
      {sceneSheet && character && <SceneSheet key={fromPlan?.id || "new"} who={character.name} plan={fromPlan} onClose={() => { setSceneSheet(false); setFromPlan(null); }} onStart={startScene} />}
      <div data-testid="chat-log" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((m, i) => m.draft ? <DraftCard key={m.draft.id} d={m.draft} onReport={reload} /> : (
          <Selectable key={m.media?.id || m.id || i} id={m.id} selecting={selected} onStart={id => setSelected(new Set([id]))} onToggle={toggleSelect}>
            <Bubble m={m} social={character && onSocial && socialOk(m.media) ? createSocial : undefined} openHandle={already(m.media)} onReactMsg={reactMsg} face={face(28)} onMedia={mediaArrived} onFailed={reload} onReact={react} who={who} onAnswer={x => setMsgs(list => (list || []).map(y => (y.media?.id === x.id ? { ...y, content: mediaNote({ ...y.media!, ...x }), media: { ...y.media!, ...x } } : y)))} />
          </Selectable>
        ))}
        {character && msgs && !msgs.length && (
          <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {face(72)}<div>Say hi to {character.name} 👋</div>
          </div>
        )}
        {(busy || !!waiting) && <div className="row" data-testid="typing">{face(28)}<div className="muted" style={{ fontSize: 14 }}>{who} is typing…</div></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>⚠️ {err}</div>}
        {intro && character && (
          <div className="card" data-testid="intro-card" style={{ display: "flex", gap: 12, alignItems: "center", border: "1px solid var(--accent)", borderRadius: 14, padding: 12 }}>
            {intro.portrait_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={intro.portrait_url} alt={intro.name} style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", objectPosition: "top", flexShrink: 0 }} />
              : null}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 13 }} className="muted">👋 {intro.introducer} wants you to meet her {intro.kind}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{intro.name}{intro.age ? `, ${intro.age}` : ""}</div>
              {intro.about && <div className="muted" style={{ fontSize: 12 }}>{intro.about}</div>}
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
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attach.name}</div>
          <button type="button" className="ghost" onClick={() => setAttach(null)} aria-label="Remove attachment" style={{ padding: "4px 10px", fontSize: 13 }}>✕</button>
        </div>
      )}
      {pendingPic && !selected && (
        <div className="row" style={{ padding: "8px 12px 0", gap: 8 }}>
          <button className="ghost" onClick={sendPic} disabled={picBusy} data-testid="send-pic" style={{ padding: "6px 12px", fontSize: 13, borderColor: "var(--accent)" }}>{picBusy ? "📸 Sending…" : `📸 ${who} didn't send it — send the pic`}</button>
        </div>
      )}
      {selected && (
        <div data-testid="select-bar" className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14 }}><b>{selected.size}</b> selected <span className="muted" style={{ fontSize: 12 }}>(up to 10)</span></span>
          <button className="ghost" onClick={() => setSelected(null)} data-testid="select-cancel">Cancel</button>
          <button className="btn" onClick={deleteSelected} disabled={!selected.size || deleting} data-testid="select-delete" style={{ background: "var(--bad)" }}>{deleting ? "…" : `🗑 Delete${selected.size > 1 ? ` ${selected.size}` : ""}`}</button>
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); send(text); }} className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", ...(selected ? { display: "none" } : {}) }}>
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} data-testid="chat-file-input" />
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button type="button" onClick={() => setMoreOpen(o => !o)} disabled={!msgs || busy} aria-label={moreOpen ? "Close menu" : "More: video chat, together, attach"} aria-expanded={moreOpen} data-testid="chat-more"
            style={{ position: "relative", zIndex: 42, borderRadius: 999, width: 40, height: 46, padding: 0, cursor: "pointer", fontSize: 24, lineHeight: 1, border: "none", background: "transparent", color: "var(--muted)", transform: moreOpen ? "rotate(45deg)" : undefined, transition: "transform .15s" }}>{uploading ? "⏳" : "＋"}</button>
          {moreOpen && (
            <>
              <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div role="menu" data-testid="chat-more-menu" className="card" style={{ position: "absolute", bottom: 52, left: 0, zIndex: 41, minWidth: 220, padding: 6, display: "flex", flexDirection: "column", gap: 2, boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}>
                {cid && !scene && <button type="button" role="menuitem" data-testid="scene-open" onClick={() => { setMoreOpen(false); setSceneSheet(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: "transparent", color: "var(--text)", fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 19 }}>🎥</span> Start a video chat</button>}
                {cid && !scene && !inPerson && !character?.live_in && <button type="button" role="menuitem" data-testid="inperson-open" onClick={() => { setMoreOpen(false); setTogetherSheet({ place: "", busy: false }); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: "transparent", color: "var(--text)", fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 19 }}>🧍</span> Together in person</button>}
                {cid && !scene && inPerson && <button type="button" role="menuitem" data-testid="icu-open" disabled={!!peekSheet} onClick={() => { setMoreOpen(false); openPeek(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: "transparent", color: "var(--text)", fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 19 }}>👁️</span> ICU — see {who} right now</button>}
                <button type="button" role="menuitem" data-testid="chat-from-gallery" onClick={() => { setMoreOpen(false); setPickGallery(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: "transparent", color: "var(--text)", fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 19 }}>🖼️</span> From my gallery</button>
                <button type="button" role="menuitem" data-testid="chat-attach" disabled={uploading} onClick={() => { setMoreOpen(false); picker.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 10, background: "transparent", color: "var(--text)", fontSize: 15, cursor: "pointer" }}><span style={{ fontSize: 19 }}>📎</span> Photo or file</button>
              </div>
            </>
          )}
        </div>
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

/** 🕒 When it was sent — small and quiet under the bubble. */
const When = ({ at, align }: { at?: string; align?: "left" | "right" | "center" }) => {
  const t = stamp(at);
  return t ? <div data-testid="when" style={{ fontSize: 10, lineHeight: 1.6, opacity: 0.55, color: "var(--text)", padding: "2px 4px 0", textAlign: align || "left", alignSelf: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>{t}</div> : null;
};

function Bubble({ m, face, who, onMedia, onFailed, onReact, onAnswer, onReactMsg, social, openHandle }: { openHandle?: string | null; social?: (md: Media) => void; m: ChatMsg; face: React.ReactNode; who: string; onMedia: (x: Media) => void; onFailed?: () => void; onReact: (id: string, r: string) => void; onAnswer: (x: Media) => void; onReactMsg: (id: string, r: string) => void }) {
  const mine = m.role === "user";
  const [picking, setPicking] = useState(false);
  // A small badge on the bubble's corner, like a text-message reaction.
  const badge = (r: string, who: string) => (
    <span data-testid={mine ? "their-reaction" : "my-reaction"} aria-label={`${who} reacted ${r}`}
      style={{ position: "absolute", bottom: -12, [mine ? "left" : "right"]: -6, fontSize: 15, lineHeight: 1, padding: "3px 5px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}>{r}</span>
  );
  // ⏰ / 👍: her brain was down / is back — just for them; she never sees these.
  if (m.peek && !m.media && (m.content === "⏰" || m.content === "👍")) return (
    <div data-testid="brain-marker" title={m.content === "⏰" ? `${who} is having trouble — still trying` : `${who} is back`} style={{ alignSelf: "center", fontSize: 18, lineHeight: 1, padding: "4px 10px", borderRadius: 999, border: "1px dashed var(--border)" }}>{m.content}</div>
  );
  if (m.peek && mine) return (
    <div data-testid="peek-note" style={{ alignSelf: "flex-end", fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px dashed var(--border)" }} className="muted">{m.content === "*ICU*" ? "👁️ you looked" : "👀 you peeked"}</div>
  );
  if (m.peek && m.media) return (
    <div data-testid="peek-media" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div className="muted" style={{ fontSize: 11 }}>👀 Peek · {who} doesn&apos;t know</div>
      <div style={{ maxWidth: "min(86%, 400px)" }}>
        <MediaView media={m.media} onReady={onMedia} onFailed={onFailed} who={who} onAnswer={x => onAnswer(x)} />
        {m.media.status === "done" && <ReactionBar value={m.media.reaction} onPick={r => onReact(m.media!.id, r)} />}
        <When at={m.at} align="center" />
      </div>
    </div>
  );
  if (m.content.startsWith("💭 ")) return (
    <div data-testid="feelings-note" style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 12, padding: "6px 12px", borderRadius: 999, background: "rgba(236,72,153,.14)", border: "1px solid rgba(236,72,153,.4)" }} className="muted">{m.content}</div>
  );
  if (m.content.startsWith("🎬 ") || m.content.startsWith("🎥 ") || m.content.startsWith("🧍 ")) return (
    <div data-testid="scene-note" style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 12, padding: "6px 12px", borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--border)" }} className="muted">{m.content}</div>
  );
  if (m.media) return (
    <div data-testid="chat-media" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {face}
      <div style={{ maxWidth: "min(80%, 380px)" }}>
        <MediaView media={m.media} onReady={onMedia} onFailed={onFailed} who={who} onAnswer={x => onAnswer(x)} />
        {m.media.status === "done" && <ReactionBar value={m.media.reaction} onPick={r => onReact(m.media!.id, r)} />}
        {social && m.media.status === "done" && <SocialButton done={!!m.media.social} openHandle={openHandle} onGo={() => social(m.media!)} />}
        <When at={m.at} align={mine ? "right" : "left"} />
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
        {m.content !== "📎" && styled((mine ? m.content : noJargon(dropSentNote(dropThoughts(m.content))).trim()).replace(/\*\*(.+?)\*\*/g, "$1"))}
        {mine && m.theirReaction && badge(m.theirReaction, who)}
        {!mine && m.reaction && badge(m.reaction, "You")}
      </div>
      {picking && m.id && <ReactionBar value={m.reaction} onPick={r => { onReactMsg(m.id!, r); setPicking(false); }} />}
      <When at={m.at} align={mine ? "right" : "left"} />
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
/** 👀 The peek, before it's made: it opens empty — ↻ Write has an AI (hers by default) write what
 *  you'd see, ↻ again rewrites it — and you can type or fix anything yourself before it's made. */
/**
 * 📸 A picture you asked her for: you see exactly what's going to the picture service first, the
 * same as a peek. Send it as it is, change a line, or drop it.
 */
function AskSheet({ who, ask, busy, onChange, onSend, onClose, onHide }: {
  who: string; ask: { kind: "image" | "video"; description: string }; busy: boolean;
  onChange: (d: string) => void; onSend: (d: string) => void; onClose: () => void; onHide: () => void;
}) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  return (
    <div role="dialog" aria-modal="true" data-testid="ask-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📸 {who}&apos;s {ask.kind === "image" ? "photo" : "video"}</div>
          <button type="button" className="ghost" onClick={onHide} aria-label="Later" title="Later" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>This goes to the picture service exactly as it reads. Change anything you like, or send it as it is. ✕ keeps it for later; Cancel drops it.</div>
        <textarea value={ask.description} onChange={e => onChange(e.target.value)} maxLength={1500} autoFocus data-testid="ask-prompt"
          style={{ width: "100%", minHeight: 110, resize: "vertical", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} data-testid="ask-cancel" style={{ padding: "10px 14px" }}>Cancel</button>
          <button type="button" className="btn" onClick={() => onSend(ask.description)} disabled={busy || ask.description.trim().length < 5} data-testid="ask-send" style={{ flex: 1, padding: "10px 14px" }}>{busy ? "…" : "Send it"}</button>
        </div>
      </div>
    </div>
  );
}

function PeekSheet({ who, sheet, brains, theirs, onChange, onWriter, onRewrite, onSend, onClose }: { who: string; sheet: { description: string; loading: boolean; error?: string; icu?: boolean; writer: string }; brains: string[]; theirs: string; onChange: (d: string) => void; onWriter: (w: string) => void; onRewrite: () => void; onSend: (d: string) => void; onClose: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  // Who can write it: Claude, plus the Atlas brains this server has set up. Hers is the default.
  const options = [{ id: "", label: "Claude (same as Velo)" }, ...BRAIN_OPTIONS.filter(o => o.atlas && (brains.includes(o.id) || o.id === theirs)).map(o => ({ id: o.id as string, label: o.label as string }))];
  return (
    <div role="dialog" aria-modal="true" data-testid="peek-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{sheet.icu ? `👁️ I see you, ${who}` : `👀 Peek at ${who}`}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>This is the picture that will be made, using her reference pictures. Write it yourself, or tap ↻ to have it written — then fix anything that&apos;s off. She won&apos;t know.</div>
        <textarea value={sheet.description} onChange={e => onChange(e.target.value)} maxLength={1500} rows={5} aria-label="Peek description" disabled={sheet.loading}
          placeholder={sheet.loading ? "Writing what you'd see…" : "e.g. Her at a candlelit corner table in an emerald dress, laughing and glancing up at me"} style={{ resize: "vertical" }} />
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <label className="row muted" style={{ gap: 4, fontSize: 12 }} title="Who writes it">🧠
            <select value={sheet.writer} aria-label="Who writes it" data-testid="peek-writer" disabled={sheet.loading} onChange={e => onWriter(e.target.value)}
              style={{ padding: "4px 6px", fontSize: 12, width: "auto", borderRadius: 8 }}>
              {options.map(o => <option key={o.id || "same"} value={o.id}>{o.label}{o.id === theirs ? " — hers" : ""}</option>)}
            </select>
          </label>
          <span className="muted" style={{ fontSize: 11 }}>{sheet.description.length}/1500</span>
        </div>
        {sheet.error && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {sheet.error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={onRewrite} disabled={sheet.loading} data-testid="peek-rewrite" style={{ flexShrink: 0 }}>{sheet.loading ? "…" : sheet.description.trim() ? "↻ Rewrite" : "↻ Write"}</button>
          <button className="btn" onClick={() => onSend(sheet.description)} disabled={sheet.loading || sheet.description.trim().length < 10} data-testid="peek-go" style={{ flex: 1 }}>{sheet.loading ? "…" : sheet.icu ? "👁️ Look" : "👀 Peek"}</button>
        </div>
      </div>
    </div>
  );
}

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type SceneClockChoice = { clock: "now" | "set"; time: string };
export function SceneSheet({ who, plan, onClose, onStart }: { who: string; plan?: { title: string; details: string; time?: string } | null; onClose: () => void; onStart: (kind: "live" | "past", title: string, details: string, clock: SceneClockChoice) => Promise<void> }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
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
  const tab = (on: boolean) => ({ flex: 1, padding: "8px 10px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "rgba(124,140,255,0.15)" : "transparent", color: "var(--text)" } as const);
  return (
    <div role="dialog" aria-modal="true" data-testid="scene-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={() => { stopMics(); onClose(); }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🎥 {plan ? `Your plans with ${who}` : `A video chat with ${who}`}</div>
          <button className="ghost" onClick={() => { stopMics(); onClose(); }} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" style={tab(kind === "live")} onClick={() => setKind("live")} data-testid="scene-live">Play it out</button>
          <button type="button" style={tab(kind === "past")} onClick={() => setKind("past")} data-testid="scene-past">It already happened</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{kind === "live" ? `You two are on video together — each of you where you are. ${who} plays her side; *actions in asterisks* show in italics. End it when you're done; it becomes a memory you both have.` : `Tell ${who} what you did together — she'll remember it as a real shared memory and talk about it.`}</div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>{kind === "live" ? "What's the plan?" : "What did you do?"}
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} aria-label="Scene" placeholder={kind === "live" ? "e.g. Dinner together on video" : "e.g. Went bowling downtown"} style={{ flex: 1, minWidth: 0 }} />
            {micBtn({ m: titleMic, other: detailsMic, value: title, label: "Say the plan", id: "scene-title-mic" })}
          </span>
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>{plan ? "Describe the scene" : "Details"} <span className="muted" style={{ fontWeight: 500 }}>· {plan ? "the more you write, the better" : "optional"}</span>
          <span className="row" style={{ gap: 8, marginTop: 4, alignItems: "flex-start" }}>
            <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} rows={3} aria-label="Scene details" style={{ flex: 1, minWidth: 0, resize: "vertical" }}
              placeholder={kind === "live" ? "What you're doing and where she is — e.g. Friday night, she's cooking at hers, I'm on the sofa" : "What happened — e.g. you beat me twice, I threw a gutter ball, then we got ice cream"} />
            {micBtn({ m: detailsMic, other: titleMic, value: details, label: "Describe it out loud", id: "scene-details-mic" })}
          </span>
        </label>
        {kind === "live" && (
          <div data-testid="scene-clock" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🕒 When is it happening?</div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" style={tab(clock === "now")} onClick={() => setClock("now")} data-testid="scene-clock-now">Now (real time)</button>
              <button type="button" style={tab(clock === "set")} onClick={() => setClock("set")} data-testid="scene-clock-set">Scheduled time</button>
            </div>
            {clock === "set" && <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Scene time" data-testid="scene-time" />}
            <span className="muted" style={{ fontSize: 12 }}>{clock === "now"
              ? `It happens right now — the light and time of day are real.${plan?.time ? ` ${who} will know it got moved from the planned time (no big deal, unless it keeps happening).` : ""}`
              : `The scene keeps its own clock, starting at ${time || "the time you pick"} and moving on as you play. ${who} won't know it's out of sync with real time.`}</span>
          </div>
        )}
        {(titleMic.listening || detailsMic.listening) && <div className="muted" style={{ fontSize: 12 }} data-testid="scene-listening">🎙️ Listening… tap ⏹️ when you&apos;re done.</div>}
        {(titleMic.error || detailsMic.error) && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {titleMic.error || detailsMic.error}</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" disabled={busy || !title.trim()} onClick={go} data-testid="scene-go">{busy ? "…" : kind === "live" ? "Start the scene" : `Tell ${who}`}</button>
      </div>
    </div>
  );
}


/** 🗑 Long-press (or right-click) a message to start selecting; then a tap toggles it. */
// 📷 A press on a photo or video is the phone's own (long-press to save / share), never ours.
const onPhoto = (e: { target: EventTarget | null }) => !!(e.target instanceof Element && e.target.closest("img, video"));

export function Selectable({ id, selecting, onStart, onToggle, children }: { id?: string; selecting: Set<string> | null; onStart: (id: string) => void; onToggle: (id: string) => void; children: React.ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  if (!id) return <>{children}</>;
  const on = !!selecting?.has(id);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return (
    <div data-testid="msg-row" data-selected={on ? "1" : undefined}
      onPointerDown={e => { if (selecting || onPhoto(e)) return; fired.current = false; cancel(); timer.current = setTimeout(() => { fired.current = true; onStart(id); }, 550); }}
      onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={e => { if (onPhoto(e)) return; e.preventDefault(); if (!selecting) onStart(id); }}
      onClickCapture={e => { if (selecting) { e.stopPropagation(); e.preventDefault(); if (!fired.current) onToggle(id); fired.current = false; } else if (fired.current) { e.stopPropagation(); fired.current = false; } }}
      style={{ display: "flex", flexDirection: "column", borderRadius: 14, outline: on ? "2px solid var(--accent)" : undefined, background: on ? "rgba(124,140,255,.12)" : undefined, position: "relative", cursor: selecting ? "pointer" : undefined, userSelect: selecting ? "none" : undefined, ...(selecting ? { WebkitTouchCallout: "none" } : {}) } as React.CSSProperties}>
      {selecting && <span aria-hidden style={{ position: "absolute", top: 4, left: 4, fontSize: 14, zIndex: 1 }}>{on ? "☑️" : "⬜"}</span>}
      {children}
    </div>
  );
}

/** 🖼️ Pick one of your pictures (from any chat, peeks or Picagram) to send with your next message. */
function GalleryPicker({ onClose, onPick }: { onClose: () => void; onPick: (f: ChatFile) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  type Item = ChatFile & { at: string; from: string };
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(true);
  const load = async (before: string | null) => {
    const r = await data<{ items: Item[] }>("gallery.pick", before ? { before } : {}).catch(() => ({ items: [] as Item[] }));
    setItems(l => [...(before ? l || [] : []), ...r.items]); setMore(r.items.length >= 30);
  };
  useEffect(() => { load(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="dialog" aria-modal="true" data-testid="gallery-picker" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "80dvh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🖼️ Share a picture</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        {items && !items.length && <div className="muted" style={{ textAlign: "center", padding: 20 }}>No pictures yet</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {(items || []).map(it => (
            <button key={it.id} type="button" onClick={() => onPick({ id: it.id, url: it.url, thumb: it.thumb, name: it.name, type: it.type })} data-testid="gallery-pick-item" title={it.from}
              style={{ position: "relative", padding: 0, border: "none", background: "var(--surface2)", cursor: "pointer", aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.thumb || it.url} alt={`From ${it.from}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" }}>{it.from}</span>
            </button>
          ))}
        </div>
        {items && more && <button className="ghost" onClick={() => load(items.at(-1)?.at || null)}>Show more</button>}
      </div>
    </div>
  );
}

function SocialButton({ onGo, done, openHandle }: { onGo: () => Promise<void> | void; done?: boolean; openHandle?: string | null }) {
  const [busy, setBusy] = useState(false);
  // 🙋 She's already on Picagram: this takes you to her rather than making a second her.
  if (openHandle) return (
    <button className="ghost" data-testid="open-social" disabled={busy} onClick={async () => { setBusy(true); await onGo(); setBusy(false); }}
      style={{ marginTop: 6, padding: "4px 12px", fontSize: 13, borderColor: "#ec4899" }}>{busy ? "✨ Opening…" : `✨ Open @${openHandle}`}</button>
  );
  // Already made: shown greyed out, can't be tapped again.
  if (done) return <button className="ghost" data-testid="create-social" disabled aria-disabled="true" style={{ marginTop: 6, padding: "4px 12px", fontSize: 13, opacity: 0.5, cursor: "default" }}>✓ Social created</button>;
  return (
    <button className="ghost" data-testid="create-social" disabled={busy} onClick={async () => { setBusy(true); await onGo(); setBusy(false); }}
      style={{ marginTop: 6, padding: "4px 12px", fontSize: 13, borderColor: "#ec4899" }}>{busy ? "✨ Making her profile…" : "✨ Create social"}</button>
  );
}
