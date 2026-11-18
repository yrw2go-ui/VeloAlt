"use client";
import { useEffect, useState } from "react";
import { data } from "./lib/api";
import { atFragment } from "./lib/mention";
export { atFragment, putName } from "./lib/mention";

export type Person = { name: string; what: "character" | "picagram"; handle: string };

/** 🗣️ Type @ in a message box and pick someone — a character, or a woman on your Picagram.
 *  Naming her is all it does: she's told who was named, never that they've met. */
export function MentionPicker({ text, caret, onPick, testid = "mention" }: {
  text: string; caret: number; onPick: (name: string, at: number) => void; testid?: string;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const spot = atFragment(text, caret);
  const frag = spot?.frag ?? null;
  useEffect(() => {
    if (frag === null) { setPeople([]); return; }
    // A short wait so a quick typist doesn't ask for every letter.
    const t = setTimeout(() => {
      data<{ people: Person[] }>("people", { q: frag.toLowerCase() }).then(r => setPeople(r.people || [])).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [frag]);
  if (frag === null || !people.length) return null;
  return (
    <div data-testid={testid} role="listbox" aria-label="People you can name"
      style={{ position: "absolute", bottom: "100%", left: 8, right: 8, marginBottom: 6, zIndex: 40, maxHeight: 220, overflowY: "auto",
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,.45)" }}>
      {people.map(p => (
        <button key={`${p.what}:${p.name}:${p.handle}`} type="button" data-testid={`${testid}-item`} onClick={() => onPick(p.name, spot!.at)}
          style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left", padding: "9px 12px", background: "none",
            border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
          <span>{p.what === "picagram" ? "📸" : "💬"}</span>
          <span style={{ fontWeight: 700 }}>{p.name}</span>
          {p.handle && <span className="muted" style={{ fontSize: 12 }}>@{p.handle}</span>}
        </button>
      ))}
    </div>
  );
}
