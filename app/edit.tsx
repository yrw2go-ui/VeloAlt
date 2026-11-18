"use client";
import { useBack } from "./lib/back";

/** ✏️ Rewording a message, full screen: the words get the whole page, with Cancel and Save on top.
 *  Escape (and the phone's back button) leaves it as it was; ⌘/Ctrl+Enter saves. */
export function EditSheet({ who, value, busy, onChange, onSave, onClose, testid = "edit-sheet" }: {
  who: string; value: string; busy?: boolean;
  onChange: (v: string) => void; onSave: () => void; onClose: () => void; testid?: string;
}) {
  useBack(true, onClose);
  return (
    <div role="dialog" aria-modal="true" data-testid={testid} onClick={e => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2800, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
        <button className="ghost" data-testid={`${testid}-cancel`} onClick={onClose} style={{ padding: "6px 12px", fontSize: 14 }}>Cancel</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 14 }}>✏️ {who}</div>
        <button className="btn" data-testid={`${testid}-save`} disabled={!value.trim() || !!busy} onClick={onSave} style={{ padding: "6px 14px", fontSize: 14 }}>{busy ? "…" : "Save"}</button>
      </div>
      <textarea value={value} autoFocus aria-label="Edit message" data-testid={`${testid}-box`} maxLength={4000}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); } }}
        style={{ flex: 1, width: "100%", resize: "none", border: "none", outline: "none", background: "var(--bg)", color: "var(--text)",
          font: "inherit", fontSize: 16, lineHeight: 1.5, padding: "14px 16px", whiteSpace: "pre-wrap" }} />
      <div className="muted" style={{ padding: "6px 16px 12px", fontSize: 12 }}>Enter makes a new line · ⌘/Ctrl + Enter saves</div>
    </div>
  );
}
