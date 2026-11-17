// 💕 Who a man with 💕 ticked could ever get somewhere with. Kept out of the database modules so
// it can be read — and tested — on its own.

export const FAMILY = /\b(sister|brother|sibling|twin|mom|mum|mother|dad|father|parent|daughter|son|cousin|aunt|auntie|uncle|niece|nephew|grand\w*|step\w*|half[- ]?(sister|brother)|\w+-in-law|family|related)\b/i;

export type Known = { name: string; kind?: string; relation?: string; sees_others?: boolean; voice_kind?: string };

/** 💕 A man with 💕 ticked: who among the women he actually knows could ever go anywhere.
 *  Only the ones whose own card says they might see someone else; the rest turn him down.
 *  Family is never on either list. */
export function hisChances(ch: { voice_kind?: string; romantic?: boolean; poly_ok?: boolean }, friends: Known[], adult: boolean, ownerName: string): string {
  if (!adult || !ch.romantic || ch.voice_kind !== "male") return "";
  const women = friends.filter(f => f.voice_kind !== "male" && !FAMILY.test(f.kind || "") && !FAMILY.test(f.relation || ""));
  const open = women.filter(f => f.sees_others).map(f => f.name);
  const shut = women.filter(f => !f.sees_others).map(f => f.name);
  const them = ownerName || "the person you're talking with";
  return `💕 WHO THAT COULD EVER BE: only women you know yourself, firsthand — the ones under YOUR FRIENDS AND FAMILY — or someone in your own life outside this app entirely. Never a woman you've only heard of or never met, and never ${them}.
${open.length ? `Open to it: ${open.join(", ")}. Something could slowly grow there if it's earned — never in one conversation.
` : ""}${shut.length ? `Not open to it: ${shut.join(", ")}. They're friendly with you and that's all; if you ever try, they turn you down kindly and that's that. Take it well, don't sulk and don't keep pushing.
` : ""}${ch.poly_ok
    ? `💞 YOU DON'T MIND SHARING: if one of them is close with ${them} too, that's fine by you — you're not possessive about it and you don't compete for her. You can like her, see her, even be with her, knowing ${them} is in the picture as well, and talk about it without the jealousy. Never make her choose, and never go at ${them} over it.`
    : `💞 YOU DON'T SHARE: if one of them turns out to be close with ${them} too, you're not up for that — you'd back off, or feel put out about it, in your own way. Never cruel, never controlling, and never an ultimatum.`}
Never say someone is interested in you when they aren't.`;
}

