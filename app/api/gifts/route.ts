import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { sql } from "../../lib/db";
import { getCharacterFor, isAdmin } from "../../lib/characters";
import { thankThem } from "../../lib/thanks";
import { dmSend, dmGiftPhoto } from "../../lib/picaDm";
import { shopFull, peopleToGift, sendGift, giftHistory, accountsFor, moveAcross, listMyGift, unlistMyGift, myGifts, closenessMap, GiftError, BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH, catalogue, editGift, rotatingCount, setRotating, addExtra, editExtra, removeExtra, shopNow, liveHints } from "../../lib/giftsDb";
import { MAX_MY_GIFTS, MAX_EXTRAS, GIFT_ICONS } from "../../lib/gifts";

const UUID = /^[0-9a-f-]{36}$/i;

/** 🛠️ Everything Admin → Gifts shows: the catalogue, what is in the shop now, and your own. */
async function adminList() {
  const stocked = new Set((await shopNow()).map(g => g.id));
  const all = await catalogue();
  return { gifts: all.map(g => ({ ...g, inShop: stocked.has(g.id) })),
    rotating: await rotatingCount(), pool: all.filter(g => !g.always && !g.slot).length,
    icons: GIFT_ICONS, maxMine: MAX_EXTRAS, mineCount: all.filter(g => g.mine).length };
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

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
        // 🐌 One at a time, on purpose. This database is reached through a transaction pooler with
        // a single connection per invocation (app/lib/db.ts, `max: 1`), shared by every request on
        // that instance — so firing these off together jammed it, the request ran to the 300-second
        // limit, and everything queued behind it, sign-in included. `mine` really is fetched once
        // now and handed to peopleToGift, which used to go and fetch it a second time.
        const acc = await accountsFor(me);
        const mine = await myGifts(me);
        const shopRest = await shopNow(Date.now());
        const people = await peopleToGift(me, mine);
        const history = await giftHistory(me, 20, mine);
        return NextResponse.json({ shop: [...mine, ...shopRest], mine, maxMine: MAX_MY_GIFTS, people, history,
          wallet: acc.spend, bank: acc.bank, paid: acc.paid, interest: acc.interest, weeks: acc.weeks,
          bankName: BANK, rate: WEEKLY_RATE, payLow: PAY_LOW, payHigh: PAY_HIGH });
      }
      // 🔴 Who has been hinting. Asked for on its own once the screen is up: raising this week's
      // hints writes rows and is the slowest thing here, and it used to hold up the whole page.
      case "hints": {
        const hints = await liveHints(me).catch(() => new Map());
        return NextResponse.json({ hinting: [...hints.keys()] });
      }
      // 💸 Bring money across from the bank into what you can spend.
      // 🛠️ Admin → Gifts: the whole catalogue, what each one costs, how many rotate, and the
      // ones you added yourself.
      case "all": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        return NextResponse.json(await adminList());
      }
      case "edit": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        if (!allow(`giftedit:${me}`, [{ ms: 60_000, max: 60 }])) return bad("Slow down a moment.", 429);
        await editGift(String(b.giftId || ""), { name: b.name === undefined ? undefined : String(b.name),
          brand: b.brand === undefined ? undefined : String(b.brand), price: b.price === undefined ? undefined : Number(b.price),
          kind: b.kind === undefined ? undefined : String(b.kind), hidden: b.hidden === undefined ? undefined : b.hidden === true });
        // The screen swaps this one row for what comes back, so it is the row that goes back —
        // not the whole list.
        const stocked = new Set((await shopNow()).map(x => x.id));
        const g = (await catalogue()).find(x => x.id === String(b.giftId || ""));
        if (!g) return bad("That isn't one of the gifts.");
        return NextResponse.json({ gift: { ...g, inShop: stocked.has(g.id) } });
      }
      case "rotating": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        await setRotating(Number(b.rotating));
        return NextResponse.json(await adminList());
      }
      // 🛠️ Things you add to the catalogue yourself: your icon, your price, and whether it stays.
      case "extra.add": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        if (!allow(`giftextra:${me}`, [{ ms: 60_000, max: 30 }])) return bad("Slow down a moment.", 429);
        await addExtra({ name: String(b.name || ""), brand: String(b.brand || ""), price: Number(b.price),
          emoji: String(b.emoji || ""), kind: String(b.kind || "treat"), always: b.always === true });
        return NextResponse.json(await adminList());
      }
      case "extra.edit": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        await editExtra(String(b.giftId || ""), { name: b.name === undefined ? undefined : String(b.name),
          brand: b.brand === undefined ? undefined : String(b.brand), price: b.price === undefined ? undefined : Number(b.price),
          emoji: b.emoji === undefined ? undefined : String(b.emoji), kind: b.kind === undefined ? undefined : String(b.kind),
          always: b.always === undefined ? undefined : b.always === true });
        return NextResponse.json(await adminList());
      }
      case "extra.remove": {
        if (!(await isAdmin(me))) return bad("That's for admins.", 403);
        if (!(await removeExtra(String(b.giftId || "")))) return bad("That isn't one of yours.");
        return NextResponse.json(await adminList());
      }
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
          if (ch) said = await thankThem(me, ch, what, r.gift ? "gift" : "money", r.gift?.id || "", note, !!u?.adult_confirmed_at, close, r.amount >= 500 || r.wished)
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
      default: return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof GiftError) return bad(e.message);
    console.error("gifts:", e instanceof Error ? e.message : e);
    return bad("Something went wrong — try again.", 500);
  }
}
