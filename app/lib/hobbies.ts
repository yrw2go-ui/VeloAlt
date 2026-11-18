// 🍞 The sourdough problem.
//
// Ask a model to invent a person and a startling number of them bake sourdough, listen to true
// crime, keep succulents and "love a good hike". Left alone, nearly everyone made in the app ends
// up with the same handful of hobbies, which is not how people are.
//
// So it's decided before the model is asked: one person in fifty genuinely is the sourdough one,
// and everybody else is told, in as many words, that they are not.

/** 🎲 One in fifty. */
export const SOURDOUGH_ODDS = 1 / 50;

/** The stock answers. Any of these is fine for the rare person it's actually true of — what isn't
 *  fine is all of them, in everyone. */
export const STOCK_HOBBIES = [
  "baking sourdough", "true-crime podcasts", "collecting succulents", "hot yoga", "thrifting",
  "wine and Netflix", "doing the crossword with coffee", "journalling", "crystals", "trying every new brunch place",
];

/** What the generator is told about hobbies. `roll` is a number from 0 to 1 — the one in fifty. */
export function hobbyRule(roll: number): string {
  const sourdough = roll < SOURDOUGH_ODDS;
  if (sourdough) {
    return `HOBBIES: this one really is a sourdough baker — it's genuinely theirs, so make it specific (the starter has a name, the kitchen smells of it, they're smug about the crumb). Give them one or two other things of their own besides.`;
  }
  return `HOBBIES: make them this person's own, specific and a bit surprising — what they'd actually spend a Saturday on, said plainly (not a list of interests). DO NOT give them any of these, which turn up far too often: ${STOCK_HOBBIES.join("; ")}. Above all no sourdough, no bread baking and no starter of any kind — not in their hobbies, their backstory, their job or their photos.`;
}

/** Did the words that came back ignore it? (Used to catch the stock answer sneaking in.) */
export const SOURDOUGH = /\b(?:sourdough|bread starter|levain|baking bread|bread baking)\b/i;
export const mentionsSourdough = (text: string) => SOURDOUGH.test(text || "");
