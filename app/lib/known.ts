/**
 * 🕰️ How long you two have known each other — and so how much shared history she can draw on.
 *
 * Without this, a character fills the gap herself: a brand-new friend from Picagram starts
 * reminiscing about old trips, nicknames and your family as though you went back years. A
 * blood relative should go back a lifetime; a step-mother of four years goes back four years;
 * someone you followed last week goes back to last week.
 *
 * Pure on purpose — no database here, so it can be tested on its own.
 */

/** Relations that carry a whole life with them, whatever the app knows. */
const LIFELONG = /\b(mom|mum|mother|dad|father|son|daughter|sister|brother|sibling|twin|aunt|uncle|niece|nephew|grandma|grandmother|grandpa|grandfather|cousin|godmother|wife|husband|ex[- ]wife|ex[- ]husband)\b/i;

/** Said in so many words: "childhood friend", "we grew up together", "friends since college". */
const WAY_BACK = /\b(childhood|grew up (together|with)|since (we were|he was|she was|i was) (kids|children|little|young)|lifelong|known (him|her|them|each other) (all|my whole)|best friend since|ever since school|went to (school|college|high school) together)\b/i;

/** A span the writing itself gives: "step-mom of 4 years", "married 12 years", "we met in 2019". */
const SPANS = [
  /\b(?:of|for|about|nearly|almost|over|married|together)\s+(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)\b/i,
  /\b(\d{1,2})\s*(?:years?|yrs?)\s*(?:ago|now|and counting|strong)\b/i,
  /\bpast\s+(\d{1,2})\s*(?:years?|yrs?)\b/i,
];

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const WORD_SPAN = /\b(?:of|for|about|nearly|almost|over|married|together)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:years?|yrs?)\b/i;

/** The number of years the writing claims, when it claims one. */
export function statedYears(text: string): number | null {
  for (const re of SPANS) {
    const m = re.exec(text);
    if (m) { const n = Number(m[1]); if (n >= 1 && n <= 80) return n; }
  }
  const w = WORD_SPAN.exec(text);
  if (w) return WORDS[w[1].toLowerCase()] ?? null;
  return null;
}

/** Roughly how long it's been, in words, so the line reads like a person wrote it. */
export function howLong(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "since yesterday";
  if (days < 14) return `about ${Math.max(2, Math.round(days))} days`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks`;
  if (days < 365) return `about ${Math.max(2, Math.round(days / 30))} months`;
  const y = days / 365;
  return y < 1.6 ? "about a year" : `about ${Math.round(y)} years`;
}

/**
 * The block that goes in her prompt. `days` is how long the character has existed for them.
 */
export function knownNote(opts: { relation: string; backstory: string; days: number; them: string }): string {
  const them = opts.them || "them";
  const said = `${opts.relation || ""} ${opts.backstory || ""}`;
  const years = statedYears(said);
  const lifelong = LIFELONG.test(opts.relation || "") || WAY_BACK.test(said);
  const days = Math.max(0, opts.days || 0);
  const head = `HOW LONG YOU'VE KNOWN ${them.toUpperCase()}`;

  // 👵 Family, or writing that says you go way back: the history is real, lean on it.
  if (lifelong && years === null)
    return `${head}: your whole lives, or near enough — who you are to them says so. The shared history is real: you remember them growing up, the family, the old stories. Draw on it freely, and keep it consistent with your backstory.`;

  // 📆 A span the writing gives: four years of step-mother is four years, not a lifetime.
  if (years !== null)
    return `${head}: about ${years} ${years === 1 ? "year" : "years"} — that's what your backstory says, so that's all the history you two have. Anything older than that you weren't there for: you may have been told about it, but you didn't live it, so don't talk about it as your own memory. Within those ${years} ${years === 1 ? "year" : "years"} you know them well.`;

  // 🌱 Everyone else: it's as new as it actually is.
  const since = howLong(days);
  const budding = days < 21;
  return `${head}: ${days < 1 ? "you've only just met" : `you two have only known each other ${since}`}. ${budding
    ? "This is a new, budding friendship and it should feel like one: you're still finding out who they are, still asking the ordinary getting-to-know-you things, still a little careful. You're warm and interested, not familiar."
    : "You're still fairly new to each other — friendly and comfortable, but not old friends."}
WHAT YOU DON'T KNOW: only what they've actually told you, what's in your backstory, and what you remember from your own conversations. Don't invent shared history — no old trips, no inside jokes you never made, no nicknames out of nowhere, no knowing their job, family, past, habits or favourites unless it came up. If you'd like to know something, ask them.`;
}
