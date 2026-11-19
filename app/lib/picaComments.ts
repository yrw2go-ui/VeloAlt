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
const BEACH = ["Beach day goals 🌊", "Take me there!!", "That water tho", "Summer vibes ☀️", "Jealous of this view", "Sun-kissed ✨", "Paradise 🏝️",
  "Wish I was on the beach too!", "Okay I need a beach day", "Save me a spot on the sand"];
const POOL = ["Pool day!! 🏊", "Wish I was in that water", "Okay this is the life", "Taking me with you next time", "That's the summer I want"];
const TRAVEL = ["Have fun on your trip!", "Bring me back a souvenir", "Living the dream ✈️", "Travel goals", "Enjoy every second!", "Wish I was there 😩", "Postcard worthy"];
const FRIENDS = ["Besties!! 💕", "You two are the cutest", "Squad goals", "Love this duo", "Friendship goals", "Double trouble 😂", "The best pair"];
const HOME = ["Cozy vibes 🏡", "Love your place", "Lazy day mood", "Comfy goals", "Such a cozy spot", "Self care day ✨"];
const NIGHT = ["Have the best night!! 🍸", "Okay going OUT out 👀", "Save me a drink", "Who's the lucky bar", "This is the night out energy", "Dance floor is in trouble"];
const WORK = ["Working hard 👏", "Even the work days look good", "Hope the shift flies by", "Boss energy", "Counting down to 5 with you"];
const COFFEE = ["Coffee is life ☕", "Need one of those", "Same order please", "That latte art tho", "Caffeine twins ☕"];
const OUTSIDE = ["That view 😍", "Fresh air goals", "Need to get outside like this", "Gorgeous spot", "Taking this hike next weekend"];
const CAR = ["That car tho 🚗", "Road trip!!", "Where you headed?", "Take me with you", "Drive safe!! "];
const SUNSET = ["That sky 😍", "The light in this 😍", "Prettiest light", "Sunset chaser ✨"];
const DANCE = ["The moves!! 🔥", "Okay go off 💃", "Teach me that", "This is so fun to watch"];

// 👗 What she's wearing: comments that actually name the thing, like a real follower would.
const WEAR: [RegExp, string][] = [
  [/crop ?top/, "crop top"], [/bikini/, "bikini"], [/swimsuit|one ?piece|swimwear/, "swimsuit"], [/sundress/, "sundress"],
  [/\bdress\b/, "dress"], [/\bgown\b/, "gown"], [/\bskirt\b/, "skirt"], [/\bjeans\b/, "jeans"], [/\bdenim\b/, "denim"],
  [/leggings|yoga pants/, "leggings"], [/sports bra/, "sports bra"], [/\bhoodie\b/, "hoodie"], [/sweater|jumper|knit/, "sweater"],
  [/\bcardigan\b/, "cardigan"], [/leather jacket/, "leather jacket"], [/\bjacket\b/, "jacket"], [/\bcoat\b/, "coat"],
  [/\bblazer\b/, "blazer"], [/\bromper\b|\bjumpsuit\b/, "jumpsuit"], [/\bshorts\b/, "shorts"], [/\bboots\b/, "boots"],
  [/\bheels\b|stilettos/, "heels"], [/sneakers|trainers/, "sneakers"], [/\bhat\b|\bcap\b|beanie/, "hat"],
  [/sunglasses|shades/, "sunglasses"], [/\bscarf\b/, "scarf"], [/\bnecklace\b/, "necklace"], [/\bearrings\b/, "earrings"],
  [/\bbag\b|\bpurse\b|handbag/, "bag"], [/\btank top\b/, "tank top"], [/\bt-?shirt\b|\btee\b/, "tee"],
  [/\bblouse\b/, "blouse"], [/\boveralls\b/, "overalls"], [/\bapron\b/, "apron"], [/\bscrubs\b/, "scrubs"],
  [/\buniform\b/, "uniform"], [/\bkimono\b/, "kimono"], [/\bnails\b|manicure/, "nails"], [/\bhair\b/, "hair"],
  [/\bmakeup\b|\bliner\b|\blipstick\b/, "makeup"], [/\bglasses\b/, "glasses"], [/\bwatch\b/, "watch"],
];
const ABOUT_WEAR = (item: string) => [
  `Love the ${item}`, `That ${item} 😍`, `Okay the ${item} is everything`, `Need that ${item}`, `Where's the ${item} from??`,
  `The ${item} 🔥`, `Obsessed with the ${item}`, `${item.charAt(0).toUpperCase() + item.slice(1)} looks so good on you`, `That ${item} though 👌`,
];

