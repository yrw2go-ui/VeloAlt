"use client";
// 📞 Call Velo: a hands-free, phone-call style conversation with Velo to talk
// about anything — your day, plans, ideas — hands-free.
//   listen (browser speech-to-text) → Velo replies (/api/atlas, call: "talk")
//   → the reply is read out loud (natural voice from /api/velo-voice, or the
//   browser's own text-to-speech if that isn't available) → listen again.
// 📝 Text (per call, off at the start): shows her latest reply and what you said.
// Off, it feels like a real call: no text on screen.
// 📱 Private (per call, off at the start): like holding the phone to your ear —
// she keeps talking, through the earpiece where the browser allows it (iPhone:
// call-style audio session), quietly elsewhere, and the screen goes dark after a
// few seconds without a touch (tap to wake), so a cheek can't press buttons.
// 🔊 Volume slider: Web Audio gain, remembered on the device (iPhone/iPad: volume buttons instead).
// Only text goes to Velo — never the recording. When the call ends, "Save
// recap" asks Velo for a short written plan and drops it into the chat.
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { VeloAvatar, useVeloLook } from "./avatar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;
type Turn = { role: "user" | "assistant"; content: string };
type Phase = "listening" | "thinking" | "speaking" | "muted" | "ended";

const speechCtor = (): AnyRec => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: AnyRec; webkitSpeechRecognition?: AnyRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};
/** Can this device do a call (speech in and out)? */
export const canCallVelo = () => typeof window !== "undefined" && !!speechCtor() && "speechSynthesis" in window;
/** Call from the tap that opens the call: phones only allow speech that starts from a tap. */
export function primeSpeech() {
  try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(" "), { volume: 0 })); } catch { /* no speech */ }
  // The natural voice plays through one audio element, unlocked by this same tap.
  try {
    callAudio = callAudio || new Audio();
    callAudio.src = SILENT_WAV; callAudio.play().catch(() => {});
  } catch { /* no audio */ }
  // 🔊 Web Audio (with a volume knob) for the natural voice. Not on iPhone/iPad:
  // there the silent switch mutes Web Audio (Velo would go quiet), so the audio
  // element plays it and the phone's volume buttons set the level.
  // Phones only let it start from a tap, so it's created and unlocked here.
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC && !isIOS()) {
      callCtx = callCtx || new AC();
      if (!callGain) { callGain = callCtx.createGain(); callGain.connect(callCtx.destination); }
      callGain.gain.value = callVolume;
      callCtx.resume().catch(() => {});
      const s = callCtx.createBufferSource(); s.buffer = callCtx.createBuffer(1, 1, 22050); s.connect(callCtx.destination); s.start(0);
    }
  } catch { /* no Web Audio: the audio element plays it */ }
}
let callAudio: HTMLAudioElement | null = null;
let callCtx: AudioContext | null = null;
let callGain: GainNode | null = null;
let callSource: AudioBufferSourceNode | null = null;
let callVolume = 1;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
const setCallVolume = (v: number) => {
  callVolume = v;
  try { if (callGain) callGain.gain.value = v; } catch { /* fine */ }
  try { if (callAudio) callAudio.volume = v; } catch { /* fine */ }
};
// 📱 Private: the voice volume where there's no earpiece (a quarter of the slider).
const QUIET = 0.25;
// Safari 17+: navigator.audioSession. "play-and-record" is call-style audio,
// which plays through the earpiece on iPhone.
type AudioSessionLike = { type: string };
const audioSession = (): AudioSessionLike | null => {
  try { const a = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession; return a && typeof a.type === "string" ? a : null; } catch { return null; }
};
const isIOS = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
/** Plays the natural voice through Web Audio. False = couldn't (use the audio element). */
async function playWebAudio(mp3: Blob, stale: () => boolean, onDone: () => void): Promise<boolean> {
  const ctx = callCtx, gain = callGain;
  if (!ctx || !gain) return false;
  try {
    if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 400))]);
    if ((ctx.state as string) !== "running") return false;
    const data = await mp3.arrayBuffer();
    // Callback form: older Safari has no promise-returning decodeAudioData.
    const buf = await new Promise<AudioBuffer>((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p && typeof p.catch === "function") p.catch(rej); });
    if (stale()) return true;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(gain);
    src.onended = () => { if (callSource === src) callSource = null; onDone(); };
    callSource = src;
    src.start(0);
    return true;
  } catch { return false; }
}
// Remembered on this device.
const VOLUME_KEY = "velo_call_volume";
const loadPref = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const savePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* storage blocked */ } };

