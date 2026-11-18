// 🎁 Picagifts: send someone a present or a bit of money. Thirty things to choose from, a handful
// in the shop each week, and everyone keeps a wishlist that moves on as the weeks do.
//
// It isn't only a nice gesture: for two days afterwards she's warmer (the Flirty slider nudges up),
// readier to meet up or get on video, and far more willing to sneak one in when she's meant to be
// at work or in class — even knowing she could get caught.

export type Gift = { id: string; name: string; brand: string; kind: Kind; price: number; emoji: string; always?: true; team?: true; theirs?: true };
export type Kind = "bag" | "clothes" | "shoes" | "jewellery" | "beauty" | "tech" | "treat" | "home" | "mine";

/** Everything there is. Prices are what the real thing costs, near enough. */
export const GIFTS: Gift[] = [
  { id: "gucci-purse", brand: "Gucci", name: "GG Marmont purse", kind: "bag", price: 2450, emoji: "👜" },
  { id: "prada-sunglasses", brand: "Prada", name: "Symbole sunglasses", kind: "beauty", price: 445, emoji: "🕶️" },
  { id: "coach-wallet", brand: "Coach", name: "leather wallet", kind: "bag", price: 195, emoji: "👛" },
  { id: "dior-hoodie", brand: "Dior", name: "embroidered hoodie", kind: "clothes", price: 1350, emoji: "🧥" },
  { id: "nike-shoes", brand: "Nike", name: "Air Max 270s", kind: "shoes", price: 160, emoji: "👟" },
  { id: "lv-tote", brand: "Louis Vuitton", name: "Neverfull tote", kind: "bag", price: 2030, emoji: "👜" },
  { id: "chanel-perfume", brand: "Chanel", name: "No.5 eau de parfum", kind: "beauty", price: 165, emoji: "🧴" },
  { id: "tiffany-necklace", brand: "Tiffany & Co.", name: "heart pendant necklace", kind: "jewellery", price: 425, emoji: "📿" },
  { id: "pandora-bracelet", brand: "Pandora", name: "charm bracelet", kind: "jewellery", price: 120, emoji: "💫" },
  { id: "apple-watch", brand: "Apple", name: "Watch Series 10", kind: "tech", price: 429, emoji: "⌚" },
  { id: "airpods", brand: "Apple", name: "AirPods Pro", kind: "tech", price: 249, emoji: "🎧" },
  { id: "ugg-boots", brand: "UGG", name: "Classic Mini boots", kind: "shoes", price: 150, emoji: "🥾" },
  { id: "lulu-leggings", brand: "Lululemon", name: "Align leggings", kind: "clothes", price: 98, emoji: "🩳" },
  { id: "ray-bans", brand: "Ray-Ban", name: "Wayfarers", kind: "beauty", price: 171, emoji: "🕶️" },
  { id: "mk-bag", brand: "Michael Kors", name: "shoulder bag", kind: "bag", price: 328, emoji: "👜" },
  { id: "sephora-set", brand: "Sephora", name: "makeup gift set", kind: "beauty", price: 85, emoji: "💄" },
  { id: "jo-malone", brand: "Jo Malone", name: "cologne and candle set", kind: "beauty", price: 210, emoji: "🕯️" },
  { id: "levis-jacket", brand: "Levi's", name: "sherpa trucker jacket", kind: "clothes", price: 128, emoji: "🧥" },
  { id: "north-face", brand: "The North Face", name: "Nuptse puffer", kind: "clothes", price: 320, emoji: "🧥" },
  { id: "doc-martens", brand: "Dr. Martens", name: "1460 boots", kind: "shoes", price: 170, emoji: "🥾" },
  { id: "kate-spade", brand: "Kate Spade", name: "crossbody bag", kind: "bag", price: 248, emoji: "👜" },
  { id: "dyson-airwrap", brand: "Dyson", name: "Airwrap styler", kind: "beauty", price: 599, emoji: "💨" },
  { id: "stanley-cup", brand: "Stanley", name: "40oz tumbler", kind: "treat", price: 45, emoji: "🥤" },
  { id: "lego-set", brand: "LEGO", name: "flower bouquet set", kind: "home", price: 60, emoji: "💐" },
  { id: "spa-day", brand: "Spa", name: "day at the spa", kind: "treat", price: 280, emoji: "💆" },
  { id: "dinner-out", brand: "Dinner", name: "dinner anywhere she likes", kind: "treat", price: 180, emoji: "🍽️" },
  { id: "concert-tickets", brand: "Tickets", name: "two concert tickets", kind: "treat", price: 340, emoji: "🎫" },
  { id: "flowers", brand: "Flowers", name: "a dozen roses, delivered", kind: "home", price: 75, emoji: "🌹" },
  { id: "bose-speaker", brand: "Bose", name: "SoundLink speaker", kind: "tech", price: 149, emoji: "🔊" },
  { id: "cartier-love", brand: "Cartier", name: "Love bracelet", kind: "jewellery", price: 7350, emoji: "💛" },
  // ☕ The small ones. Always in the shop, never rotated out: the everyday things you'd actually
  // send someone on an ordinary Tuesday.
  { id: "iced-latte", brand: "", name: "large iced latte", kind: "treat", price: 10, emoji: "🧋", always: true, theirs: true },
  { id: "ice-cream", brand: "", name: "ice cream or a shake", kind: "treat", price: 8, emoji: "🍦", always: true, theirs: true },
  { id: "food-delivery", brand: "", name: "dinner delivered", kind: "treat", price: 30, emoji: "🥡", always: true, theirs: true },
  { id: "gift-card", brand: "", name: "gift card", kind: "treat", price: 50, emoji: "🎟️", always: true },
  { id: "team-gear", brand: "", name: "team gear", kind: "clothes", price: 60, emoji: "🏟️", always: true, team: true },
];

