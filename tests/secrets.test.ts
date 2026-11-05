// Run: node --experimental-strip-types tests/secrets.test.ts
import { hideSecrets } from "../app/lib/secrets.ts";

const HIDE: [string, string][] = [
  ["my password is hunter2", "hunter2"],
  ["Password: Sup3r$ecret!", "Sup3r$ecret!"],
  ["the wifi password is coffee4all", "coffee4all"],
  ["my PIN is 4821", "4821"],
  ["pin 7734", "7734"],
  ["my verification code is 482913", "482913"],
  ["Your Amazon one-time code: 557102", "557102"],
  ["otp 123456", "123456"],
  ["the code is 904417", "904417"],
  ["482913", "482913"],
  ["G-482913", "482913"],
  ["card 4111 1111 1111 1111 exp 12/29", "4111 1111 1111 1111"],
  ["cvv is 123", "123"],
  ["ssn 123-45-6789", "123-45-6789"],
  ["my security answer is fluffy", "fluffy"],
  ["2FA code 99881", "99881"],
  ["G-482913 is your Google verification code", "482913"],
  ["551204 is your Uber code. Never share it.", "551204"],
  ["they texted me 7731 as my login code", "7731"],
];
const KEEP: string[] = [
  "pin the post to the top",
  "what's a good password manager?",
  "my confirmation code is ABC123",
  "booking code 77441",
  "order number 112-5567788-1234567",
  "the zip code is 46304",
  "call me at 219-555-0142",
  "remind me at 6pm tomorrow",
  "we have 12 people coming",
  "password please",
  "the code is fine now",
  "take I-94 to exit 21",
  "my flight UA 1234 lands at 5",
];
let fail = 0;
for (const [s, secret] of HIDE) {
  const r = hideSecrets(s);
  if (!r.hidden || r.text.includes(secret)) { fail++; console.log("NOT HIDDEN:", s, "→", r.text); }
}
for (const s of KEEP) {
  const r = hideSecrets(s);
  if (r.hidden || r.text !== s) { fail++; console.log("WRONGLY HIDDEN:", s, "→", r.text); }
}
console.log(fail ? `${fail} failed` : `all ${HIDE.length + KEEP.length} passed`);
process.exit(fail ? 1 : 0);
