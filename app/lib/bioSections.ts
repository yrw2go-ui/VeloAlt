// 👤 The extra "About you" sections (all optional). Shared by the Settings card and the server.
export const BIO_SECTIONS = [
  { key: "work", label: "💼 Work", placeholder: "e.g. Project manager at a construction company — long days, love the team", note: "What they do" },
  { key: "hobbies", label: "🎣 Hobbies & interests", placeholder: "e.g. Fishing, golf on Sundays, building PCs, true-crime podcasts", note: "Hobbies & interests" },
  { key: "favorites", label: "⭐ Favorites", placeholder: "e.g. Tacos, 90s country, The Office, the lake at sunset", note: "Favorite things (food, music, shows, places)" },
  { key: "family", label: "🏡 Family & pets", placeholder: "e.g. Two kids (Mia 8, Jake 5), a golden retriever named Bo", note: "Family & pets" },
  { key: "goals", label: "🎯 Goals", placeholder: "e.g. Get back in shape, start my own business, see Japan", note: "What they're working toward" },
  { key: "dislikes", label: "🙅 Pet peeves", placeholder: "e.g. Being late, loud chewing, small talk", note: "Pet peeves & dislikes" },
  { key: "cared", label: "💛 What makes you feel cared for", placeholder: "e.g. Checking in on my day, little compliments, remembering details", note: "What makes them feel cared for" },
  { key: "style", label: "💬 How you like to be talked to", placeholder: "e.g. Straight talk, lots of jokes, no sugar-coating", note: "How they like to be talked to" },
  { key: "avoid", label: "🚫 Topics to avoid", placeholder: "e.g. Politics, my ex, my weight", note: "Topics to avoid" },
] as const;
export type BioKey = (typeof BIO_SECTIONS)[number]["key"];
export type BioMore = Partial<Record<BioKey, string>>;
export const BIO_MAX = 400;
