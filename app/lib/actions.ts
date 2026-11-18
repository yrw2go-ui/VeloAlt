// 🫱 When all you send is an action.
//
// `*moves closer to her and cuddles*` isn't a question and it isn't small talk — it's something
// you did, and the honest answer to it is often not a sentence. Sometimes it's one emoji, the one
// that says how she took it. Sometimes it's an action straight back:
//
//   you:  *moves closer to her and cuddles*
//   her:  *settles in closer to enjoy the warmth and closeness*
//
// Which of those happens is hers: her personality, her sliders and where the two of you are.

/** 😏 What she might answer with when words would be too much. */
export const ACTION_EMOJI = ["😏", "❤️", "😈", "😳", "🫣", "😊", "😘", "😚", "😙", "😋", "😜", "🤭", "🤔", "🤨"] as const;

/** Is this message nothing but an action? "*cuddles*", "*moves closer* *smiles*" — but not
 *  "*laughs* yeah okay", which has something said out loud in it. */
export function onlyAction(text: string): boolean {
  const t = String(text || "").trim();
  if (!t.startsWith("*") || t.length < 3) return false;
  // Take every *…* run out; if nothing but punctuation and spaces is left, it was all action.
  const left = t.replace(/\*[^*]+\*/g, " ").replace(/[\s.,!?;:…]+/gu, "");
  return !left;
}

export type Answer = "emoji" | "action" | "words";

/** 🎲 How she answers one. Roughly a quarter get one emoji, a third get an action back, and the
 *  rest get words as usual — so neither ever becomes her whole personality. `roll` is 0–1. */
export function answerTo(roll: number): Answer {
  if (roll < 0.25) return "emoji";
  if (roll < 0.58) return "action";
  return "words";
}

/** What she's told, when it's one of the two short ways. Empty for an ordinary worded reply. */
export function actionNote(answer: Answer, who: string): string {
  if (answer === "emoji") {
    return `🫱 ${who} has just sent you something they DID, not something they said. Answer with ONE emoji and nothing else — no words, no action, no punctuation. Pick the one that honestly says how you take it, from how you feel about them right now, your personality and your sliders: ${ACTION_EMOJI.join(" ")}. Pleased, shy, amused, smug, unsure, unimpressed — whichever it really is. Nothing else in the message at all.`;
  }
  if (answer === "action") {
    return `🫱 ${who} has just sent you something they DID, not something they said. Answer the same way: ONE action of your own, in *asterisks*, and nothing else — no words before or after it. What you actually do in reply, in a few plain words, true to how you feel about them and your sliders (settle in closer, go still, pull back a little, laugh into their shoulder). One line, no dialogue.`;
  }
  return "";
}
