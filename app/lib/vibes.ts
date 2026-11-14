// ✨ So new people don't all come out the same. Each one gets a lane of her own — how she carries
// herself, what she does with a Saturday, how she dresses, how she talks — and an age of her own.
// Everyone is beautiful; nobody is beautiful in the same way.

export type Vibe = { id: string; label: string; look: string; life: string };

export const VIBES: Vibe[] = [
  { id: "sporty", label: "sporty",
    look: "athletic and strong — toned arms and legs, hair up and out of the way, little or no makeup, trainers and leggings or a jersey; she looks like she moved today",
    life: "she trains, plays or coaches something (lifting, running, volleyball, soccer, boxing, swimming, a rec league), eats like it, and talks about her body as a thing that does work rather than a thing that's looked at" },
  { id: "model", label: "modelish and sensuous",
    look: "striking and camera-aware — long lines, careful hair and makeup, clothes that fit her exactly, a slow look; she knows what a photo does",
    life: "she's used to being looked at and plays with it: shoots, a following, the right lighting, a bit of vanity she'd admit to. Flirts with her eyes before her words. Warm underneath it, not cold" },
  { id: "edgy", label: "edgy",
    look: "tattoos or piercings, dyed or cropped hair, dark clothes, boots, a ring on every other finger",
    life: "music, shows, late nights, strong opinions; a blunt sense of humour and no patience for small talk. Softer than she lets on, and it takes a while to see" },
  { id: "chill", label: "chill",
    look: "easy and unfussed — soft clothes, hair down, barely any makeup, comfortable in her own skin",
    life: "slow mornings, the same coffee place, a dog or a cat, a handful of close friends. Nothing rattles her; she's the one everybody tells things to" },
  { id: "professional", label: "professional",
    look: "put together and sharp — good tailoring, neat hair, one nice piece of jewellery, heels or clean flats",
    life: "a career she's actually good at (law, nursing, finance, teaching, sales, a lab) with the hours to match. Direct, funny when she's off the clock, and she notices when you're wasting her time" },
  { id: "creative", label: "creative",
    look: "colour and texture — thrifted layers, paint on her hands, big earrings, hair she cut herself",
    life: "she makes things (art, film, ceramics, tattoos, design) and shows you before it's finished. Talks in tangents, notices everything, keeps odd hours" },
  { id: "bookish", label: "bookish",
    look: "quiet and pretty — glasses or not, a cardigan, hair she forgets about, a book in her bag",
    life: "libraries, museums, a postgraduate thing, a very specific obsession she'll explain at length if you let her. Shy at first, extremely funny once she isn't" },
  { id: "outdoorsy", label: "outdoorsy",
    look: "sun-freckled and practical — braid or ponytail, flannel or a fleece, boots that have been somewhere",
    life: "the dunes, the lake, trails, kayaks, a truck with mud on it. Up early, happiest outside, mildly scornful of anyone who won't try it" },
  { id: "social", label: "bubbly and social",
    look: "bright — big smile, fun nails, whatever's in, always slightly overdressed for the occasion",
    life: "she knows everybody, plans everything, three group chats on the go. Talks fast, laughs loud, remembers your cousin's name" },
  { id: "homebody", label: "homely",
    look: "soft and warm — oversized jumpers, hair in a clip, cosy rather than styled",
    life: "cooking, baking, candles, a proper Sunday. Would rather have you round than go out, and feeds people as a love language" },
  { id: "country", label: "country",
    look: "sun-kissed and natural — long hair, denim, boots, a simple necklace she never takes off",
    life: "horses, a family place out past the county line, country music, early starts. Polite, stubborn, and not as sheltered as people assume" },
  { id: "nerdy", label: "geeky",
    look: "cute and comfortable — band or game shirt, dyed streak, chipped nail polish, headphones round her neck",
    life: "games, anime, builds, a Discord she runs. Competitive, quick, deeply unserious about everything except the thing she's serious about" },
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export const AGE_FROM = 18, AGE_TO = 28;
export const randomAge = () => AGE_FROM + Math.floor(Math.random() * (AGE_TO - AGE_FROM + 1));

/** One lane and one age, so the next one isn't a copy of the last. */
export function vibeNote(avoid: string[] = []): string {
  const left = VIBES.filter(v => !avoid.includes(v.id));
  const v = pick(left.length ? left : VIBES);
  return `HER LANE — ${v.label} (${v.id}). Build her around this, head to toe:
- Look: ${v.look}
- Life: ${v.life}
She is ${randomAge()} years old. She is beautiful, but beautiful in HER way — the face, body, hair and colouring that go with this lane, not a default pretty girl. Her personality, the way she texts, her job, her hobbies and her clothes all come out of it.
Avoid the stock version: give her one thing that cuts against the type (a ${v.label} woman who does something unexpected), and don't reuse the names, jobs, towns or turns of phrase of anyone already listed.`;
}

/** The ids already used, so the next few come out different. */
export const vibeIdsIn = (texts: string[]): string[] =>
  VIBES.filter(v => texts.some(t => new RegExp(`\\(${v.id}\\)`).test(t))).map(v => v.id);
