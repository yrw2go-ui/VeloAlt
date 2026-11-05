// 📎 Files saved to Vercel Blob (store "velo-blob", public access with long
// random links): chat attachments and Velo's custom face. Server only.
// Each file has a row in velo_files; every lookup is scoped to its owner.
import { del, storageReady } from "./storage";
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { scrub } from "./secrets";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const DOC_TYPES = ["application/pdf", "text/plain"];
/** Uploads pass through the server, which Vercel caps at 4.5 MB per request. */
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 500;
export const blobReady = () => storageReady();

export type VeloFile = { id: string; url: string; name: string; content_type: string; size: number; kind: string; created_at?: string };

export async function ownFile(userId: string, id: string): Promise<VeloFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [f] = await sql()`select id, url, name, content_type, size, kind from velo_files where id = ${id} and user_id = ${userId}`;
  return (f as VeloFile) || null;
}

/** Deletes a file's blob and row (the message keeps its text; its attachment goes). */
export async function deleteFile(userId: string, id: string): Promise<boolean> {
  const [f] = await sql()`delete from velo_files where id = ${id} and user_id = ${userId} returning url, thumb_url`;
  if (!f) return false;
  try { await del([String(f.url), ...(f.thumb_url ? [String(f.thumb_url)] : [])]); } catch (e) { console.error("files: blob delete", e instanceof Error ? e.message : e); }
  return true;
}

/** The attachment as Claude content: a photo or PDF it can look at, or a text file's words. */
export async function fileForAi(f: VeloFile): Promise<Anthropic.ContentBlockParam | null> {
  try {
    const res = await fetch(f.url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (IMAGE_TYPES.includes(f.content_type)) {
      return { type: "image", source: { type: "base64", media_type: f.content_type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: buf.toString("base64") } };
    }
    if (f.content_type === "application/pdf") {
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }, title: f.name.slice(0, 200) };
    }
    // Text files: passwords and codes are hidden like everything else.
    return { type: "text", text: `Attached file "${f.name}":\n${scrub(buf.toString("utf8").slice(0, 60_000))}` };
  } catch (e) {
    console.error("files: read for AI", e instanceof Error ? e.message : e);
    return null;
  }
}
