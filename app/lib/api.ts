"use client";
// Calls Velo's server routes as the signed-in person (the session cookie rides along).

export async function api<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth") window.dispatchEvent(new Event("velo:signed-out"));
  if (!res.ok) throw Object.assign(new Error(data.error || `Velo didn't answer (${res.status}).`), { final: res.status === 401 || res.status === 403 || res.status === 429 });
  return data as T;
}

/** Reads and changes the person's own data (app/api/data). */
export const data = <T = unknown>(action: string, args: Record<string, unknown> = {}) => api<T>("/api/data", { action, ...args });

export type SavedFile = { id: string; url: string; thumb_url?: string | null; name: string; content_type: string; size: number };

/** Big photos are shrunk on the device first (longest side 2000px, JPEG) so uploads stay small and fast. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

/** Saves a file to Velo's storage (purpose "chat" for attachments, "face" for her picture). */
export async function uploadFile(file: File, purpose: "chat" | "face" | "bio"): Promise<SavedFile> {
  const form = new FormData();
  form.set("file", await shrink(file));
  form.set("purpose", purpose);
  const res = await fetch("/api/files", { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("velo:signed-out"));
  if (!res.ok) throw new Error(out.error || "Upload didn't go through.");
  return out.file as SavedFile;
}

/** 🎭 Admin: add a picture of a character (e.g. made in Atlas Cloud) to her gallery; optionally her headshot. */
export async function uploadCharacterPicture(file: File, characterId: string, portrait: boolean): Promise<{ mediaId: string; url: string }> {
  const form = new FormData();
  form.set("file", await shrink(file));
  form.set("purpose", "character");
  form.set("characterId", characterId);
  form.set("fictional", "yes");
  if (portrait) form.set("portrait", "yes");
  const res = await fetch("/api/files", { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("velo:signed-out"));
  if (!res.ok) throw new Error(out.error || "Upload didn't go through.");
  return out;
}
