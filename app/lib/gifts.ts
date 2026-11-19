// 🎁 Picagifts: send someone a present or a bit of money. Thirty things to choose from, a handful
// in the shop each week, and everyone keeps a wishlist that moves on as the weeks do.
//
// It isn't only a nice gesture: for two days afterwards she's warmer (the Flirty slider nudges up),
// readier to meet up or get on video, and far more willing to sneak one in when she's meant to be
// at work or in class — even knowing she could get caught.

export type Gift = { id: string; name: string; brand: string; kind: Kind; price: number; emoji: string; always?: true; team?: true; theirs?: true; slot?: Slot; was?: number; off?: number };
/** 👙 A kind of thing the shop is never without. Which one it is changes week to week; that there
 *  is one does not. */
export type Slot = "bikini" | "leotard" | "necklace" | "heels";
export const SLOTS: Slot[] = ["bikini", "leotard", "necklace", "heels"];
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
  { id: "tiffany-necklace", brand: "Tiffany & Co.", name: "heart pendant necklace", kind: "jewellery", price: 425, emoji: "📿", slot: "necklace" },
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
  { id: "spa-day", brand: "", name: "day at the spa", kind: "treat", price: 280, emoji: "💆" },
  { id: "dinner-out", brand: "", name: "dinner anywhere she likes", kind: "treat", price: 180, emoji: "🍽️" },
  { id: "concert-tickets", brand: "", name: "two concert tickets", kind: "treat", price: 340, emoji: "🎫" },
  { id: "bose-speaker", brand: "Bose", name: "SoundLink speaker", kind: "tech", price: 149, emoji: "🔊" },
  { id: "cartier-love", brand: "Cartier", name: "Love bracelet", kind: "jewellery", price: 7350, emoji: "💛" },
  { id: "sony-headphones", brand: "Sony", name: "WH-1000XM5 headphones", kind: "tech", price: 399, emoji: "🎧" },
  { id: "kindle", brand: "Amazon", name: "Kindle Paperwhite", kind: "tech", price: 160, emoji: "📱" },
  { id: "polaroid", brand: "Polaroid", name: "instant camera", kind: "tech", price: 120, emoji: "📷" },
  { id: "birkenstocks", brand: "Birkenstock", name: "Arizona sandals", kind: "shoes", price: 110, emoji: "🩴" },
  { id: "converse", brand: "Converse", name: "Chuck 70s", kind: "shoes", price: 85, emoji: "👟" },
  { id: "cowboy-boots", brand: "Tecovas", name: "leather cowboy boots", kind: "shoes", price: 295, emoji: "👢" },
  { id: "patagonia-fleece", brand: "Patagonia", name: "Better Sweater fleece", kind: "clothes", price: 139, emoji: "🧥" },
  { id: "reformation-dress", brand: "Reformation", name: "midi dress", kind: "clothes", price: 248, emoji: "👗" },
  { id: "cosplay-outfit", brand: "", name: "cosplay outfit she's been eyeing", kind: "clothes", price: 115, emoji: "🎭" },
  { id: "minidress", brand: "House of CB", name: "bodycon minidress", kind: "clothes", price: 189, emoji: "👠" },
  { id: "miniskirt", brand: "Miaou", name: "pleated miniskirt", kind: "clothes", price: 145, emoji: "🩱" },
  { id: "marc-jacobs-tote", brand: "Marc Jacobs", name: "The Tote Bag", kind: "bag", price: 350, emoji: "👜" },
  { id: "diptyque-candle", brand: "Diptyque", name: "Baies candle", kind: "home", price: 78, emoji: "🕯️" },
  { id: "lush-set", brand: "Lush", name: "bath bomb set", kind: "beauty", price: 45, emoji: "🛁" },
  { id: "laneige-set", brand: "Laneige", name: "lip mask set", kind: "beauty", price: 38, emoji: "💋" },
  { id: "massage", brand: "", name: "an hour's massage", kind: "treat", price: 120, emoji: "💆" },
  { id: "weekend-away", brand: "", name: "a weekend away", kind: "treat", price: 850, emoji: "🏨" },
  { id: "ysl-loulou", brand: "Saint Laurent", name: "Loulou shoulder bag", kind: "bag", price: 2950, emoji: "👜" },
  { id: "telfar-bag", brand: "Telfar", name: "shopping bag", kind: "bag", price: 257, emoji: "👜" },
  { id: "longchamp", brand: "Longchamp", name: "Le Pliage tote", kind: "bag", price: 145, emoji: "👜" },
  { id: "fjallraven", brand: "Fjällräven", name: "Kånken backpack", kind: "bag", price: 90, emoji: "🎒" },
  { id: "baggu", brand: "Baggu", name: "crescent bag", kind: "bag", price: 68, emoji: "👛" },
  { id: "skims-set", brand: "SKIMS", name: "cosy lounge set", kind: "clothes", price: 128, emoji: "🧶" },
  { id: "aritzia-coat", brand: "Aritzia", name: "wool wrap coat", kind: "clothes", price: 348, emoji: "🧥" },
  { id: "free-people-dress", brand: "Free People", name: "maxi dress", kind: "clothes", price: 168, emoji: "👗" },
  { id: "madewell-jeans", brand: "Madewell", name: "high-rise jeans", kind: "clothes", price: 138, emoji: "👖" },
  { id: "carhartt-jacket", brand: "Carhartt", name: "Detroit jacket", kind: "clothes", price: 148, emoji: "🧥" },
  { id: "lulu-define", brand: "Lululemon", name: "Define jacket", kind: "clothes", price: 118, emoji: "🧥" },
  { id: "silk-robe", brand: "Lunya", name: "washable silk robe", kind: "clothes", price: 228, emoji: "👘" },
  { id: "cashmere-jumper", brand: "Quince", name: "cashmere jumper", kind: "clothes", price: 60, emoji: "🧣" },
  { id: "vintage-tee", brand: "", name: "band tee she'd actually wear", kind: "clothes", price: 55, emoji: "👕" },
  { id: "corset-top", brand: "Dion Lee", name: "corset top", kind: "clothes", price: 390, emoji: "👑" },
  { id: "golden-goose", brand: "Golden Goose", name: "Super-Star trainers", kind: "shoes", price: 595, emoji: "👟" },
  { id: "new-balance", brand: "New Balance", name: "530s", kind: "shoes", price: 100, emoji: "👟" },
  { id: "sambas", brand: "Adidas", name: "Sambas", kind: "shoes", price: 100, emoji: "👟" },
  { id: "hoka-runners", brand: "Hoka", name: "Clifton running shoes", kind: "shoes", price: 150, emoji: "🏃" },
  { id: "hunter-wellies", brand: "Hunter", name: "tall wellies", kind: "shoes", price: 165, emoji: "👢" },
  { id: "chelsea-boots", brand: "Blundstone", name: "Chelsea boots", kind: "shoes", price: 220, emoji: "👢" },
  { id: "gold-hoops", brand: "Mejuri", name: "bold gold hoops", kind: "jewellery", price: 198, emoji: "💍" },
  { id: "anklet", brand: "Mejuri", name: "fine gold anklet", kind: "jewellery", price: 95, emoji: "🦶" },
  { id: "birthstone-ring", brand: "Angara", name: "birthstone ring", kind: "jewellery", price: 480, emoji: "💍" },
  { id: "david-yurman", brand: "David Yurman", name: "cable bracelet", kind: "jewellery", price: 850, emoji: "💫" },
  { id: "watch-cartier", brand: "Cartier", name: "Tank watch", kind: "jewellery", price: 3400, emoji: "⌚" },
  { id: "belly-chain", brand: "Éliou", name: "beaded belly chain", kind: "jewellery", price: 125, emoji: "✨" },
  { id: "dyson-dryer", brand: "Dyson", name: "Supersonic hair dryer", kind: "beauty", price: 429, emoji: "💨" },
  { id: "charlotte-tilbury", brand: "Charlotte Tilbury", name: "Pillow Talk set", kind: "beauty", price: 85, emoji: "💄" },
  { id: "ysl-perfume", brand: "Yves Saint Laurent", name: "Libre eau de parfum", kind: "beauty", price: 135, emoji: "🧴" },
  { id: "le-labo", brand: "Le Labo", name: "Santal 33", kind: "beauty", price: 220, emoji: "🧴" },
  { id: "drunk-elephant", brand: "Drunk Elephant", name: "skincare set", kind: "beauty", price: 158, emoji: "🧴" },
  { id: "gua-sha", brand: "Herbivore", name: "jade gua sha set", kind: "beauty", price: 42, emoji: "💎" },
  { id: "nails-done", brand: "", name: "her nails done properly", kind: "beauty", price: 90, emoji: "💅" },
  { id: "hair-done", brand: "", name: "a morning at the salon", kind: "beauty", price: 240, emoji: "💇" },
  { id: "ipad", brand: "Apple", name: "iPad", kind: "tech", price: 349, emoji: "📱" },
  { id: "airtag", brand: "Apple", name: "AirTag for her keys", kind: "tech", price: 29, emoji: "🔑" },
  { id: "ring-light", brand: "Lume Cube", name: "ring light", kind: "tech", price: 110, emoji: "💡" },
  { id: "switch-lite", brand: "Nintendo", name: "Switch Lite", kind: "tech", price: 200, emoji: "🎮" },
  { id: "espresso-machine", brand: "Breville", name: "espresso machine", kind: "home", price: 700, emoji: "☕" },
  { id: "le-creuset", brand: "Le Creuset", name: "casserole dish", kind: "home", price: 400, emoji: "🍲" },
  { id: "record-player", brand: "Audio-Technica", name: "record player", kind: "home", price: 299, emoji: "🎶" },
  { id: "weighted-blanket", brand: "Bearaby", name: "weighted blanket", kind: "home", price: 199, emoji: "🛏️" },
  { id: "cooking-class", brand: "", name: "a cooking class for two", kind: "treat", price: 160, emoji: "👩‍🍳" },
  { id: "festival-tickets", brand: "", name: "two festival tickets", kind: "treat", price: 450, emoji: "🎪" },
  // 👙 One of each of these is in the shop every week — a different one each time, never none.
  { id: "triangl-bikini", brand: "Triangl", name: "neoprene bikini", kind: "clothes", price: 99, emoji: "👙", slot: "bikini" },
  { id: "frankies-bikini", brand: "Frankies Bikinis", name: "Marley triangle bikini", kind: "clothes", price: 150, emoji: "👙", slot: "bikini" },
  { id: "aerie-bikini", brand: "Aerie", name: "ribbed cheeky bikini", kind: "clothes", price: 60, emoji: "👙", slot: "bikini" },
  { id: "laperla-bikini", brand: "La Perla", name: "string bikini", kind: "clothes", price: 390, emoji: "👙", slot: "bikini" },
  { id: "skims-leotard", brand: "SKIMS", name: "high-cut bodysuit", kind: "clothes", price: 88, emoji: "🩱", slot: "leotard" },
  { id: "alo-leotard", brand: "Alo Yoga", name: "high-cut Airlift leotard", kind: "clothes", price: 128, emoji: "🩱", slot: "leotard" },
  { id: "wolford-leotard", brand: "Wolford", name: "high-cut leotard", kind: "clothes", price: 295, emoji: "🩱", slot: "leotard" },
  { id: "mejuri-necklace", brand: "Mejuri", name: "gold pendant necklace", kind: "jewellery", price: 130, emoji: "📿", slot: "necklace" },
  { id: "swarovski-necklace", brand: "Swarovski", name: "crystal necklace", kind: "jewellery", price: 150, emoji: "📿", slot: "necklace" },
  { id: "vca-necklace", brand: "Van Cleef & Arpels", name: "Alhambra pendant", kind: "jewellery", price: 3100, emoji: "📿", slot: "necklace" },
  { id: "madden-platforms", brand: "Steve Madden", name: "platform heels", kind: "shoes", price: 110, emoji: "👠", slot: "heels" },
  { id: "campbell-platforms", brand: "Jeffrey Campbell", name: "platform heels", kind: "shoes", price: 185, emoji: "👠", slot: "heels" },
  { id: "wolfe-platforms", brand: "Naked Wolfe", name: "platform heels", kind: "shoes", price: 230, emoji: "👠", slot: "heels" },
  { id: "ysl-platforms", brand: "Saint Laurent", name: "Tribute platform heels", kind: "shoes", price: 1095, emoji: "👠", slot: "heels" },
  // ☕ The small ones. Always in the shop, never rotated out: the everyday things you'd actually
  // send someone on an ordinary Tuesday.
  { id: "iced-latte", brand: "", name: "large iced latte", kind: "treat", price: 10, emoji: "🧋", always: true, theirs: true },
  { id: "ice-cream", brand: "", name: "ice cream or a shake", kind: "treat", price: 8, emoji: "🍦", always: true, theirs: true },
  { id: "food-delivery", brand: "", name: "dinner delivered", kind: "treat", price: 30, emoji: "🥡", always: true, theirs: true },
  { id: "gift-card", brand: "", name: "gift card", kind: "treat", price: 50, emoji: "🎟️", always: true },
  { id: "team-gear", brand: "", name: "team gear", kind: "clothes", price: 60, emoji: "🏟️", always: true, team: true },
  { id: "book", brand: "", name: "book they've been meaning to read", kind: "home", price: 25, emoji: "📖", always: true },
  { id: "flowers", brand: "", name: "a dozen roses, delivered", kind: "home", price: 75, emoji: "🌹", always: true },
  { id: "wine", brand: "", name: "a nice bottle of wine", kind: "treat", price: 35, emoji: "🍷", always: true },
];