const TEXT = ["So true 😂", "Felt this", "Literally me", "Same!!", "Mood", "Relatable af", "Hahaha yes", "Big agree", "Couldn't have said it better",
  "Needed to hear this", "Facts", "Preach 🙌", "This is so real", "Lmao 😂", "Okay but why is this so accurate", "Story of my life", "100%",
  "I feel seen", "Bestie this is me", "No lies detected", "Say it louder", "Hahaha I love you", "Spill the tea ☕", "Tell me more!!"];
const EMOJI = ["😍", "🔥", "😍😍😍", "🔥🔥", "❤️", "❤️❤️", "💕", "😮", "👏", "👏👏👏", "🙌", "💯", "✨", "😘", "🥰", "🤩", "😭😍", "💖", "🥵", "😂",
  "😂😂", "👀", "👀🔥", "💪", "💪🔥", "🌊☀️", "🐾😍", "🤤", "🙌🔥", "😍🔥", "❤️🔥", "💯💯", "✨😍", "🥹", "😳🔥", "💅", "👑", "🫶", "😊", "😎",
  "🌸", "🌞", "😻", "💥", "🤍", "💙", "🖤", "💜", "😆", "🤗", "🤭", "😌", "🎉", "🍑🔥", "💐", "🌺", "🏝️", "✈️😍", "🍕😋", "🐶❤️"];

// 😘 Every so often a stranger shoots their shot. One per post at most. Lines that work on anyone,
// then the ones that only fit a woman's post or a man's.
export const FLIRTY_ANY = [
  "Can we go out sometime?", "You're hot!", "Wanna get a coffee with me?", "Okay you're gorgeous 😍", "Are you single??",
  "Marry me", "Drop a pin, I'm on my way", "Let me take you to dinner", "You're actually stunning", "Sliding into the DMs now 👀",
  "Is it weird to ask you out in the comments?", "Please tell me you're taken because otherwise I have to shoot my shot",
  "Coffee? My treat", "You free this weekend?", "I'd walk a long way for a smile like that",
  "Can I buy you a drink sometime?", "You're the reason I open this app", "Okay but are you dating anyone?",
  "My DMs are open if yours are 😏", "Date? Yes? No? Maybe?", "Hi, hello, hey, how are you 😅", "Breakfast tomorrow? I'll cook", "I have got to ask — are you seeing someone?", "You + me + dinner somewhere, think about it",
  "Not me falling in love in a comment section", "Say the word and I'm there", "Drinks sometime? No pressure 😊",
  "Someone's lucky to have you. Or should I apply?", "Dinner's on me if you say yes",
  "You're unreal 😍 call me?", "Let me know if you ever want company",
];

// 👩 Said to a woman.
export const FLIRTY_HER = [
  "Prettiest girl on here", "Honestly? Wife material", "I'll be the guy in the corner working up the nerve",
  "You're the prettiest thing on my feed", "Whoever gets to take you out is a lucky man",
  "Tell me there's a chance 😅", "Okay I have to ask — can I take you out?", "You'd make a great first date story",
  "Is your boyfriend going to come after me for this comment?", "Beautiful girl", "You're way out of my league but here I am",
  "Hey beautiful 😊", "Seriously, you're beautiful",
];
// 👨 Said to a man.
export const FLIRTY_HIM = [
  "Okay handsome 😍", "Whoever has you is lucky", "You can take me out whenever", "Tell me you're single",
  "Checking for a ring 👀", "My friends all think you're cute, and so do I", "Buy me a drink?",
  "Looking good 🔥", "Someone take him off the market before I do", "Call me 😉", "That smile should be illegal",
  "Taking you out for dinner, no arguments", "You're trouble and I'm into it", "Hi, I'm free this weekend 😊",
  "Okay but who IS this", "Is it too forward to ask you out here?", "Save a dance for me",
];

