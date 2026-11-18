// 📍 Local: she lives close enough to actually see — within about an hour's drive. For a hometown
// in the Chicago south suburbs that's the south side, the south and southwest suburbs, and the
// whole of north-west Indiana. Real places, so the two of you can talk about them like locals.

/** Real towns and cities within roughly an hour of South Holland, Illinois. */
export const NEAR_SOUTH_HOLLAND = [
  // Illinois — south and southwest suburbs, and the south side of Chicago
  "South Holland, IL", "Dolton, IL", "Lansing, IL", "Calumet City, IL", "Harvey, IL", "Homewood, IL",
  "Flossmoor, IL", "Glenwood, IL", "Chicago Heights, IL", "Park Forest, IL", "Matteson, IL",
  "Olympia Fields, IL", "Richton Park, IL", "Country Club Hills, IL", "Oak Forest, IL", "Tinley Park, IL",
  "Orland Park, IL", "Oak Lawn, IL", "Evergreen Park, IL", "Blue Island, IL", "Alsip, IL", "Midlothian, IL",
  "Crestwood, IL", "Palos Heights, IL", "Frankfort, IL", "Mokena, IL", "New Lenox, IL", "Monee, IL",
  "Beecher, IL", "Steger, IL", "Crete, IL", "Peotone, IL", "Lemont, IL", "Burbank, IL", "Joliet, IL",
  "Beverly, Chicago, IL", "Hyde Park, Chicago, IL", "Bridgeport, Chicago, IL", "Pullman, Chicago, IL",
  "Kankakee, IL", "Bourbonnais, IL", "Manteno, IL",
  // Indiana — the Region
  "Hammond, IN", "Whiting, IN", "East Chicago, IN", "Munster, IN", "Highland, IN", "Griffith, IN",
  "Schererville, IN", "Dyer, IN", "St. John, IN", "Cedar Lake, IN", "Crown Point, IN", "Merrillville, IN",
  "Hobart, IN", "Lake Station, IN", "Gary, IN", "Portage, IN", "Chesterton, IN", "Valparaiso, IN",
  "Lowell, IN", "Hebron, IN", "DeMotte, IN", "Michigan City, IN", "La Porte, IN",
] as const;

// 🚫 Far enough away to be a mistake on a card marked local: another state, or the far end of
// Illinois or Indiana. (Only places people actually name — not every town in both states.)
const FAR_STATES = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"], ["California", "CA"],
  ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"], ["Florida", "FL"], ["Georgia", "GA"],
  ["Hawaii", "HI"], ["Idaho", "ID"], ["Iowa", "IA"], ["Kansas", "KS"], ["Kentucky", "KY"],
  ["Louisiana", "LA"], ["Maine", "ME"], ["Maryland", "MD"], ["Massachusetts", "MA"], ["Michigan", "MI"],
  ["Minnesota", "MN"], ["Mississippi", "MS"], ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"],
  ["Nevada", "NV"], ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"], ["New York", "NY"],
  ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"], ["Oklahoma", "OK"], ["Oregon", "OR"],
  ["Pennsylvania", "PA"], ["Rhode Island", "RI"], ["South Carolina", "SC"], ["South Dakota", "SD"],
  ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"], ["Vermont", "VT"], ["Virginia", "VA"],
  ["Washington", "WA"], ["West Virginia", "WV"], ["Wisconsin", "WI"], ["Wyoming", "WY"],
] as const;
const FAR_TOWNS = [
  "Springfield", "Peoria", "Rockford", "Champaign", "Urbana", "Bloomington", "Normal", "Decatur",
  "Carbondale", "Quincy", "Galesburg", "Moline", "Rock Island", "Alton", "Belleville", "Edwardsville",
  "Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Bloomington, Indiana", "Muncie", "Kokomo",
  "Lafayette", "Terre Haute", "Anderson", "Elkhart", "Richmond, Indiana", "Columbus, Indiana",
] as const;
const CITIES_ABROAD = ["London", "Paris", "Toronto", "Vancouver", "Sydney", "Melbourne", "Dublin", "Manila", "Tokyo", "Berlin", "Madrid", "Mexico City", "Lagos", "Nairobi", "Mumbai", "Delhi", "Seoul", "Bangkok"] as const;

const word = (w: string) => new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`, "i");

/**
 * Does her card put her somewhere that isn't within an hour? Returns the place it found, for a
 * warning next to the tick — never a block: she might simply have moved, and it's your call.
 */
export function localConflict(text: string): string {
  const t = String(text || "");
  if (!t.trim()) return "";
  // A nearby town named outright settles it, whatever else the text mentions.
  for (const n of NEAR_SOUTH_HOLLAND) if (word(n.split(",")[0])!.test(t)) return "";
  for (const [full, abbr] of FAR_STATES) {
    if (word(full).test(t)) return full;
    if (new RegExp(`,\\s*${abbr}([^A-Za-z]|$)`).test(t)) return full;
  }
  for (const town of FAR_TOWNS) if (word(town.split(",")[0]).test(t)) return town.split(",")[0];
  for (const c of CITIES_ABROAD) if (word(c).test(t)) return c;
  return "";
}

/** What to tell whoever is writing her, so she comes out of a real town up the road. */
export function localNote(home: string): string {
  const some = [...NEAR_SOUTH_HOLLAND].sort(() => Math.random() - 0.5).slice(0, 14).join("; ");
  return `WHERE SHE LIVES: a real town within about an hour's drive of ${home || "South Holland, Illinois"} — the south and southwest suburbs of Chicago, the south side, or north-west Indiana. Pick ONE and name it in her backstory, e.g.: ${some}. Vary it (don't default to the obvious one), and let her everyday places be real ones nearby — her gym, her diner, the Metra, the lake, the mall.`;
}
