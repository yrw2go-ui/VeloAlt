// 🗣️ How a character talks: the habits of their voice, written on their card (learned from their own
// messages, then edited by hand). It only ever shapes HOW they say things — never what they say or
// who they are — and the switch on the card turns it off without losing what's written.
export type Speech = { name?: string; speech?: string; speech_on?: boolean };

/** 🗣️ How she talks, in her own habits: only ever HOW she says things, never what she says or who
 *  she is. Her personality and description win every time they disagree, and the switch on her card
 *  turns it off without losing what's written. */
export function speechNote(c: Speech): string {
  const text = (c.speech || "").trim();
  if (!text || c.speech_on === false) return "";
  return `HOW YOU TALK (habits of your voice — phrasing, punctuation, length, words you reach for):
${text.slice(0, 1200)}
This shapes HOW you say things, nothing else. It never decides what you think, feel, want or do, and it never adds anything to who you are. Where it pulls against YOUR PERSONALITY, your backstory, who you are to them or anything below, they win and you simply drop it. Follow it loosely, the way a habit shows up some of the time, not a rule you hit every message.
`;
}

