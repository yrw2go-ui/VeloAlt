// 🎁 Picagifts, the database side: the wallet, sending a present or money, and working out
// whether someone is still in the glow of one.
import { sql } from "./db";
import { scrub } from "./secrets";
import { GIFTS, giftById, shopFor, weekOf, wishlistFor, onWishlist, boostFrom, type Boost, type Gift } from "./gifts";
import { settle, transfer, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH } from "./money";

export class GiftError extends Error {}

/** 💳 Both accounts, brought up to date: this week's wages in, this week's interest on. */
export async function accountsFor(userId: string, now = Date.now()) {
  const [r] = await sql()`select wallet, bank, money_week from users where id = ${userId}`;
  const week = weekOf(now);
  const had = { spend: Number(r?.wallet ?? 0), bank: Number(r?.bank ?? 0), week: Number(r?.money_week ?? 0) };
  // A brand-new account starts this week, so nobody gets a year of back pay on their first look.
  if (!had.week) {
    await sql()`update users set money_week = ${week} where id = ${userId}`;
    return { ...had, week, paid: 0, interest: 0, weeks: 0 };
  }
  if (had.week >= week) return { ...had, paid: 0, interest: 0, weeks: 0 };
  const s = settle(had, userId, week);
  await sql()`update users set wallet = ${s.accounts.spend}, bank = ${s.accounts.bank}, money_week = ${s.accounts.week} where id = ${userId}`;
  return { ...s.accounts, paid: s.paid, interest: s.interest, weeks: s.weeks };
}

export async function walletFor(userId: string): Promise<number> {
  return (await accountsFor(userId)).spend;
}

/** 💸 Bring money across from the bank into what you can spend. */
export async function moveAcross(userId: string, amount: number) {
  const a = await accountsFor(userId);
  let next;
  try { next = transfer({ spend: a.spend, bank: a.bank, week: a.week }, Math.round(Number(amount) || 0)); }
  catch (e) { throw new GiftError(e instanceof Error ? e.message : "That transfer didn't go through."); }
  await sql()`update users set wallet = ${next.spend}, bank = ${next.bank} where id = ${userId}`;
  return { spend: next.spend, bank: next.bank };
}

/** 🛍️ This week's shop, and what each person is hoping for. */
export const shopNow = (now = Date.now()): Gift[] => shopFor(weekOf(now));
export const wishlistOf = (whoId: string, now = Date.now()): Gift[] => wishlistFor(whoId, weekOf(now));

/** 💝 Everyone you can send to: your characters, and the Picagram people you follow. */
export async function peopleToGift(userId: string) {
  const chars = await sql()`select c.id, c.name, f.url as face from chat_characters c
    left join velo_files f on f.id = c.portrait_file_id
    where c.owner_id is null or c.owner_id = ${userId} order by c.name`;
  const accounts = await sql()`select a.id, a.name, a.handle, f.url as face from pica_accounts a
    left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id
    where a.user_id = ${userId} and a.followed and a.character_id is null and not a.mine order by a.name limit 40`;
  const now = Date.now();
  return [
    ...chars.map(r => ({ id: String(r.id), kind: "character" as const, name: String(r.name), handle: null as string | null,
      face: r.face ? String(r.face) : null, wishlist: wishlistOf(String(r.id), now) })),
    ...accounts.map(r => ({ id: String(r.id), kind: "account" as const, name: String(r.name), handle: String(r.handle || ""),
      face: r.face ? String(r.face) : null, wishlist: wishlistOf(String(r.id), now) })),
  ];
}

/** 🎀 Send it. The money leaves the wallet, and it's remembered for the warm spell afterwards. */
export async function sendGift(userId: string, to: { kind: "character" | "account"; id: string }, what: { giftId?: string; money?: number; note?: string }) {
  const now = Date.now();
  const gift = what.giftId ? giftById(what.giftId) : null;
  if (what.giftId && !gift) throw new GiftError("That isn't something you can send.");
  if (gift && !shopNow(now).some(g => g.id === gift.id)) throw new GiftError(`${gift.name} isn't in the shop this week.`);
  const money = gift ? 0 : Math.round(Number(what.money) || 0);
  if (!gift && (money < 1 || money > 50_000)) throw new GiftError("Send between $1 and $50,000.");
  const amount = gift ? gift.price : money;
  const wallet = await walletFor(userId);
  if (amount > wallet) throw new GiftError(`That's $${(amount - wallet).toLocaleString()} more than you have. Add funds first.`);
  const wished = !!gift && onWishlist(to.id, weekOf(now), gift.id);
  const note = scrub(String(what.note || "")).replace(/\s+/g, " ").trim().slice(0, 300);
  await sql()`update users set wallet = wallet - ${amount} where id = ${userId}`;
  const [row] = await sql()`insert into pica_gift_sent (user_id, character_id, account_id, kind, gift_id, amount, wished, note)
    values (${userId}, ${to.kind === "character" ? to.id : null}, ${to.kind === "account" ? to.id : null},
      ${gift ? "gift" : "money"}, ${gift?.id || ""}, ${amount}, ${wished}, ${note}) returning id, created_at::text`;
  return { id: String(row.id), at: String(row.created_at), amount, wished, gift, wallet: wallet - amount };
}

/** 💞 Is she still in the glow of something? Null once two days have gone by. */
export async function boostFor(userId: string, who: { kind: "character" | "account"; id: string }, now = Date.now()): Promise<Boost | null> {
  const rows = who.kind === "character"
    ? await sql()`select amount, wished, created_at from pica_gift_sent where user_id = ${userId} and character_id = ${who.id} and created_at > now() - interval '48 hours'`
    : await sql()`select amount, wished, created_at from pica_gift_sent where user_id = ${userId} and account_id = ${who.id} and created_at > now() - interval '48 hours'`;
  return boostFrom(rows.map(r => ({ amount: Number(r.amount), wished: !!r.wished, at: Date.parse(String(r.created_at)) })), now);
}

/** What she was actually sent, in words, for the line she reads. */
export async function lastGiftWords(userId: string, characterId: string): Promise<string> {
  const [r] = await sql()`select kind, gift_id, amount from pica_gift_sent
    where user_id = ${userId} and character_id = ${characterId} and created_at > now() - interval '48 hours'
    order by amount desc, created_at desc limit 1`;
  if (!r) return "";
  if (String(r.kind) === "money") return `$${Number(r.amount).toLocaleString()}`;
  const g = giftById(String(r.gift_id));
  return g ? `${g.brand} ${g.name}` : "a present";
}

/** 🧾 What you've sent lately. */
export async function giftHistory(userId: string, limit = 30) {
  const rows = await sql()`select s.id, s.kind, s.gift_id, s.amount, s.wished, s.note, s.created_at::text as at,
      coalesce(c.name, a.name) as who, a.handle
    from pica_gift_sent s left join chat_characters c on c.id = s.character_id left join pica_accounts a on a.id = s.account_id
    where s.user_id = ${userId} order by s.created_at desc limit ${limit}`;
  return rows.map(r => {
    const g = giftById(String(r.gift_id || ""));
    return { id: String(r.id), kind: String(r.kind), who: String(r.who || "someone"), handle: r.handle ? String(r.handle) : null,
      what: String(r.kind) === "money" ? `$${Number(r.amount).toLocaleString()}` : g ? `${g.emoji} ${g.brand} ${g.name}` : "a present",
      amount: Number(r.amount), wished: !!r.wished, note: String(r.note || ""), at: String(r.at) };
  });
}

export { GIFTS, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH };
