// 🔒 Velo never sees passwords or codes. Every message on every channel (app
// chat, texts to Velo, phone calls, calls Velo makes) goes through hideSecrets
// before it's saved or sent to the AI: passwords, PINs, verification / security
// / one-time codes, card numbers, CVVs and Social Security numbers become
// "[hidden]". Pure functions, safe on client and server.
// Confirmation, booking, order and tracking numbers are kept — they aren't secrets.

export const HIDDEN = "[hidden]";

// "password is hunter2", "PIN: 4821", "my verification code is 482913", "otp 123456"…
const KEYWORD = /\b(pass ?words?|passwd|pwd|pass ?codes?|pins?(?: numbers?| codes?)?|(?:verification|security|login|log-in|sign[- ]?in|one[- ]time|auth(?:entication)?|access|2fa|mfa|otp|unlock|reset|text(?:ed)?|sms)[ -]codes?|otp|2fa|cvv2?|cvc|security answers?|secret answers?|answer to my security question)\b(\s*(?:is|was|are|=|:|-|→)?\s*(?:my|the|it'?s|its)?\s*["'“‘]?)([^\s"'“”‘’,;]{2,64})/gi;
// "code is 482913", "code: 4821" — but not confirmation / booking / order / tracking / zip / promo codes.
const BARE_CODE = /\b((?:confirmation|reservation|booking|order|tracking|zip|postal|area|promo|discount|coupon|gift|referral|country|product|reference|ref)\s+)?(codes?)(\s*(?:is|was|=|:|-)?\s*)(\d{4,8}|[A-Z0-9]{4,8}(?=\b))/gi;
// A message that is nothing but a code (they pasted it).
const ONLY_CODE = /^\s*(?:[A-Za-z]{1,3}-?)?\d{4,8}\s*$/;
// Google-style "G-482913".
const LETTER_CODE = /\b[A-Z]{1,3}-\d{4,8}\b/g;
// The code first: "482913 is your verification code", "they texted me 7731 as my login code".
const CODE_FIRST = /\b([A-Z]{0,3}-?\d{4,8})\b(?=\s+is\s+your\b[^.\n]{0,30}?\bcode\b|[^.\n]{0,40}?\b(?:(?:verification|security|login|log-in|sign[- ]?in|one[- ]time|auth\w*|access|2fa|mfa|otp|unlock|reset|text(?:ed)?|sms)\s+code|pin|password|passcode)s?\b)/gi;
// 13–19 digit card numbers (spaces/dashes allowed) that pass the Luhn check.
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

function luhn(digits: string) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** The text with any passwords or codes replaced by [hidden], and whether anything was hidden. */
export function hideSecrets(input: string): { text: string; hidden: boolean } {
  let hidden = false;
  const hit = () => { hidden = true; return HIDDEN; };
  if (ONLY_CODE.test(input)) return { text: HIDDEN, hidden: true };
  let t = input.replace(KEYWORD, (m, kw: string, sep: string, val: string) => {
    // "pin the post" isn't a PIN: it needs "is" / ":" / "=" or a digit in the value.
    if (val === HIDDEN || (!/(is|was|are|=|:|-|→)/i.test(sep) && !/\d/.test(val))) return m;
    return `${kw}${sep}${hit()}`;
  });
  t = t.replace(CODE_FIRST, () => hit()).replace(LETTER_CODE, () => hit());
  t = t.replace(BARE_CODE, (m, keep: string | undefined, word: string, sep: string, val: string) => (keep || !/\d/.test(val) ? m : `${word}${sep}${hit()}`));
  t = t.replace(CARD, m => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d) ? hit() : m; });
  t = t.replace(SSN, () => hit());
  return { text: t, hidden };
}

/** Just the cleaned text. */
export const scrub = (s: string) => hideSecrets(s).text;
