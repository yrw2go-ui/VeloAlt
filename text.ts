// Models sometimes put HTML in a message (e.g. a lone "</br>" beside a photo); chat is plain text.
export function cleanTags(t: string): string {
  return t.replace(/<\/?br\s*\/?>/gi, "\n").replace(/<\/?(p|div|span|b|i|em|strong|u|small)\b[^>]*>/gi, "").replace(/&nbsp;/gi, " ").replace(/\n{3,}/g, "\n\n").trim();
}
