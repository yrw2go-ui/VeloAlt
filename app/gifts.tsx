"use client";
// 🎁 Picagifts: send someone a present or a bit of money. The shop changes every week, everyone
// keeps a wishlist, and for two days afterwards they're warmer with you — keener to see you, and
// willing to slip away from work or class for you in a way they normally wouldn't.
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { confirmAsk } from "./lib/dialog";
import { isMyGift } from "./lib/gifts";

type Gift = { id: string; name: string; brand: string; kind: string; price: number; emoji: string; was?: number; off?: number };
type Person = { id: string; kind: "character" | "account"; name: string; handle: string | null; face: string | null; wishlist: Gift[]; hinting?: boolean };
type Sent = { id: string; kind: string; who: string; handle: string | null; what: string; amount: number; wished: boolean; note: string; at: string };

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Face({ p, size }: { p: Person; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (p.face) return <img src={p.face} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--surface2)", fontWeight: 800, fontSize: size * 0.42 }}>{p.name.charAt(0).toUpperCase()}</div>
  );
}

// 💌 What she does about a present — her reply, her photo, her DM — runs behind the screen, but
// one at a time: sending three in a row shouldn't start three of them at once. On a database
// reached through a single connection, that overlap is what jams everything behind it.
let afterHer: Promise<unknown> = Promise.resolve();
const tellHer = (body: Record<string, unknown>) => {
  afterHer = afterHer.catch(() => {}).then(() => api("/api/gifts", { action: "send.after", ...body }).catch(() => {}));
  return afterHer;
};

export default function Gifts() {
  const [shop, setShop] = useState<Gift[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [wallet, setWallet] = useState(0);
  const [bank, setBank] = useState(0);
  const [payday, setPayday] = useState<{ paid: number; interest: number; weeks: number } | null>(null);
  const [bankName, setBankName] = useState("");
  const [history, setHistory] = useState<Sent[]>([]);
  const [who, setWho] = useState<Person | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  // 🛍️ Your own things to send: up to five, listed by hand, never rotated away.
  const [mine, setMine] = useState<Gift[]>([]);
  const [maxMine, setMaxMine] = useState(5);
  const [newGift, setNewGift] = useState({ brand: "", name: "", price: "" });

  // ⏳ Everything on this screen comes from one request. Until it lands, the money, the people and
  // the shop show that they're still coming rather than $0 and "make a character first", which
  // read like answers and aren't.
  const loading = shop === null && !err;
  const load = () => api<{ shop: Gift[]; mine: Gift[]; maxMine: number; people: Person[]; wallet: number; bank: number; history: Sent[]; paid: number; interest: number; weeks: number; bankName: string }>("/api/gifts", { action: "shop" })
    .then(r => { setShop(r.shop); setMine(r.mine); setMaxMine(r.maxMine); setPeople(r.people); setWallet(r.wallet); setBank(r.bank); setHistory(r.history); setBankName(r.bankName);
      if (r.weeks > 0) setPayday({ paid: r.paid, interest: r.interest, weeks: r.weeks }); })
    .catch(e => setErr(e instanceof Error ? e.message : "Couldn't open the shop."));
  useEffect(() => { load(); }, []);
  // 🔴 The red dots come a moment after the screen, on their own: raising this week's hints is the
  // slowest thing here and it used to hold up everything else.
  useEffect(() => {
    if (!people.length) return;
    let stop = false;
    api<{ hinting: string[] }>("/api/gifts", { action: "hints" })
      .then(r => { if (!stop && r.hinting.length) { const on = new Set(r.hinting); setPeople(l => l.map(p => (on.has(p.id) ? { ...p, hinting: true } : p))); } })
      .catch(() => {});
    return () => { stop = true; };
  }, [people.length]);

  // Whoever is picked keeps their wishlist in view, so you can see what they're hoping for.
  const chosen = who ? people.find(p => p.id === who.id) || who : null;
  const wished = (g: Gift) => !!chosen?.wishlist.some(w => w.id === g.id);

  const send = async (gift: Gift | null, amount = 0) => {
    if (!chosen) { setErr("Pick who it's for first."); return; }
    setBusy(gift ? gift.id : "money"); setErr("");
    try {
      const r = await api<{ sent: { amount: number; wished: boolean }; wallet: number; bank: number; history: Sent[] }>("/api/gifts",
        { action: "send", toKind: chosen.kind, toId: chosen.id, giftId: gift?.id, money: amount, note });
      setWallet(r.wallet); setBank(r.bank); setHistory(r.history); setNote(""); setCash("");
      // 💌 What she does about it — her reply, her photo, her DM — happens behind this, so the
      // present lands the moment it's paid for instead of waiting on her to write back.
      void tellHer({ toKind: chosen.kind, toId: chosen.id, giftId: gift?.id, amount: r.sent.amount, wished: r.sent.wished, note });
      await confirmAsk(`${gift ? `${gift.emoji} ${gift.brand} ${gift.name}` : money(r.sent.amount)} sent to ${chosen.name}.${r.sent.wished ? ` It was on ${chosen.name}'s wishlist — that one really lands.` : ""}\n\nFor the next two days ${chosen.name} is warmer with you, keener to meet up or get on video, and much more likely to slip away from work or class for you.`, { yes: "Lovely", danger: false });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send that."); }
    finally { setBusy(""); }
  };

  // 💸 Bring money across from the bank. It's a transfer, not free money — the bank goes down.
  // 🛍️ Put one of your own in the shop, or take it back off.
  const listItem = async () => {
    setErr("");
    try {
      const r = await api<{ shop: Gift[]; mine: Gift[] }>("/api/gifts", { action: "list", brand: newGift.brand.trim(), name: newGift.name.trim(), price: Number(newGift.price) });
      setShop(r.shop); setMine(r.mine); setNewGift({ brand: "", name: "", price: "" });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't list that."); }
  };
  const unlist = async (g: Gift) => {
    setErr("");
    try { const r = await api<{ shop: Gift[]; mine: Gift[] }>("/api/gifts", { action: "unlist", giftId: g.id }); setShop(r.shop); setMine(r.mine); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't take that off the list."); }
  };
  const topUp = async (amount: number) => {
    if (!amount || amount < 1) return;
    setErr("");
    try { const r = await api<{ wallet: number; bank: number }>("/api/gifts", { action: "funds", amount }); setWallet(r.wallet); setBank(r.bank); }
    catch (e) { setErr(e instanceof Error ? e.message : "That transfer didn't go through."); }
  };

  return (
    <div style={{ flex: 1, width: "100%", minWidth: 0, maxWidth: "100%", overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>🎁 Picagifts</div>
      {/* 💳 What you can spend now, and the bank it comes from. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>💳 To spend</span>
          <span data-testid="wallet" style={{ fontWeight: 800, fontSize: 20, opacity: loading ? 0.45 : 1 }}>{loading ? "…" : money(wallet)}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>🏦 {bankName || "Savings"}</span>
          <span data-testid="bank" className="muted" style={{ fontWeight: 700, opacity: loading ? 0.45 : 1 }}>{loading ? "…" : money(bank)}</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {[1000, 5000, 10000].map(n => (
            <button key={n} className="ghost" data-testid={`add-${n}`} disabled={n > bank} onClick={() => topUp(n)}
              style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700 }}>＋ {money(n)}</button>
          ))}
          <button className="ghost" data-testid="add-funds" disabled={bank <= 0} onClick={() => topUp(Number(prompt(`How much from ${bankName || "the bank"}?`, "25000") || 0))}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700 }}>＋ Add $…</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Your wages land every week, and the bank pays 0.5% a week on what&apos;s in it.</div>
      </div>
      {payday && (
        <div data-testid="payday" style={{ padding: "8px 10px", borderRadius: 10, fontSize: 13, background: "rgba(74,222,128,.14)", border: "1px solid rgba(74,222,128,.45)" }}>
          💵 {payday.weeks === 1 ? "This week" : `While you were away (${payday.weeks} weeks)`}: {money(payday.paid)} in wages{payday.interest > 0 ? `, and ${money(payday.interest)} interest from the bank` : ""}.
        </div>
      )}
      {err && <div role="alert" style={{ padding: "8px 10px", borderRadius: 10, fontSize: 13, background: "rgba(248,113,113,.14)", border: "1px solid rgba(248,113,113,.45)" }}>{err}</div>}

      {/* 👤 Who it's for. */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Who&apos;s it for?</div>
        <div data-testid="gift-people" className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {people.map(p => (
            <button key={p.id} type="button" onClick={() => { setWho(p); setErr(""); }} aria-pressed={chosen?.id === p.id}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px 5px 5px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
                color: "var(--text)", background: chosen?.id === p.id ? "rgba(96,165,250,.18)" : "var(--surface2)",
                border: `1px solid ${chosen?.id === p.id ? "rgba(96,165,250,.6)" : "var(--border)"}` }}>
              <Face p={p} size={26} />{p.hinting && <span data-testid="hint-dot" title={`${p.name} has hinted at something`} style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />}{p.name}
            </button>
          ))}
          {loading && <span className="muted" style={{ fontSize: 13 }}>Finding everyone…</span>}
          {!loading && !people.length && <span className="muted" style={{ fontSize: 13 }}>Make a character first, or follow someone on Picagram.</span>}
        </div>
      </div>

      {chosen && (
        <>
          {/* 💭 Their wishlist, which moves on each week. A man keeps none, so there's no box
              for him at all — you just pick something and send it. */}
          {chosen.wishlist.length > 0 && (
          <div data-testid="wishlist" style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(244,114,182,.10)", border: "1px solid rgba(244,114,182,.35)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💭 {chosen.name}&apos;s wishlist this week
              {chosen.hinting && <span data-testid="has-hinted" style={{ fontWeight: 500, marginLeft: 6 }}>· 🔴 {chosen.name} has been hinting</span>}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {chosen.wishlist.map(g => (
                <div key={g.id} className="row" style={{ justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span>{g.emoji} {g.brand} {g.name}</span><span className="muted">{money(g.price)}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* 💵 Money, with a note. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>💵 Send {chosen.name} money</div>
            <div className="row" style={{ gap: 8 }}>
              <input value={cash} onChange={e => setCash(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} inputMode="numeric"
                data-testid="cash" aria-label={`How much to send ${chosen.name}`} placeholder="250" style={{ flex: 1 }} />
              <button className="btn" data-testid="send-money" disabled={!cash || busy === "money"} onClick={() => send(null, Number(cash))}
                style={{ padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap" }}>{busy === "money" ? "Sending…" : "Send"}</button>
            </div>
            <input value={note} onChange={e => setNote(e.target.value.slice(0, 200))} data-testid="gift-note"
              aria-label="A note with it" placeholder="A note with it (optional)" />
          </div>

          {/* 🛍️ This week's shop. */}
          {/* 🛍️ Add your own: they go straight into the shop and stay there. */}
          <div data-testid="my-gifts" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🛍️ Your own list <span className="muted" style={{ fontWeight: 500 }}>· {mine.length}/{maxMine}, and they never rotate out</span></div>
            {!!mine.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {mine.map(g => (
                  <div key={g.id} className="row" style={{ justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⭐ 🛍️ {g.brand ? `${g.brand} ` : ""}{g.name}</span>
                    <span className="row" style={{ gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                      <span className="muted">{money(g.price)}</span>
                      <button className="ghost" data-testid={`unlist-${g.id}`} onClick={() => unlist(g)} style={{ padding: "2px 8px", fontSize: 11 }}>Remove</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {mine.length < maxMine ? (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <input value={newGift.brand} onChange={e => setNewGift(g => ({ ...g, brand: e.target.value.slice(0, 40) }))}
                  data-testid="new-brand" aria-label="Brand" placeholder="Brand (optional)" style={{ flex: "1 1 90px", minWidth: 0 }} />
                <input value={newGift.name} onChange={e => setNewGift(g => ({ ...g, name: e.target.value.slice(0, 60) }))}
                  data-testid="new-name" aria-label="What it is" placeholder="What it is" style={{ flex: "2 1 130px", minWidth: 0 }} />
                <input value={newGift.price} onChange={e => setNewGift(g => ({ ...g, price: e.target.value.replace(/[^\d]/g, "").slice(0, 7) }))}
                  inputMode="numeric" data-testid="new-price" aria-label="Price" placeholder="$" style={{ flex: "0 1 80px", minWidth: 0 }} />
                <button className="btn" data-testid="list-item" disabled={!newGift.name.trim() || !newGift.price} onClick={listItem}
                  style={{ padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap" }}>List item</button>
              </div>
            ) : <div className="muted" style={{ fontSize: 12 }}>That&apos;s all five. Remove one to list something else.</div>}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🛍️ In the shop <span className="muted" style={{ fontWeight: 500 }}>· ⭐ yours first</span></div>
            <div data-testid="shop" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {(shop || []).map(g => (
                <div key={g.id} data-testid={`gift-${g.id}`} data-mine={isMyGift(g.id) ? "yes" : undefined} style={{ padding: 10, borderRadius: 12, display: "flex", flexDirection: "column", gap: 6,
                  background: isMyGift(g.id) ? "rgba(250,204,21,.12)" : wished(g) ? "rgba(244,114,182,.12)" : "var(--surface2)",
                  border: `1px solid ${isMyGift(g.id) ? "rgba(250,204,21,.55)" : wished(g) ? "rgba(244,114,182,.5)" : "var(--border)"}` }}>
                  <div style={{ fontSize: 22 }}>{isMyGift(g.id) && <span data-testid="mine-star" title="One you listed yourself" style={{ fontSize: 14, marginRight: 4 }}>⭐</span>}{g.emoji}{wished(g) && <span style={{ fontSize: 12, marginLeft: 6 }}>💭 on the list</span>}
                    {!!g.off && <span data-testid={`sale-${g.id}`} style={{ fontSize: 11, fontWeight: 800, marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "rgba(34,197,94,.18)", border: "1px solid rgba(34,197,94,.5)", verticalAlign: "middle" }}>{g.off}% off</span>}
                    {g.kind === "discreet" && <span data-testid={`discreet-${g.id}`} title="Private — just between the two of you" style={{ fontSize: 11, fontWeight: 800, marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "rgba(167,139,250,.18)", border: "1px solid rgba(167,139,250,.5)", verticalAlign: "middle" }}>🤫 Discreet</span>}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{g.brand}<br /><span style={{ fontWeight: 500 }}>{g.name}</span></div>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: "auto" }}>
                    <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
                      {g.was ? <span style={{ textDecoration: "line-through", opacity: .6, marginRight: 5, fontWeight: 500 }}>{money(g.was)}</span> : null}
                      {money(g.price)}
                    </span>
                    <button className="btn" disabled={!!busy || g.price > wallet} onClick={() => send(g)}
                      style={{ padding: "4px 10px", fontSize: 12 }}>{busy === g.id ? "…" : g.price > wallet ? "Too dear" : "Send"}</button>
                  </div>
                </div>
              ))}
              {loading && <span className="muted" style={{ fontSize: 13 }}>Opening the shop…</span>}
            </div>
          </div>
        </>
      )}

      {/* 🧾 What you've sent. */}
      {!!history.length && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🧾 Lately</div>
          <div data-testid="gift-history" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {history.map(h => (
              <div key={h.id} className="row" style={{ justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.what} → <b>{h.who}</b>{h.wished ? " 💭" : ""}</span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>{money(h.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
        It&apos;s play money. For two days after a present or some cash, they&apos;re warmer with you, readier to meet up or get on video, and much more likely to slip away from work or class for you — more so if it was something on their wishlist. The shop and every wishlist change each week.
      </div>
    </div>
  );
}
