// 🎁 Picagifts, the database side: the wallet, sending a present or money, and working out
// whether someone is still in the glow of one.
import { sql } from "./db";
import { scrub } from "./secrets";
import { GIFTS, giftById, shopFor, weekOf, wishlistFor, onWishlist, boostFrom, myGift, isMyGift, edited, ROTATING, GIFTS_A_DAY, MAX_MY_GIFTS, type Boost, type Gift, type GiftEdit } from "./gifts";
import { settle, transfer, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH } from "./money";
import { hintsThisWeek, hintPick, hintLive, hintDealtWith, moneyTier, lovePoints, MONEY_LAVISH } from "./hints";

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

/** 🛍️ Your own things to send: listed by hand, never rotated, up to five. */
export async function myGifts(userId: string): Promise<Gift[]> {
  const rows = await sql()`select id, name, brand, price from pica_my_gifts where user_id = ${userId} order by created_at`;
  return rows.map(r => myGift({ id: String(r.id), name: String(r.name), brand: String(r.brand || ""), price: Number(r.price) }));
}

export async function listMyGift(userId: string, name: string, brand: string, price: number): Promise<Gift> {
  const nm = scrub(String(name || "")).replace(/\s+/g, " ").trim().slice(0, 60);
  if (nm.length < 2) throw new GiftError("What is it? Give it a name.");
  const br = scrub(String(brand || "")).replace(/\s+/g, " ").trim().slice(0, 40);
  const p = Math.round(Number(price) || 0);
  if (p < 1 || p > 1_000_000) throw new GiftError("Put a price on it, between $1 and $1,000,000.");
  const [{ n }] = await sql()`select count(*)::int as n from pica_my_gifts where user_id = ${userId}`;
  if (n >= MAX_MY_GIFTS) throw new GiftError(`That's all five of your own listed — take one off the list first.`);
  const [row] = await sql()`insert into pica_my_gifts (user_id, name, brand, price) values (${userId}, ${nm}, ${br}, ${p}) returning id, name, brand, price`;
  return myGift({ id: String(row.id), name: String(row.name), brand: String(row.brand || ""), price: Number(row.price) });
}

export async function unlistMyGift(userId: string, giftId: string): Promise<boolean> {
  const id = giftId.replace(/^mine:/, "");
  const rows = await sql()`delete from pica_my_gifts where user_id = ${userId} and id = ${id} returning id`;
  return rows.length > 0;
}

/** 🛍️ The shop as it stands: this week's rotation, plus everything you listed yourself. */
/**
 * 🛠️ What Admin → Gifts has changed by hand: a price, a brand, a name. Everything the shop
 * shows and everything it charges goes through here, so an edit is the real thing everywhere — in
 * the shop, on her wishlist, and on the bill.
 */
export async function giftEdits(): Promise<Map<string, GiftEdit>> {
  const rows = await sql()`select gift_id, name, brand, price from gift_edits`.catch(() => []);
  return new Map(rows.map(r => [String(r.gift_id), { name: r.name === null ? null : String(r.name),
    brand: r.brand === null ? null : String(r.brand), price: r.price === null ? null : Number(r.price) }]));
}

/** 🔁 How many rotating things are in the shop this week — Admin's number, or thirty. */
export async function rotatingCount(): Promise<number> {
  const [r] = await sql()`select rotating from gift_shop where only_row`.catch(() => []);
  const n = Number(r?.rotating);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : ROTATING;
}

export async function shopNow(now = Date.now()): Promise<Gift[]> {
  return shopFor(weekOf(now), await rotatingCount(), await giftEdits());
}
export async function shopFull(userId: string, now = Date.now()): Promise<Gift[]> {
  return [...(await myGifts(userId)), ...(await shopNow(now))];
}
export async function wishlistOf(whoId: string, now = Date.now(), mine: Gift[] = [], closeness = 100): Promise<Gift[]> {
  return wishlistFor(whoId, weekOf(now), mine, closeness, await giftEdits());
}

/** 🛍️ Every gift there is, with the hand edits on, for the admin list. */
export async function catalogue(): Promise<(Gift & { edited: boolean })[]> {
  const tweaks = await giftEdits();
  return edited(GIFTS, tweaks).map(g => ({ ...g, edited: tweaks.has(g.id) }));
}

/** ✏️ Change one by hand. Giving back the catalogue's own value clears the edit rather than storing it. */
export async function editGift(giftId: string, patch: { name?: string; brand?: string; price?: number }): Promise<Gift> {
  const base = GIFTS.find(g => g.id === giftId);
  if (!base) throw new GiftError("That isn't one of the gifts.");
  const name = String(patch.name ?? base.name).replace(/\s+/g, " ").trim().slice(0, 80);
  const brand = String(patch.brand ?? base.brand).replace(/\s+/g, " ").trim().slice(0, 60);
  const price = Math.round(Number(patch.price ?? base.price));
  if (!name) throw new GiftError("It needs a name.");
  if (!Number.isFinite(price) || price < 1 || price > 1_000_000) throw new GiftError("Put a price on it, between $1 and $1,000,000.");
  // Back to exactly what the catalogue says? Then there's nothing to remember.
  if (name === base.name && brand === base.brand && price === base.price) {
    await sql()`delete from gift_edits where gift_id = ${giftId}`;
    return base;
  }
  await sql()`insert into gift_edits (gift_id, name, brand, price) values (${giftId}, ${name}, ${brand}, ${price})
    on conflict (gift_id) do update set name = excluded.name, brand = excluded.brand, price = excluded.price, updated_at = now()`;
  return { ...base, name, brand, price };
}

/** 🔁 Set how many rotating things are in the shop each week. */
export async function setRotating(n: number): Promise<number> {
  const want = Math.round(Number(n));
  if (!Number.isFinite(want) || want < 1 || want > 200) throw new GiftError("Between 1 and 200.");
  await sql()`insert into gift_shop (only_row, rotating) values (true, ${want})
    on conflict (only_row) do update set rotating = excluded.rotating, updated_at = now()`;
  return want;
}

/** 💞 How close each of your characters is to you — the higher of love and trust, as stored. */
export async function closenessMap(userId: string): Promise<Map<string, number>> {
  const rows = await sql()`select character_id, greatest(coalesce(love, 0), coalesce(trust, 0)) as close
    from chat_relationships where user_id = ${userId}`;
  return new Map(rows.map(r => [String(r.character_id), Number(r.close || 0)]));
}

/** 💝 Everyone you can send to: your characters, and the Picagram people you follow. */
export async function peopleToGift(userId: string) {
  const chars = await sql()`select c.id, c.name, f.url as face from chat_characters c
    left join velo_files f on f.id = c.portrait_file_id
    where c.owner_id is null or c.owner_id = ${userId} order by c.name`;
  const accounts = await sql()`select a.id, a.name, a.handle, f.url as face from pica_accounts a
    left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id
    where a.user_id = ${userId} and a.followed and a.character_id is null and not a.mine order by a.name limit 40`;
  const now = Date.now();
  // What you listed yourself counts — but only for someone close enough to want one of yours.
  const mine = await myGifts(userId);
  const close = await closenessMap(userId);
  const hints = await liveHints(userId, now).catch(() => new Map());
  // 🛠️ One read of the hand edits for everyone's wishlist, rather than one each.
  const tweaks = await giftEdits();
  // 🎁 How many each of them has had today (your day, not the server's), so the panel can say
  // how many are left before you reach for the Send button.
  const [u] = await sql()`select coalesce(nullif(time_zone, ''), 'America/Chicago') as tz from users where id = ${userId}`;
  const tz = String(u?.tz || "America/Chicago");
  const todayRows = await sql()`select character_id, account_id from pica_gift_sent
    where user_id = ${userId} and (created_at at time zone ${tz})::date = (now() at time zone ${tz})::date`;
  const givenToday = new Map<string, number>();
  for (const r of todayRows) {
    const key = String(r.character_id || r.account_id || "");
    if (key) givenToday.set(key, (givenToday.get(key) || 0) + 1);
  }
  const left = (id: string) => Math.max(0, GIFTS_A_DAY - (givenToday.get(id) || 0));
  const wish = (id: string, forChar: boolean) => wishlistFor(id, weekOf(now), forChar ? mine : [], forChar ? close.get(id) || 0 : 0, tweaks);
  return [
    ...chars.map(r => ({ id: String(r.id), kind: "character" as const, name: String(r.name), handle: null as string | null,
      face: r.face ? String(r.face) : null, wishlist: wish(String(r.id), true), leftToday: left(String(r.id)),
      hinting: hints.has(String(r.id)) })),
    // Someone you only follow on Picagram is never close enough for one of yours.
    ...accounts.map(r => ({ id: String(r.id), kind: "account" as const, name: String(r.name), handle: String(r.handle || ""),
      face: r.face ? String(r.face) : null, wishlist: wish(String(r.id), false), leftToday: left(String(r.id)), hinting: false })),
  ];
}

/** 🎁 How many presents (and how much cash) have gone to this one person today, your time. */
export async function sentToday(userId: string, to: { kind: "character" | "account"; id: string }): Promise<number> {
  const [u] = await sql()`select coalesce(nullif(time_zone, ''), 'America/Chicago') as tz from users where id = ${userId}`;
  const tz = String(u?.tz || "America/Chicago");
  const [r] = to.kind === "character"
    ? await sql()`select count(*)::int as n from pica_gift_sent where user_id = ${userId} and character_id = ${to.id}
        and (created_at at time zone ${tz})::date = (now() at time zone ${tz})::date`
    : await sql()`select count(*)::int as n from pica_gift_sent where user_id = ${userId} and account_id = ${to.id}
        and (created_at at time zone ${tz})::date = (now() at time zone ${tz})::date`;
  return Number(r?.n || 0);
}

/** 🎀 Send it. The money leaves the wallet, and it's remembered for the warm spell afterwards. */
export async function sendGift(userId: string, to: { kind: "character" | "account"; id: string }, what: { giftId?: string; money?: number; note?: string }) {
  const now = Date.now();
  const mine = what.giftId && isMyGift(what.giftId) ? (await myGifts(userId)).find(g => g.id === what.giftId) || null : null;
  const gift = mine || (what.giftId ? giftById(what.giftId) : null);
  if (what.giftId && !gift) throw new GiftError("That isn't something you can send.");
  // One of the thirty has to be in stock this week; one of yours always is.
  // 🏷️ And it is the shop's copy that is paid for, so a week's reduction is really taken off.
  const stocked = gift && !mine ? (await shopNow(now)).find(g => g.id === gift.id) || null : null;
  if (gift && !mine && !stocked) throw new GiftError(`${gift.name} isn't in the shop this week.`);
  const money = gift ? 0 : Math.round(Number(what.money) || 0);
  if (!gift && (money < 1 || money > 50_000)) throw new GiftError("Send between $1 and $50,000.");
  // 🎁 Five a day to any one person, presents and cash together — counted against the day where
  // YOU are, so it comes round again at your own midnight rather than the server's.
  const sent = await sentToday(userId, to);
  if (sent >= GIFTS_A_DAY) throw new GiftError(`That's ${GIFTS_A_DAY} today — the most you can send one person in a day. Try again tomorrow.`);
  const amount = gift ? (stocked || gift).price : money;
  const wallet = await walletFor(userId);
  if (amount > wallet) throw new GiftError(`That's $${(amount - wallet).toLocaleString()} more than you have. Add funds first.`);
  // Anything in the shop can be on their wishlist — yours only once they're close enough to want one.
  const close = to.kind === "character" ? (await closenessMap(userId)).get(to.id) || 0 : 0;
  const wished = !!gift && onWishlist(to.id, weekOf(now), gift.id, await myGifts(userId), close);
  const note = scrub(String(what.note || "")).replace(/\s+/g, " ").trim().slice(0, 300);
  await sql()`update users set wallet = wallet - ${amount} where id = ${userId}`;
  const [row] = await sql()`insert into pica_gift_sent (user_id, character_id, account_id, kind, gift_id, amount, wished, note)
    values (${userId}, ${to.kind === "character" ? to.id : null}, ${to.kind === "account" ? to.id : null},
      ${gift ? "gift" : "money"}, ${gift?.id || ""}, ${amount}, ${wished}, ${note}) returning id, created_at::text`;
  // 💅 If they'd hinted, that's that dealt with and the dot comes down.
  const dealt = to.kind === "character"
    ? await dealWithHint(userId, to.id, { giftId: gift?.id, money: gift ? 0 : amount }).catch(() => false) : false;
  // 💗 Money that was more than a gesture (over $99) moves the love slider a point.
  const tier = gift ? "small" as const : moneyTier(amount);
  if (to.kind === "character" && lovePoints(tier) > 0) await nudgeLove(userId, to.id, lovePoints(tier)).catch(() => {});
  return { id: String(row.id), at: String(row.created_at), amount, wished, gift: stocked || gift, tier, dealt,
    wallet: wallet - amount, leftToday: Math.max(0, GIFTS_A_DAY - (sent + 1)) };
}

