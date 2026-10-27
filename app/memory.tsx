"use client";
// 🧠 What Velo remembers: goals, things she knows about you, and past chats and
// calls. You can forget any of it (and clear the chat history).
import { useEffect, useState } from "react";
import { data } from "./lib/api";
import { confirmAsk } from "./lib/dialog";

type Mem = { id: string; kind: "goal" | "fact" | "call" | "chat"; text: string; status: string; created_at: string };
const SECTIONS: { title: string; pick: (m: Mem) => boolean; empty: string }[] = [
  { title: "🎯 Goals", pick: m => m.kind === "goal", empty: "No goals yet — tell Velo what you're working toward." },
  { title: "💡 Things Velo knows about you", pick: m => m.kind === "fact", empty: "Nothing yet. Velo picks things up as you talk." },
  { title: "🗓️ Past chats & calls", pick: m => m.kind === "chat" || m.kind === "call", empty: "Summaries of your chats and calls show up here." },
];

export default function Memory({ refresh }: { refresh: number }) {
  const [mems, setMems] = useState<Mem[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    data<{ memories: Mem[] }>("memories.list").then(r => setMems(r.memories)).catch(() => setMems([]));
  }, [refresh, tick]);

  const forget = async (m: Mem) => {
    if (!(await confirmAsk("Forget this? Are you sure?"))) return;
    await data("memories.delete", { id: m.id }).catch(() => {});
    setTick(t => t + 1);
  };
  const clearChat = async () => {
    if (!(await confirmAsk("Delete your whole chat history with Velo? Are you sure? (Her memories stay unless you forget them here.)"))) return;
    await data("messages.clear").catch(() => {});
    location.reload();
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="muted" style={{ fontSize: 14 }}>Velo remembers these so she can follow up like a friend would. Only you can see them.</div>
      {SECTIONS.map(s => {
        const list = (mems || []).filter(s.pick);
        return (
          <section key={s.title} className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{s.title}</div>
            {mems === null ? <div className="muted">Loading…</div> : !list.length ? <div className="muted" style={{ fontSize: 14 }}>{s.empty}</div> : list.map(m => (
              <div key={m.id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--border)", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ textDecoration: m.status === "dropped" ? "line-through" : undefined }}>{m.status === "hit" ? "✅ " : ""}{m.text}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.kind === "call" ? "📞 " : m.kind === "chat" ? "💬 " : ""}{new Date(m.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                <button className="ghost" onClick={() => forget(m)} style={{ padding: "4px 10px", fontSize: 12 }}>Forget</button>
              </div>
            ))}
          </section>
        );
      })}
      <button className="ghost" onClick={clearChat}>Clear chat history</button>
    </div>
  );
}
