// 🔊 Voices a character can have on calls (ElevenLabs premade voices).
// kind picks the device's own voice if ElevenLabs is unavailable.
export type CharacterVoice = { id: string; name: string; kind: "female" | "male"; voiceId: string; about: string };
export const CHARACTER_VOICES: CharacterVoice[] = [
  { id: "sarah", name: "Sarah", kind: "female", voiceId: "EXAVITQu4vr4xnSDxMaL", about: "warm, young adult" },
  { id: "laura", name: "Laura", kind: "female", voiceId: "FGY2WhTYpPnrIDTdsKH5", about: "upbeat, quirky" },
  { id: "alice", name: "Alice", kind: "female", voiceId: "Xb7hH8MSUJpSbSDYk0k2", about: "clear, British" },
  { id: "matilda", name: "Matilda", kind: "female", voiceId: "XrExE9yKIg1WjnnlVkGX", about: "friendly, mature" },
  { id: "lily", name: "Lily", kind: "female", voiceId: "pFZP5JQG7iQjIQuC4Bku", about: "velvety, British" },
  { id: "george", name: "George", kind: "male", voiceId: "JBFqnCBsd6RMkjVDRZzb", about: "warm storyteller, British" },
  { id: "brian", name: "Brian", kind: "male", voiceId: "nPczCjzI2devNBz1zQrb", about: "deep, calm" },
  { id: "daniel", name: "Daniel", kind: "male", voiceId: "onwK4e9ZLuTAKqWW03F9", about: "steady, British" },
  { id: "liam", name: "Liam", kind: "male", voiceId: "TX3LPaxmHKxFdv7VPQKU", about: "energetic, young" },
  { id: "chris", name: "Chris", kind: "male", voiceId: "iP95p4xoKVk53GoZ742B", about: "casual, down-to-earth" },
  { id: "roger", name: "Roger", kind: "male", voiceId: "CwhRBWXzGAHq8TQ4Fs17", about: "easygoing, mature" },
];
export const characterVoice = (id?: string | null) => CHARACTER_VOICES.find(v => v.id === id) || CHARACTER_VOICES[0];