/** 💞 Is she still in the glow of something? Null once two days have gone by. */
export async function boostFor(userId: string, who: { kind: "character" | "account"; id: string }, now = Date.now()): Promise<Boost | null> {
  const rows = who.kind === "character"
    ? await sql()`select amount, wished, kind, created_at from pica_gift_sent where user_id = ${userId} and character_id = ${who.id} and created_at > now() - interval '48 hours'`
    : await sql()`select amount, wished, kind, created_at from pica_gift_sent where user_id = ${userId} and account_id = ${who.id} and created_at > now() - interval '48 hours'`;
  return boostFrom(rows.map(r => ({ amount: Number(r.amount), wished: !!r.wished, money: String(r.kind) === "money", at: Date.parse(String(r.created_at)) })), now);
}

/** 💸 $500 or more in cash in the last couple of days: for that stretch there isn't much she
 *  wouldn't be up for. Gives back what was sent, or null. */
export async function lavishFor(userId: string, characterId: string): Promise<string | null> {
  const [r] = await sql()`select amount from pica_gift_sent
    where user_id = ${userId} and character_id = ${characterId} and kind = 'money' and amount >= ${MONEY_LAVISH}
      and created_at > now() - interval '48 hours' order by amount desc limit 1`;
  return r ? `$${Number(r.amount).toLocaleString()}` : null;
}

/** What she was actually sent, in words, for the line she reads. */
export async function lastGiftWords(userId: string, characterId: string): Promise<string> {
  const [r] = await sql()`select kind, gift_id, amount from pica_gift_sent
    where user_id = ${userId} and character_id = ${characterId} and created_at > now() - interval '48 hours'
    order by amount desc, created_at desc limit 1`;
  if (!r) return "";
  if (String(r.kind) === "money") return `$${Number(r.amount).toLocaleString()}`;
  const id = String(r.gift_id);
  const g = giftById(id) || (isMyGift(id) ? (await myGifts(userId)).find(x => x.id === id) || null : null);
  return g ? `${g.brand ? `${g.brand} ` : ""}${g.name}` : "a present";
}

