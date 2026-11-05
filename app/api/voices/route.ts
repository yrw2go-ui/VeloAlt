import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { isAdmin } from "../../lib/characters";
import { CHARACTER_VOICES } from "../../lib/voices";

// 🔊 Voices to choose from for a character (admins). POST { provider: "elevenlabs" | "fish", q } → { voices, source }
// Fish Audio: female voices from its public library (needs FISH_API_KEY).
// Their ElevenLabs voices plus a search of ElevenLabs' shared voice library (thousands of
// voices); a shared voice is added to their ElevenLabs account when the character is saved.
// If ElevenLabs can't be reached (or the key can't list voices), the built-in list.
type VoiceOption = { id: string; name: string; kind: "female" | "male"; about: string; preview: string; owner?: string };
const API = () => process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io";
const FISH = () => process.env.FISH_AUDIO_API_URL || "https://api.fish.audio";
const kindOf = (g: unknown): "female" | "male" => (String(g || "").toLowerCase() === "male" ? "male" : "female");
const about = (...parts: unknown[]) => parts.map(p => String(p || "").trim()).filter(Boolean).join(", ").slice(0, 120);

export async function POST(req: NextRequest) {
  const c = await resolveCaller(req);
  if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!(await isAdmin(c.userId))) return NextResponse.json({ error: "Only an admin can pick voices." }, { status: 403 });
  if (!allow(`voices:${c.userId}`, [{ ms: 60_000, max: 30 }])) return NextResponse.json({ error: "Too many searches — try again in a moment." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const q = String(body?.q || "").replace(/[^\w\s'-]/g, " ").trim().slice(0, 60);
  if (body?.provider === "fish") {
    const key = (process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY);
    if (!key) return NextResponse.json({ error: "Fish Audio isn't set up yet — add FISH_API_KEY in Vercel." }, { status: 503 });
    try {
      const r = await fetch(`${FISH()}/model?page_size=40&page_number=1&sort_by=score&tag=female${q ? `&title=${encodeURIComponent(q)}` : ""}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) { console.error(`voices: Fish Audio list ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`); return NextResponse.json({ error: "Fish Audio didn't answer. Try again." }, { status: 502 }); }
      const j = await r.json();
      const voices: VoiceOption[] = (j?.items || []).filter((v: { _id?: string }) => /^[A-Za-z0-9]{16,64}$/.test(String(v._id || ""))).map((v: { _id: string; title?: string; description?: string; tags?: string[]; languages?: string[]; samples?: { audio?: string }[] }) => ({
        id: `fish:${v._id}`, name: String(v.title || "Voice").slice(0, 60), kind: "female" as const,
        about: about(v.description, (v.tags || []).slice(0, 4).join(" "), (v.languages || []).join("/")),
        preview: /^https:\/\//.test(String(v.samples?.[0]?.audio || "")) ? String(v.samples![0].audio) : "",
      }));
      return NextResponse.json({ voices, source: "fish" });
    } catch (e) { console.error("voices: fish", e instanceof Error ? e.message : e); return NextResponse.json({ error: "Fish Audio didn't answer. Try again." }, { status: 502 }); }
  }
  const builtIn: VoiceOption[] = CHARACTER_VOICES.map(v => ({ id: v.voiceId, name: v.name, kind: v.kind, about: v.about, preview: "" }));
  const match = (v: VoiceOption) => !q || `${v.name} ${v.about} ${v.kind}`.toLowerCase().includes(q.toLowerCase());
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ voices: builtIn.filter(match), source: "builtin" });
  const h = { "xi-api-key": key };
  const out: VoiceOption[] = [];
  let ok = false;
  try {
    const r = await fetch(`${API()}/v1/voices`, { headers: h });
    if (r.ok) {
      ok = true;
      const j = await r.json();
      for (const v of j?.voices || []) {
        const l = v.labels || {};
        const o = { id: String(v.voice_id), name: String(v.name || "Voice").slice(0, 60), kind: kindOf(l.gender), about: about(l.description || l.descriptive, l.accent, l.age, l.use_case), preview: String(v.preview_url || "") };
        if (match(o)) out.push(o);
      }
    } else console.error(`voices: ElevenLabs list ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  } catch (e) { console.error("voices: list", e instanceof Error ? e.message : e); }
  try {
    const r = await fetch(`${API()}/v1/shared-voices?page_size=40${q ? `&search=${encodeURIComponent(q)}` : ""}`, { headers: h });
    if (r.ok) {
      ok = true;
      const j = await r.json();
      for (const v of j?.voices || []) {
        if (out.some(o => o.id === v.voice_id)) continue;
        out.push({ id: String(v.voice_id), name: String(v.name || "Voice").slice(0, 60), kind: kindOf(v.gender), about: about(v.descriptive || v.description, v.accent, v.age, v.use_case), preview: String(v.preview_url || ""), owner: String(v.public_owner_id || "") || undefined });
      }
    } else console.error(`voices: ElevenLabs library ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  } catch (e) { console.error("voices: library", e instanceof Error ? e.message : e); }
  const voices = (ok ? out : builtIn.filter(match)).map(v => ({ ...v, preview: /^https:\/\//.test(v.preview) ? v.preview : "" }));
  return NextResponse.json({ voices: voices.slice(0, 80), source: ok ? "elevenlabs" : "builtin" });
}