export const giftById = (id: string) => GIFTS.find(g => g.id === id) || null;

/** 🛍️ One of yours, added by hand. They carry a plain shopping bag rather than an emoji of their
 *  own, they never rotate out of the shop, and they're never on anyone's wishlist — a wishlist is
 *  what she came up with, and these are what you came up with. */
export const MY_GIFT_EMOJI = "🛍️";
export const MAX_MY_GIFTS = 10;
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

/**
 * 🛠️ An edit made by hand in Admin → Gifts: a different price, a different brand, a different
 * name. Only the parts actually changed are given; the rest of the gift stays as the catalogue has
 * it, so an edit survives the catalogue being added to.
 */
export type GiftEdit = { name?: string | null; brand?: string | null; price?: number | null };

/** The catalogue with the hand edits laid over it, in catalogue order. */
export function edited(list: Gift[], edits: Map<string, GiftEdit>): Gift[] {
  if (!edits.size) return list;
  return list.map(g => {
    const e = edits.get(g.id);
    if (!e) return g;
    const name = typeof e.name === "string" && e.name.trim() ? e.name.trim() : g.name;
    const brand = typeof e.brand === "string" ? e.brand.trim() : g.brand;
    const price = Number.isFinite(Number(e.price)) && Number(e.price) > 0 ? Math.round(Number(e.price)) : g.price;
    return { ...g, name, brand, price };
  });
}

