"use client";
// ✱ The asterisk, one tap away. It's wanted often — *she smiles*, *walks in* — and on a phone
// keyboard it's two taps down a symbol page, which is enough friction to put you off using it.
import type { RefObject } from "react";

/** The text with a * dropped in where the caret was, and where the caret should sit after. */
export const starAt = (text: string, caret: number): { text: string; caret: number } => {
  const at = Math.max(0, Math.min(Number.isFinite(caret) ? caret : text.length, text.length));
  return { text: `${text.slice(0, at)}*${text.slice(at)}`, caret: at + 1 };
};

type Box = HTMLInputElement | HTMLTextAreaElement | null;

/** Put a * in at the caret, then hand the box back with the caret just after it. */
export function tapStar(box: RefObject<Box> | { current: Box } | null, text: string, caret: number,
  setText: (t: string) => void, setCaret: (n: number) => void) {
  const r = starAt(text, caret);
  setText(r.text); setCaret(r.caret);
  // After React has painted the new text, or the caret lands in the wrong place.
  requestAnimationFrame(() => {
    const el = box?.current;
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(r.caret, r.caret); } catch { /* a box that can't be asked: never mind */ }
  });
}

/** The button itself, sized to sit in a composer row beside the box. */
export function StarButton({ onTap, disabled, testid = "star" }: { onTap: () => void; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" onClick={onTap} disabled={disabled} data-testid={testid}
      aria-label="Add an asterisk" title="Asterisk — for *actions* like this"
      onMouseDown={e => e.preventDefault()} // don't steal the caret from the box
      style={{ borderRadius: 999, width: 32, height: 46, padding: 0, flexShrink: 0, cursor: "pointer",
        fontSize: 22, lineHeight: 1, border: "none", background: "transparent", color: "var(--muted)" }}>*</button>
  );
}
