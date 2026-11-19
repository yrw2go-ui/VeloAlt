// A first photo the picture service will accept. The model often copies "no lingerie"
// into the description, and that word alone is enough to refuse the picture.
export function plainFacePhoto(name: string): string {
  return `${name} standing outdoors in daylight, everyday clothes, a candid photo, natural light`;
}
