import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { sql } from "../../lib/db";
import { getCharacterFor } from "../../lib/characters";
import { thankThem } from "../../lib/thanks";
import { dmSend, dmGiftPhoto } from "../../lib/picaDm";
import { shopFull, peopleToGift, sendGift, giftHistory, accountsFor, moveAcross, listMyGift, unlistMyGift, myGifts, closenessMap, catalogue, editGift, rotatingCount, setRotating, shopNow, addExtra, editExtra, removeExtra, GiftError, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH } from "../../lib/giftsDb";
import { MAX_MY_GIFTS, MAX_EXTRAS, GIFT_ICONS } from "../../lib/gifts";

const UUID = /^[0-9a-f-]{36}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
/** Everything the Admin → Gifts screen shows, after any change. */
async function adminList(_me: string) {
  const stocked = new Set((await shopNow()).map(g => g.id));
  const all = await catalogue();
  return { gifts: all.map(g => ({ ...g, inShop: stocked.has(g.id) })), rotating: await rotatingCount(),
    pool: all.filter(g => !g.always && !g.slot).length, icons: GIFT_ICONS, maxMine: MAX_EXTRAS, mineCount: all.filter(g => g.mine).length };
}
const isAdmin = async (me: string) => !!(await sql()`select is_admin from users where id = ${me}`)[0]?.is_admin;

