// 💰 The money behind Picagifts. Two accounts: what you can spend right now, and the bank you
// move it from. The bank pays a little interest every week and your wages land every week, both
// worked out whenever you look — no clock running in the background.
//
// None of it is real money. It's the fiction the gifts live in.

/** 🏦 The bank the outside account is at. */
export const BANK = "Marrowfield Savings";
/** What a new account starts with. */
export const START_SPEND = 20_000;
export const START_BANK = 480_000;
/** 📈 What the bank pays each week, and what a week's wages come to. */
export const WEEKLY_RATE = 0.005;
export const PAY_LOW = 3_000;
export const PAY_HIGH = 8_000;

export type Accounts = { spend: number; bank: number; week: number };
export type Settled = { accounts: Accounts; weeks: number; paid: number; interest: number };

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** 💵 One week's wages: the same every time you ask, different every week. */
export function paycheckFor(userId: string, week: number): number {
  const span = (PAY_HIGH - PAY_LOW) / 50;
  return PAY_LOW + (hash(`pay:${userId}:${week}`) % (span + 1)) * 50;
}

/** 🗓️ Bring both accounts up to date: wages in, interest on, one week at a time. Never backwards,
 *  and never more than a year of catching up at once however long you've been away. */
export function settle(a: Accounts, userId: string, week: number): Settled {
  const from = Math.max(a.week, week - 52);
  let { spend, bank } = a, paid = 0, interest = 0;
  for (let w = from + 1; w <= week; w++) {
    const pay = paycheckFor(userId, w);
    const earned = Math.round(bank * WEEKLY_RATE * 100) / 100;
    spend += pay; bank += earned; paid += pay; interest += earned;
  }
  const weeks = Math.max(0, week - from);
  return { accounts: { spend: Math.round(spend * 100) / 100, bank: Math.round(bank * 100) / 100, week: Math.max(a.week, week) }, weeks, paid, interest: Math.round(interest * 100) / 100 };
}

/** 💸 Moving money across from the bank. */
export function transfer(a: Accounts, amount: number): Accounts {
  const want = Math.round(Math.max(0, amount) * 100) / 100;
  if (want <= 0) throw new Error("Say how much to bring across.");
  if (want > a.bank) throw new Error(`There's only $${a.bank.toLocaleString()} in your ${BANK} account.`);
  return { ...a, spend: Math.round((a.spend + want) * 100) / 100, bank: Math.round((a.bank - want) * 100) / 100 };
}

// 💭 What the people close to you work out about it.
//
// Nobody is told your balance. What someone close picks up on is the shape of it: the presents,
// the money that arrives without fuss, never hearing you worry about it. It only reaches someone
// you're actually close to, and it never turns them into a gold-digger — most of them never
// mention it at all.

/** How close she'd have to be before she'd notice. */
export const KNOWS_AT = 55;

export function wealthNote(closeness: number, sent: number, hinting: boolean, wish: string[]): string {
  if (closeness < KNOWS_AT) return "";
  const known = `💭 WHAT YOU'VE WORKED OUT ABOUT THEM: they're comfortable — more than comfortable. ${sent > 0 ? "Things turn up for you, " : "Money doesn't seem to be a worry for them, "}they never flinch at what anything costs, and it's plainly not a stretch. Nobody told you a number and you'd never ask for one. It doesn't change how you feel about them one way or the other, and you're not with them for it — bring it up the way you'd bring up anything else you know about someone, rarely and lightly, if at all.`;
  if (!hinting) return known;
  const want = wish.length ? ` Right now what's caught your eye is ${wish.slice(0, 2).join(", or ")}.` : "";
  return `${known}
💅 JUST THIS ONCE, somewhere in this reply, let slip something you want. Not a request and never a price — the way anyone drops a hint: something you've been eyeing, something you keep walking past, something you'd love but wouldn't buy yourself.${want} Be light about it, be a bit shameless if that's who you are (flirt your way into it, tease, work for it), and drop it instantly if they don't bite. Never ask outright, never sulk, never bring it up twice.`;
}

/** 🎲 How often a hint comes up: about one message in nine once she's close, and not at all before. */
export function hintsNow(closeness: number, roll: number): boolean {
  return closeness >= KNOWS_AT && roll < 0.11;
}
