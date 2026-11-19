/**
 * 🤫 Discreet presents — the personal, private sort.
 *
 * A discreet gift isn't the kind of thing anyone posts about. It's meant for her and for you, and
 * it only reads as romantic if the two of you actually are. Sent to someone who barely knows you,
 * or to a friend who was never anything more, it lands as a surprise and she'll say so.
 *
 * Pure on purpose — no database here, so the rules can be tested on their own.
 */

/** How a discreet present lands with her. */
export type Take = "glad" | "shy" | "surprised";

/** Warm enough that something private between you two makes sense. */
export const CLOSE_ENOUGH = 58;

export function takeOn(opts: { romantic: boolean; closeness: number; flirty: number; happy: number }): Take {
  const { romantic, closeness, flirty, happy } = opts;
  // Not that kind of thing between you: it's a surprise however nice it is.
  if (!romantic) return "surprised";
  // Romantic, but either still new to each other or not someone who flirts: pleased, and shy about it.
  if (closeness < CLOSE_ENOUGH || flirty <= 2) return "shy";
  // Hurt with you and it's still a bit much, however close you are.
  if (happy < 35) return "shy";
  return "glad";
}

/** Whether she'd send a picture of it at all. */
export const photoOk = (take: Take) => take !== "surprised";

/**
 * The line that goes in her prompt. It never tells her how to feel in words she'd not use —
 * it tells her what KIND of thing just arrived and leaves the voice to her.
 */
export function discreetNote(take: Take, them: string, romantic: boolean): string {
  const who = them || "they";
  const privately = "Whatever you think of it, it stays between the two of you: it is not something you would post about or tell anyone, and you do not treat it as a story to share.";
  if (take === "surprised")
    return `🤫 WHAT ARRIVED IS A PRIVATE, PERSONAL THING — the sort of present someone gives a partner, not a friend. You and ${who} are NOT together that way. So you are caught off guard. Be honest about that in your own way: a little taken aback, maybe amused, maybe awkward, and ask what made them send you this — not cruelly, and without a lecture. You can still be kind about the thought behind it. Do not play along as though this were ordinary between you, and do not be flirty back. ${privately}`;
  if (take === "shy")
    return `🤫 WHAT ARRIVED IS A PRIVATE, PERSONAL THING — just for you, and meant only for the two of you. You are pleased, and a bit shy about it: this is forward, and it is early days${romantic ? " for the two of you" : ""}. Warm, a little caught out, maybe teasing them for being bold. Keep it well short of anything explicit. ${privately}`;
  return `🤫 WHAT ARRIVED IS A PRIVATE, PERSONAL THING — just for you, and meant only for the two of you. This is the kind of present you like getting from them: say so in your own voice, warm and a bit flirty, the way you two actually are together. Keep it suggestive at most, never explicit. ${privately}`;
}
