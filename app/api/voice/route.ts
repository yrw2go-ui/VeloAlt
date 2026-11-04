import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { getCharacter } from "../../lib/characters";
import { characterVoice } from "../../lib/voices";

// 🔊 Velo's natural voice on calls (ElevenLabs): one spoken reply → MP3.
// If that voice is refused, it retries once with Sarah (a built-in voice every
// ElevenLabs account has); if that fails too, the call uses the device's own voice.
//   POST { text, look | characterId } → audio/mpeg. Each look has its own voice, picked here on the server.
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const MAX_CHARS = 1200;
const FALLBACK_VOICE = "EXAVITQu4vr4xnSDxMaL"; // "Sarah", one of ElevenLabs' current default voices
const API = () => process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ error: "Voice isn't set up." }, { status: 503 });
    const caller = await resolveCaller(req);
    if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!allow(caller.userId)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
    // A character speaks in its own voice; Velo in her look's voice.
    const ch = body?.characterId ? await getCharacter(String(body.characterId)) : null;
    const chosen = ch ? characterVoice(ch.voice).voiceId : (VELO_LOOKS.find(l => l.id === body?.look) || VELO_LOOKS[0]).voiceId || FALLBACK_VOICE;
    for (const voiceId of chosen === FALLBACK_VOICE ? [chosen] : [chosen, FALLBACK_VOICE]) {
      const res = await fetch(`${API()}/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
      });
      if (res.ok && res.body) return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
      // Say why (ElevenLabs' own error, never the key), so a refused voice or key permission shows in the logs.
      const why = await res.text().catch(() => "");
      console.error(`voice: ElevenLabs refused voice ${voiceId} (${res.status}) ${why.replace(/\s+/g, " ").slice(0, 300)}`);
    }
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 502 });
  } catch (e) {
    console.error("voice", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 500 });
  }
}