/** 🎁 How much you can give one person in a day — presents and cash together. */
export const GIFTS_A_DAY = 5;

/** 🛠️ How many things you can add to the catalogue yourself in Admin → Gifts. */
export const MAX_EXTRAS = 20;

/** The icons to pick from when you add one. */
export const GIFT_ICONS = ["🎁", "👜", "👛", "🧥", "👗", "👙", "🩱", "👠", "👟", "🥾", "👢", "🩴", "📿", "💍", "💫", "⌚", "🕶️", "💄", "🧴", "💅", "🛁", "💆", "🎧", "📱", "📷", "💻", "🎮", "🔊", "💡", "🧋", "☕", "🍦", "🥡", "🍫", "🍷", "🎟️", "🎫", "🌹", "💐", "🕯️", "🏨", "🏟️", "⚽", "🏀", "📖", "🎨", "🎸", "🧸", "🪴", "🧣"];

/**
 * 🛍️ Something you added to the catalogue yourself: your icon, your price, and your say on whether
 * it stays in the shop every week or takes its turn on the rotation with everything else.
 */
export type Extra = { id: string; name: string; brand: string; price: number; emoji: string; kind: Kind; always?: true };

/** One of yours, as a gift the shop understands. */
export const asGift = (e: Extra): Gift => ({ id: `extra:${e.id}`, name: e.name, brand: e.brand, price: e.price, emoji: e.emoji, kind: e.kind, ...(e.always ? { always: true as const } : {}) });
export const isExtra = (id: string) => id.startsWith("extra:");

