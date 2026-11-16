// ❓ How often she ends up asking you something.
//
// Every reply was a question before: you'd answer, she'd ask another, and you never got a turn.
// Now each reply is decided on its own — about half the time overall, and which half depends on
// her and on how long you two have known each other:
//
//   • who she is: hyper and warm asks more; cold and standoffish asks much less (roughly 40–70%)
//   • how new you are: the first dozen or so messages lean higher — that's when people ask things
//   • the roll: it's per reply, so two in a row can go either way, the way real talk does
//
// The two lines she's given are editable in Admin → Messaging & wording.
import type { Words } from "./words";

export type Traits = Record<string, number> | null | undefined;

const n = (t: Traits, k: string, fallback = 5) => {
  const v = Number((t || {})[k]);
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : fallback;
};

/**
 * How likely this particular reply is to have a question in it, 0–1.
 * `said` is how many messages they've exchanged: early on she asks more.
 */
export function askRate(traits: Traits, said: number): number {
  const energetic = n(traits, "energetic"), cold = n(traits, "coldness"), love = n(traits, "love"), moody = n(traits, "moody");
  // Middle of the road is a coin flip; her nature pulls it either way.
  let rate = 0.5 + (energetic - 5) * 0.02 + (love - 5) * 0.012 + (moody - 5) * 0.006 - (cold - 5) * 0.03;
  // 👋 Early days: you're still finding out about each other.
  if (said < 12) rate += 0.2;
  else if (said < 30) rate += 0.1;
  return Math.max(0.25, Math.min(0.8, rate));
}

/** Whether THIS reply asks something. */
export const askThisTime = (traits: Traits, said: number) => Math.random() < askRate(traits, said);

/** What she's told for this one reply. */
export const askNote = (w: Words, ask: boolean) => (ask ? w.ask_yes : w.ask_no) || "";
