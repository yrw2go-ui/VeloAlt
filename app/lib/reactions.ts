// 😮 The reactions (on messages, photos and videos; in chats and group chats). One list, used everywhere.
export const REACTIONS = ["❤️", "🔥", "🙌", "😍", "👍", "😮", "😂", "🥵", "🤤", "💦", "😈", "😏", "👀", "👌", "🤔", "🫣", "😅", "😴"] as const;

// 🔥 The ones that say more than "nice": she always has something to say back to these.
export const HOT = ["🔥", "🥵", "🤤", "💦", "😈"] as const;
export const isHot = (r: unknown): boolean => typeof r === "string" && (HOT as readonly string[]).includes(r);
export const isReaction = (r: unknown): r is (typeof REACTIONS)[number] => typeof r === "string" && (REACTIONS as readonly string[]).includes(r);
