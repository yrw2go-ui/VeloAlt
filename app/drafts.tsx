"use client";
// ✉️📞 Texts and calls Velo drafted (Velo Pro). Nothing goes out until you tap
// Send / Call here (or reply YES by text). Calls update when Velo reports back.
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { formatPhone } from "./lib/contact";

export type Draft = { id: string; kind: "text" | "call"; to_name: string | null; to_phone: string; body: string; status: string; result?: string | null };

const LABEL: Record<string, string> = { done: "", calling: "Calling… I'll report back in the chat.", failed: "Didn't go through.", cancelled: "Cancelled.", approved: "Working on it…" };

export default function DraftCard({ d, onReport }: { d: Draft; onReport: () => void }) {
  const [status, setStatus] = useState(d.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const who = d.to_name ? `${d.to_name} (${formatPhone(d.to_phone)})` : formatPhone(d.to_phone);
  const text = d.kind === "text";

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
      <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{text ? "✉️ TEXT TO" : "📞 CALL"} {who}</div>
      <div style={{ margin: "6px 0 10px", whiteSpace: "pre-wrap", fontSize: 15 }}>{text ? d.body : `Goal: ${d.body}`}</div>
      {status === "pending" ? (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => act("approve")} style={{ padding: "8px 16px" }}>{busy ? "…" : text ? "Send" : "Call"}</button>
          <button className="ghost" disabled={busy} onClick={() => act("cancel")} style={{ padding: "8px 14px" }}>Cancel</button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: status === "failed" ? "var(--bad)" : "var(--muted)" }}>
          {status === "done" ? (text ? "Sent ✅" : "Call finished — report is in the chat.") : LABEL[status] || status}
        </div>
      )}
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>⚠️ {err}</div>}
    </div>
  );
}