// 👩 Everyday lines that only really fit a woman's post — left out of a man's.
const HER_ONLY = new Set(["Okay but this is so cute", "Stunning as always", "So pretty!!", "Absolutely gorgeous", "Beautiful!",
  "Slayyy", "Cutest thing I've seen all day", "Glowing \u2728", "Okay queen", "Okay this is cute cute", "You're glowing", "Too cute",
  "Okay model \ud83d\udc40", "How are you so photogenic", "Adorable", "Serving looks", "That smile tho", "Okay fitness queen",
  "Strong and gorgeous \ud83d\udcaa", "\ud83d\udc85", "\ud83d\udc51"]);
// 👨 And the everyday lines a man's post gets instead.
const HIM_ONLY = ["Looking sharp", "Okay sir \ud83d\udc4f", "Clean 🔥", "That fit is clean", "Man knows what he's doing",
  "Respect 🙌", "Solid", "Okay king \ud83d\udc51", "Living right", "Built different", "He's got it figured out",
  "Good man", "That's the energy", "Strong work 💪", "Okay big dog 👀", "Legend", "Fresh 🔥", "Looking well, man",
  "The man, the myth", "Handsome devil", "Rugged \ud83d\udd25", "Doing it right"];

const FIRST = ["jess", "mike", "tay", "sam", "alex", "jordan", "chris", "brit", "kayla", "ty", "mia", "nate", "lexi", "dani", "zoe", "rob", "luis", "ana", "emma", "liv",
  "kat", "ben", "sara", "max", "jade", "nick", "ellie", "josh", "maddie", "drew", "bella", "cam", "rae", "leo", "nina", "matt", "ivy", "aj", "sky", "dev"];
const TAIL = ["_xo", ".fit", "_official", "lovesyou", "_vibes", "babyy", ".daily", "_travels", "_eats", "_gram", "x3", "__", "_ok", "_life", "_art", "_photo", "_99", "_21", "_07", ""];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function randomUser(): string {
  const n = Math.random() < 0.5 ? String(Math.floor(Math.random() * 999)) : "";
  return `${pick(FIRST)}${pick(TAIL)}${n}`.slice(0, 24);
}

// 💬 Free and instant: short comments and emoji that cost nothing at all — no AI, no tokens.
// Most comments on a post come from here; a brain is only asked when a comment should really
// be in someone's own voice about this particular post.
export const QUICK = [
  "Nice!", "Love it ❤️", "😏", "👍", "nice outfit!", "Ooolala!", "Stunning", "Amazing look", "HMU 😏", "Lookin good",
  "Well hey there", "❤️", "😍", "👋☺️", "Perfection 😍", "Coffee sometime?", "Can we chat?", "Omg I love it", "Nice ❤️",
  "Yes!!", "So good", "Love this", "🔥", "🔥🔥", "Gorgeous", "Beautiful", "Wow", "Wow 😍", "This is great",
  "Looking great!", "Love the vibe", "Cute!", "So cute", "Too cute", "Adorable", "Obsessed", "Obsessed 😍",
  "Okay wow", "Stop it 😍", "That smile ☺️", "Great shot", "Love this one", "Yes to all of this", "Incredible",
  "Beautiful as always", "You look amazing", "This made me smile", "Made my day ❤️", "Happy for you!", "Enjoy!",
  "Have fun!!", "Looks fun", "Jealous!", "Wish I was there", "Take me next time", "Save me a spot", "Need this",
  "Same ☺️", "Agreed", "So true", "Facts", "100%", "💯", "🙌", "👏", "👏👏", "✨", "💕", "🥰", "🤩", "😘", "🫶",
  "😊", "☺️", "😎", "🤍", "💖", "👀", "👀🔥", "😮", "🤤", "💪", "🎉", "🌸", "🌞", "💐",
  "Hey you ☺️", "Hi 👋", "Hello there", "Long time!", "Miss you!", "Miss that face", "Come back soon!",
  "Call me sometime", "Text me!", "We need to catch up", "Let's do something soon", "Drinks soon?",
  "Lunch this week?", "You free this weekend?", "Proud of you", "Love to see it", "Keep it up", "Go you!",
  "Doing it right", "Great news!", "Congrats!!", "Aww", "Awww ❤️", "Sweet", "Lovely", "Class", "Perfect",
];
/** One free comment, picked at random. */
export const quickComment = () => pick(QUICK);

