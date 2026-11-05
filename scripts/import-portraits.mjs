// 🖼️ Runs before each build: gives a character the headshot listed for her in
// db/seeds/starter-portraits.json (made in ElevenLabs; the files are in db/seeds/portraits), with its prompt —
// saved to Blob, in the admin's gallery, as her headshot and first reference picture.
// Only for a character that has no headshot or reference pictures yet; never fails the build.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return console.log("import-portraits: no database or Blob token, skipping");
  const sql = neon(url);
  const [admin] = await sql`select id from users where is_admin order by created_at limit 1`;
  if (!admin) return console.log("import-portraits: no admin yet, skipping");
  const list = JSON.parse(readFileSync(new URL("../db/seeds/starter-portraits.json", import.meta.url), "utf8"));
  for (const p of list) {
    const [ch] = await sql`select id, portrait_file_id, cardinality(reference_ids) as refs from chat_characters where lower(name) = lower(${p.name}) limit 1`;
    if (!ch || ch.portrait_file_id || ch.refs > 0) continue;
    try {
      // The picture is saved with the code (db/seeds/portraits/…).
      const buf = readFileSync(new URL(`../db/seeds/${p.file}`, import.meta.url));
      const type = p.file.endsWith(".png") ? "image/png" : "image/jpeg";
      const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
      const blob = await put(`velo/media/${randomUUID()}/photo.${ext}`, buf, { access: "public", addRandomSuffix: true, contentType: type });
      const [f] = await sql`insert into velo_files (user_id, kind, url, pathname, name, content_type, size) values (${admin.id}, 'media', ${blob.url}, ${blob.pathname}, ${`photo.${ext}`}, ${type}, ${buf.length}) returning id`;
      const [m] = await sql`insert into velo_media (user_id, character_id, kind, prompt, model, status, file_id, kept, description, done_at)
        values (${admin.id}, ${ch.id}, 'image', ${String(p.prompt).slice(0, 2000)}, ${String(p.model || "elevenlabs").slice(0, 200)}, 'done', ${f.id}, true, ${String(p.description || "").slice(0, 400) || null}, now()) returning id`;
      await sql`update chat_characters set portrait_file_id = ${f.id}, reference_ids = ${[m.id]}::uuid[], updated_at = now() where id = ${ch.id}`;
      console.log(`import-portraits: ${p.name} now has her headshot`);
    } catch (e) { console.warn(`import-portraits: ${p.name}: ${e?.message || e}`); }
  }
}
main().catch(e => console.warn(`import-portraits: skipped (${e?.message || e})`)).finally(() => process.exit(0));
