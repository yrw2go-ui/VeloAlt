// 📎 Files saved to Supabase Storage. Chat attachments, portraits, and Velo's custom face.
// Server only. Each file has a row in velo_files; every lookup is scoped to its owner.
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { scrub } from "./secrets";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const DOC_TYPES = ["application/pdf", "text/plain"];
/** Uploads pass through the server, which Vercel caps at 4.5 MB per request. */
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 500;

const SUPABASE_URL = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const BUCKET = () => process.env.SUPABASE_STORAGE_BUCKET || "velo";

export const blobReady = () => !!(SUPABASE_URL() && SUPABASE_KEY());

async function storageFetch(path: string, init?: RequestInit) {
  const url = `${SUPABASE_URL()}/storage/v1${path}`;
  const headers = {
    Authorization: `Bearer ${SUPABASE_KEY()}`,
    apikey: SUPABASE_KEY(),
    ...(init?.headers || {}),
  };
  return fetch(url, { ...init, headers });
}

/** Uploads a buffer to Supabase Storage and returns the public URL + path. */
export async function storagePut(pathname: string, body: Buffer, contentType: string): Promise<{ url: string; pathname: string }> {
  const bucket = BUCKET();
  const path = pathname.replace(/^\/+/, "");
  const res = await storageFetch(`/object/${bucket}/${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`storage: put ${res.status} ${err.slice(0, 200)}`);
    throw new Error(`storage put failed: ${res.status}`);
  }
  const url = `${SUPABASE_URL()}/storage/v1/object/public/${bucket}/${path}`;
  return { url, pathname: path };
}

/** Deletes one or more objects from Supabase Storage. */
export async function storageDel(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const bucket = BUCKET();
  const prefixes = paths.map(p => p.replace(/^\/+/, ""));
  await storageFetch(`/object/${bucket}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes }),
  }).catch(e => console.error("storage: del", e instanceof Error ? e.message : e));
}

export type VeloFile = { id: string; url: string; name: string; content_type: string; size: number; kind: string; created_at?: string };

export async function ownFile(userId: string, id: string): Promise<VeloFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [f] = await sql()`select id, url, name, content_type, size, kind from velo_files where id = ${id} and user_id = ${userId}`;
  return (f as VeloFile) || null;
}

/** Deletes a file's storage object and row. */
export async function deleteFile(userId: string, id: string): Promise<boolean> {
  const [f] = await sql()`delete from velo_files where id = ${id} and user_id = ${userId} returning url, thumb_url, pathname`;
  if (!f) return false;
  const paths = [f.pathname, f.thumb_url].filter(Boolean).map(String);
  // Best-effort: also try to derive path from URL if pathname missing
  if (f.url && !f.pathname) {
    const m = String(f.url).match(/\/object\/public\/[^/]+\/(.+)$/);
    if (m) paths.push(m[1]);
  }
  await storageDel(paths);
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
    return { type: "text", text: `Attached file "${f.name}":\n${scrub(buf.toString("utf8").slice(0, 60_000))}` };
  } catch (e) {
    console.error("files: read for AI", e instanceof Error ? e.message : e);
    return null;
  }
}