/** A few random strangers' comments for a post (some emoji-only).
 *  They're told what the picture shows — what she's doing and what she's wearing — so the
 *  comments land on it ("love the crop top", "wish I was on the beach too!"), not just "Love this!". */
export function randomComments(text: string, kind: "image" | "text", n: number, who: "her" | "him" = "her"): { name: string; text: string }[] {
  const t = text.toLowerCase();
  // 👨 A man's post: the lines that only fit a woman are dropped, and ones that fit him take their place.
  const him = who === "him";
  const ok = (a: string[]) => (him ? a.filter(x => !HER_ONLY.has(x)) : a);
  const themed = [
    /gym|workout|lift|weights|run|jog|yoga|pilates|fit|sweat|treadmill|squat/.test(t) ? GYM : [],
    /food|dinner|lunch|brunch|breakfast|cook|bake|pizza|taco|pasta|eat|meal|plate/.test(t) ? FOOD : [],
    /coffee|latte|espresso|cappuccino|café|cafe/.test(t) ? COFFEE : [],
    /dog|cat|pup|puppy|kitten|pet|horse/.test(t) ? PET : [],
    /beach|ocean|sand|surf|shore|seaside/.test(t) ? BEACH : [],
    /pool|hot tub|jacuzzi|lake|waterpark|swim/.test(t) ? POOL : [],
    /vacation|trip|travel|flight|hotel|resort|airport|abroad/.test(t) ? TRAVEL : [],
    /friend|bestie|sister|brother|mom|dad|girls|with her/.test(t) ? FRIENDS : [],
    /home|couch|bed|cozy|lazy|blanket|kitchen|living room/.test(t) ? HOME : [],
    /club|bar|night out|cocktail|drinks|party|rooftop|concert/.test(t) ? NIGHT : [],
    /work|office|shift|desk|hospital|classroom|studio/.test(t) ? WORK : [],
    /hike|trail|mountain|park|forest|garden|walk|picnic/.test(t) ? OUTSIDE : [],
    /car|driving|road trip|motorcycle|truck/.test(t) ? CAR : [],
    /sunset|sunrise|golden hour|skyline|dusk/.test(t) ? SUNSET : [],
    /danc|club floor|choreo/.test(t) ? DANCE : [],
  ].flat();
  const general = him ? [...ok(GENERAL), ...HIM_ONLY] : GENERAL;
  // 👗 Anything she's actually wearing, named.
  const wearing = kind === "image" ? WEAR.filter(([re]) => re.test(t)).slice(0, 3).flatMap(([, item]) => ABOUT_WEAR(item)) : [];
  // Comments that are about THIS picture — what she's doing and what she has on.
  const about = ok([...themed, ...wearing]);
  const out: { name: string; text: string }[] = [];
  const used = new Set<string>();
  // At least one lands on the picture itself when there's something to land on.
  if (about.length && n > 0) { const c = pick(about); used.add(c); out.push({ name: randomUser(), text: c }); }
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const r = Math.random();
    const c = r < 0.3 ? pick(EMOJI)
      : kind === "text" ? (r < 0.8 ? pick(ok(TEXT)) : pick(general))
      : wearing.length && r < 0.45 ? pick(ok(wearing))
      : about.length && r < 0.72 ? pick(about)
      : pick(general);
    if (used.has(c)) continue;
    used.add(c);
    out.push({ name: randomUser(), text: c });
  }
  // 😘 Now and then one of them shoots their shot instead of just saying something nice. Never the
  // comment about the picture itself (that one stays), and never more than one on the same post.
  if (out.length > 1 && Math.random() < 0.35) {
    const at = 1 + Math.floor(Math.random() * (out.length - 1));
    out[at] = { name: randomUser(), text: pick([...FLIRTY_ANY, ...(him ? FLIRTY_HIM : FLIRTY_HER)]) };
  }
  return out;
}
