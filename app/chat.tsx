"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, data } from "./lib/api";
import { VeloAvatar } from "./avatar";
import DraftCard, { type Draft } from "./drafts";
import { hideSecrets } from "./lib/secrets";
import { timeZone } from "./lib/tz";

export type ChatMsg = { role: "user" | "assistant"; content: string; draft?: Draft };
const unsaved = { current: 0 };
const realMsgs = (m: ChatMsg[]) => m.filter(x => !x.draft).map(({ role, content }) => ({ role, content }));
const INTRO = "Hi, I'm Velo! I'm here for whatever you need — planning your day, reminders, to-dos, talking things through, or just keeping you company. What should I call you?";
function helloLine(n: string, pick: number) {
  const who = n ? " " + n : "";
  const lines = [
    "Hey" + who + "! What's on your mind?",
    "Hi" + who + " — how's your day going?",
    "Hey" + who + ", good to see you. What can I do for you?",
  ];
  return lines[pick] || lines[0];
}
const SUGGESTIONS = ["Plan my day", "Remind me to call Mom tomorrow at 6pm", "I need to vent", "Help me set a goal"];

export default function Chat({ userId, name, onChanged, added }: { userId: string; name: string; onChanged: () => void; added: ChatMsg | null }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [who, setWho] = useState("Velo");
  const [people, setPeople] = useState<{ name: string; image: string }[]>([{ name: "Velo", image: "" }]);
  const face = people.find(p => p.name === who)?.image || "";
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("velo:character", { detail: { name: who, image: face } }));
  }, [who, face]);
  const reload = useCallback(() => {
    data<{ messages: ChatMsg[] }>("messages.list", { character: who }).then(r => setMsgs(m => {
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
  }, [who]);
  const end = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>([]);
  const [hello] = useState(() => Math.floor(Math.random() * 3));
  msgsRef.current = msgs || [];

  useEffect(() => {
    data<{ looks: { name: string; image: string }[] }>("profile.listCharacterLooks")
      .then(r => setPeople([{ name: "Velo", image: "" }, ...(r.looks || []).filter(c => c.name !== "Velo")]))
      .catch(() => {});
  }, [userId]);
  useEffect(() => {
    Promise.all([
      data<{ messages: ChatMsg[] }>("messages.list", { character: who }).then(r => r.messages).catch(() => [] as ChatMsg[]),
      who === "Velo" ? data<{ drafts: Draft[] }>("drafts.list").then(r => r.drafts).catch(() => [] as Draft[]) : Promise.resolve([] as Draft[]),
    ]).then(([m, d]) => setMsgs([...m, ...d.filter(x => x.status === "pending" || x.status === "calling").map(draft => ({ role: "assistant" as const, content: "", draft }))]));
  }, [userId, who]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  useEffect(() => {
    if (!added) return;
    setMsgs(m => [...(m || []), added]);
    data("messages.add", { messages: [added] }).catch(() => {});
  }, [added, userId]);

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
    const t = hideSecrets(raw.trim()).text;
    if (!t || busy || !msgs) return;
    const opener: ChatMsg[] = msgs.length ? [] : [{ role: "assistant", content: openingLine }];
    const next = [...msgs, ...opener, { role: "user" as const, content: t }];
    setMsgs(next); setText(""); setBusy(true); setErr("");
    unsaved.current++;
    await data("messages.add", { messages: [...opener, { role: "user", content: t }], character: who }).catch(() => {});
    try {
      const r = who === "Velo"
        ? await api<{ reply: string; changed?: boolean; drafts?: Draft[] }>("/api/velo", { mode: "chat", messages: realMsgs(next), timeZone: timeZone(), name })
        : await data<{ reply: string; changed?: boolean; drafts?: Draft[] }>("character.chat", { character: who, messages: realMsgs(next), timeZone: timeZone(), name });
      setMsgs(m => [...(m || []), { role: "assistant", content: r.reply }, ...(r.drafts || []).map(draft => ({ role: "assistant" as const, content: "", draft }))]);
      setBusy(false);
      await data("messages.add", { messages: [{ role: "assistant", content: r.reply }], character: who }).catch(() => {});
      if (who !== "Velo") await data("character.remember", { character: who, text: t.slice(0, 400) }).catch(() => {});
      if (r.changed) onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Velo didn't answer.");
    } finally { setBusy(false); }
  };

  const first = (name || "").split(" ")[0];
  const openingLine = who !== "Velo" ? "Hey, it's " + who + ". What's on your mind?" : msgs && !msgs.length && !name ? INTRO : helloLine(first, hello);
  const shown: ChatMsg[] = msgs && !msgs.length ? [{ role: "assistant", content: openingLine }] : msgs || [];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        {people.map(p => (
          <button key={p.name} onClick={() => setWho(p.name)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: who === p.name ? "var(--accent)" : "transparent", color: who === p.name ? "white" : "var(--text)", fontSize: 13, flexShrink: 0 }}>
            {p.image ? <img src={"/api/pic?u=" + encodeURIComponent(p.image)} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} /> : null}
            {p.name}
          </button>
        ))}
      </div>
      <div data-testid="chat-log" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((m, i) => m.draft ? <DraftCard key={m.draft.id} d={m.draft} onReport={reload} /> : <Bubble key={i} m={m} face={m.role === "assistant" ? face : ""} who={who} />)}
        {busy && <div className="row">{face ? <img src={"/api/pic?u=" + encodeURIComponent(face)} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} /> : <VeloAvatar size={28} />}<div className="muted" style={{ fontSize: 14 }}>{who} is typing…</div></div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>Could not send.</div>}
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
        <button className="btn" disabled={!text.trim() || busy} aria-label="Send" style={{ borderRadius: 999, width: 46, height: 46, padding: 0, flexShrink: 0 }}>Send</button>
      </form>
    </div>
  );
}

function Bubble({ m, face, who }: { m: ChatMsg; face?: string; who?: string }) {
  const mine = m.role === "user";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start" }}>
      {!mine && (face ? <img src={"/api/pic?u=" + encodeURIComponent(face)} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} /> : <VeloAvatar size={28} />)}
      <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: mine ? 18 : 4, borderBottomRightRadius: mine ? 4 : 18, background: mine ? "linear-gradient(135deg, var(--accent), var(--accent2))" : "var(--surface2)", color: "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.45, fontSize: 15 }}>
        {renderRich(m.content.replace(/\*\*(.+?)\*\*/g, "$1"))}
      </div>
    </div>
  );
}

function Pic({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  const src = "/api/pic?u=" + encodeURIComponent(url);
  if (!ok) {
    return <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{url.slice(0, 80)}</a>;
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 8 }}>
      <img src={src} alt="" onError={() => setOk(false)} style={{ width: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 12, background: "#111", display: "block" }} />
    </a>
  );
}

function renderRich(text: string) {
  const parts = text.split(/(https:\/\/[^\s<>"']+)/g);
  return parts.map((part, i) => (i % 2 ? <Pic key={i} url={part.replace(/[.,;:!?)]+$/, "")} /> : part));
}
