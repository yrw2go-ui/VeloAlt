// 🏡 Ordinary people, not influencers. Six of them turn up on Picagram over time: the sister of
// someone you know, your cousin, your step-sister, a family friend, a friend of a friend, the
// neighbour two doors down. They're adults with everyday lives, small followings and plain photos
// — a quieter kind of account next to the swimsuit models and the trust-fund divas.
//
// Each one turns up once. Where she's connected to one of your characters, the connection is real:
// she's named in that character's memory and the two of them know of each other from then on.

export type Tie = "character" | "you";
export type Folk = {
  key: string;
  /** Who she is, in a line — the brief her profile is written from. */
  who: string;
  /** Her everyday life: what she actually posts about. */
  life: string;
  /** Roughly how many followers someone like her has. */
  followers: [number, number];
  /** Who she's connected to: one of your characters, or you. */
  tie: Tie;
  /** How that connection reads in her bio and in their memory of her. */
  how: string;
};

export const FOLKS: Folk[] = [
  {
    key: "sister",
    who: "a 19-year-old college freshman, still living at home, working weekends at a sandwich place",
    life: "her dorm room, her shifts, her car, studying at the kitchen table at midnight, her sister's dog, being broke",
    followers: [180, 900],
    tie: "character",
    how: "she's {NAME}'s younger sister",
  },
  {
    key: "cousin",
    who: "a 27-year-old in a trade — a dental assistant, a vet tech, a hairdresser — who's had the same haircut for years",
    life: "her kid or her nephews, the lake in summer, her mom's cooking, family birthdays, a bad day at work",
    followers: [220, 1400],
    tie: "you",
    how: "she's your cousin on your dad's side",
  },
  {
    key: "stepsister",
    who: "a 24-year-old working retail management and taking night classes, blunt and funny about all of it",
    life: "closing shifts, her group chat, Target runs, her plants, what her mom said this time",
    followers: [300, 2000],
    tie: "you",
    how: "she's your step-sister — your step-mom's daughter",
  },
  {
    key: "familyfriend",
    who: "a 31-year-old teacher's aide who's known your family for years and still calls your mom on her birthday",
    life: "her classroom, her sourdough, 5K runs she walks half of, her two cats, church on Sunday",
    followers: [400, 2500],
    tie: "you",
    how: "she's a family friend — she's known you since you were kids",
  },
  {
    key: "friendoffriend",
    who: "a 26-year-old barista and part-time photographer who you only know through someone else",
    life: "latte art, film photos of her friends, thrift finds, shows at small venues, her bike",
    followers: [900, 6000],
    tie: "character",
    how: "she's a friend of {NAME}'s — you two have never actually met",
  },
  {
    key: "neighbor",
    who: "a 23-year-old who lives two doors down, talks constantly and posts about ten times a day",
    life: "everything — her coffee, her nails, the mail, a bug she found, her ex, what she's doing right this second",
    followers: [600, 3500],
    tie: "you",
    how: "she lives two doors down from you",
  },
];

/** The brief her profile is written from, instead of the usual influencer lanes. */
export function folkNote(f: Folk, who: string): string {
  const tied = f.how.replace("{NAME}", who || "someone you know");
  return `SHE IS AN ORDINARY PERSON, not an influencer or a model — this one matters: ${f.who}. ${tied}.
WHAT SHE POSTS: ${f.life}. Her photos look like a normal person's phone: ordinary rooms, bad lighting half the time, no makeup some days, her food, her car, her people. No studio shots, no "content", no hashtag walls.
HER BIO reads like a real small account — a line, a town, an emoji or two, maybe who she is to people ("${tied}" can show through in it naturally, or not at all). Nothing curated.
SHE IS AN ADULT (21 or older unless her description says otherwise), and she is never described in a sexual or suggestive way.`;
}

/** Everyday people keep their posts everyday: they're not the ones doing the sensual shots. */
export const FOLK_SUGGESTIVE = 1;

/** The one she's tied to, in their own memory of her. */
export const folkMemory = (f: Folk, her: string, handle: string, who: string) =>
  `${her} — ${f.how.replace("{NAME}", who || "someone")} — is on Picagram as @${handle}.`;
