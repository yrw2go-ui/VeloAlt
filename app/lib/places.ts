// 🗺️ The local spots. Hours are local clock times; a place that closes after midnight (the brewery)
// is written with a closing time smaller than its opening one and handled as running past midnight.
// `months` limits a place to part of the year (the pool, the orchard). `away` marks somewhere that
// isn't in town at all — going there is travel, not an evening out.
export type Place = {
  id: string; name: string; emoji: string;
  open: string; close: string;        // "" and "" = always open
  months?: number[];                   // 1–12; absent = all year
  away?: boolean;                      // not local
  adult?: boolean;                     // 21+
};

export const PLACES: Place[] = [
  { id: "mall", name: "SH Mall", emoji: "🛍️", open: "10:00", close: "21:00" },
  { id: "hooters", name: "Hooters", emoji: "🍗", open: "11:00", close: "23:00" },
  { id: "ymca", name: "YMCA Gym", emoji: "🏋️", open: "05:00", close: "00:00" },
  { id: "park", name: "SH State Park", emoji: "🌲", open: "07:00", close: "22:00" },
  { id: "home", name: "My house", emoji: "🏠", open: "", close: "" },
  { id: "starbucks", name: "Starbucks", emoji: "☕", open: "05:00", close: "19:00" },
  { id: "longhorn", name: "Longhorn Steakhouse", emoji: "🥩", open: "11:00", close: "23:00" },
  { id: "library", name: "Local library", emoji: "📚", open: "07:00", close: "18:00" },
  { id: "wingstop", name: "Wingstop", emoji: "🍖", open: "11:00", close: "00:00" },
  { id: "pool", name: "Public pool", emoji: "🏊", open: "08:00", close: "21:00", months: [6, 7, 8] },
  { id: "picagift", name: "PicaGift Shop", emoji: "🎁", open: "08:00", close: "20:00" },
  { id: "petstore", name: "Noah's Ark Pet Store", emoji: "🐾", open: "09:00", close: "21:00" },
  { id: "freshlooks", name: "Fresh Looks", emoji: "💈", open: "09:00", close: "19:00" },
  { id: "hotshots", name: "Hotshots Brewery", emoji: "🍺", open: "15:00", close: "02:00", adult: true },
  { id: "orchard", name: "Apple Orchard & Shops", emoji: "🍎", open: "07:00", close: "16:00", months: [9, 10, 11, 12] },
  { id: "parents", name: "Parents' house (Chicago)", emoji: "👪", open: "", close: "", away: true },
  { id: "chicago", name: "Chicago", emoji: "🌆", open: "", close: "", away: true },
];

export const placeById = (id: unknown): Place | null => PLACES.find(p => p.id === String(id || "")) || null;

/** 🕰️ Is it open at this local time (HH:MM) and month? A place with no hours is always open. */
export function placeOpen(p: Place, hhmm: string, month: number): boolean {
  if (p.months && !p.months.includes(month)) return false;
  if (!p.open || !p.close) return true;
  // Past midnight: open 15:00, closes 02:00 — the evening and the small hours both count.
  return p.open <= p.close ? hhmm >= p.open && hhmm < p.close : hhmm >= p.open || hhmm < p.close;
}
