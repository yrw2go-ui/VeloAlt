"use client";
// 🔔 Settings → Check-ins: let Velo and your characters text you first (push notifications).
// iPhone/iPad: works once Velo is added to the Home Screen and opened from there.
import { useEffect, useState } from "react";
import { api, data } from "./lib/api";
import type { Profile } from "./pro";

const b64ToBytes = (s: string) => { const p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(p), c => c.charCodeAt(0)); };
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

export default function CheckinsCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!supported()) { setOn(false); return; }
    navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription()).then(s => setOn(!!s)).catch(() => setOn(false));
  }, []);
  const level = profile.checkins || "sometimes";

  const turnOn = async () => {
    setBusy(true); setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setMsg("Notifications are blocked — allow them for Velo in your browser or phone settings."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await api("/api/push", { action: "subscribe", subscription: sub.toJSON() });
      if (level === "off") await data("profile.update", { checkins: "sometimes" });
      await api("/api/push", { action: "test" }).catch(() => {});
      setOn(true); onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't turn notifications on."); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true); setMsg("");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) { await api("/api/push", { action: "unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setOn(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't turn them off."); }
    finally { setBusy(false); }
  };
  const pick = async (v: string) => { await data("profile.update", { checkins: v }).catch(() => {}); onChange(); };

  return (
    <div className="card" data-testid="checkins">
      <div style={{ fontWeight: 700 }}>🔔 Check-ins</div>
      <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Velo and your characters can text you first now and then — a notification on your phone, in their own voice. Never at night (9pm–9am), and not while you&apos;re chatting.</div>
      {!supported() ? (
        <div className="muted" style={{ fontSize: 13 }}>{isIOS() && !standalone() ? "On iPhone/iPad: tap Share → Add to Home Screen, open Velo from there, then turn this on." : "This browser can't show notifications."}</div>
      ) : on ? (
        <>
          <div role="radiogroup" aria-label="How often" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([["off", "Off"], ["sometimes", "Sometimes · ~once a day"], ["often", "Often · ~twice a day"]] as const).map(([id, label]) => {
              const sel = id === level;
              return <button key={id} role="radio" aria-checked={sel} onClick={() => !sel && pick(id)} style={{ background: sel ? "rgba(124,140,255,0.12)" : "var(--surface2)", border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`, borderRadius: 999, padding: "8px 14px", color: "var(--text)", fontWeight: 700, cursor: sel ? "default" : "pointer" }}>{sel ? "✓ " : ""}{label}</button>;
            })}
          </div>
          <button className="ghost" disabled={busy} onClick={turnOff} style={{ marginTop: 10, padding: "6px 12px", fontSize: 13 }}>Turn off notifications on this device</button>
        </>
      ) : (
        <button className="btn" disabled={busy || on === null} onClick={turnOn} data-testid="checkins-on">{busy ? "…" : "Turn on notifications"}</button>
      )}
      {msg && <div style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>⚠️ {msg}</div>}
    </div>
  );
}
