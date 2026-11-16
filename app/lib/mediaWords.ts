// 📸 Words for a photo or video, so "I sent an image" counts the same as "I sent a pic".

/** They mention a picture: "want a pic?", "check your phone", "I'll send you an image". */
export const MENTIONS_MEDIA = /\b(phone|pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|show you|send you)\b/i;

/** She says one is coming or went out: "sending you a pic", "here's a selfie", "(I sent an image)", "snapping one now 📸". */
export const CLAIMS_MEDIA = /\b(send(ing)?|sent|here'?s|here you go|snapp(ing|ed)|taking|took|coming (your way|right up)|on (its|it's) way)\b[\s\S]{0,50}\b(pics?|pictures?|photos?|images?|selfies?|videos?|vids?|clips?|snaps?|shots?)\b|📸|🤳/i;