// 🎁 Picagifts: the shop, who you can send to and what they're hoping for, and sending it.
export async function POST(req: NextRequest) {
  const caller = await resolveCaller(req);
  if (!caller) return bad("Sign in first.", 401);
  const me = caller.userId;
  let b: Record<string, unknown> = {};
  try { b = (await req.json()) as Record<string, unknown>; } catch { /* no body */ }
  const action = String(b.action || "");
  try {
    switch (action) {
      // 🛍️ Everything on one screen: what's in stock this week, who to send to, your wallet.
      case "shop": {
        const acc = await accountsFor(me);
        return NextResponse.json({ shop: await shopFull(me), mine: await myGifts(me), maxMine: MAX_MY_GIFTS, people: await peopleToGift(me), history: await giftHistory(me, 20),
          wallet: acc.spend, bank: acc.bank, paid: acc.paid, interest: acc.interest, weeks: acc.weeks,
          bankName: BANK, rate: WEEKLY_RATE, payLow: PAY_LOW, payHigh: PAY_HIGH });
      }
      // 💸 Bring money across from the bank into what you can spend.
      case "funds": {
        if (!allow(`funds:${me}`, [{ ms: 60_000, max: 20 }])) return bad("Slow down a moment.", 429);
        const r = await moveAcross(me, Number(b.amount) || 1000);
        return NextResponse.json({ wallet: r.spend, bank: r.bank });
      }
      case "send": {
        if (!allow(`gift:${me}`, [{ ms: 60_000, max: 12 }, { ms: 86_400_000, max: 200 }])) return bad("That's a lot of presents at once — try again in a minute.", 429);
        const kind = b.toKind === "account" ? "account" as const : "character" as const;
        const id = String(b.toId || "");
        if (!UUID.test(id)) return bad("Who's it for?");
        const note = String(b.note || "");
        const r = await sendGift(me, { kind, id }, { giftId: b.giftId ? String(b.giftId) : undefined, money: Number(b.money) || 0, note });
        // 💌 She writes back the moment it lands, usually with a photo of herself with it.
        // Either way the thread says what turned up first: "🎁 Received: …", then her reply.
        let said = null;
        const what = r.gift ? `${r.gift.brand ? `${r.gift.brand} ` : ""}${r.gift.name}` : `$${r.amount.toLocaleString()}`;
        if (kind === "account") {
          // 📸 Someone on Picagram: it lands in her DMs, and she answers there.
          await dmSend(me, id, `🎁 Received: ${what}`).catch(e => { console.error("gifts: dm", e instanceof Error ? e.message : e); return null; });
          // 📸 And, as in the chat, usually a photo of her with it.
          await dmGiftPhoto(me, id, what, r.gift ? "gift" : "money", r.gift?.id || "", 50, r.amount >= 500 || r.wished)
            .catch(e => { console.error("gifts: dm photo", e instanceof Error ? e.message : e); });
        }
        if (kind === "character") {
          const ch = await getCharacterFor(me, id);
          const [u] = await sql()`select adult_confirmed_at from users where id = ${me}`;
          // How close she is, and whether this was a big one — both show in her face.
          const close = (await closenessMap(me)).get(id) || 0;
          if (ch) said = await thankThem(me, ch, what, r.gift ? "gift" : "money", r.gift?.id || "", note, !!u?.adult_confirmed_at, close, r.amount >= 500 || r.wished, r.wished)
            .catch(e => { console.error("gifts: thank you", e instanceof Error ? e.message : e); return null; });
        }
        return NextResponse.json({ sent: r, said, wallet: r.wallet, bank: (await accountsFor(me)).bank, history: await giftHistory(me, 20) });
      }
      // 🛍️ Your own things to send: listed by hand, never rotated away.
      case "list": {
        if (!allow(`listgift:${me}`, [{ ms: 60_000, max: 10 }])) return bad("Slow down a moment.", 429);
        const g = await listMyGift(me, String(b.name || ""), String(b.brand || ""), Number(b.price) || 0);
        return NextResponse.json({ listed: g, shop: await shopFull(me), mine: await myGifts(me) });
      }
      case "unlist": {
        if (!(await unlistMyGift(me, String(b.giftId || "")))) return bad("That one isn't on your list.");
        return NextResponse.json({ shop: await shopFull(me), mine: await myGifts(me) });
      }
      // 🛠️ Admin → Gifts: every gift there is, with its price, to put right by hand.
      case "all": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        const stocked = new Set((await shopNow()).map(g => g.id));
        const all = await catalogue();
        return NextResponse.json({ gifts: all.map(g => ({ ...g, inShop: stocked.has(g.id) })),
          rotating: await rotatingCount(), pool: all.filter(g => !g.always && !g.slot).length,
          icons: GIFT_ICONS, maxMine: MAX_EXTRAS, mineCount: all.filter(g => g.mine).length });
      }
      case "edit": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        if (!allow(`giftedit:${me}`, [{ ms: 60_000, max: 60 }])) return bad("Slow down a moment.", 429);
        await editGift(String(b.giftId || ""), { name: b.name === undefined ? undefined : String(b.name),
          brand: b.brand === undefined ? undefined : String(b.brand), price: b.price === undefined ? undefined : Number(b.price) });
        const stocked = new Set((await shopNow()).map(x => x.id));
        const g = (await catalogue()).find(x => x.id === String(b.giftId || ""))!;
        return NextResponse.json({ gift: { ...g, inShop: stocked.has(g.id) } });
      }
      case "rotating": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        const n = await setRotating(Number(b.rotating));
        const stocked = new Set((await shopNow()).map(g => g.id));
        return NextResponse.json({ rotating: n, gifts: (await catalogue()).map(g => ({ ...g, inShop: stocked.has(g.id) })) });
      }
      // 🛠️ Things you add to the catalogue yourself: your icon, your price, and whether it stays.
      case "extra.add": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        if (!allow(`giftextra:${me}`, [{ ms: 60_000, max: 30 }])) return bad("Slow down a moment.", 429);
        await addExtra({ name: String(b.name || ""), brand: String(b.brand || ""), price: Number(b.price),
          emoji: String(b.emoji || ""), kind: String(b.kind || "treat"), always: b.always === true });
        return NextResponse.json(await adminList(me));
      }
      case "extra.edit": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        await editExtra(String(b.giftId || ""), { name: b.name === undefined ? undefined : String(b.name),
          brand: b.brand === undefined ? undefined : String(b.brand), price: b.price === undefined ? undefined : Number(b.price),
          emoji: b.emoji === undefined ? undefined : String(b.emoji), kind: b.kind === undefined ? undefined : String(b.kind),
          always: b.always === undefined ? undefined : b.always === true });
        return NextResponse.json(await adminList(me));
      }
      case "extra.remove": {
        if (!(await isAdmin(me))) return bad("That's for admins.");
        if (!(await removeExtra(String(b.giftId || "")))) return bad("That isn't one of yours.");
        return NextResponse.json(await adminList(me));
      }
      default: return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof GiftError) return bad(e.message);
    console.error("gifts:", e instanceof Error ? e.message : e);
    return bad("Something went wrong — try again.", 500);
  }
}