/** 🔁 How many of the rotating things are in the shop in a week, unless Admin says otherwise. */
export const ROTATING = 30;

/** 🛍️ What the shop has this week: the staples and a slot each, plus thirty that come and go. */
/** 🏷️ Two things are reduced every week, each by a different amount between a tenth and a
 *  quarter off. Which two, and by how much, is settled by the week itself, so the shop everyone
 *  opens on a Tuesday is the shop they opened on the Monday. */
export const SALE_COUNT = 2;
export const SALE_MIN = 10;
export const SALE_MAX = 25;
export const salePrice = (price: number, off: number) => Math.max(1, Math.round(price * (100 - off) / 100));

/** What is reduced this week, and by how much: gift id → percent off. */
export function salesFor(week: number, stock: Gift[]): Map<string, number> {
  const out = new Map<string, number>();
  const picks = order(`sale:${week}`, stock).slice(0, SALE_COUNT);
  const taken = new Set<number>();
  for (const g of picks) {
    // A different amount off each one: walk on from where the week lands until it is one of its own.
    const span = SALE_MAX - SALE_MIN + 1;
    let off = SALE_MIN + (hash(`off:${week}:${g.id}`) % span);
    while (taken.has(off)) off = SALE_MIN + ((off - SALE_MIN + 1) % span);
    taken.add(off);
    out.set(g.id, off);
  }
  return out;
}

