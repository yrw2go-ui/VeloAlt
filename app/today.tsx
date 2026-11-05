"use client";
// ☀️ Today: upcoming reminders and the to-do list (Velo adds to both in chat; you can too).
import { useEffect, useState } from "react";
import { data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";

type Reminder = { id: string; text: string; remind_at: string; status: string };
type Task = { id: string; text: string; due_date: string | null; done: boolean };
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Today({ refresh }: { refresh: number }) {
  const [rems, setRems] = useState<Reminder[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    data<{ reminders: Reminder[] }>("reminders.list").then(r => setRems(r.reminders)).catch(() => setRems([]));
    data<{ tasks: Task[] }>("tasks.list").then(r => setTasks(r.tasks)).catch(() => setTasks([]));
  }, [refresh, tick]);

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
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
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
