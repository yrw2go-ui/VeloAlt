// Models sometimes put HTML in a message (e.g. a lone "</br>" beside a photo); chat is plain text.
export function cleanTags(t: string): string {
  return t.replace(/<\/?br\s*\/?>/gi, "\n").replace(/<\/?(p|div|span|b|i|em|strong|u|small)\b[^>]*>/gi, "").replace(/&nbsp;/gi, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// 🙈 Some models slip into narrating the app instead of talking: "(They see the message and the
// system is waiting for their reply.)", "(No further action needed.)", "As an AI, …". Those lines
// are never part of what she'd say, so they're dropped — and if that's the whole reply, it doesn't count.
// An aside — "(…)" or "*…*" — only has to sound like app narration; a plain line has to be unmistakable.
const ASIDE = /\b(the (system|app|chat app|assistant|model) (is|has|will|was|needs|expects|waits)|waiting for (their|his|her|the user'?s|a) (reply|response|message|next message)|no (further|more) (action|response|reply)|nothing (more|else) (to do|is needed)|out of character|end of (turn|response)|user'?s (turn|input)\b)/i;
const ALWAYS = /\b(as an ai\b|ai language model|\bi am an ai\b|tool call|function call|system prompt)/i;
const SAYS = /[A-Za-z]/;

/** Drops stage-direction lines that talk about the app instead of to the person. */
export function dropMeta(t: string): string {
  const lines = t.split("\n").filter(line => {
    const s = line.trim();
    if (!s) return true;
    const bare = s.replace(/^[([*_"“”]+|[)\]*_"“”]+$/g, "").trim();
    const aside = /^[([*]/.test(s) && /[)\]*]$/.test(s); // a parenthetical / *italic* aside
    return !(ALWAYS.test(bare) || (aside && ASIDE.test(bare)));
  });
  return cleanTags(lines.join("\n"));
}

/** True when nothing usable is left once the stage directions are gone. */
export function isMeta(t: string): boolean {
  const left = dropMeta(t);
  return !!t.trim() && (!left || !SAYS.test(left));
}