/** The same gift with the sale on it: what it costs now, and what it cost before. */
export const reduced = (g: Gift, off?: number): Gift =>
  off ? { ...g, price: salePrice(g.price, off), was: g.price, off } : g;

export function shopFor(week: number, rotating = ROTATING, edits?: Map<string, GiftEdit>, extra: Gift[] = []): Gift[] {
  const ALL = extra.length ? [...GIFTS, ...extra] : GIFTS;
  // 👙 One bikini, one high-cut leotard, one necklace, one pair of platform heels — always there,
  // and a different one of each as the weeks go by.
  const picks = SLOTS.map(sl => order(`slot:${sl}:${week}`, ALL.filter(g => g.slot === sl))[0]).filter(Boolean);
  const always = ALL.filter(g => !g.slot && g.always);
  const rest = ALL.filter(g => !g.slot && !g.always);
  const picked = order(`shop:${week}`, rest).slice(0, Math.max(0, rotating));
  const keep = new Set<Gift>([...always, ...picked, ...picks]);
  // 🛠️ Hand edits go on BEFORE the sale, so a reduction comes off the price you set.
  const stock = edits ? edited(ALL.filter(g => keep.has(g)), edits) : ALL.filter(g => keep.has(g));
  const sales = salesFor(week, stock);
  return stock.map(g => reduced(g, sales.get(g.id)));
}

/** 💭 What one person is hoping for this week: three things, their own, and they move on weekly. */
/** 💞 How close someone has to be before the things YOU listed start turning up on their wishlist.
 *  The thirty-five are what anyone might want; yours are yours, and wanting one of those is a
 *  closer thing to want. */
