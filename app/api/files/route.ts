import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import sharp from "sharp";
import { IMAGE_TYPES, DOC_TYPES, MAX_BYTES, MAX_FILES, blobReady, deleteFile } from "../../lib/files";
import { thumbOf } from "../../lib/media";

/** 🔒 Re-saves a photo without its hidden data (GPS location, camera, date…), upright, same format. */
async function cleanImage(buf: Buffer, type: string): Promise<Buffer> {
  const img = sharp(buf, { animated: type === "image/gif" }).rotate().keepIccProfile();
  return type === "image/png" ? img.png().toBuffer() : type === "image/webp" ? img.webp({ quality: 90 }).toBuffer() : type === "image/gif" ? img.gif().toBuffer() : img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

// 📎 Upload one file to Vercel Blob for the signed-in person.
// POST multipart { file, purpose: "chat" | "face" } → { file: { id, url, thumb_url, name, content_type, size } }
// Photos are cleaned first (location and camera data removed) and get a small thumbnail.
// "face" also makes it Velo's face (replacing the last custom one).
export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!blobReady()) return NextResponse.json({ error: "File storage isn't set up yet." }, { status: 503 });
    if (!allow(`files:${c.userId}`, [{ ms: 60_000, max: 10 }, { ms: 86_400_000, max: 200 }])) return NextResponse.json({ error: "That's a lot of uploads — try again in a bit." }, { status: 429 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const purpose = form?.get("purpose") === "face" ? "face" : "chat";
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
    const type = (file.type || "").toLowerCase();
    const allowed = purpose === "face" ? IMAGE_TYPES : [...IMAGE_TYPES, ...DOC_TYPES];
    if (!allowed.includes(type)) return NextResponse.json({ error: purpose === "face" ? "Use a JPG, PNG, WebP or GIF picture." : "Velo can take photos (JPG, PNG, WebP, GIF), PDFs and text files." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    const [{ n }] = await sql()`select count(*)::int as n from velo_files where user_id = ${c.userId}`;
    if (n >= MAX_FILES) return NextResponse.json({ error: `You have ${MAX_FILES} files saved — delete some on the Memory tab first.` }, { status: 400 });

    const name = (file.name || "file").replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
    // Folder names are random, never the person's id or email; Blob adds a random suffix too.
    let body: Buffer = Buffer.from(await file.arrayBuffer());
    let thumbUrl: string | null = null;
    const folder = `velo/${purpose}/${randomUUID()}`;
    if (IMAGE_TYPES.includes(type)) {
      // Never stored with its hidden data: if it can't be cleaned, it isn't saved.
      try { body = await cleanImage(body, type); }
      catch (e) { console.error("files: clean image", e instanceof Error ? e.message : e); return NextResponse.json({ error: "That picture couldn't be read. Try another one." }, { status: 400 }); }
      const t = await thumbOf(body);
      if (t) thumbUrl = (await put(`${folder}/thumb.webp`, t, { access: "public", addRandomSuffix: true, contentType: "image/webp" })).url;
    }
    const blob = await put(`${folder}/${name}`, body, { access: "public", addRandomSuffix: true, contentType: type });
    const [row] = await sql()`insert into velo_files (user_id, kind, url, pathname, name, content_type, size, thumb_url)
      values (${c.userId}, ${purpose === "face" ? "face" : "file"}, ${blob.url}, ${blob.pathname}, ${name}, ${type}, ${body.length}, ${thumbUrl})
      returning id, url, thumb_url, name, content_type, size, kind`;

    if (purpose === "face") {
      // One custom face at a time: the old one is removed.
      const old = await sql()`select id from velo_files where user_id = ${c.userId} and kind = 'face' and id <> ${row.id}`;
      for (const o of old) await deleteFile(c.userId, String(o.id));
      await sql()`update users set look = 'custom', updated_at = now() where id = ${c.userId}`;
    }
    return NextResponse.json({ file: row });
  } catch (e) {
    console.error("files: upload", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Upload didn't go through. Please try again." }, { status: 500 });
  }
}
