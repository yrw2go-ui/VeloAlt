// 🔊 Character voices. A character's voice is any ElevenLabs voice (stored by its
// voice_id). The admin picks from their ElevenLabs voices or the shared voice
// library (Settings → character editor); these built-ins are the fallback list.
// kind picks the device's own voice if ElevenLabs is unavailable.
export type CharacterVoice = { id: string; name: string; kind: "female" | "male"; voiceId: string; about: string };
export const CHARACTER_VOICES: CharacterVoice[] = [
  { id: "sarah", name: "Sarah", kind: "female", voiceId: "EXAVITQu4vr4xnSDxMaL", about: "warm, young adult" },
  { id: "aria", name: "Aria", kind: "female", voiceId: "9BWtsMINqrJLrRacOk9x", about: "expressive, American" },
  { id: "laura", name: "Laura", kind: "female", voiceId: "FGY2WhTYpPnrIDTdsKH5", about: "upbeat, quirky" },
  { id: "charlotte", name: "Charlotte", kind: "female", voiceId: "XB0fDUnXU5powFXDhCwa", about: "smooth, Swedish-English" },
  { id: "alice", name: "Alice", kind: "female", voiceId: "Xb7hH8MSUJpSbSDYk0k2", about: "clear, British" },
  { id: "matilda", name: "Matilda", kind: "female", voiceId: "XrExE9yKIg1WjnnlVkGX", about: "friendly, mature" },
  { id: "jessica", name: "Jessica", kind: "female", voiceId: "cgSgspJ2msm6clMCkdW9", about: "bright, playful" },
  { id: "lily", name: "Lily", kind: "female", voiceId: "pFZP5JQG7iQjIQuC4Bku", about: "velvety, British" },
  { id: "river", name: "River", kind: "female", voiceId: "SAz9YHcvj6GT2YYXdXww", about: "relaxed, neutral" },
  { id: "rachel", name: "Rachel", kind: "female", voiceId: "21m00Tcm4TlvDq8ikWAM", about: "calm, American" },
  { id: "george", name: "George", kind: "male", voiceId: "JBFqnCBsd6RMkjVDRZzb", about: "warm storyteller, British" },
  { id: "brian", name: "Brian", kind: "male", voiceId: "nPczCjzI2devNBz1zQrb", about: "deep, calm" },
  { id: "daniel", name: "Daniel", kind: "male", voiceId: "onwK4e9ZLuTAKqWW03F9", about: "steady, British" },
  { id: "liam", name: "Liam", kind: "male", voiceId: "TX3LPaxmHKxFdv7VPQKU", about: "energetic, young" },
  { id: "chris", name: "Chris", kind: "male", voiceId: "iP95p4xoKVk53GoZ742B", about: "casual, down-to-earth" },
  { id: "roger", name: "Roger", kind: "male", voiceId: "CwhRBWXzGAHq8TQ4Fs17", about: "easygoing, mature" },
  { id: "charlie", name: "Charlie", kind: "male", voiceId: "IKne3meq5aSn9XLyUdCD", about: "natural, Australian" },
  { id: "callum", name: "Callum", kind: "male", voiceId: "N2lVS1w4EtoT3dr4eOWO", about: "gravelly, intense" },
  { id: "will", name: "Will", kind: "male", voiceId: "bIHbv24MWmeRgasZH58o", about: "friendly, young" },
  { id: "eric", name: "Eric", kind: "male", voiceId: "cjVigY5qzO86Huf0OWal", about: "smooth, classy" },
  { id: "bill", name: "Bill", kind: "male", voiceId: "pqHfZKP75CvOlQylNhV4", about: "wise, older" },
];
export const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;
// 🐟 Fish Audio voices are saved as "fish:<model id>".
export const FISH_ID = /^fish:[A-Za-z0-9]{16,64}$/;
export const isFish = (v?: string | null) => !!v && FISH_ID.test(v);
/** The ElevenLabs voice_id for a character's saved voice (a built-in key or a voice_id). */
export const voiceIdFor = (v?: string | null) => isFish(v) ? v! : CHARACTER_VOICES.find(x => x.id === v)?.voiceId || (v && VOICE_ID.test(v) ? v : CHARACTER_VOICES[0].voiceId);
