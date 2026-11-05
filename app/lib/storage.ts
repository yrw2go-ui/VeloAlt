// 🗂️ Where photos, videos and uploads are kept: Supabase Storage (a public "velo" bucket)
// when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set — as Vercel's Supabase link sets
// them — otherwise Vercel Blob. Same calls either way: put() → { url, pathname }, del(urls).
// Paths are random folders plus a random suffix, never a person's id or email.
import { put as blobPut, del as blobDel } from "@vercel/blob";
import { randomBytes } from "node:crypto";

const BUCKET = "velo";
const base = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const usingSupabase = () => !!(base() && key());
export const storageReady = () => usingSupabase() || !!process.env.BLOB_READ_WRITE_TOKEN;
const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key()}`, apikey: key(), ...extra });

// The bucket is made the first time it's needed (public: files are read by their unguessable links).
let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  return (bucketReady ??= (async () => {
    const res = await fetch(`${base()}/storage/v1/bucket`, {
      method: "POST", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 52428800 }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (!/already exists|Duplicate|409/i.test(`${res.status} ${t}`)) { bucketReady = null; throw new Error(`storage: bucket ${res.status} ${t.slice(0, 200)}`); }
    }
  })());
}

const withSuffix = (path: string) => {
  const s = randomBytes(9).toString("base64url");
  const i = path.lastIndexOf("."), slash = path.lastIndexOf("/");
  return i > slash ? `${path.slice(0, i)}-${s}${path.slice(i)}` : `${path}-${s}`;
};

export async function put(pathname: string, body: Buffer | ArrayBuffer | Uint8Array, opts: { access?: "public"; addRandomSuffix?: boolean; contentType: string }): Promise<{ url: string; pathname: string }> {
  if (!usingSupabase()) return blobPut(pathname, body as Buffer, { access: "public", addRandomSuffix: opts.addRandomSuffix ?? true, contentType: opts.contentType });
  await ensureBucket();
  const path = (opts.addRandomSuffix ?? true) ? withSuffix(pathname) : pathname;
  const enc = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${enc}`, {
    method: "POST", headers: headers({ "Content-Type": opts.contentType, "x-upsert": "false", "cache-control": "max-age=31536000" }),
    body: body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body as Uint8Array),
  });
  if (!res.ok) throw new Error(`storage: upload ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return { url: `${base()}/storage/v1/object/public/${BUCKET}/${enc}`, pathname: path };
}

/** Deletes files by their links (Supabase links here, or older Vercel Blob ones). */
export async function del(urls: string | string[]): Promise<void> {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  const prefix = `${base()}/storage/v1/object/public/${BUCKET}/`;
  const mine = usingSupabase() ? list.filter(u => u.startsWith(prefix)) : [];
  const others = list.filter(u => !mine.includes(u));
  if (mine.length) {
    const res = await fetch(`${base()}/storage/v1/object/${BUCKET}`, {
      method: "DELETE", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: mine.map(u => decodeURIComponent(u.slice(prefix.length))) }),
    });
    if (!res.ok) throw new Error(`storage: delete ${res.status}`);
  }
  if (others.length && process.env.BLOB_READ_WRITE_TOKEN) await blobDel(others);
}
