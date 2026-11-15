// 📷 Her posts shouldn't all be the same photo. Every post is given a shot and a tone, so the
// pose, the angle and how dressed-up it is move around even when the place repeats.
export const SHOTS = [
  "a selfie at arm's length, looking into the camera",
  "a mirror selfie, phone in shot",
  "a photo someone else took of her, full body, not looking at the camera",
  "a candid shot mid-something (walking, laughing, reaching for something), caught off guard",
  "a close-up from slightly above, head and shoulders",
  "from behind or over her shoulder, glancing back",
  "a wide shot with her small in the frame and the place around her",
  "sitting or lying down — on a sofa, a bed, a towel, the grass — shot from above or beside",
  "a low angle from below, looking up at her",
  "leaning on something (a car, a counter, a railing), weight on one hip",
];
export const TONES = {
  everyday: "ordinary and unposed — what she actually wore today, nothing done for the camera",
  flattering: "she knows she looks good: a proper outfit, a confident pose, the light working for her",
  sensual: "flattering and a little sensual (PG-13): a close, confident shot — a low-cut top, a sports bra, swimwear at the beach or pool, a look over the shoulder — tasteful, never nudity, lingerie or anything sexual",
} as const;
export const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
/** A different shot each time: the one she used last time never comes round twice in a row. */
export const shotFor = (seed: string, n: number) => SHOTS[(hash(seed) + n * 3 + Math.floor(Math.random() * 2)) % SHOTS.length];
/**
 * How dressed-up this one is. Everyone has some — one in six at the very least — and the ones
 * who are that way inclined (the suggestive slider) have more.
 */
export function toneFor(seed: string, n: number, suggestive: number, allowed: boolean): keyof typeof TONES {
  const everyNth = suggestive >= 6 ? 2 : suggestive >= 4 ? 3 : suggestive >= 2 ? 4 : 6;
  const r = (hash(`${seed}:tone`) + n) % everyNth;
  if (r === 0) return allowed ? "sensual" : "flattering";
  return (hash(`${seed}:t2`) + n) % 2 === 0 ? "flattering" : "everyday";
}

