import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { IMAGE_TYPES, DOC_TYPES, MAX_BYTES, MAX_FILES, blobReady, deleteFile } from "../../lib/files";

// 📎 Upload one file to Vercel Blob for the signed-in person.
// POST multipart { file, purpose: "chat" | "face" } → { file: { id, url, name, content_type, size } }
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
    const blob = await put(`velo/${purpose}/${randomUUID()}/${name}`, file, { access: "public", addRandomSuffix: true, contentType: type });
    const [row] = await sql()`insert into velo_files (user_id, kind, url, pathname, name, content_type, size)
      values (${c.userId}, ${purpose === "face" ? "face" : "file"}, ${blob.url}, ${blob.pathname}, ${name}, ${type}, ${file.size})
      returning id, url, name, content_type, size, kind`;

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
