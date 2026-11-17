// 😮 The reactions (on messages, photos and videos; in chats and group chats). One list, used everywhere.
export const REACTIONS = ["❤️", "😍", "☺️", "😘", "🔥", "🙌", "👍", "😮", "😂", "🥵", "🤤", "💦", "😈", "😏", "👀", "👌", "🤔", "🫣", "😅", "😴"] as const;

// 👋 Signing off without words: what she leaves on your last message when you're both winding down.
export const SIGN_OFF = ["❤️", "❤️", "❤️", "❤️", "😍", "☺️", "😘"] as const;

// 🔥 The ones that say more than "nice": she always has something to say back to these.
export const HOT = ["🔥", "🥵", "🤤", "💦", "😈"] as const;
export const isHot = (r: unknown): boolean => typeof r === "string" && (HOT as readonly string[]).includes(r);
export const isReaction = (r: unknown): r is (typeof REACTIONS)[number] => typeof r === "string" && (REACTIONS as readonly string[]).includes(r);

// 🎲 How often she taps a reaction on their message: about 1 in 7 (~15%) on an ordinary message,
// more when it's got feeling in it (excited, sweet, funny, a compliment, a photo), less on a quick
// "ok" or a practical question. She still writes her reply as usual — the reaction is on top.
const FEELING = /[!❤️😍🥰😘😂🤣🔥😭🥺💕💖😊😁]|\b(love|miss|cute|beautiful|gorgeous|sexy|hot|amazing|awesome|proud|happy|excited|lol|lmao|haha+|omg|wow|aww+|thank(s| you))\b/iu;
const FLAT = /^\s*(ok(ay)?|k|kk|sure|yep|yeah|yes|no|nope|cool|fine|got it|alright|mhm|hm+)\s*[.!]?\s*$/i;

export function reactChance(said: string, withPhoto = false): number {
  const t = String(said || "");
  if (withPhoto) return 0.4;
  if (FLAT.test(t) || !t.trim()) return 0.05;
  if (FEELING.test(t)) return 0.25;
  if (/\?\s*$/.test(t) && t.length < 80) return 0.08;
  return 0.15;
}

/** This turn, does she react? `roll` is 0–1 (Math.random() in the app; fixed in tests). */
export const reactsThisTime = (said: string, withPhoto: boolean, roll: number): boolean => roll < reactChance(said, withPhoto);
