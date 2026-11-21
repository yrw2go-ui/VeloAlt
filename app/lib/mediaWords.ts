// 📸 Words for a photo or video, so "I sent an image" counts the same as "I sent a pic".
//
// ✍️ Everything here is matched against `plain(text)`, never the raw message. Models type curly
// quotes — "here’s a pic", "I didn’t get it" — and a pattern written with a straight apostrophe
// misses every one of them, which is how "here’s a pic" went unnoticed for so long.

/** The same words with the typography flattened: curly quotes, dashes and ellipses made plain. */
export function plain(s: string): string {
  return String(s || "")
    .replace(/[\u2018\u2019\u02BC\u02B9\u2032\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...");
}

/** 📸 Does she say a picture is on its way? */
export const claimsMedia = (s: string) => CLAIMS_MEDIA.test(plain(s));
/** 🙋 Did they ask for one? */
export const askedForMedia = (s: string) => ASKED_FOR_MEDIA.test(plain(s));
/** 👍 Is her reply a yes to that? */
export const agreesMedia = (s: string) => AGREES_MEDIA.test(plain(s));
/** 💬 Is a picture even being talked about? */
export const mentionsMedia = (s: string) => MENTIONS_MEDIA.test(plain(s));

/** They mention a picture: "want a pic?", "check your phone", "I'll send you an image". */
export const MENTIONS_MEDIA = /\b(phone|pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|show you|send you)\b/i;

/** She says one is coming or went out: "sending you a pic", "here's a selfie", "(I sent an image)",
 *  "snapping one now 📸", "here's a sneaky peek…" — and the ones that only make sense about a
 *  picture already on its way: "hope it came through", "hope it lands", "sending it again".
 *  Also the ways she claims one without ever naming it: an action note in the third person
 *  (*sends a pic*, *snaps a photo*), the picture as "it" or "one" (*I sent it*, *sending one*),
 *  and saying it should be arriving (*should be popping up*). Each of those left her saying a
 *  picture was on its way with no button to make it happen. */
export const CLAIMS_MEDIA = /\b(send(ing)?|sent|here'?s|here ya go|here you go|snapp(ing|ed)|taking|took|coming (your way|right up)|on (its|it's) way)\b[\s\S]{0,50}\b(pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|shots?|peeks?|glimpses?)\b|\b(sneaky|quick|cheeky|little) peek\b|📸|🤳|\b(hope|hoping)\b[\s\S]{0,25}\b(came through|comes through|went through|goes through|lands|landed|arrives|arrived|shows up|showed up|works|worked|loads|loaded)\b|\b(resend|resending|re-send|re-sending)\b|\b(send|sending|sent)\b[\s\S]{0,18}\b(again|once more|one more time)\b|\b(let me|lemme|i'?ll|gonna|going to)\b[\s\S]{0,15}\btry\b[\s\S]{0,15}\bagain\b|\b(did|has|have)\b[\s\S]{0,15}\b(it|that|this|one|they)\b[\s\S]{0,15}\b(come through|came through|arrive|arrived|land|landed|show up|showed up|get there|got there|reach you|reached you)\b|\b(it|that|this|one)\b[\s\S]{0,10}\b(should|ought to|might)\b[\s\S]{0,10}\b(be (there|with you)|come through|land|show up|arrive)\b|\b(on (its|it's) way|coming (your way|right up|through)|just sent|fresh off the camera)\b|\bfingers crossed\b[\s\S]{0,25}\b(works|sends|comes through|lands)\b|\b(tell|let) me (if|when)\b[\s\S]{0,22}\b(shows up|arrives|comes through|lands|doesn'?t|does not)\b|\b(here'?s|here is|this is)\b[\s\S]{0,12}\b(the |my |your )?(view|viewer|sight)\b|\benjoy\b[\s\S]{0,12}\b(the |this |that |my )?(view|viewer|sight|pic|picture|photo|it)\b|\bhope\b[\s\S]{0,14}\b(you|u)\b[\s\S]{0,8}\b(like|love|enjoy)\b[\s\S]{0,10}\b(it|this|that|them|the view)\b|\b(sends|snaps|takes|shares|drops|attaches|uploads|posts)\b[\s\S]{0,50}\b(pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|shots?)\b|\b(sent|sending|send)\s+(it|one|that|this|them)\b|\b(sent|sending|send)\s+(you|u|ya)\s+(it|one)\b|\b(should|must|might|may|ought to)\s+be\s+(popping|pulling|coming|showing|loading|turning)\s+up\b|\bpopping up\b/i;

