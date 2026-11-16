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

/** True when nothing usable is left once the stage directions and leaked tool calls are gone. */
export function isMeta(t: string): boolean {
  const left = cleanReply(t);
  return !!t.trim() && (!left || !SAYS.test(left));
}

// 🧰 Some models write a tool call out as text instead of making one: "<invoke name="x">…</invoke>",
// "<function_calls>", a ```json block. None of that is a message, so it never reaches the chat.
const CALL_TAGS = /<\/?\s*(invoke|antml:invoke|function_calls|antml:function_calls|function_results|tool_use|tool_call|parameter|antml:parameter|thinking|antml:thinking)\b[^>]*>/gi;
const FENCE = /```[a-z]*\s*|```/gi;
/**
 * 📸 …and some write the call out the way code would — "(send_media(kind='image',
 * description='…', with_me=True))" — right in the middle of what she's saying. That's never a
 * message either: it's read (so the picture can actually be made) and then cut out.
 */
const WRITTEN_CALL = /\(?\s*\b(send_media|send_photo|send_image)\s*\(([\s\S]*?)\)\s*\)?/i;

export type WrittenCall = { kind: "image" | "video"; description: string; with_me: boolean; with_them: boolean };

/** The call she wrote out as words, if there is one. */
export function writtenCall(t: string): WrittenCall | null {
  const m = WRITTEN_CALL.exec(t || "");
  if (!m) return null;
  const args = m[2] || "";
  const arg = (name: string) => {
    const a = new RegExp(`\\b${name}\\s*[=:]\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|([A-Za-z0-9_]+))`, "i").exec(args);
    return a ? (a[1] ?? a[2] ?? a[3] ?? "").replace(/\\(['"])/g, "$1") : "";
  };
  const yes = (v: string) => /^(true|yes|1)$/i.test(v.trim());
  // No named description: take the longest quoted run — that's what she meant to send.
  const quoted = [...args.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
    .map(q => (q[1] ?? q[2] ?? "").trim())
    .filter(v => v.length >= 12 && !/^(image|photo|picture|video|vid|clip)$/i.test(v))
    .sort((a, b) => b.length - a.length);
  const description = (arg("description") || arg("prompt") || quoted[0] || "").replace(/\s+/g, " ").trim();
  if (description.length < 12) return null;
  return { kind: /video/i.test(arg("kind")) ? "video" : "image", description: description.slice(0, 1500), with_me: arg("with_me") === "" ? true : yes(arg("with_me")), with_them: yes(arg("with_them")) };
}

/** What she said, with that written-out call taken out of it. */
export const dropWrittenCall = (t: string) =>
  t.replace(WRITTEN_CALL, " ").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

/** Strips tool-call scaffolding and code fences a model leaked into its reply. */
export function stripScaffolding(t: string): string {
  const out = t.replace(/<\s*(invoke|antml:invoke|function_calls|antml:function_calls|tool_use|parameter|antml:parameter|thinking|antml:thinking)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(CALL_TAGS, " ").replace(FENCE, " ")
    .replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "");
  return /[\p{L}\p{N}]/u.test(out) ? cleanTags(out) : "";
}
// 💭 Some models write their thoughts out in square brackets — "[She wonders if he means it]",
// "[I should play this cool]". Those are never something she'd say out loud, so they never show.
// Brackets the PERSON types are a different thing entirely (stepping out of a scene); this is only
// ever applied to what a model sends back.
const THOUGHT = /\[[^\]\n]{0,300}\]/g;
export function dropThoughts(t: string): string {
  return t.replace(THOUGHT, " ").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

// 🙊 Caption-speak that no one says out loud. Belt and braces: the prompts say not to, and
// anything that slips through is put back into plain words before it's shown or saved.
const GOLDEN = /\bgolden[-\s]?hour\b/gi;
export function noJargon(t: string): string {
  return t.replace(GOLDEN, (m, i: number) => (i === 0 || /[.!?]\s+$/.test(t.slice(0, i)) ? "The evening light" : "the evening light"));
}

/** Everything a reply goes through before it's shown: stray HTML, leaked tool calls, stage directions, thoughts. */
// 🙈 Her own scaffolding leaking into her words: "(I sent an image)", "(sent a photo: …)",
// "[photo sent]". She'd never type it, and the real picture comes as its own message.
const SENT_NOTE = /\s*[([](?:(?:i\s+)?(?:just\s+)?(?:sent|sends|sending|attached|attaching|shared)\s+(?:you\s+)?(?:an?\s+|the\s+|my\s+)?(?:pic|picture|photo|image|selfie|video|vid|clip|snap|shot)s?|(?:pic|picture|photo|image|selfie|video|vid|clip|snap|shot)s?\s+(?:sent|attached|shared))\b[^)\]]*[)\]]/gi;
export const dropSentNote = (t: string) => t.replace(SENT_NOTE, " ").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

export const cleanReply = (t: string) => noJargon(dropSentNote(dropWrittenCall(dropThoughts(dropMeta(stripScaffolding(cleanTags(t)))))));

/**
 * 💭 Thoughts you plant. Anything the person types in [square brackets] isn't something they said
 * out loud — it's a thought, a feeling or a fact about her world that she takes as true and acts
 * on. The same rule in her chats and in her Picagram DMs, so it behaves the same everywhere.
 */
export const BRACKETS = (them: string) =>
  `💭 Anything ${them} puts in [square brackets] is NOT something they said out loud. It's a thought, a feeling, a memory or a turn of events — take it as true about you and your world, let it land, and act on it from then on. Reply only to what they actually said out loud. If the brackets were ALL they sent, there is nothing to answer — it's a thought in your own head, not a message: stay quiet unless it genuinely makes you say or do something, and then say that, as if the thought had just come to you. Never repeat the bracketed words back, never put brackets around your own thoughts, and never mention or ask about the brackets themselves.`;
