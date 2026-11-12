// 💬 Picagram: random comments and usernames from strangers (followers), so every post feels alive.
// Hundreds of variations: plain comments, short reactions and emoji-only comments, mixed and matched.

const GENERAL = [
  "Love this!", "This is everything 😍", "Obsessed 🔥", "Okay but this is so cute", "Goals fr", "Living for this", "Stunning as always",
  "Wow 😮", "No because this is amazing", "Need this energy today", "Vibes ✨", "This made my day", "So pretty!!", "Yesss", "Iconic",
  "Can't stop looking at this", "Absolutely gorgeous", "Main character energy", "Love love love", "This is so you", "Where is this?? 😍",
  "Okay I'm jealous", "The lighting tho 👌", "Serving looks", "A whole vibe", "Beautiful!", "Slayyy", "You look so happy here",
  "Need details on the outfit", "This is art", "Ugh I love this", "Perfection", "So fun!!", "Wish I was there", "Take me with you next time",
  "Cutest thing I've seen all day", "Glowing ✨", "This is giving everything", "Okay queen", "Stop it 😍", "Loving the vibes here",
  "Low key obsessed", "Love your style", "This is such a mood", "Where did you get that??", "You never miss", "That smile tho",
  "Absolutely love this pic", "Gorgeous view", "Can we talk about how good this is", "Saving this", "Frame this one", "10/10",
  "This is my favorite post of yours", "Literally perfect", "Such good energy", "Love to see it", "Okay this is cute cute", "Mood forever",
  "You're glowing", "So effortless", "This!!!", "Couldn't be more perfect", "I needed to see this today", "Ugh goals", "Weekend vibes",
  "Happy for you!", "Enjoy!!", "Looks like so much fun", "Looks amazing", "Need a day like this", "Chef's kiss", "Unreal 😍",
  "How are you so photogenic", "Okay model 👀", "Teach me your ways", "Big fan of this", "Sweet!", "Adorable", "Look at you!",
  "So proud of you", "Love this for you", "Rate: 💯", "Hello?? 😍😍", "Not you looking this good", "Too cute", "The vibe is unmatched",
];
const GYM = ["Gym goals 💪", "Those gains tho", "Okay fitness queen", "Motivated to work out now", "Leg day hits different", "Strong and gorgeous 💪",
  "Where's the workout plan", "Put the rest of us to shame", "Consistency pays off!", "Beast mode", "Fit check approved ✅", "Inspo for my next workout"];
const FOOD = ["That looks delicious 🤤", "Recipe please!!", "Now I'm hungry", "Save me a plate", "Yum!", "Okay chef 👩‍🍳", "Need this right now", "Foodie goals"];
const PET = ["OMG the baby 😭", "Cutest little buddy", "I need to pet them", "Who's a good baby", "Stop the cuteness 🐾", "That face!! 😍", "Best friend goals"];
const BEACH = ["Beach day goals 🌊", "Take me there!!", "That water tho", "Summer vibes ☀️", "Jealous of this view", "Sun-kissed ✨", "Paradise 🏝️"];
const TRAVEL = ["Have fun on your trip!", "Bring me back a souvenir", "Living the dream ✈️", "Travel goals", "Enjoy every second!", "Wish I was there 😩", "Postcard worthy"];
const FRIENDS = ["Besties!! 💕", "You two are the cutest", "Squad goals", "Love this duo", "Friendship goals", "Double trouble 😂", "The best pair"];
const HOME = ["Cozy vibes 🏡", "Love your place", "Lazy day mood", "Comfy goals", "Such a cozy spot", "Self care day ✨"];
const TEXT = ["So true 😂", "Felt this", "Literally me", "Same!!", "Mood", "Relatable af", "Hahaha yes", "Big agree", "Couldn't have said it better",
  "Needed to hear this", "Facts", "Preach 🙌", "This is so real", "Lmao 😂", "Okay but why is this so accurate", "Story of my life", "100%",
  "I feel seen", "Bestie this is me", "No lies detected", "Say it louder", "Hahaha I love you", "Spill the tea ☕", "Tell me more!!"];
const EMOJI = ["😍", "🔥", "😍😍😍", "🔥🔥", "❤️", "❤️❤️", "💕", "😮", "👏", "👏👏👏", "🙌", "💯", "✨", "😘", "🥰", "🤩", "😭😍", "💖", "🥵", "😂",
  "😂😂", "👀", "👀🔥", "💪", "💪🔥", "🌊☀️", "🐾😍", "🤤", "🙌🔥", "😍🔥", "❤️🔥", "💯💯", "✨😍", "🥹", "😳🔥", "💅", "👑", "🫶", "😊", "😎",
  "🌸", "🌞", "😻", "💥", "🤍", "💙", "🖤", "💜", "😆", "🤗", "🤭", "😌", "🎉", "🍑🔥", "💐", "🌺", "🏝️", "✈️😍", "🍕😋", "🐶❤️"];

const FIRST = ["jess", "mike", "tay", "sam", "alex", "jordan", "chris", "brit", "kayla", "ty", "mia", "nate", "lexi", "dani", "zoe", "rob", "luis", "ana", "emma", "liv",
  "kat", "ben", "sara", "max", "jade", "nick", "ellie", "josh", "maddie", "drew", "bella", "cam", "rae", "leo", "nina", "matt", "ivy", "aj", "sky", "dev"];
const TAIL = ["_xo", ".fit", "_official", "lovesyou", "_vibes", "babyy", ".daily", "_travels", "_eats", "_gram", "x3", "__", "_ok", "_life", "_art", "_photo", "_99", "_21", "_07", ""];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function randomUser(): string {
  const n = Math.random() < 0.5 ? String(Math.floor(Math.random() * 999)) : "";
  return `${pick(FIRST)}${pick(TAIL)}${n}`.slice(0, 24);
}

/** A few random strangers' comments for a post (some emoji-only), fitted loosely to what it's about. */
export function randomComments(text: string, kind: "image" | "text", n: number): { name: string; text: string }[] {
  const t = text.toLowerCase();
  const themed = [
    /gym|workout|lift|run|yoga|fit|sweat/.test(t) ? GYM : [],
    /food|dinner|lunch|brunch|cook|bake|pizza|coffee|eat/.test(t) ? FOOD : [],
    /dog|cat|pup|kitten|pet/.test(t) ? PET : [],
    /beach|pool|ocean|lake|waterpark|bikini|swim/.test(t) ? BEACH : [],
    /vacation|trip|travel|flight|hotel|resort|airport/.test(t) ? TRAVEL : [],
    /friend|bestie|sister|brother|mom|dad|with /.test(t) ? FRIENDS : [],
    /home|couch|bed|cozy|lazy|blanket/.test(t) ? HOME : [],
  ].flat();
  const out: { name: string; text: string }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const r = Math.random();
    const c = r < 0.35 ? pick(EMOJI) : kind === "text" ? (r < 0.8 ? pick(TEXT) : pick(GENERAL)) : themed.length && r < 0.6 ? pick(themed) : pick(GENERAL);
    if (used.has(c)) continue;
    used.add(c);
    out.push({ name: randomUser(), text: c });
  }
  return out;
}
