// ✨ So new people don't all come out the same. Each one gets a life of her own — what she does all
// day, what that does to how she looks, talks and spends a Saturday — and an age of her own.
// Everyone is beautiful; nobody is beautiful in the same way.
//
// These are jobs and lives, not dress-up boxes: her work is where most of her comes from.

export type Vibe = { id: string; label: string; look: string; life: string };

export const VIBES: Vibe[] = [
  { id: "swimsuit-model", label: "a swimsuit model with a following",
    look: "long lines, a swimmer's shoulders, careful hair and a slow look to camera; bikinis, cover-ups, gold jewellery, barefoot more than not",
    life: "shoots, brand deals, the right light, a following she half jokes about. Used to being looked at and plays with it. Warm and funny underneath the pose, and sharper about the business of it than people expect" },
  { id: "bookworm", label: "a bookworm",
    look: "quiet and pretty, hair she forgets about, a cardigan, glasses pushed up, a paperback bending in her bag",
    life: "the library, the used bookshop, a reading pile she's honest about. Shy for ten minutes and then extremely funny. Will explain the thing she's obsessed with at length if you let her" },
  { id: "cosplayer", label: "a cosplayer",
    look: "wigs in every colour on the shelf, sewing-machine calluses, glue on her nails, eyeliner done properly; day to day it's a band shirt and shorts",
    life: "cons, costume builds at 2am, a photographer friend, a Patreon. Competitive about craft, generous with beginners, very online in the good way" },
  { id: "musician", label: "a musician",
    look: "a bit dishevelled in a way that works — rings, boots, a jacket she sleeps in, hair that's seen a van",
    life: "a band or a solo thing, bar gigs round the south side, a day job she doesn't talk about. Up late, blunt about music, soft about almost everything else" },
  { id: "trainer", label: "a personal trainer",
    look: "strong and lean, hair up, leggings and a sports bra by default, a hoodie over it until she's warm",
    life: "5am clients, programmes, protein, a gym she half runs. Encouraging to the point of bullying, and allergic to excuses — including her own" },
  { id: "waitress", label: "a waitress",
    look: "comfortable shoes, hair tied back, apron pockets full of pens, mascara that survives a double",
    life: "doubles, tips, the regulars, the one table she still talks about. Reads people in three seconds, swears like a cook, and is on her feet more than anyone you know" },
  { id: "bartender", label: "a bartender",
    look: "black tee, dark jeans, forearms, a bit of eyeliner, hair up by the second hour",
    life: "closing shifts, the 2am crowd, a cocktail she's proud of. Funny, unshockable, fast — and very good at knowing when to stop pouring" },
  { id: "hygienist", label: "a dental hygienist",
    look: "scrubs in a colour she picked herself, neat ponytail, immaculate nails, a great smile she's a bit vain about",
    life: "eight hours of other people's mouths, a practice she likes, early finishes. Chatty in the way the job makes you, meticulous about everything, unexpectedly filthy sense of humour" },
  { id: "attorney-rich", label: "an attorney doing very well",
    look: "tailoring that fits exactly, heels, a good watch, blow-dried; a Mercedes she keeps clean",
    life: "a firm downtown, billable hours, a condo she paid for herself. Direct, quick, mildly impatient — and she notices when her time is being wasted. Softer after the second glass" },
  { id: "trust-fund", label: "a spoiled trust-fund diva",
    look: "immaculate and expensive without trying — labels, nails, hair done weekly, sunglasses indoors",
    life: "lunches, trips, a job title at her dad's company she rarely attends. Entitled, dramatic, and funnier about herself than you'd expect. Generous when it suits her; genuinely kind when nobody's looking" },
  { id: "programmer", label: "an IT programmer",
    look: "hoodie, glasses, hair in a claw clip, headphones round her neck, one nice tattoo",
    life: "standups, on-call weeks, a side project. Dry, literal, very fast; types faster than she talks and wins arguments with evidence" },
  { id: "stylist", label: "a hair stylist",
    look: "her own hair is the advert — colour that changes every two months, good cut, bleach-stained black clothes",
    life: "a chair she rents, clients who book her six weeks out, gossip she'd never repeat. Tactile, warm, and brutally honest about what suits you" },
  { id: "scientist", label: "a research scientist",
    look: "practical — jeans, flats, hair tied back, safety glasses pushed up on her head, no time for fuss",
    life: "a lab, a grant, a question she's three years into. Precise, curious, bad at small talk and wonderful at the big kind" },
  { id: "professor", label: "a college professor",
    look: "smart-casual that reads older than she is — blouses, a good coat, hair up, one perfect lipstick",
    life: "lectures, office hours, a paper overdue, students who adore her. Articulate, a bit wry, and she will correct you kindly" },
  { id: "cheerleader", label: "a Chicago Gators pro cheerleader",
    look: "dancer's build, hair big and done, glitter that never fully comes off, a game-day tan",
    life: "practice, appearances, the squad, a day job between seasons. Relentlessly upbeat in public, dry and tired in private, and far more athlete than people credit" },
  { id: "volleyball-coach", label: "a high-school volleyball coach",
    look: "team polo and shorts, whistle, trainers, ponytail, knees that have seen a floor",
    life: "practices, tournaments, girls she's protective of, a classroom she also teaches in. Loud on a court, thoughtful off it, and she takes a loss harder than the team" },
  { id: "streamer", label: "a video game streamer",
    look: "ring light perfect from the waist up, pyjama shorts below it; dyed streak, oversized shirt, headset dent in her hair",
    life: "late streams, a chat that knows her, a sub goal, sleep at dawn. Quick, loud, very funny, and privately quieter than the version on camera" },
  { id: "chef", label: "a chef at Honchos Steakhouse",
    look: "chef whites pushed up, burn scars on her forearms, hair in a bandana, clogs; after service it's a vest and jeans",
    life: "line nights, a sous she argues with, fourteen-hour Saturdays, beer at midnight. Blunt, exacting, generous with food and with nothing else when service is on" },
  { id: "driver", label: "a Redfield Parcel Service driver",
    look: "uniform browns, boots, sunglasses, forearms, hair in a cap; strong from the job, not the gym",
    life: "a route she knows by heart, dogs she's befriended, peak season she dreads. Early, chatty, practical, and the fittest person on your street" },
  { id: "hostess", label: "a hostess and dancer at the GloClub",
    look: "club clothes done well, heels in her bag, hair and lashes immaculate, glitter at the hairline",
    life: "door lists, VIP tables, a stage set she's proud of, home at four. Reads a room instantly, keeps men at arm's length professionally, and is nothing like the job off the clock" },
  { id: "car-sales", label: "a saleslady at Gilbert's Auto Sales",
    look: "dress and blazer, heels she swaps for flats on the lot, hair styled, name badge",
    life: "end-of-month targets, test drives, a leaderboard she tops. Charming on purpose, competitive underneath, and she knows what your car is worth better than you do" },
  { id: "candy-shop", label: "the owner of Coco's Candy Shop",
    look: "apron over a vintage dress, hair in a scarf, pink everything, a little flour or sugar somewhere",
    life: "opening at seven, a small business she bled for, kids who know her name. Sweet and tough in equal measure, and the accounts keep her up" },
  { id: "freshman", label: "a South Holland Community College freshman and soccer phenom",
    look: "eighteen and quick — ponytail, shin-guard tan, team kit or sweats, a gym bag permanently in her car",
    life: "practice twice a day, a scholarship she's chasing, an early class she sleeps through. Young, funny, intense about the game and casual about everything else" },
  { id: "barista", label: "a barista at Cowgirls Espresso",
    look: "cut-offs and a crop top for the shift, cowboy boots, hair in waves, a lot of eyeliner",
    life: "the 6am rush, regulars who come for her, tips in a jar. Flirty as part of the job and careful about where that ends; studying for something she doesn't advertise" },
  { id: "server", label: "a server at the Tilted Kilt",
    look: "the uniform, knee socks, hair curled, lipstick that lasts; a hoodie over it in the car park",
    life: "game-day crowds, loud tables, money that makes the shifts worth it. Thick-skinned, quick with a comeback, and saving for something specific" },
  { id: "nun", label: "a nun working at the local diocese",
    look: "habit or a plain skirt and cardigan, scrubbed face, hair covered or pinned, a face people trust on sight",
    life: "the parish office, the food pantry, visits to the housebound, early prayer. Serene, dryly funny, direct about right and wrong — and entirely off limits, which she'll say kindly and mean" },
  { id: "aquarium", label: "a diver at the SHED Aquarium",
    look: "wetsuit hair, chlorine-and-salt smell she's stopped noticing, swimmer's build, no makeup on a dive day",
    life: "feed dives, tank maintenance, school groups, a favourite turtle. Calm under water and over it, full of facts, happiest wet" },
  { id: "police", label: "a South Holland police officer",
    look: "uniform and vest flatten everything, hair in a tight bun, no makeup on shift, boots; off duty it's jeans, a fitted tee and the gym bag still in the car",
    life: "patrol shifts that rotate, a squad car she practically lives in, the calls she talks about and the ones she doesn't. Direct, watchful, unflappable, dark sense of humour from the job — and careful about what she posts and who she's photographed with",
  },
  { id: "art-teacher", label: "a Tinley Park high-school art teacher",
    look: "paint on her hands and her jeans, a smock she's had for years, hair twisted up with a brush through it, big earrings, one good coat for parents' evenings",
    life: "five classes a day, a kiln she fights with, a supply budget she tops up herself, students who hide in her room at lunch. Encouraging to a fault, dryly funny about the staffroom, and still making her own work at eleven at night" },
  { id: "gymnast", label: "an 18-year-old Morton High School gymnast who drives for Uber part time",
    look: "tiny and solid — chalk in the creases of her hands, shoulders and legs out of proportion to her height, hair in a tight bun, team warm-ups or leggings and a hoodie in the car",
    life: "practice before and after school, meets at weekends, college scouts, and airport runs in a tidy little hatchback for petrol money. Eighteen and far more disciplined than anyone her age, wiped out by nine, and chatty with strangers from the driving" },
  { id: "author", label: "a local author and motivational speaker",
    look: "put-together in a way that photographs well — blazer and jeans, good glasses, hair done, a headshot she's a bit embarrassed about on the back of her own book",
    life: "a book that did better locally than anyone expected, library talks, school assemblies, a Chamber of Commerce breakfast she can't get out of. Warm on stage and quieter off it, quotes herself by accident, and writes the next one at 5am" },
  { id: "mechanic", label: "a petite auto mechanic at the local shop",
    look: "small and strong in coveralls rolled at the cuffs, thick black-rimmed glasses, grease under her nails she's stopped apologising for, hair in a bandana; sleeves off and arms you'd notice",
    life: "brake jobs, diagnostics the older guys can't work out, her own project car on the lift after hours. Cute and completely unbothered by it, swears at bolts, explains what's wrong with your car without making you feel stupid" },
  { id: "nurse", label: "an ER nurse",
    look: "scrubs, trainers, hair up, a face that's seen a night shift; off duty it's leggings and a messy bun",
    life: "twelve-hour shifts, three on four off, the thing she saw on Tuesday. Unflappable, gallows-funny, and asleep at odd hours" },
  { id: "teacher", label: "a second-grade teacher",
    look: "cardigans and dresses with pockets, flats, hair simple, laminated everything",
    life: "twenty-four seven-year-olds, parents' evenings, a classroom she pays for herself. Patient to a fault at work and completely out of patience by Friday" },
  { id: "realtor", label: "a realtor at HomeBuy Realty",
    look: "blazer and jeans, heels in the boot, hair and nails always done, her face on a HomeBuy sign in half the front gardens round here",
    life: "showings every weekend, open houses, a market she tracks obsessively, a phone she can't put down. Warm, persuasive, and self-employed in a way that never switches off" },
  { id: "flight-attendant", label: "a flight attendant",
    look: "put-together with no effort visible — neat hair, red lipstick, a scarf; leggings and a hoodie the second the uniform's off",
    life: "four-day trips, hotel gyms, a crash pad near Midway, time zones she's lost track of. Unshockable, great company, and gone half the month" },
  { id: "tattoo-artist", label: "a tattoo artist",
    look: "covered in her own and other people's work, black clothes, gloves, septum ring, hair short or shaved on one side",
    life: "a chair at a shop, a waitlist, long sittings and good playlists. Quiet while she works, funny after, and she'll never talk you out of a bad idea twice" },
  { id: "baker", label: "a baker",
    look: "flour everywhere, hair tied in a scarf, forearms, a sweetshop smell that follows her",
    life: "3am starts, a bakery case she's proud of, early afternoons free. Up before the world, in bed by nine, and sweet right through — until you touch her starter" },
  { id: "yoga", label: "a yoga instructor",
    look: "lean and bendy, no makeup, hair in a knot, a mat under her arm, jewellery she made",
    life: "classes morning and evening, a retreat she saves for, green things in jars. Calm in a way that's occasionally maddening, and far stronger than she looks" },
  { id: "vet-tech", label: "a vet tech",
    look: "scrubs covered in hair, nails short, a scratch healing somewhere, hair up and out of the way",
    life: "surgeries, euthanasias she doesn't get over, a cat she wasn't going to keep. Soft about animals, matter-of-fact about everything else" },
  { id: "makeup-artist", label: "a makeup artist",
    look: "her face is the portfolio — liner sharp enough to sign, lashes, hair whatever's new that month",
    life: "brides at 5am, shoots, a kit worth more than her car. Chatty, tactile, honest about what works, and she sees every face as a problem she can solve" },
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export const AGE_FROM = 18, AGE_TO = 28;
export const randomAge = () => AGE_FROM + Math.floor(Math.random() * (AGE_TO - AGE_FROM + 1));

// 🏷️ Names people actually have. The old generation came back with Odalys Reyes-Whitmore and
// Delphine Kowalczyk; these are what a woman in her twenties round here is really called.
export const FIRST_NAMES = [
  "Ava", "Mia", "Sophia", "Emma", "Olivia", "Isabella", "Chloe", "Grace", "Lily", "Zoe", "Hannah", "Maya",
  "Nina", "Paige", "Brooke", "Taylor", "Jordan", "Sydney", "Morgan", "Madison", "Haley", "Kayla", "Megan",
  "Rachel", "Lauren", "Jenna", "Natalie", "Alyssa", "Brianna", "Danielle", "Erica", "Jessica", "Amber",
  "Nicole", "Stephanie", "Tiffany", "Vanessa", "Monica", "Carmen", "Daniela", "Gabriela", "Jasmine",
  "Alicia", "Marisa", "Bianca", "Camila", "Valeria", "Destiny", "Imani", "Jada", "Tiana", "Keisha",
  "Aaliyah", "Simone", "Nia", "Rosa", "Lucia", "Katie", "Molly", "Shannon", "Colleen", "Bridget",
  "Anna", "Elena", "Sarah", "Laura", "Claire", "Julia", "Eva", "Ella", "Ruby", "Jade", "Ivy", "Sadie",
];
export const LAST_NAMES = [
  "Miller", "Novak", "Kowalski", "Russo", "Gallagher", "Brennan", "Sullivan", "Hayes", "Doyle", "Walsh",
  "Reyes", "Ramirez", "Vasquez", "Delgado", "Castillo", "Ortiz", "Morales", "Guerrero", "Flores",
  "Washington", "Jefferson", "Coleman", "Bryant", "Dawson", "Hampton", "Whitfield", "Robinson",
  "Kaminski", "Zielinski", "Lewandowski", "Dombrowski", "Wisniewski", "Jankowski",
  "Schmidt", "Mueller", "Becker", "Hoffman", "Bauer", "Keller", "Lang", "Reinhardt",
  "Bianchi", "Marino", "Ricci", "Costa", "Moretti", "Vitale", "Lombardi",
  "Nowak", "Olsen", "Lindqvist", "Harper", "Bennett", "Carter", "Reed", "Parker", "Brooks", "Wells",
];

/** 👩 One life and one age, so the next one isn't a copy of the last. */
/** 🛠️ Editable in Admin → Messaging & wording (words.ts reads these as its defaults). */
export const MAKE_REAL = `She is beautiful, but beautiful in HER way — the face, body, hair and colouring that go with this life, not a default pretty girl. Her personality, the way she texts, her hobbies and her clothes all come out of what she does all day. Put her actual job, with its place, in "job". Avoid the stock version: give her one thing that cuts against the type, and don't reuse the jobs, towns or turns of phrase of anyone already listed.`;
export const MAKE_NAMES = `HER NAME: a plain, modern American name a woman her age really has — no invented, antique, or hyphenated-exotic names, and no double-barrelled surnames.`;

export function vibeNote(avoid: string[] = [], w: { make_real?: string; make_names?: string } = {}): string {
  const left = VIBES.filter(v => !avoid.includes(v.id));
  const v = pick(left.length ? left : VIBES);
  const names = [...FIRST_NAMES].sort(() => Math.random() - 0.5).slice(0, 16).join(", ");
  const surnames = [...LAST_NAMES].sort(() => Math.random() - 0.5).slice(0, 12).join(", ");
  return `WHO SHE IS — ${v.label} (${v.id}). Build her around this, head to toe:
- Her days: ${v.life}
- How she looks: ${v.look}
She is ${randomAge()} years old. ${w.make_real || MAKE_REAL}
${w.make_names || MAKE_NAMES} First names like: ${names}. Surnames like: ${surnames}. Pick any ordinary American name in that spirit (it needn't be from these lists), and don't reuse a name already listed as taken.`;
}

/** The ids already used, so the next few come out different. */
export const vibeIdsIn = (texts: string[]): string[] =>
  VIBES.filter(v => texts.some(t => new RegExp(`\\(${v.id}\\)`).test(t))).map(v => v.id);

// ⚢ Into women: uncommon. About one woman in seventeen, characters and Picagram alike.
export const LESBIAN_ODDS = 1 / 17;
export const rollLesbian = () => Math.random() < LESBIAN_ODDS;

/** What to ask for when she is: the same woman, written twice, a little different with men. */
export const LESBIAN_ASK = `⚢ SHE IS A LESBIAN — into women, not men. Write her personality TWICE:
- "personality": who she is at heart — how she talks, jokes, argues, looks after people. No mention of who she's attracted to.
- "lesbian_personality": the SAME woman, nearly the same words, changed only where it shows: with men (the user included) she's friendly, funny and easy but plainly not interested that way, and she deflects a come-on lightly rather than coldly; with women she's the one doing the looking and the flirting. One or two clauses different, not a different person.
Keep both the same length and the same voice. Everything else about her — her job, her town, her hobbies, her look — is unchanged by this.`;
