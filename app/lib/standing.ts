// 💞🤫 Where a romance stands, on her character card:
//   ''       — as it always was: nothing is said either way.
//   'gf'     — officially together. Everyone knows; she can say it out loud.
//   'secret' — together, but kept private. In front of other people she stays discreet; her own
//              personality still shows (a hint, a private joke, a bit of flirting), she just never
//              confirms it. Other characters can still work it out over time if they get close
//              enough through group chats and in-person meet-ups (chat_secret_out).
import { sql } from "./db";
import type { Character } from "./characters";

export type Standing = "" | "gf" | "secret";
export const standingOf = (c: Pick<Character, "standing">): Standing => (c.standing === "gf" || c.standing === "secret" ? c.standing : "");

/** The other characters who have found out about her secret (names, for her own prompt). */
export async function secretKnowers(userId: string, characterId: string): Promise<string[]> {
  const rows = await sql()`select c.name from chat_secret_out s join chat_characters c on c.id = s.knower_id
    where s.user_id = ${userId} and s.character_id = ${characterId} order by s.at`;
  return rows.map(r => String(r.name));
}

/** The secret relationships THIS character has found out about (the other characters' ids). */
export async function secretsKnownBy(userId: string, knowerId: string): Promise<string[]> {
  const rows = await sql()`select character_id from chat_secret_out where user_id = ${userId} and knower_id = ${knowerId}`;
  return rows.map(r => String(r.character_id));
}

/** Her own standing, for her system prompt. */
export function standingNote(standing: Standing, name: string, knowers: string[]): string {
  const them = name || "they";
  if (standing === "gf") {
    return `💞 OFFICIALLY TOGETHER: you and ${them} are a couple — girlfriend and boyfriend — and it's public. Everyone you both know knows it, so there's nothing to hide: call ${them} yours, say "my boyfriend", be openly affectionate in front of other people, mention your dates and plans together, and let it show in group chats and when you're all hanging out. Keep anything intimate between you two private, and keep it PG-13.`;
  }
  if (standing === "secret") {
    return `🤫 SECRET RELATIONSHIP: you and ${them} are together, but you two are keeping it private — nobody else is supposed to know yet. One-on-one with ${them} you're exactly as you always are: as close, as affectionate, as flirty as your feelings and personality say.
IN FRONT OF ANYONE ELSE (group chats, hanging out in person, anywhere public): be discreet. Don't say you're together, don't call ${them} babe or my boyfriend out loud, don't bring up your dates, your nights together or anything that gives it away, and don't act possessive of ${them} in front of others. Your personality still comes through — a little flirting, teasing, a private joke only ${them} gets, a look that lingers, something slightly suggestive — just never confirm it. If someone asks straight out, brush it off lightly or change the subject rather than spinning a big lie, and never out ${them}.
${knowers.length ? `WHO ALREADY KNOWS: ${knowers.join(", ")} ${knowers.length > 1 ? "have" : "has"} worked it out — around ${knowers.length > 1 ? "them" : knowers[0]} you don't have to pretend as hard, though you'd rather ${knowers.length > 1 ? "they" : "she"} kept it quiet.` : "Nobody else has worked it out yet."}`;
  }
  return "";
}

/** What another character knows about where this friend stands with the person. */
export function friendStandingNote(standing: Standing, friendName: string, them: string, knows: boolean): string {
  if (standing === "gf") return `💞 ${them} and ${friendName} are officially together — they're a couple, and everyone knows it. Talk about it as the ordinary fact it is (tease them about it, ask how they're doing) and never pretend not to know.`;
  if (standing === "secret" && knows) return `🤫 You've worked out that ${them} and ${friendName} are together — they keep it quiet and haven't announced it. You know; keep it to yourself. You might tease ${them} about it privately, but never out them in front of other people.`;
  return "";
}

// 🤫 How a secret gets out: only once two characters have really gotten close through group chats
// and meet-ups with them — and then only now and then, so it stays a surprise.
// The same score friends.ts uses for "friends" (level 3), plus a few separate occasions together.
const READY = (messages: number, occasions: number) => messages + occasions * 8 >= 90 && occasions >= 4;
const CHANCE = 0.04;

/** Called after a group turn: a close enough friend may work out one of the secrets in the room. */
export async function maybeRevealSecrets(userId: string, chars: Pick<Character, "id" | "name" | "standing" | "romantic">[]): Promise<{ who: string; knower: string }[]> {
  const hidden = chars.filter(c => standingOf(c) === "secret" && c.romantic);
  if (!hidden.length || chars.length < 2) return [];
  const out: { who: string; knower: string }[] = [];
  for (const her of hidden) {
    for (const other of chars) {
      if (other.id === her.id || standingOf(other) === "secret") continue;
      const [a, b] = her.id < other.id ? [her.id, other.id] : [other.id, her.id];
      const [bond] = await sql()`select messages, occasions from chat_bonds where user_id = ${userId} and a_id = ${a} and b_id = ${b}`;
      if (!bond || !READY(Number(bond.messages), Number(bond.occasions))) continue;
      const [had] = await sql()`select 1 from chat_secret_out where user_id = ${userId} and character_id = ${her.id} and knower_id = ${other.id}`;
      if (had || Math.random() > CHANCE) continue;
      await sql()`insert into chat_secret_out (user_id, character_id, knower_id) values (${userId}, ${her.id}, ${other.id}) on conflict do nothing`;
      out.push({ who: her.name, knower: other.name });
    }
  }
  return out;
}