/** 🧾 What you've sent lately. */
export async function giftHistory(userId: string, limit = 30) {
  const rows = await sql()`select s.id, s.kind, s.gift_id, s.amount, s.wished, s.note, s.created_at::text as at,
      coalesce(c.name, a.name) as who, a.handle
    from pica_gift_sent s left join chat_characters c on c.id = s.character_id left join pica_accounts a on a.id = s.account_id
    where s.user_id = ${userId} order by s.created_at desc limit ${limit}`;
  const listed = new Map((await myGifts(userId)).map(g => [g.id, g]));
  return rows.map(r => {
    const g = giftById(String(r.gift_id || "")) || listed.get(String(r.gift_id || "")) || null;
    return { id: String(r.id), kind: String(r.kind), who: String(r.who || "someone"), handle: r.handle ? String(r.handle) : null,
      what: String(r.kind) === "money" ? `$${Number(r.amount).toLocaleString()}` : g ? `${g.emoji} ${g.brand} ${g.name}` : "a present",
      amount: Number(r.amount), wished: !!r.wished, note: String(r.note || ""), at: String(r.at) };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// 💅 Hints: who's dropped one, whether the dot is still up, and dealing with it.

/** Raise this week's hints for anyone who has one, and give back everyone with a live one. */
export async function liveHints(userId: string, now = Date.now()): Promise<Map<string, { kind: string; giftId: string; at: number }>> {
  const week = weekOf(now);
  const chars = await sql()`select id from chat_characters where owner_id is null or owner_id = ${userId}`;
  const mine = await myGifts(userId);
  const close = await closenessMap(userId);
  // Whoever is due one this week and hasn't got a row yet gets one now.
  for (const c of chars) {
    const id = String(c.id);
    if (!hintsThisWeek(userId, id, week)) continue;
    const pick = hintPick(userId, id, week, await wishlistOf(id, now, mine, close.get(id) || 0));
    await sql()`insert into chat_hints (user_id, character_id, week, kind, gift_id)
      values (${userId}, ${id}, ${week}, ${pick.kind}, ${pick.giftId}) on conflict do nothing`;
  }
  const rows = await sql()`select character_id, kind, gift_id, created_at, done_at from chat_hints
    where user_id = ${userId} and done_at is null and created_at > now() - interval '48 hours'`;
  const shop = new Set([...(await shopNow(now)).map(g => g.id), ...mine.map(g => g.id)]);
  const out = new Map<string, { kind: string; giftId: string; at: number }>();
  for (const r of rows) {
    const h = { created_at: Date.parse(String(r.created_at)), done_at: r.done_at ? Date.parse(String(r.done_at)) : null, kind: String(r.kind), gift_id: String(r.gift_id || "") };
    if (hintLive(h, now, id => shop.has(id))) out.set(String(r.character_id), { kind: h.kind, giftId: h.gift_id, at: h.created_at });
  }
  return out;
}

/** ✅ Something arrived: if it deals with their hint, the dot comes down. */
export async function dealWithHint(userId: string, characterId: string, sent: { giftId?: string; money?: number }): Promise<boolean> {
  const rows = await sql()`select week, kind, gift_id from chat_hints
    where user_id = ${userId} and character_id = ${characterId} and done_at is null and created_at > now() - interval '48 hours'`;
  let any = false;
  for (const r of rows) {
    if (!hintDealtWith({ kind: String(r.kind), gift_id: String(r.gift_id || "") }, sent)) continue;
    await sql()`update chat_hints set done_at = now() where user_id = ${userId} and character_id = ${characterId} and week = ${Number(r.week)}`;
    any = true;
  }
  return any;
}


/** 💗 A point on the love slider — never past 100, and only for a woman in a romance. */
export async function nudgeLove(userId: string, characterId: string, by: number) {
  const [c] = await sql()`select romantic, voice_kind from chat_characters where id = ${characterId}`;
  if (!c?.romantic || String(c.voice_kind) === "male") return;
  await sql()`insert into chat_relationships (user_id, character_id, feelings, love) values (${userId}, ${characterId}, '', 50)
    on conflict (user_id, character_id) do nothing`;
  await sql()`update chat_relationships set love = least(100, coalesce(love, 50) + ${by}), updated_at = now()
    where user_id = ${userId} and character_id = ${characterId}`;
}

export { GIFTS, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH };
