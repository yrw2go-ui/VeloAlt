"use client";
// ☀️ Today: what today holds with your people, then reminders and the to-do list
// (Velo adds to both in chat; you can too).
import { useEffect, useState } from "react";
import { data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { timeZone } from "./lib/tz";

type Hangout = { id: string; characterId: string; who: string; portrait: string | null; title: string; details: string; time: string; kind: "video" | "person"; now: boolean };
type Nudge = { kind: "quiet" | "unhappy"; characterId: string; who: string; portrait: string | null; line: string };
type Reminder = { id: string; text: string; remind_at: string; status: string };
type Task = { id: string; text: string; due_date: string | null; done: boolean };
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "14:30" the way a clock reads it where they are. */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
/** Today where THEY are — so the list turns over at their midnight, not the server's. */
const localDay = () => new Date().toLocaleDateString("en-CA", { timeZone: timeZone() });

export default function Today({ refresh, onChat }: { refresh: number; onChat?: (characterId: string) => void }) {
  const [mine, setMine] = useState<{ hangouts: Hangout[]; nudges: Nudge[] } | null>(null);
  const [rems, setRems] = useState<Reminder[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    data<{ hangouts: Hangout[]; nudges: Nudge[] }>("today.list", { timeZone: timeZone() })
      .then(r => setMine({ hangouts: r.hangouts || [], nudges: r.nudges || [] })).catch(() => setMine({ hangouts: [], nudges: [] }));
    data<{ reminders: Reminder[] }>("reminders.list").then(r => setRems(r.reminders)).catch(() => setRems([]));
    data<{ tasks: Task[] }>("tasks.list").then(r => setTasks(r.tasks)).catch(() => setTasks([]));
  }, [refresh, tick]);

  // 🔄 Fresh again when you come back to it, and the moment the day turns over — so plans made
  // this evening for tonight are here, and yesterday's are not.
  useEffect(() => {
    let day = localDay();
    const look = () => {
      if (document.visibilityState !== "visible") return;
      const now = localDay();
      const stale = now !== day;
      day = now;
      setTick(t => t + 1);
      return stale;
    };
    const timer = setInterval(() => { if (localDay() !== day) { day = localDay(); setTick(t => t + 1); } }, 60_000);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", look); };
  }, []);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim().slice(0, 300);
    if (!text) return;
    setDraft("");
    await data("tasks.add", { text }).catch(() => {});
    setTick(t => t + 1);
  };
  const toggle = async (t: Task) => {
    setTasks(ts => (ts || []).map(x => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await data("tasks.toggle", { id: t.id, done: !t.done }).catch(() => setTick(x => x + 1));
  };
  const delTask = async (t: Task) => {
    if (!(await confirmAsk(`Delete "${t.text}"? Are you sure?`))) return;
    await data("tasks.delete", { id: t.id }).catch(() => {});
    setTick(x => x + 1);
  };
  const doneRem = async (r: Reminder) => {
    if (r.status === "pending" && !(await confirmAsk(`Cancel the reminder "${r.text}"? Are you sure?`))) return;
    await data("reminders.dismiss", { id: r.id }).catch(() => {});
    setTick(x => x + 1);
  };

  const now = Date.now();
  const face = (url: string | null, who: string) => url
    ? <img src={url} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
    : <span aria-hidden style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: "var(--surface2)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700 }}>{who.slice(0, 1)}</span>;
  const go = (id: string) => onChat?.(id);
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)", width: "100%", textAlign: "left" as const, background: "none", border: "none", borderTopStyle: "solid" as const, cursor: onChat ? "pointer" : "default", color: "inherit" };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ☀️ What today holds with your people. */}
      <section className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>☀️ Today</div>
        {mine === null ? <div className="muted">Loading…</div> : !mine.hangouts.length && !mine.nudges.length ? (
          <div className="muted" style={{ fontSize: 14 }}>Nothing on today, and everyone&apos;s heard from you lately.</div>
        ) : (
          <>
            {mine.hangouts.map(h => (
              <button key={h.id} data-testid={`today-plan-${h.characterId}`} onClick={() => go(h.characterId)} style={row}>
                {face(h.portrait, h.who)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{h.kind === "person" ? "🧍" : "🎥"} {h.who}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{h.now ? " · together now" : h.time ? ` · ${clock(h.time)}` : ""}</span>
                  <br />
                  <span style={{ fontSize: 13 }}>{h.title}{h.details ? <span className="muted"> — {h.details}</span> : null}</span>
                </span>
                {onChat && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>Open ›</span>}
              </button>
            ))}
            {mine.nudges.map(n => (
              <button key={`${n.kind}:${n.characterId}`} data-testid={`today-nudge-${n.characterId}`} onClick={() => go(n.characterId)} style={row}>
                {face(n.portrait, n.who)}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  {n.kind === "quiet" ? "💭" : "🙁"} {n.line}
                  {onChat && <span className="muted"> Say something ›</span>}
                </span>
              </button>
            ))}
          </>
        )}
      </section>

      <section className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>⏰ Reminders</div>
        {rems === null ? <div className="muted">Loading…</div> : !rems.length ? (
          <div className="muted" style={{ fontSize: 14 }}>Nothing coming up. Try telling Velo &quot;remind me to stretch at 3pm&quot;.</div>
        ) : rems.map(r => {
          const isDue = new Date(r.remind_at).getTime() <= now;
          return (
            <div key={r.id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.text}</div>
                <div style={{ fontSize: 12, color: isDue ? "var(--accent)" : "var(--muted)" }}>{isDue ? "Due · " : ""}{when(r.remind_at)}</div>
              </div>
              <button className="ghost" onClick={() => doneRem(r)} style={{ padding: "6px 10px", fontSize: 13 }}>{isDue ? "Done" : "Cancel"}</button>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>✅ To-do</div>
        <form onSubmit={addTask} className="row" style={{ marginBottom: 8 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a to-do…" aria-label="Add a to-do" maxLength={300} />
          <button className="btn" disabled={!draft.trim()}>Add</button>
        </form>
        {tasks === null ? <div className="muted">Loading…</div> : !tasks.length ? (
          <div className="muted" style={{ fontSize: 14 }}>All clear. 🎉</div>
        ) : tasks.map(t => (
          <div key={t.id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Done: ${t.text}`} style={{ width: 22, height: 22, flexShrink: 0, accentColor: "var(--accent)" }} />
            <div style={{ flex: 1, textDecoration: t.done ? "line-through" : undefined, color: t.done ? "var(--muted)" : undefined }}>
              {t.text}{t.due_date && <span className="muted" style={{ fontSize: 12 }}> · due {t.due_date}</span>}
            </div>
            <button onClick={() => delTask(t)} aria-label={`Delete ${t.text}`} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>🗑️</button>
          </div>
        ))}
      </section>
    </div>
  );
}
