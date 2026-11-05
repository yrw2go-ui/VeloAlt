"use client";
// 🎙️ Talk instead of typing in the chat: the phone's own speech-to-text fills
// the message box as you speak. Nothing is sent until you tap Send, so you can
// fix it first. Only the words go anywhere — never the recording.
import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;
const speechCtor = (): AnyRec => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: AnyRec; webkitSpeechRecognition?: AnyRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/** Dictation into a text box. `onText` gets the box's full text as you speak. */
export function useDictation(onText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<AnyRec>(null);
  useEffect(() => { setSupported(!!speechCtor()); return () => { try { rec.current?.abort(); } catch { /* fine */ } }; }, []);

  /** Starts listening; what they say is added after `before` (what was already typed). */
  const start = (before: string) => {
    const Ctor = speechCtor();
    if (!Ctor || rec.current) return;
    setError("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    const base = before.trim() ? before.trim() + " " : "";
    r.onresult = (e: AnyRec) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      onText((base + said.replace(/\s+/g, " ").trimStart()).slice(0, 4000));
    };
    r.onerror = (e: AnyRec) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") setError("Microphone is blocked — allow it for Velo in your browser settings.");
      else if (e?.error !== "no-speech" && e?.error !== "aborted") setError("Couldn't hear that — try again.");
    };
    r.onend = () => { if (rec.current === r) { rec.current = null; setListening(false); } };
    rec.current = r;
    try { r.start(); setListening(true); } catch { rec.current = null; }
  };

  const stop = () => {
    const r = rec.current;
    rec.current = null; setListening(false);
    try { r?.stop(); } catch { /* fine */ }
  };

  return { supported, listening, error, start, stop };
}