/** Call Velo's voice kind for the device fallback voice. */
export type VeloVoice = "female" | "male";
export const VELO_VOICE_KEY = "velo_voice";
/** The Male choice is greyed out until phones reliably offer the browser a male voice. */
export const MALE_VOICE_READY = false;
// Device voices known to sound female / male (iPhone, Android/Chrome, Windows, Mac).
const FEMALE = ["Samantha", "Ava", "Allison", "Zoe", "Susan", "Google US English", "Microsoft Aria", "Microsoft Jenny", "Microsoft Michelle", "Microsoft Zira", "Victoria", "Karen", "Moira", "Tessa"];
const MALE = ["Aaron", "Evan", "Nathan", "Tom", "Alex", "Fred", "Daniel", "Rishi", "Microsoft Guy", "Microsoft Andrew", "Microsoft Brian", "Microsoft Christopher", "Microsoft Eric", "Microsoft Davis", "Microsoft David", "Microsoft Mark", "Google UK English Male", "Arthur", "Oliver"];
// A natural-sounding English voice of the chosen kind when the device has one
// (US first). Returns whether it's a sure match, so a guess can be pitched to fit.
function pickVoice(kind: VeloVoice): { voice: SpeechSynthesisVoice | null; sure: boolean } {
  const all = window.speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
  const us = all.filter(v => /^en(-|_)US/i.test(v.lang));
  const names = kind === "male" ? MALE : FEMALE;
  for (const list of [us, all]) {
    const hit = names.map(n => list.find(v => v.name.includes(n))).find(Boolean);
    if (hit) return { voice: hit, sure: true };
  }
  const byName = (re: RegExp) => all.find(v => re.test(v.name));
  const guess = kind === "male" ? byName(/\bmale\b/i) : byName(/female/i);
  return guess ? { voice: guess, sure: true } : { voice: us.find(v => v.localService) || us[0] || all[0] || null, sure: false };
}
// What's shown and read: no markdown or symbols.
const speakable = (t: string) => t.replace(/\[\[[^\]]*\]\]/g, "").replace(/https?:\/\/\S+/g, "").replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim();
// Said out loud: "Velo" is pronounced Vĕllō ("VEL-oh"), so the voice reads it as "Vello".
const sayable = (t: string) => speakable(t).replace(/\bVelo\b/g, "Vello").replace(/\bVELO\b/g, "Vello");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** Velo answers by first name, a little differently each time. On the very
 *  first call she introduces herself and what she's there for. */
const greetingFor = (name?: string, first = false, who = "Velo") => {
  const n = (name || "").trim().split(/\s+/)[0];
  if (who && who.toLowerCase() !== "velo") return `Hey${n ? ` ${n}` : ""}, it's ${who}.`;
  if (first) return `Hi${n ? ` ${n}` : ""}, I'm Velo! I'm here to help with any questions, your schedule, and whatever else you need. What can I do for you?`;
  const h = new Date().getHours();
  const tod = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const say = (named: string, plain: string) => (n ? named : plain);
  const options = [
    say(`Hey ${n}, what's up?`, "Hey, what's up?"),
    say(`${tod} ${n}!`, `${tod}!`),
    say(`Hi ${n}, how can I help?`, "Hi, how can I help?"),
    say(`Hey ${n}! What's on your mind?`, "Hey! What's on your mind?"),
    say(`${tod} ${n}, what are we working on?`, `${tod}, what are we working on?`),
    say(`Hi ${n}! Good to hear from you. What's going on?`, "Hi! Good to hear from you. What's going on?"),
  ];
  return options[Math.floor(Math.random() * options.length)];
};