/** 🙋 They asked for one: "can I see you?", "send me a pic", "can I see her?", "wanna see". */
export const ASKED_FOR_MEDIA = /\b(send|show|share|snap|take|got|get|see|want|wanna|make|need|post|drop)\b[\s\S]{0,40}\b(pics?|pictures?|photos?|selfies?|videos?|vids?|clips?|images?|snaps?|shots?)\b|\b(pics?|pictures?|photos?|selfies?|videos?|vids?)\b[\s\S]{0,30}\?|\b(let me|lemme|can i|could i|may i|i wanna|i want to|wanna|i'?d love to)\s+see\b|\b(can|could|will|would)\s+(you|u|ya)\s+(send|show|snap|take)\b|\bshow me\b|\bsend (me )?(one|another|it|that|more)\b|\b(another|one more)( one| pic| photo)?\s*(please|pls|plz)?\s*[!?.]*$|\bwhat (do|does) (you|your \w+) look like\b|\bwhat are you wearing\b|\b(resend|re-send)\b|\b(send|try)\b[\s\S]{0,15}\bagain\b|\b(it|that|nothing|anything)\b[\s\S]{0,15}\b(didn'?t|did not|never)\b[\s\S]{0,15}\b(come through|came through|arrive|arrived|land|landed|show up|showed up|go through|went through|work|worked|load|loaded)\b|\b(i )?(didn'?t|never) (get|receive|see)\b[\s\S]{0,12}\b(it|that|anything|one)\b|\bnothing (came|arrived|showed)\b/i;

/** 👍 Her reply is a yes to that: "sure", "here ya go", "take a look", "enjoy the view", "since you
 *  asked so nicely". Only counts right after they asked — on its own it's just friendly talk. */
export const AGREES_MEDIA = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|alright|fine|of course|absolutely|definitely|anything for you|say no more|you got it|done|mhm|mmhm)\b|\b(here (ya|you) go|here it is|here'?s one|there (ya|you) go|take a look|have a look|look at this|check (this|it) out|enjoy( the view| this| it)?|hope you (like|enjoy) (it|this)|just for you|only for you|for your eyes only|since you asked( so nicely)?|because you asked( so nicely)?|you asked so nicely|don'?t tell anyone|like what you see)\b|what do you think\?/i;

// 👄 Lip-biting comes out deformed every time, so it never reaches the picture service: it's cut
// from the description (the rest of the sentence stands) wherever it's written.
const LIP_BITE = /\s*,?\s*\b(?:(?:gently|softly|slightly|playfully|teasingly|nervously|absently|lightly)\s+)?(?:biting|bites|bite|chewing|chews|nibbling|nibbles|tugging at|tugs at)\s+(?:her|his|their|the)?\s*(?:lower |bottom |upper )?lips?\b(?:\s+(?:\w+ly))?(?:\s+and\b)?|\s*,?\s*\blip[- ]?(?:bite|biting|bitten|nibble|nibbling)\b|\s*,?\s*\b(?:her|his|their|the)?\s*(?:lower |bottom |upper )?lips?\s+(?:caught|held|pinned)\s+(?:between|in)\s+(?:her|his|their)\s+teeth\b/gi;
// 🎨 Her looks are the reference photos' job. Spelling them out in words as well pulls the picture
// away from her — the model follows the words and you get someone else's face with her name on it.
// So when there ARE references, the look words come out of the description and only what the
// photos can't know is left: where she is, what she's wearing, her pose, the light.
const HAIR = /\b(?:(?:very|long|short|shoulder[- ]length|mid[- ]length|cropped|waist[- ]length|wavy|curly|straight|coiled|braided|tousled|sleek|silky|blonde?|brunette|black|jet[- ]black|dark|light|red|auburn|ginger|chestnut|platinum|honey|caramel|ash|silver|grey|gray|brown)\s+){1,4}hair\b/gi;
const EYES = /\b(?:(?:bright|warm|pale|deep|dark|light|piercing|striking|big|wide|blue|green|brown|hazel|grey|gray|amber)\s+){1,3}eyes\b/gi;
const SKIN = /\b(?:(?:warm|cool|pale|fair|light|deep|rich|caramel|olive|tan|tanned|bronzed|porcelain|ebony|dark|brown|golden|sun[- ]kissed)\s+){1,3}(?:skin|complexion)\b/gi;
const CALLED = /\b(?:a\s+)?(?:gorgeous|beautiful|pretty|stunning)?\s*(?:blonde|brunette|redhead)\b(?=[\s,.]|$)/gi;
const LOOKS = [HAIR, EYES, SKIN, CALLED];

/** The description with her looks taken out — used only when reference photos are carrying them. */
export function noLooks(s: string): string {
  let out = String(s || "");
  for (const re of LOOKS) out = out.replace(re, " ");
  // Tidying what's left of the sentence takes a couple of passes: taking "long dark hair" out of
  // "with pale skin and long dark hair," leaves "with and ,", which only reads properly once the
  // leftovers have been swept twice.
  const tidy = (t: string) => t
    .replace(/\b(?:with|and)\s+(?:and|with)\b/gi, "and")
    .replace(/\b(?:with|has|have|having|and)\s*(?=[,.;]|$)/gi, "")
    .replace(/\b(she|he|they)\s+(?:and|with|has|have)\s*(?=[,.;])/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/(?:,\s*){2,}/g, ", ");
  for (let i = 0; i < 3; i++) out = tidy(out);
  return out
    .replace(/^\s*(?:she|he|they)\s*,\s*/i, "")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

export const noLipBite = (s: string) => s.replace(LIP_BITE, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").replace(/^[\s,]+|[\s,]+$/g, "").trim();