export const giftById = (id: string) => GIFTS.find(g => g.id === id) || null;

/** 🛍️ One of yours, added by hand. They carry a plain shopping bag rather than an emoji of their
 *  own, they never rotate out of the shop, and they're never on anyone's wishlist — a wishlist is
 *  what she came up with, and these are what you came up with. */
export const MY_GIFT_EMOJI = "🛍️";
export const MAX_MY_GIFTS = 5;
export const myGiftId = (rowId: string) => `mine:${rowId}`;
export const isMyGift = (id: string) => id.startsWith("mine:");
export const myGift = (row: { id: string; name: string; brand: string; price: number }): Gift =>
  ({ id: myGiftId(row.id), name: row.name, brand: row.brand, kind: "mine", price: Number(row.price), emoji: MY_GIFT_EMOJI });

/** Which week it is, counted from a Monday, so the shop and the wishlists move on together. */
export function weekOf(ms: number): number {
  return Math.floor((ms + 3 * 86_400_000) / (7 * 86_400_000)); // the epoch was a Thursday
}

// A steady shuffle: the same week always gives the same answer, and next week gives another.
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const order = (seed: string, items: Gift[]) => items.map(g => ({ g, k: hash(seed + g.id) })).sort((a, b) => a.k - b.k).map(x => x.g);

/** 🛍️ What the shop has this week: the staples always, plus a rotating handful of the rest. */
export function shopFor(week: number): Gift[] {
  const always = GIFTS.filter(g => g.always || g.price <= 200);
  const rest = GIFTS.filter(g => g.price > 200);
  const rotating = order(`shop:${week}`, rest).slice(0, 10);
  return GIFTS.filter(g => always.includes(g) || rotating.includes(g));
}

/** 💭 What one person is hoping for this week: three things, their own, and they move on weekly. */
/** 💞 How close someone has to be before the things YOU listed start turning up on their wishlist.
 *  The thirty-five are what anyone might want; yours are yours, and wanting one of those is a
 *  closer thing to want. */
export const WANTS_YOURS_AT = 62;

export function wishlistFor(whoId: string, week: number, mine: Gift[] = [], closeness = 100): Gift[] {
  // The everyday small ones aren't what anyone puts on a wishlist — a wishlist is for things people
  // hope for, not for a coffee. What you listed yourself only joins the pool once they're close.
  const yours = closeness >= WANTS_YOURS_AT ? mine : [];
  return order(`wish:${whoId}:${week}`, [...GIFTS.filter(g => !g.always), ...yours]).slice(0, 3);
}

