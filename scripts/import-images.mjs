// 🖼️ One-time copy of Anya's, Hailey's and Allie's pictures from Velo into this app's own storage
// (Supabase Storage): their gallery photos, their 4 reference pictures and their headshot.
// Runs from setup-db during the build. A character that already has a headshot or reference
// pictures here is left alone, so it never doubles up; it waits until there's an admin to own them.
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";

const envAny = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; for (const n of names) { const k = Object.keys(process.env).find(k => k.endsWith(`_${n}`) && process.env[k]); if (k) return process.env[k]; } return ""; };

export async function importImages(sql, file = new URL("../db/seeds/my-character-images.json", import.meta.url)) {
  const base = envAny("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = envAny("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  if (!base || !key) return console.log("setup-db: pictures not copied yet — no Supabase storage keys");
  const [admin] = await sql`select id from users where is_admin order by created_at limit 1`;
  if (!admin) return console.log("setup-db: pictures not copied yet — no admin account (sign up, make yourself admin, then redeploy)");
  const H = (extra = {}) => ({ Authorization: `Bearer ${key}`, apikey: key, ...extra });
  const b = await fetch(`${base}/storage/v1/bucket`, { method: "POST", headers: H({ "Content-Type": "application/json" }), body: JSON.stringify({ id: "velo", name: "velo", public: true, file_size_limit: 52428800 }) });
  if (!b.ok && !/already exists|Duplicate|409/i.test(`${b.status} ${await b.text().catch(() => "")}`)) throw new Error(`bucket ${b.status}`);
  const upload = async (srcUrl, folder, name) => {
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const type = res.headers.get("content-type") || (name.endsWith(".webp") ? "image/webp" : "image/jpeg");
    const buf = Buffer.from(await res.arrayBuffer());
    const dot = name.lastIndexOf(".");
    const path = `velo/media/${folder}/${name.slice(0, dot)}-${randomBytes(9).toString("base64url")}${name.slice(dot)}`;
    const up = await fetch(`${base}/storage/v1/object/velo/${path}`, { method: "POST", headers: H({ "Content-Type": type, "x-upsert": "false" }), body: buf });
    if (!up.ok) throw new Error(`upload ${up.status}`);
    return { url: `${base}/storage/v1/object/public/velo/${path}`, pathname: path, type, size: buf.length };
  };
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const c of data) {
    const [ch] = await sql`select id, portrait_file_id, cardinality(reference_ids) as refs from chat_characters where lower(name) = lower(${c.name}) limit 1`;
    if (!ch || ch.portrait_file_id || ch.refs > 0) continue;
    const refs = [];
    let portrait = null;
    let copied = 0;
    for (const im of c.images) {
      try {
        const folder = randomUUID();
        const f = await upload(im.url, folder, "photo.jpg");
        const t = im.thumb ? await upload(im.thumb, folder, "thumb.webp").catch(() => null) : null;
        const [file] = await sql`insert into velo_files (user_id, kind, url, pathname, name, content_type, size) values (${admin.id}, 'media', ${f.url}, ${f.pathname}, 'photo.jpg', ${f.type}, ${f.size}) returning id`;
        const [thumb] = t ? await sql`insert into velo_files (user_id, kind, url, pathname, name, content_type, size) values (${admin.id}, 'media', ${t.url}, ${t.pathname}, 'thumb.webp', ${t.type}, ${t.size}) returning id` : [null];
        const [m] = await sql`insert into velo_media (user_id, character_id, kind, prompt, model, status, file_id, thumb_file_id, kept, caption, description, created_at, done_at)
          values (${admin.id}, ${ch.id}, 'image', ${(im.description || "Copied from Velo").slice(0, 2000)}, ${String(im.model || "upload").slice(0, 200)}, 'done', ${file.id}, ${thumb?.id || null}, ${!!im.kept}, ${im.caption ? String(im.caption).slice(0, 200) : null}, ${im.description ? String(im.description).slice(0, 400) : null}, ${im.at || new Date().toISOString()}, ${im.at || new Date().toISOString()})
          returning id`;
        if (im.ref) refs.push({ ref: im.ref, id: m.id });
        if (im.url === c.portrait) portrait = file.id;
        copied++;
      } catch (e) { console.warn(`setup-db: couldn't copy one of ${c.name}'s pictures: ${e?.message || e}`); }
    }
    const refIds = refs.sort((a, b) => a.ref - b.ref).map(r => r.id).slice(0, 4);
    await sql`update chat_characters set reference_ids = ${refIds}::uuid[], portrait_file_id = ${portrait}, updated_at = now() where id = ${ch.id}`;
    console.log(`setup-db: copied ${copied} of ${c.images.length} pictures for ${c.name}${portrait ? " (with her headshot)" : ""}`);
  }
}
