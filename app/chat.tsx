"use client";
// 💬 The chat with Velo. Messages are saved to velo_messages (so the chat
// follows them across devices). When they leave the app after chatting, Velo
// files a short summary and any new goals/facts in her memory ("memo").
import { useCallback, useEffect, useRef, useState } from "react";
import { api, data } from "./lib/api";
import { VeloAvatar } from "./avatar";
import DraftCard, { type Draft } from "./drafts";
import { hideSecrets } from "./lib/secrets";
import { timeZone } from "./lib/tz";

export type ChatMsg = { role: "user" | "assistant"; content: string; draft?: Draft };
/** What Velo sees: real messages only (draft cards are local to the screen). */
// Their messages since the last memo. Kept outside the component so switching tabs doesn't reset it.
const unsaved = { current: 0 };
const realMsgs = (m: ChatMsg[]) => m.filter(x => !x.draft).map(({ role, content }) => ({ role, content }));
const INTRO = "Hi, I'm Velo! 👋 I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
const HELLO = (n: string) => [`Hey${n ? ` \( {n}` : ""}! What's on your mind?`, `Hi \){n ? ` \( {n}` : ""} — how's your day going?`, `Hey \){n ? ` ${n}` : ""}, good to see you. What can I do for you?`];
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

export default function Chat({ userId, name, onChanged, added }: { userId: string; name: string; onChanged: () => void; added: ChatMsg | null }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // A call finished: Velo's report landed in the chat (draft cards stay where they are).
  const reload = useCallback(() => {
    data<{ messages: ChatMsg[] }>("messages.list").then(r => setMsgs(m => {
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
  }, []);
  const end = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>([]);
  const [hello] = useState(() => Math.floor(Math.random() * 3));
  msgsRef.current = msgs || [];

  useEffect(() => {
    // History, then drafts still waiting for a Send and calls still going.
    Promise.all([
      data<{ messages: ChatMsg[] }>("messages.list").then(r => r.messages).catch(() => [] as ChatMsg[]),
      data<{ drafts: Draft[] }>("drafts.list").then(r => r.drafts).catch(() => [] as Draft[]),
    ]).then(([m, d]) => setMsgs([...m, ...d.filter(x => x.status === "pending" || x.status === "calling").map(draft => ({ role: "assistant" as const, content: "", draft }))]));
  }, [userId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  // A call recap lands in the chat.
  useEffect(() => {
    if (!added) return;
    setMsgs(m => [...(m || []), added]);
    data("messages.add", { messages: [added] }).catch(() => {});
  }, [added, userId]);

  // 🧠 Leaving the app after a chat: Velo remembers what mattered.
  useEffect(() => {
    const memo = () => {
      if (unsaved.current < 2 || document.visibilityState !== "hidden") return;
      unsaved.current = 0;
      api("/api/velo", { mode: "memo", messages: realMsgs(msgsRef.current).slice(-40), timeZone: timeZone(), name }).catch(() => {});
    };
    document.addEventListener("visibilitychange", memo);
    return () => document.removeEventListener("visibilitychange", memo);
  }, [name]);

  const send = async (raw: string) => {
    // 🔒 Passwords and codes are hidden right here, before anything leaves the phone.
    const t = hideSecrets(raw.trim()).text;
    if (!t || busy || !msgs) return;
    const opener: ChatMsg[] = msgs.length ? [] : [{ role: "assistant", content: openingLine }];
    const next = [...msgs, ...opener, { role: "user" as const, content: t }];
    setMsgs(next); setText(""); setBusy(true); setErr("");
    unsaved.current++;
    await data("messages.add", { messages: [...opener, { role: "user", content: t }] }).catch(() => {});
    try {
      const r = await api<{ reply: string; changed?: boolean; drafts?: Draft[] }>("/api/velo", { mode: "chat", messages: realMsgs(next), timeZone: timeZone(), name });
      setMsgs(m => [...(m || []), { role: "assistant", content: r.reply }, ...(r.drafts || []).map(draft => ({ role: "assistant" as const, content: "", draft }))]);
      // Free the box as soon as her reply shows; saving it can finish in the background.
      setBusy(false);
      await data("messages.add", { messages: [{ role: "assistant", content: r.reply }] }).catch(() => {});
      if (r.changed) onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Velo didn't answer.");
    } finally { setBusy(false); }
  };

  const openingLine = msgs && !msgs.length && !name ? INTRO : HELLO(name.split(" ")[0])[hello];
  const shown: ChatMsg[] = msgs && !msgs.length ? [{ role: "assistant", content: openingLine }] : msgs || [];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div data-testid="chat-log" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((m, i) => m.draft ? <DraftCard key={m.draft.id} d={m.draft} onReport={reload} /> : <Bubble key={i} m={m} />)}
        {busy && <div className="row"><VeloAvatar size={28} /><div className="muted" style={{ fontSize: 14 }}>Velo is typing…</div></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>⚠️ {err}</div>}
        {msgs && msgs.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {SUGGESTIONS.map(s => <button key={s} className="ghost" onClick={() => send(s)} style={{ borderRadius: 999, fontSize: 14, padding: "8px 12px" }}>{s}</button>)}
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={e => { e.preventDefault(); send(text); }} className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <textarea rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={msgs ? "Message Velo…" : "Loading…"} aria-label="Message Velo" disabled={!msgs}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          style={{ resize: "none", maxHeight: 140, borderRadius: 20 }} />
        <button className="btn" disabled={!text.trim() || busy} aria-label="Send" style={{ borderRadius: 999, width: 46, height: 46, padding: 0, flexShrink: 0 }}>➤</button>
      </form>
    </div>
  );
}

function Bubble({ m }: { m: ChatMsg }) {
  const mine = m.role === "user";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start" }}>
      {!mine && <VeloAvatar size={28} />}
      <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18,
        background: mine ? "linear-gradient(135deg, var(--accent), var(--accent2))" : "var(--surface2)", color: "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.45, fontSize: 15 }}>
        {renderRich(m.content.replace(/\*\*(.+?)\*\*/g, "$1"))}
      </div>
    </div>
  );
}

const URL_RE = /(https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
const isImageUrl = (url: string) =>
  /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url) ||
  /blob\.vercel-storage\.com|volces\.com|cloudfront\.net|r2\.dev|spicyapi|\/images?\//i.test(url);

/** Web links become tappable. Image links render in the bubble. */
function renderRich(text: string) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    if (isImageUrl(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "block", marginTop: 8 }}>
          <img src={part} alt="" referrerPolicy="no-referrer" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 12, background: "#111", display: "block" }} />
        </a>
      );
    }
    return <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{part.replace(/^https:\/\/(www\.)?/, "").slice(0, 60)}</a>;
  });
}