export const onWishlist = (whoId: string, week: number, giftId: string, mine: Gift[] = [], closeness = 100) =>
  wishlistFor(whoId, week, mine, closeness).some(g => g.id === giftId);

export type Sent = { amount: number; wished: boolean; money?: boolean; at: number };
export type Boost = { flirty: number; eager: number; until: number };

/** 💝 How much a present is still doing for you. It lasts 48 hours, it's worth more if it was
 *  something they actually wanted, and several presents don't stack up without limit. */
export const BOOST_MS = 48 * 3_600_000;

/** 💰 Money always lands: even a small amount is them choosing to hand you something. */
export const MONEY_FLOOR = 1.8;
/** 💭 Something off their own wishlist is worth far more than something that wasn't. */
export const WISHED_X = 1.7;

export function boostFrom(sent: Sent[], now: number): Boost | null {
  const live = sent.filter(s => now - s.at < BOOST_MS && now >= s.at);
  if (!live.length) return null;
  // What it was worth. A small treat barely registers and a Cartier bracelet lands; something they
  // actually asked for lands much harder than something they didn't; and cash always lands, because
  // it's never the wrong size, the wrong colour or the wrong thing.
  const worth = (s: Sent) => {
    const size = Math.min(3, Math.max(0.5, Math.log10(Math.max(10, s.amount)) - 1));
    if (s.money) return Math.min(3, Math.max(MONEY_FLOOR, size * 1.4));
    return Math.min(3, size * (s.wished ? WISHED_X : 1));
  };
  const best = Math.max(...live.map(worth));
  const extra = Math.min(1, (live.length - 1) * 0.25); // more presents help a little, never a lot
  const flirty = Math.min(3, Math.round((best + extra) * 10) / 10);
  const eager = Math.min(1, Math.round((best / 3 + extra / 4) * 100) / 100);
  return { flirty, eager, until: Math.max(...live.map(s => s.at)) + BOOST_MS };
}

/** What she's told about it while it lasts — never a transaction, just that it meant something. */
export function boostNote(boost: Boost | null, what: string, who: string): string {
  if (!boost) return "";
  return `🎁 ${who} sent you ${what} in the last couple of days, and it landed: you're warmer with them than usual, quicker to want to see them, and you'd bend your day around them — slip out of work, skip a class, take the call you shouldn't — more readily than you normally would. Bring it up the way anyone would (pleased, teasing, a bit spoiled), never as a transaction, and never as something that bought you.`;
}

/** 📸 How often a thank-you comes with a photo: most of the time, not always. */
export const PHOTO_ODDS = 0.7;

/** What the picture is of, when there is one. */
export function photoBrief(what: string, kind: "gift" | "money", g: Pick<Gift, "emoji" | "name" | "brand" | "kind"> & { team?: true; theirs?: true } | null): string {
  if (kind === "money") return `holding up a fan of cash — ${what} in notes — grinning at the camera`;
  // One of yours, or something we don't know: she holds it up. ("a present" reads as "the present".)
  if (!g || g.kind === "mine") return `holding up the ${what.replace(/^(?:an?|the)\s+/i, "") || "present"} they've just been sent, pleased with it`;
  // 🏟️ Team gear is whatever team is actually theirs — the one they follow, or the one they play for.
  if (g.team) return `wearing the team gear they've just been sent — their OWN team, the one they follow or play for (from their description: their college side, their city's team, the sport they play), in that team's real colours — showing it off to the camera`;
  // ☕🍦🥡 A coffee, a pudding, dinner: whatever THIS person actually orders, not a stock answer.
  if (g.theirs) return `with the ${g.name} they've just been sent — their OWN usual, the drink or the food THIS person actually orders (from their description, where they live, what they're like), never a stock answer and never tacos unless tacos are genuinely theirs — holding it up to the camera, pleased`;
  const worn = ["clothes", "shoes", "jewellery", "bag"].includes(g.kind);
  return worn ? `wearing the ${g.brand} ${g.name} they've just been sent, showing it off to the camera`
    : `holding up the ${g.brand} ${g.name} they've just been sent, pleased with it`;
}
