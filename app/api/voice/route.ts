import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { VELO_LOOKS } from "../../lib/veloAvatars";

// 🔊 Velo's natural voice on calls (ElevenLabs): one spoken reply → MP3.
// If this fails, the call falls back to the device's own voice.
//   POST { text, look } → audio/mpeg. Each look has its own voice, picked here on the server.
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const MAX_CHARS = 1200;

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
    const voiceId = (VELO_LOOKS.find(l => l.id === body?.look) || VELO_LOOKS[0]).voiceId;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    });
    if (!res.ok || !res.body) return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 502 });
    return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 500 });
  }
}
