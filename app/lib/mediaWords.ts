// 📸 Words for a photo or video, so "I sent an image" counts the same as "I sent a pic".

/** They mention a picture: "want a pic?", "check your phone", "I'll send you an image". */
export const MENTIONS_MEDIA = /\b(phone|pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|show you|send you)\b/i;

/** She says one is coming or went out: "sending you a pic", "here's a selfie", "(I sent an image)", "snapping one now 📸", "here's a sneaky peek…". */
export const CLAIMS_MEDIA = /\b(send(ing)?|sent|here'?s|here ya go|here you go|snapp(ing|ed)|taking|took|coming (your way|right up)|on (its|it's) way)\b[\s\S]{0,50}\b(pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|shots?|peeks?|glimpses?)\b|\b(sneaky|quick|cheeky|little) peek\b|📸|🤳/i;

/** 🙋 They asked for one: "can I see you?", "send me a pic", "can I see her?", "wanna see". */
export const ASKED_FOR_MEDIA = /\b(send|show|share|snap|take|got|get|see|want|wanna|make|need|post|drop)\b[\s\S]{0,40}\b(pics?|pictures?|photos?|selfies?|videos?|vids?|clips?|images?|snaps?|shots?)\b|\b(pics?|pictures?|photos?|selfies?|videos?|vids?)\b[\s\S]{0,30}\?|\b(let me|lemme|can i|could i|may i|i wanna|i want to|wanna|i'?d love to)\s+see\b|\b(can|could|will|would)\s+(you|u|ya)\s+(send|show|snap|take)\b|\bshow me\b|\bsend (me )?(one|another|it|that|more)\b|\b(another|one more)( one| pic| photo)?\s*(please|pls|plz)?\s*[!?.]*$|\bwhat (do|does) (you|your \w+) look like\b|\bwhat are you wearing\b/i;

/** 👍 Her reply is a yes to that: "sure", "here ya go", "take a look", "enjoy the view", "since you
 *  asked so nicely". Only counts right after they asked — on its own it's just friendly talk. */
export const AGREES_MEDIA = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|alright|fine|of course|absolutely|definitely|anything for you|say no more|you got it|done|mhm|mmhm)\b|\b(here (ya|you) go|here it is|here'?s one|there (ya|you) go|take a look|have a look|look at this|check (this|it) out|enjoy( the view| this| it)?|hope you (like|enjoy) (it|this)|just for you|only for you|for your eyes only|since you asked( so nicely)?|because you asked( so nicely)?|you asked so nicely|don'?t tell anyone|like what you see)\b|what do you think\?/i;
