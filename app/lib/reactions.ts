// 😮 The reactions (on messages, photos and videos; in chats and group chats). One list, used everywhere.
export const REACTIONS = ["❤️", "🔥", "🙌", "😍", "👍", "😮", "😂", "🥵", "🤤", "😏", "😅", "😴"] as const;
export const isReaction = (r: unknown): r is (typeof REACTIONS)[number] => typeof r === "string" && (REACTIONS as readonly string[]).includes(r);