export const WANTS_YOURS_AT = 62;

export function wishlistFor(whoId: string, week: number, mine: Gift[] = [], closeness = 100, edits?: Map<string, GiftEdit>, extra: Gift[] = []): Gift[] {
  // The everyday small ones aren't what anyone puts on a wishlist — a wishlist is for things people
  // hope for, not for a coffee. What you listed yourself only joins the pool once they're close.
  const yours = closeness >= WANTS_YOURS_AT ? mine : [];
  const everything = extra.length ? [...GIFTS, ...extra] : GIFTS;
  const pool = edits ? edited(everything.filter(g => !g.always), edits) : everything.filter(g => !g.always);
  return order(`wish:${whoId}:${week}`, [...pool, ...yours]).slice(0, 3);
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

// 📝 The wording on a photo she sends after a present arrives — every line of it, exactly as it
// goes out, so Settings → 📝 Photo wording can show it and you can change any of it. The defaults
// live here and nowhere else: the editor reads them from this file and so does the code below, so
// the two can never drift apart.
//
// {curly} bits are filled in when the picture is made:
//   {thing}  what turned up, brand and all ("Gucci GG Marmont purse")
//   {what}   the same, or the amount when it's money ("$500")
//   {team}   the line about whose team it is

export type GiftBit = { key: string; label: string; about: string; text: string };

export const GIFT_BITS: GiftBit[] = [
  // 📦 What the picture is OF.
  {
    key: "gift_holding_show",
    label: "Holding up something she could have worn",
    about: "A present she can wear, held up to the camera this time rather than worn.",
    text: "holding up the {thing} they've just been sent, showing it off to the camera",
  },
  {
    key: "gift_holding_plain",
    label: "Holding up something she can't wear",
    about: "A speaker, flowers, tickets — anything there's no wearing.",
    text: "holding up the {thing} they've just been sent, pleased with it",
  },
  {
    key: "gift_wearing",
    label: "Wearing it",
    about: "A present she has on. Nothing else is described for her to wear when this is used.",
    text: "wearing the {thing} they've just been sent, showing it off to the camera",
  },
  {
    key: "gift_cash",
    label: "Money",
    about: "When you sent cash rather than a thing.",
    text: "holding up a fan of cash — {what} in notes — grinning at the camera",
  },
  {
    key: "gift_theirs",
    label: "Her own usual",
    about: "The coffee, the pudding, the dinner — whatever THIS person actually orders.",
    text: "with the {thing} they've just been sent — their OWN usual, the drink or the food THIS person actually orders (from their description, where they live, what they're like), never a stock answer and never tacos unless tacos are genuinely theirs — holding it up to the camera, pleased",
  },
  {
    key: "gift_team_which",
    label: "Whose team the gear is for",
    about: "Goes inside both team-gear lines below.",
    text: "their OWN team, the one they follow or play for (from their description: their college side, their city's team, the sport they play), in that team's real colours",
  },
  {
    key: "gift_team_worn",
    label: "Team gear, worn",
    text: "wearing the team gear they've just been sent — {team} — showing it off to the camera",
    about: "When she puts the team gear on.",
  },
  {
    key: "gift_team_held",
    label: "Team gear, held up",
    about: "When she holds the team gear up instead.",
    text: "holding up the team gear they've just been sent — {team} — to the camera, pleased with it",
  },

  // 🖐️ Hands. This is what stops a second pair of arms appearing.
  {
    key: "gift_hands_held",
    label: "Hands when she's holding it",
    about: "One hand on the present, one on the phone. Without this the picture grows extra arms to do both.",
    text: "She is holding it in ONE hand only; her other arm is the one holding the phone that is taking the picture, reaching toward the camera and out of shot. She has exactly two arms and two hands in total — no third or fourth arm, and no spare hand supporting the thing she is holding.",
  },
  {
    key: "gift_hands_worn",
    label: "Hands when she's wearing it",
    about: "Both hands free, so an ordinary two-handed selfie is fine.",
    text: "She is wearing it, so both of her hands are free: she can hold the phone however she likes. She has exactly two arms and two hands in total.",
  },

  // 🙂 Her face. Which one is used follows her sliders — the top one that fits.
  {
    key: "gift_face_cold",
    label: "Her face · cold",
    about: "Used when her coldness is 7 or more.",
    text: "barely smiling — pleased, and not about to make a fuss of it",
  },
  {
    key: "gift_face_funny",
    label: "Her face · funny",
    about: "Used when her humour is 7 or more.",
    text: "mid-laugh, caught enjoying herself",
  },
  {
    key: "gift_face_flirty",
    label: "Her face · flirty",
    about: "Used when her flirty slider is 7 or more.",
    text: "a slow pleased smile, looking straight down the lens",
  },
  {
    key: "gift_face_lively",
    label: "Her face · lively",
    about: "Used when her energy is 7 or more.",
    text: "beaming, caught mid-bounce",
  },
  {
    key: "gift_face_moody",
    label: "Her face · moody",
    about: "Used when her moodiness is 7 or more.",
    text: "a small, almost shy smile that doesn't quite reach the camera",
  },
  {
    key: "gift_face_warm",
    label: "Her face · anyone else",
    about: "When none of the others fit.",
    text: "a warm, genuine smile",
  },

  // 👀 Where she's looking, by how close the two of you are.
  {
    key: "gift_look_close",
    label: "Looking · close to you",
    about: "70 or more.",
    text: "Looking right at the camera as though it's them.",
  },
  {
    key: "gift_look_middle",
    label: "Looking · knows you",
    about: "45 to 69.",
    text: "Half looking at the camera.",
  },
  {
    key: "gift_look_new",
    label: "Looking · barely knows you",
    about: "Under 45.",
    text: "Not quite looking at the camera — a little shy about it.",
  },
  {
    key: "gift_big",
    label: "When it was a big one",
    about: "Added for cash over $500, or something off her own wishlist.",
    text: "Caught off guard by it — it's more than she expected.",
  },

  // 📸 The closing line on every gift photo.
  {
    key: "gift_same_woman",
    label: "That it's really her",
    about: "The last words on a gift photo, after her face and what she's wearing.",
    text: "It is clearly the same woman as in the reference pictures — her face, her hair, her build. Taken on her own phone where she is, candid and real.",
  },
];

export type GiftWords = Record<string, string>;

/** Every default, by key. */
export const giftDefaults = (): GiftWords => Object.fromEntries(GIFT_BITS.map(b => [b.key, b.text]));

const DEFAULTS = giftDefaults();

/** One line: theirs if they changed it, otherwise the default — with the {curly} bits filled in. */
export function say(words: GiftWords | undefined, key: string, vars: Record<string, string> = {}): string {
  const text = (words && typeof words[key] === "string" && words[key].trim()) || DEFAULTS[key] || "";
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "" : vars[k])).replace(/\s+/g, " ").trim();
}

