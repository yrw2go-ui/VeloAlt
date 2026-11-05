import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { getCharacter } from "../../lib/characters";
import { voiceIdFor, isFish } from "../../lib/voices";

// 🔊 Natural voice on calls: one spoken reply → MP3.
// ElevenLabs, or Fish Audio for a character with a Fish voice ("fish:<id>").
// If that voice is refused, it retries once with ElevenLabs' Sarah (every account has
// her); if that fails too, the call uses the device's own voice.
//   POST { text, look | characterId } → audio/mpeg. The voice is picked here on the server.
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const MAX_CHARS = 1200;
const FALLBACK_VOICE = "EXAVITQu4vr4xnSDxMaL"; // "Sarah", one of ElevenLabs' current default voices
const API = () => process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io";
const FISH = () => process.env.FISH_AUDIO_API_URL || "https://api.fish.audio";

async function eleven(text: string, voiceId: string): Promise<Response | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const res = await fetch(`${API()}/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  });
  if (res.ok && res.body) return res;
  // Say why (ElevenLabs' own error, never the key), so a refused voice or key permission shows in the logs.
  console.error(`voice: ElevenLabs refused voice ${voiceId} (${res.status}) ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`);
  return null;
}

// Fish's paid models need API credit (separate from a Fish app plan). With none left
// (402), the same voice is tried once on Fish's free model before falling back.
const FISH_FREE_MODEL = "s2.1-pro-free";
async function fishOnce(text: string, voice: string, key: string, model: string): Promise<Response> {
  return fetch(`${FISH()}/v1/tts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model },
    body: JSON.stringify({ text, reference_id: voice.slice(5), format: "mp3", mp3_bitrate: 64, latency: "balanced" }),
  });
}

async function fish(text: string, voice: string): Promise<Response | null> {
  const key = (process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY);
  if (!key) { console.error("voice: Fish Audio voice picked but FISH_API_KEY isn't set"); return null; }
  const model = process.env.FISH_AUDIO_MODEL || "s1";
  let res = await fishOnce(text, voice, key, model);
  if (res.status === 402 && model !== FISH_FREE_MODEL) {
    console.error(`voice: Fish Audio has no API credit for ${model}; using ${FISH_FREE_MODEL}`);
    await res.text().catch(() => "");
    res = await fishOnce(text, voice, key, FISH_FREE_MODEL);
  }
  if (res.ok && res.body) return res;
  console.error(`voice: Fish Audio refused voice ${voice} (${res.status}) ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`);
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ELEVENLABS_API_KEY && !(process.env.FISH_AUDIO_API_KEY || process.env.FISH_API_KEY)) return NextResponse.json({ error: "Voice isn't set up." }, { status: 503 });
    const caller = await resolveCaller(req);
    if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!allow(caller.userId)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
    // A character speaks in its own voice; Velo in her look's voice.
    const ch = body?.characterId ? await getCharacter(String(body.characterId)) : null;
    const chosen = ch ? voiceIdFor(ch.voice) : (VELO_LOOKS.find(l => l.id === body?.look) || VELO_LOOKS[0]).voiceId || FALLBACK_VOICE;
    const tries = isFish(chosen) ? [() => fish(text, chosen), () => eleven(text, FALLBACK_VOICE)]
      : chosen === FALLBACK_VOICE ? [() => eleven(text, chosen)] : [() => eleven(text, chosen), () => eleven(text, FALLBACK_VOICE)];
    for (const t of tries) {
      const res = await t();
      if (res?.body) return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 502 });
  } catch (e) {
    console.error("voice", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 500 });
  }
}
