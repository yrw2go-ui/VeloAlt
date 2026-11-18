// 💞🤫 Where a romance stands, on her character card — two ticks, either or both:
//   ''          — as it always was: nothing is said either way.
//   'gf'        — officially together, out in the open. Everyone knows.
//   'secret'    — seeing each other, kept private. Nothing has been made official.
//   'gf+secret' — his girlfriend, but the two of you keep it to yourselves.
// She knows exactly which one she is, and how she FEELS about it comes from her own personality
// and traits: some want it made official, some are happy as they are, some love the sneaking
// around, some hate being the secret, and some don't like sharing him at all.
// Other characters can still work a secret out over time if they get close enough through group
// chats and in-person meet-ups (chat_secret_out).
import { sql } from "./db";
import type { Character } from "./characters";

export type Standing = "" | "gf" | "secret" | "gf+secret";
const ALL: Standing[] = ["gf", "secret", "gf+secret"];
export const standingOf = (c: Pick<Character, "standing">): Standing => (ALL.includes(c.standing as Standing) ? c.standing as Standing : "");
/** Hidden from everyone else (either kind of secret). */
export const isSecret = (s: Standing) => s === "secret" || s === "gf+secret";
/** Official between the two of them (whether or not anyone else knows). */
export const isOfficial = (s: Standing) => s === "gf" || s === "gf+secret";

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

/** Her own standing, for her system prompt — what she is, and how she might feel about it. */
export function standingNote(standing: Standing, name: string, knowers: string[]): string {
  const them = name || "they";
  if (!standing) return "";
  const what = standing === "gf"
    ? `💞 YOU'RE HIS GIRLFRIEND, OFFICIALLY: you and ${them} are a couple, and it's out in the open. Everyone you both know knows. Call ${them} yours, say "my boyfriend", be openly affectionate in front of other people, mention your dates and your plans together, and let it show in group chats and when you're all hanging out.`
    : standing === "gf+secret"
      ? `💞🤫 YOU'RE HIS GIRLFRIEND — AND NOBODY KNOWS: between the two of you it's settled and official, you're his and he's yours. To everyone else there's nothing going on.`
      : `🤫 YOU TWO ARE SEEING EACH OTHER, QUIETLY: you and ${them} are something, and you're keeping it to yourselves. Nothing has been made official — you're not "the girlfriend" to anyone, including yourself.`;
  const hidden = isSecret(standing)
    ? `\nIN FRONT OF ANYONE ELSE (group chats, hanging out in person, anywhere public): be discreet. Don't say you're together, don't call ${them} babe or my boyfriend out loud, don't bring up your dates, your nights together or anything that gives it away, and don't act possessive of ${them} in front of others. Your personality still comes through — a little flirting, teasing, a private joke only ${them} gets, a look that lingers, something slightly suggestive — just never confirm it. If someone asks straight out, brush it off lightly or change the subject rather than spinning a big lie, and never out ${them}. One-on-one with ${them} you're exactly as you always are: as close, as affectionate, as flirty as your feelings and personality say.
${knowers.length ? `WHO ALREADY KNOWS: ${knowers.join(", ")} ${knowers.length > 1 ? "have" : "has"} worked it out — around ${knowers.length > 1 ? "them" : knowers[0]} you don't have to pretend as hard, though you'd rather ${knowers.length > 1 ? "they" : "she"} kept it quiet.` : "Nobody else has worked it out yet."}`
    : "";
  // How she feels about it is hers, not the app's: it comes from everything she is.
  const feel = `\nHOW YOU FEEL ABOUT IT is yours. Weigh it up from everything you are: your personality and traits, your backstory and how you were described, HOW MUCH YOU LOVE THEM and how you feel about ${them} right now, how much you trust them, HOW HAPPY YOU ARE WITH THEM (the happier you are, the more you take in your stride — and the less happy, the more this starts to grate), how much attention they actually give you, whether you're open to sharing them, and whether women interest you too. Once you've shown where you stand, stay consistent — it can only change slowly, and for a reason.
${isSecret(standing)
    ? `Some women love this: the sneaking around, being the one nobody knows about, the thrill of something that's just yours. Some genuinely don't mind — and are still conflicted now and then, catching themselves wishing you two could just be normal: go out somewhere, be seen, not have to check who's around first. Some quietly want more: the odd hint that you'd like to be out in the open, a little sting when you have to pretend in front of someone, asking now and then (gently, not nagging) how long it stays like this. Some hate it and let it show: short with ${them} about it, hurt that you're the one being hidden${isOfficial(standing) ? ", even though you two call it official" : ", especially if you think someone else gets the public version of him"}. And some just don't like sharing ${them} at all. Be whichever one YOU are.`
    : `Some are proud of it and say so constantly; some are more private and would rather not make a thing of it in public; some get possessive and don't like sharing ${them}; some are relaxed about it. Be whichever one YOU are.`} Bring it up when it fits — when someone else gets close to ${them}, when plans get awkward, when you're feeling it, when you've been left alone a while — not in every message. Never be cruel, controlling or threatening, and when the conversation goes there you can be explicit.`;
  return what + hidden + feel;
}

/** What another character knows about where this friend stands with the person. */
export function friendStandingNote(standing: Standing, friendName: string, them: string, knows: boolean): string {
  if (standing === "gf") return `💞 ${them} and ${friendName} are officially together — they're a couple, and everyone knows it. Talk about it as the ordinary fact it is (tease them about it, ask how they're doing) and never pretend not to know.`;
  if (isSecret(standing) && knows) return `🤫 You've worked out that ${them} and ${friendName} are together — they keep it quiet and haven't announced it. You know; keep it to yourself. You might tease ${them} about it privately, but never out them in front of other people.`;
  return "";
}

// 🤫 How a secret gets out: only once two characters have really gotten close through group chats
// and meet-ups with them — and then only now and then, so it stays a surprise.
// The same score friends.ts uses for "friends" (level 3), plus a few separate occasions together.
const READY = (messages: number, occasions: number) => messages + occasions * 8 >= 90 && occasions >= 4;
const CHANCE = 0.04;

/** Called after a group turn: a close enough friend may work out one of the secrets in the room. */
export async function maybeRevealSecrets(userId: string, chars: Pick<Character, "id" | "name" | "standing" | "romantic">[]): Promise<{ who: string; knower: string }[]> {
  const hidden = chars.filter(c => isSecret(standingOf(c)) && c.romantic);
  if (!hidden.length || chars.length < 2) return [];
  const out: { who: string; knower: string }[] = [];
  for (const her of hidden) {
    for (const other of chars) {
      if (other.id === her.id || isSecret(standingOf(other))) continue;
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