// 😊 Her face in the picture. The same present lands differently on different people: someone
// cold gives you the smallest smile she's got, someone daft is already laughing, someone flirty is
// looking at the camera over her shoulder. And how close you are changes it again — a woman who's
// mad about you looks at the lens like it's you; one who barely knows you is politer about it.
export function giftFace(t: { humor?: number; coldness?: number; flirty?: number; energetic?: number; moody?: number }, closeness: number, big = false, w?: GiftWords): string {
  const n = (v: unknown) => Math.max(0, Math.min(10, Number(v) || 0));
  const humor = n(t.humor), cold = n(t.coldness), flirty = n(t.flirty), lively = n(t.energetic), moody = n(t.moody);
  const face = say(w, cold >= 7 ? "gift_face_cold"
    : humor >= 7 ? "gift_face_funny"
    : flirty >= 7 ? "gift_face_flirty"
    : lively >= 7 ? "gift_face_lively"
    : moody >= 7 ? "gift_face_moody"
    : "gift_face_warm");
  const toward = say(w, closeness >= 70 ? "gift_look_close" : closeness >= 45 ? "gift_look_middle" : "gift_look_new");
  const more = big ? ` ${say(w, "gift_big")}` : "";
  return `Her expression: ${face}. ${toward}${more}`;
}

