import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { sql } from "../../lib/db";

// 🔊 Velo's natural voice on calls (ElevenLabs): one spoken reply → MP3.
// If this fails, the call falls back to the device's own voice.
//   POST { text, look } → audio/mpeg. Each look has its own voice, picked here on the server.
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const MAX_CHARS = 1200;

export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCaller(req);
    if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!allow(caller.userId)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

    // Use adult-friendly TTS for alternate (spicy) personality
    const [u] = await sql()`select personality, spicy_voice, secret_voice, spicy_api_voice from users where id = ${caller.userId}`;
    const isAlternate = u?.personality === "alternate" && caller.email.toLowerCase() === "yrw2go@gmail.com";
    const provider = (u?.spicy_voice || process.env.SPICY_VOICE_PROVIDER || "secretvoice").toLowerCase();

    let res;
    if (isAlternate) {
      if (provider === "fish" && process.env.FISH_API_KEY) {
        res = await fetch("https://api.fish.audio/v1/tts", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.FISH_API_KEY}`, "Content-Type": "application/json", "model": "s2.1-pro-free" },
          body: JSON.stringify({ text, format: "mp3", reference_id: process.env.FISH_VOICE_ID || undefined }),
        });
      } else if (provider === "spicy" && process.env.SPICY_API_KEY) {
        res = await fetch("https://api.spicyapi.com/v1/audio/speech", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.SPICY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "spicy-voice-3", input: text, voice: u?.spicy_api_voice || "Bella Bright", response_format: "mp3" }),
        });
      } else if (process.env.SECRETVOICE_API_KEY) {
        const voice = u?.secret_voice || "velvet";
        res = await fetch(`https://api.secretvoice.dev/v1/text-to-speech/${voice}`, {
          method: "POST",
          headers: { "xi-api-key": process.env.SECRETVOICE_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ text, model_id: "secret-v1" }),
        });
      }
    }
    if (!res) {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) return NextResponse.json({ error: "Voice isn't set up." }, { status: 503 });
      const voiceId = (VELO_LOOKS.find(l => l.id === body?.look) || VELO_LOOKS[0]).voiceId;
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
      });
    }
    if (!res.ok || !res.body) return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 502 });
    return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Voice is unavailable right now." }, { status: 500 });
  }
}