export default function VeloCall({ request, onEnd, voice = "female", name, who = "Velo", faceUrl = "", firstCall = false, fetchVoice, opener, startPrivate = false, continueFrom, mini = false, onMinimize, onExpand }: {
  /** 📞 Check-in call: what Velo says first (instead of her usual hello). */
  opener?: string;
  /** Start like a normal phone call: on the earpiece (📱 Private), with a 🔊 Speaker button. */
  startPrivate?: boolean;
  voice?: VeloVoice;
  /** The account owner's name, for the greeting. */
  name?: string;
  /** Who is on the call. A created character, or Velo. */
  who?: string;
  /** Her photo, if one is saved. */
  faceUrl?: string;
  /** Their first call ever: Velo introduces herself. */
  firstCall?: boolean;
  /** Recent chat messages to continue from (instead of a fresh greeting). */
  continueFrom?: Turn[];
  /** Shrunk to a bar so they can use the app while they talk. */
  mini?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
  /** Sends the conversation to Velo; returns its reply. */
  request: (turns: Turn[], mode: "talk" | "recap" | "remember") => Promise<string>;
  /** The call closed — with the recap to add to the chat, or null. */
  onEnd: (recap: string | null, turns: Turn[]) => void;
  /** 🔊 Natural voice for a reply (MP3), or null to use the device's voice. */
  fetchVoice?: (text: string, voice: VeloVoice, look: string) => Promise<Blob | null>;
}) {
  const [phase, setPhase] = useState<Phase>("speaking");
  const [greeting] = useState(() => opener?.trim() || greetingFor(name, firstCall, who));
  const [turns, setTurns] = useState<Turn[]>(continueFrom && continueFrom.length ? continueFrom : [{ role: "assistant", content: greeting }]);
  const [heard, setHeard] = useState("");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const muted = useRef(false);
  const rec = useRef<AnyRec>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  // Her chosen face also picks her voice (the server maps the look to a voice).
  const look = useVeloLook();
  const [face, setFace] = useState(faceUrl);
  useEffect(() => {
    const on = (e: Event) => setFace(String((e as CustomEvent).detail?.image || ""));
    window.addEventListener("velo:character", on);
    return () => window.removeEventListener("velo:character", on);
  }, []);
  const lookRef = useRef(look);
  lookRef.current = look;
  // 📝 Text: show the conversation on screen. Off at the start of every call.
  const [showText, setShowText] = useState(false);
  // 📱 Private: phone-to-your-ear mode. Off at the start of every call.
  // A check-in call Velo placed starts this way (picked up like a normal call).
  const [priv, setPriv] = useState(startPrivate);
  const privRef = useRef(priv);
  // An earpiece is available (call-style audio session) — otherwise Private plays quietly.
  const [earpiece] = useState(() => !!audioSession());
  const prevSession = useRef<string | null>(null);
  // The voice volume actually used: the slider, or a quarter of it in Private without an earpiece.
  const outVol = (v = volRef.current) => (privRef.current && !earpiece ? v * QUIET : v);
  // What Velo last said (or showed), including the greeting and error lines.
  const [said, setSaid] = useState(greeting);
  const [vol, setVol] = useState(() => {
    const v = Number(loadPref(VOLUME_KEY));
    return loadPref(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  });
  const volRef = useRef(vol);
  // iPhone/iPad: no Web Audio (silent switch would mute it), so the slider wouldn't do anything there.
  const [volHint] = useState(() => isIOS() && !callCtx);

  useEffect(() => {
    if (privRef.current) { setSession(true); armDark(4000); }
    setCallVolume(outVol());
    const t = setInterval(() => live.current && setSecs(s => s + 1), 1000);
    speak(greeting);
    return () => { clearInterval(t); live.current = false; stopAll(); setSession(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the phone from locking mid-call (where the browser allows it).
  useEffect(() => {
    if (phase === "ended") return;
    let lock: { release: () => Promise<void> } | null = null, gone = false;
    const get = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl || document.visibilityState !== "visible") return;
        const l = await wl.request("screen");
        if (gone) l.release().catch(() => {}); else lock = l;
      } catch { /* not allowed: the phone may lock as usual */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    get();
    document.addEventListener("visibilitychange", onVis);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVis); try { lock?.release().catch(() => {}); } catch { /* fine */ } };
  }, [phase === "ended"]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📱 Private: call-style audio (earpiece) on, or back to how it was.
  const setSession = (on: boolean) => {
    const s = audioSession();
    if (!s) return;
    try {
      if (on) { if (prevSession.current === null) prevSession.current = s.type; s.type = "play-and-record"; }
      else if (prevSession.current !== null) { s.type = prevSession.current || "auto"; prevSession.current = null; }
    } catch { /* not supported */ }
  };

  // 📱 Private: the screen goes dark "at your ear". Websites can't read the
  // proximity sensor, so after 4s without a touch a black cover takes the screen
  // and swallows taps; a tap wakes it for 8s (the tap itself presses nothing).
  const [dark, setDark] = useState(false);
  const [wakeHint, setWakeHint] = useState(false);
  const darkAt = useRef(0);
  const darkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armDark = (ms: number, extendOnly = false) => {
    const at = Date.now() + ms;
    darkAt.current = extendOnly ? Math.max(darkAt.current, at) : at;
    if (darkTimer.current) clearTimeout(darkTimer.current);
    const tick = () => {
      const left = darkAt.current - Date.now();
      if (left > 0) { darkTimer.current = setTimeout(tick, left); return; }
      darkTimer.current = null;
      if (!privRef.current || !live.current) return;
      setDark(true); flashHint();
    };
    darkTimer.current = setTimeout(tick, Math.max(0, darkAt.current - Date.now()));
  };
  const flashHint = () => {
    setWakeHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setWakeHint(false), 2000);
  };
  const clearDark = () => {
    if (darkTimer.current) clearTimeout(darkTimer.current);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    darkTimer.current = hintTimer.current = null;
    setDark(false); setWakeHint(false);
  };
  useEffect(() => () => clearDark(), []);
  // Any touch on the (lit) call screen pushes the darkness back.
  const touched = () => { if (privRef.current && !dark) armDark(4000, true); };
  // On the dark cover: a tap wakes it for 8s; the tap doesn't reach any button.
  const darkTap = (e: SyntheticEvent) => {
    e.stopPropagation();
    setDark(false); setWakeHint(false); armDark(8000);
  };
  // Back in the app (after a phone call, another app, or the screen locking): show the call screen.
  useEffect(() => {
    const onBack = () => { if (document.visibilityState === "visible" && privRef.current && live.current) { setDark(false); setWakeHint(false); armDark(8000); } };
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const swallow = (e: SyntheticEvent) => { e.stopPropagation(); };

  const stopAll = () => {
    try { rec.current?.abort(); } catch { /* not listening */ }
    rec.current = null;
    stopTalking();
  };
  // Stop whichever voice is talking (natural or device).
  const speakId = useRef(0);
  const stopTalking = () => {
    speakId.current++;
    try { window.speechSynthesis.cancel(); } catch { /* no speech */ }
    try { if (callAudio) { callAudio.onended = callAudio.onerror = null; callAudio.pause(); } } catch { /* no audio */ }
    try { if (callSource) { callSource.onended = null; callSource.stop(); } } catch { /* already stopped */ }
    callSource = null;
  };
  // After two natural-voice failures in a call, stay on the device voice.
  const voiceFails = useRef(0);

  const speak = async (text: string, thenHangUp = false) => {
    if (!live.current) return;
    setSaid(text);
    stopTalking();
    const id = speakId.current;
    const next = () => { if (!live.current || id !== speakId.current) return; if (thenHangUp) hangUp(); else listen(); };
    setPhase("speaking");
    if (fetchVoice && callAudio && voiceFails.current < 2) {
      try {
        const mp3 = await fetchVoice(sayable(text), voice, lookRef.current);
        if (id !== speakId.current || !live.current) return;
        if (mp3 && await playWebAudio(mp3, () => id !== speakId.current || !live.current, next)) return;
        if (id !== speakId.current || !live.current) return;
        if (mp3) {
          callAudio.volume = outVol();
          const url = URL.createObjectURL(mp3);
          const done = () => { URL.revokeObjectURL(url); next(); };
          callAudio.onended = done;
          callAudio.onerror = () => { URL.revokeObjectURL(url); voiceFails.current++; speakDevice(text, next); };
          callAudio.src = url;
          await callAudio.play();
          return;
        }
      } catch { /* fall back to the device voice */ }
      if (id !== speakId.current || !live.current) return;
      voiceFails.current++;
    }
    speakDevice(text, next);
  };

  const speakDevice = (text: string, next: () => void) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sayable(text));
      const v = pickVoice(voice); if (v.voice) u.voice = v.voice;
      u.rate = 1.03;
      u.volume = outVol();
      // No voice of the chosen kind on this device: shift the pitch toward it.
      if (!v.sure) u.pitch = voice === "male" ? 0.75 : 1.15;
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    } catch { next(); }
  };

  const listen = () => {
    if (!live.current) return;
    if (muted.current) { setPhase("muted"); return; }
    const Ctor = speechCtor();
    if (!Ctor) { setErr("This device can't listen — try Chrome or Safari."); return; }
    try { rec.current?.abort(); } catch { /* fine */ }
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let said = "";
    r.onresult = (e: AnyRec) => {
      let interim = ""; said = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) said += t; else interim += t;
      }
      setHeard((said + " " + interim).trim());
    };
    r.onerror = (e: AnyRec) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") { setErr("Microphone is blocked — allow it for Velo in your browser settings."); live.current = false; }
    };
    r.onend = () => {
      if (rec.current !== r) return;
      rec.current = null;
      if (!live.current) return;
      const text = said.trim();
      if (text) think(text);
      else setTimeout(() => { if (live.current && !rec.current && !muted.current) listen(); }, 250);   // silence: keep listening
    };
    rec.current = r;
    setPhase("listening"); setHeard("");
    try { r.start(); } catch { /* already started */ }
  };

  const sendTyped = () => {
    const t = typed.trim();
    if (!t || phase === "thinking" || phase === "speaking") return;
    setTyped("");
    think(t);
  };
  const think = async (text: string) => {
    const next = [...turnsRef.current, { role: "user" as const, content: text }];
    setTurns(next); setPhase("thinking"); setErr("");
    try {
      const reply = await request(next, "talk");
      if (!live.current) return;
      setTurns([...next, { role: "assistant", content: reply }]);
      setHeard("");
      speak(reply);
    } catch (e) {
      if (!live.current) return;
      const msg = e instanceof Error ? e.message : "Velo didn't answer.";
      setErr(msg);
      if ((e as { final?: boolean })?.final) speak(msg, true);
      else speak("Sorry, I lost you for a second. Could you say that again?");
    }
  };

  // Tap while Velo is talking: cut in and talk.
  const interrupt = () => { if (phase === "speaking") { stopTalking(); listen(); } };
  const toggleMute = () => {
    muted.current = !muted.current;
    if (muted.current) { try { rec.current?.abort(); } catch { /* fine */ } rec.current = null; if (phase !== "speaking" && phase !== "thinking") setPhase("muted"); }
    else if (phase === "muted") listen();
  };
  // 📱 Private: she keeps talking — through the earpiece (or quietly) — and the screen darkens at your ear.
  const togglePrivate = () => {
    const on = !privRef.current;
    privRef.current = on; setPriv(on);
    setSession(on);
    setCallVolume(outVol());
    if (on) armDark(4000); else clearDark();
  };
  const changeVolume = (v: number) => {
    volRef.current = v; setVol(v); setCallVolume(outVol(v)); savePref(VOLUME_KEY, String(v));
  };
  // 🧠 Hanging up: Velo files a short summary of the call (and any new goals) in her memory.
  const remembered = useRef(false);
  const hangUp = () => {
    live.current = false; stopAll(); setPhase("ended");
    clearDark(); setSession(false);
    if (!remembered.current && turnsRef.current.some(t => t.role === "user")) { remembered.current = true; request(turnsRef.current, "remember").catch(() => {}); }
  };
  const talked = turns.some(t => t.role === "user");

  const saveRecap = async () => {
    setSaving(true); setErr("");
    try { onEnd(await request(turns, "recap"), turns); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't write the recap."); setSaving(false); }
  };

  const ring = phase === "listening" ? "#10b981" : phase === "speaking" ? "#3b82f6" : phase === "thinking" ? "#f97316" : "#6b7280";
  const label = { listening: "Listening…", thinking: "Thinking…", speaking: `${who} is talking — tap to cut in`, muted: "Muted — tap 🎙️ to talk", ended: "Call ended" }[phase];
  const lastVelo = said;
  const small = showText;
  const pill = (on: boolean) => ({ flexShrink: 0, background: on ? "#3b82f6" : "#1f2937", color: "#fff", border: `1px solid ${on ? "#60a5fa" : "#374151"}`, borderRadius: 999, padding: "8px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" } as const);
  const btn = (bg: string) => ({ width: 64, height: 64, borderRadius: "50%", border: "none", background: bg, color: "#fff", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" } as const);

  if (mini && phase !== "ended") return (
    <div data-testid="velo-call-mini" style={{ position: "fixed", left: 0, right: 0, top: 0, zIndex: 2000, padding: "max(8px, env(safe-area-inset-top)) 12px 8px", background: "linear-gradient(90deg, #1e3a8a, #1e2a4a)", borderBottom: "1px solid #3b82f6", color: "#f1f1f3", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.45)" }}>
      <button onClick={onExpand} aria-label="Back to the call" style={{ all: "unset", flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        {faceUrl ? <img src={faceUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <VeloAvatar size={34} />}
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800 }}>{who}</div><div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div></div>
      </button>
    </div>
  );

  return (
    <div role="dialog" aria-label="Call with Velo" data-testid="velo-call" onClick={interrupt} onPointerDownCapture={touched}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "radial-gradient(circle at 50% 30%, #1e2a4a 0%, #0a0a0f 70%)", color: "#f1f1f3", display: "flex", flexDirection: "column", alignItems: "center", padding: "max(40px, env(safe-area-inset-top)) 20px max(28px, env(safe-area-inset-bottom))", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`@keyframes vcRing { 0% { box-shadow: 0 0 0 0 ${ring}88 } 70% { box-shadow: 0 0 0 26px ${ring}00 } 100% { box-shadow: 0 0 0 0 ${ring}00 } }
        @keyframes vcDot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }`}</style>
      <div style={{ fontSize: 13, color: "#9ca3af", letterSpacing: 1 }}>{phase === "ended" ? "CALL ENDED" : "ON A CALL"} · {clock(secs)}</div>
      {onMinimize && phase !== "ended" && (
        <button onClick={e => { e.stopPropagation(); onMinimize(); }} style={{ position: "absolute", top: "max(32px, env(safe-area-inset-top))", right: 16, background: "#1f2937", color: "#f1f1f3", border: "1px solid #374151", borderRadius: 999, padding: "8px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>⤡ Minimize</button>
      )}
      <div style={{ marginTop: small ? 12 : 34, width: small ? 84 : 150, height: small ? 84 : 150, flexShrink: 0, borderRadius: "50%", background: "#111827", border: `3px solid ${ring}`, display: "flex", alignItems: "center", justifyContent: "center", animation: phase === "ended" || phase === "muted" ? undefined : "vcRing 1.6s infinite" }}>
        {face ? <img src={"/api/pic?u=" + encodeURIComponent(face)} alt="" style={{ width: small ? 78 : 144, height: small ? 78 : 144, borderRadius: "50%", objectFit: "cover" }} /> : <VeloAvatar size={small ? 78 : 144} />}
      </div>
      <div style={{ marginTop: small ? 10 : 18, fontSize: small ? 22 : 26, fontWeight: 800 }}>{who}</div>
      <div style={{ marginTop: 6, fontSize: 14, color: ring, fontWeight: 700, minHeight: 20 }}>
        {phase === "thinking" ? <span>Thinking<span style={{ animation: "vcDot 1.2s infinite" }}>.</span><span style={{ animation: "vcDot 1.2s .2s infinite" }}>.</span><span style={{ animation: "vcDot 1.2s .4s infinite" }}>.</span></span> : label}
      </div>

      <div style={{ marginTop: small ? 14 : 22, width: "100%", maxWidth: 440, flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {phase !== "ended" && lastVelo && /https:\/\/\S+/.test(lastVelo) && (
          <img src={"/api/pic?u=" + encodeURIComponent((lastVelo.match(/https:\/\/\S+/) || [""])[0])} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 12, background: "#111" }} />
        )}
        {phase !== "ended" && showText && lastVelo && (
          <div data-testid="velo-call-reply" aria-live="polite" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 14, padding: "16px 18px", fontSize: 22, fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>{speakable(lastVelo)}</div>
        )}
        {phase !== "ended" && showText && heard && (
          <div data-testid="velo-call-heard" style={{ alignSelf: "flex-end", background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 14, padding: "10px 14px", fontSize: 14, color: "#d1fae5", maxWidth: "85%" }}>{heard}</div>
        )}
        {phase === "ended" && (
          <div style={{ textAlign: "center", fontSize: 14, color: "#d1d5db", lineHeight: 1.5, marginTop: 8 }}>
            {talked ? "Want a written recap with the plan and next steps? It goes in your chat." : "Nothing was said on this call."}
          </div>
        )}
        {err && <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center" }}>⚠️ {err}</div>}
      </div>

      {phase !== "ended" && (
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, marginTop: 8, display: "flex", gap: 8 }}>
          <input value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === "Enter" && sendTyped()} placeholder="Type to her…" style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #374151", background: "#111827", color: "#f1f1f3", fontSize: 15 }} />
          <button onClick={sendTyped} disabled={!typed.trim() || phase === "thinking" || phase === "speaking"} style={{ padding: "10px 14px", borderRadius: 12, background: "#3b82f6", color: "white", border: "none", fontWeight: 600, cursor: "pointer" }}>Send</button>
        </div>
      )}
      {phase !== "ended" && (
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button role="switch" aria-checked={showText} onClick={() => setShowText(t => !t)} data-testid="velo-call-text"
            title="Text: show the conversation on screen" style={pill(showText)}>
            📝 Text{showText ? " · on" : ""}
          </button>
          {priv ? (
            <button onClick={togglePrivate} data-testid="velo-call-speaker" aria-label="Speaker"
              title="Speaker: switch from the earpiece to the speaker" style={{ ...pill(false), background: "#f1f1f3", color: "#0a0a0f", border: "1px solid #f1f1f3" }}>
              🔊 Speaker
            </button>
          ) : (
            <button role="switch" aria-checked={priv} onClick={togglePrivate} data-testid="velo-call-private"
              title="Private: like holding the phone to your ear — she keeps talking and the screen goes dark (tap to wake)" style={pill(priv)}>
              📱 Private
            </button>
          )}
          {volHint ? (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>🔊 Use your phone&apos;s volume buttons</div>
          ) : (
            <label style={{ flex: "1 1 140px", minWidth: 0, maxWidth: 260, display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
              <span aria-hidden>{vol === 0 ? "🔈" : "🔊"}</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(vol * 100)} data-testid="velo-call-volume"
                aria-label="Velo's voice volume" aria-valuetext={`${Math.round(vol * 100)}%`}
                onChange={e => changeVolume(Number(e.target.value) / 100)}
                style={{ flex: 1, minWidth: 0, accentColor: "#3b82f6" }} />
              <span style={{ fontSize: 12, color: "#9ca3af", width: 34, textAlign: "right" }}>{Math.round(vol * 100)}%</span>
            </label>
          )}
          {priv && (
            <div data-testid="velo-call-private-note" style={{ width: "100%", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
              {earpiece ? "Hold the phone to your ear — she's on the earpiece" : "Hold the phone to your ear — her voice is turned down"}
            </div>
          )}
        </div>
      )}

      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 26, alignItems: "center", marginTop: 16 }}>
        {phase === "ended" ? (<>
          {talked && <button onClick={saveRecap} disabled={saving} style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 12, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Writing recap…" : "📋 Save recap"}</button>}
          <button onClick={() => onEnd(null, turns)} disabled={saving} style={{ background: "transparent", color: "#d1d5db", border: "1px solid #374151", borderRadius: 12, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Close</button>
        </>) : (<>
          <button onClick={toggleMute} aria-label={muted.current ? "Unmute" : "Mute"} aria-pressed={muted.current} style={btn(muted.current ? "#4b5563" : "#1f2937")}>{muted.current ? "🔇" : "🎙️"}</button>
          <button onClick={hangUp} aria-label="End call" style={{ ...btn("#ef4444"), width: 72, height: 72, fontSize: 30 }}><span style={{ transform: "rotate(135deg)", display: "inline-block" }}>📞</span></button>
        </>)}
      </div>

      {dark && phase !== "ended" && (
        <div data-testid="velo-call-dark" aria-label="Screen dark — tap to wake" role="button"
          onClick={darkTap} onPointerDown={swallow} onPointerUp={swallow} onTouchStart={swallow} onTouchEnd={swallow} onContextMenu={swallow}
          style={{ position: "fixed", inset: 0, zIndex: 2001, background: "#000", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 14, color: wakeHint ? "#9ca3af" : "#4b5563", pointerEvents: "none", textAlign: "center", lineHeight: 1.6 }}>📞 On a call with Velo<br />Tap to wake</div>
        </div>
      )}
    </div>
  );
}