/**
 * 👗 How likely she is to have the present ON rather than held up to the camera.
 *
 * Trying something on for someone is a familiar thing to do. A woman who barely knows you is far
 * likelier to hold the boots up and say look what you sent than to put them on and photograph
 * herself in them; someone you're close to does it without thinking. Who she is moves it again —
 * a flirt or a livewire will try anything on, someone cold or shy would rather just show you.
 */
export function wearOdds(t: { humor?: number; coldness?: number; flirty?: number; energetic?: number; moody?: number }, closeness: number): number {
  const n = (v: unknown) => Math.max(0, Math.min(10, Number(v) || 0));
  let p = 0.12 + Math.max(0, Math.min(100, closeness)) / 100 * 0.63;
  if (n(t.flirty) >= 7) p += 0.12;
  if (n(t.energetic) >= 7) p += 0.08;
  if (n(t.humor) >= 7) p += 0.05;
  if (n(t.coldness) >= 7) p -= 0.18;
  if (n(t.moody) >= 7) p -= 0.1;
  return Math.max(0.05, Math.min(0.9, p));
}

/** 📸 How often a thank-you comes with a photo: most of the time, not always. */
export const PHOTO_ODDS = 0.7;

/**
 * What the picture is of, when there is one.
 *
 * `wearing` says she has the present ON. When she has, nothing else is described for her to wear:
 * telling the picture she's in the new boots AND her usual white sneakers is how you get a photo of
 * someone holding boots. Whether she has it on at all is `wears` (see wearOdds): someone who hardly
 * knows you holds the boots up to the camera rather than putting them on for you.
 */
export function photoBrief(what: string, kind: "gift" | "money", g: Pick<Gift, "emoji" | "name" | "brand" | "kind"> & { team?: true; theirs?: true } | null, wears = 0.5, roll = Math.random(), w?: GiftWords): { brief: string; wearing: boolean; hands: string } {
  const hasOn = roll < wears;
  const held = (brief: string) => ({ brief, wearing: false, hands: say(w, "gift_hands_held") });
  const worn = (brief: string) => ({ brief, wearing: true, hands: say(w, "gift_hands_worn") });
  if (kind === "money") return held(say(w, "gift_cash", { what, thing: what }));
  // One of yours, or something we don't know: she holds it up. ("a present" reads as "the present".)
  const plain = what.replace(/^(?:an?|the)\s+/i, "") || "present";
  if (!g || g.kind === "mine") return held(say(w, "gift_holding_plain", { thing: plain, what }));
  // 🏟️ Team gear is whatever team is actually theirs — the one they follow, or the one they play for.
  const team = say(w, "gift_team_which");
  if (g.team) return hasOn ? worn(say(w, "gift_team_worn", { team })) : held(say(w, "gift_team_held", { team }));
  // ☕🍦🥡 A coffee, a pudding, dinner: whatever THIS person actually orders, not a stock answer.
  if (g.theirs) return held(say(w, "gift_theirs", { thing: g.name, what }));
  // 👗 Something she can wear: on, or held up to the camera — how often depends on who she is and
  // how well she knows you (wearOdds).
  const named = `${g.brand} ${g.name}`.trim();
  const canWear = ["clothes", "shoes", "jewellery", "bag"].includes(g.kind);
  if (canWear && hasOn) return worn(say(w, "gift_wearing", { thing: named, what }));
  return held(say(w, canWear ? "gift_holding_show" : "gift_holding_plain", { thing: named, what }));
}
