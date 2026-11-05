"use client";
// ✉️📞📣 Texts, calls and Facebook posts Velo drafted (Velo Pro). Nothing goes
// out until you tap Send / Call / Post here (or reply YES by text). Calls update
// when Velo reports back.
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { formatPhone } from "./lib/contact";

export type Draft = { id: string; kind: "text" | "call" | "post" | "cart"; to_name: string | null; to_phone: string | null; body: string; status: string; result?: string | null };
const HEAD = { text: "✉️ TEXT TO", call: "📞 CALL", post: "📣 FACEBOOK POST ON", cart: "🛒 AMAZON CART" };
const BUTTON = { text: "Send", call: "Call", post: "Post", cart: "" };
const DONE = { text: "Sent ✅", call: "Call finished — report is in the chat.", post: "Posted ✅", cart: "" };

const LABEL: Record<string, string> = { done: "", calling: "Calling… I'll report back in the chat.", failed: "Didn't go through.", cancelled: "Cancelled.", approved: "Working on it…" };

export default function DraftCard({ d, onReport }: { d: Draft; onReport: () => void }) {
  const [status, setStatus] = useState(d.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const who = d.kind === "cart" ? "" : d.kind === "post" ? d.to_name : d.to_name ? `${d.to_name} (${formatPhone(d.to_phone)})` : formatPhone(d.to_phone);

  // A call in progress: check back until Velo's report is in.
  useEffect(() => {
    if (status !== "calling") return;
    const t = setInterval(async () => {
      const r = await api<{ status: string }>("/api/actions", { action: "get", id: d.id }).catch(() => null);
      if (r && r.status !== "calling") { setStatus(r.status); onReport(); }
    }, 5000);
    return () => clearInterval(t);
  }, [status, d.id, onReport]);

  const act = async (action: "approve" | "cancel") => {
    setBusy(true); setErr("");
    try { const r = await api<{ status: string }>("/api/actions", { action, id: d.id }); setStatus(r.status); }
    catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="draft" className="card" style={{ padding: 12, marginLeft: 36, borderColor: status === "pending" ? "var(--accent)" : "var(--border)" }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{HEAD[d.kind]} {who}</div>
      <div style={{ margin: "6px 0 10px", whiteSpace: "pre-wrap", fontSize: 15 }}>{d.kind === "call" ? `Goal: ${d.body}` : d.body}</div>
      {d.kind === "cart" ? (
        <div>
          {/^https:\/\/www\.amazon\.com\//.test(d.result || "") && (
            <a className="btn" href={d.result!} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "8px 16px", textDecoration: "none" }}>Open Amazon cart</a>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>You review and check out on Amazon — Velo never buys anything. Prices are confirmed there.</div>
        </div>
      ) : status === "pending" ? (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => act("approve")} style={{ padding: "8px 16px" }}>{busy ? "…" : BUTTON[d.kind]}</button>
          <button className="ghost" disabled={busy} onClick={() => act("cancel")} style={{ padding: "8px 14px" }}>Cancel</button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: status === "failed" ? "var(--bad)" : "var(--muted)" }}>
          {status === "done" ? DONE[d.kind] : LABEL[status] || status}
        </div>
      )}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>⚠️ {err}</div>}
    </div>
  );
}
