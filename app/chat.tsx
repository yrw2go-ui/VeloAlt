"use client";
// 💬 The chat with Velo. Messages are saved to velo_messages (so the chat
// follows them across devices). When they leave the app after chatting, Velo
// files a short summary and any new goals/facts in her memory ("memo").
import { useEffect, useRef, useState } from "react";
import { api, data } from "./lib/api";
import { VeloAvatar } from "./avatar";
import { timeZone } from "./lib/tz";

export type ChatMsg = { role: "user" | "assistant"; content: string };
const INTRO = "Hi, I'm Velo! 👋 I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
const HELLO = (n: string) => [`Hey${n ? ` ${n}` : ""}! What's on your mind?`, `Hi${n ? ` ${n}` : ""} — how's your day going?`, `Hey${n ? ` ${n}` : ""}, good to see you. What can I do for you?`];
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

export default function Chat({ userId, name, onChanged, added }: { userId: string; name: string; onChanged: () => void; added: ChatMsg | null }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>([]);
  const unsaved = useRef(0); // their messages since the last memo
  const [hello] = useState(() => Math.floor(Math.random() * 3));
  msgsRef.current = msgs || [];

  useEffect(() => {
    data<{ messages: ChatMsg[] }>("messages.list").then(r => setMsgs(r.messages)).catch(() => setMsgs([]));
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
      api("/api/velo", { mode: "memo", messages: msgsRef.current.slice(-40), timeZone: timeZone(), name }).catch(() => {});
    };
    document.addEventListener("visibilitychange", memo);
    return () => document.removeEventListener("visibilitychange", memo);
  }, [name]);

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busy || !msgs) return;
    const opener: ChatMsg[] = msgs.length ? [] : [{ role: "assistant", content: openingLine }];
    const next = [...msgs, ...opener, { role: "user" as const, content: t }];
    setMsgs(next); setText(""); setBusy(true); setErr("");
    unsaved.current++;
    await data("messages.add", { messages: [...opener, { role: "user", content: t }] }).catch(() => {});
    try {
      const r = await api<{ reply: string; changed?: boolean }>("/api/velo", { mode: "chat", messages: next, timeZone: timeZone(), name });
      setMsgs(m => [...(m || []), { role: "assistant", content: r.reply }]);
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
        {shown.map((m, i) => <Bubble key={i} m={m} />)}
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
        {m.content.replace(/\*\*(.+?)\*\*/g, "$1")}
      </div>
    </div>
  );
}
