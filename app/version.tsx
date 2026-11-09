"use client";
// 🏷️ Bottom of Settings: which version of Velo this is, when it was updated, and an Update button
// that checks for a newer version and loads it. The app also checks on its own every 2 hours.
import { useEffect, useState } from "react";

const ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); };

/** Loads the newest version: refresh the service worker, then reload the page. */
async function applyUpdate() {
  await navigator.serviceWorker?.getRegistration().then(reg => reg?.update()).catch(() => {});
  location.reload();
}

// ⏰ Velo checks for a newer version when it opens, every 2 hours, and when you come back to it after 2+ hours.
export const UPDATE_EVERY = 2 * 60 * 60 * 1000;
export function UpdateBanner() {
  const [live, setLive] = useState<{ id: string; time: string | null } | null>(null);
  const [later, setLater] = useState(false);
  useEffect(() => {
    let last = 0;
    const run = () => {
      last = Date.now();
      fetch("/api/version", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(v => { if (v?.id) { setLive(v); setLater(false); } }).catch(() => {});
    };
    run();
    const t = setInterval(run, UPDATE_EVERY);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - last >= UPDATE_EVERY) run(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, []);
  if (!live || live.id === ID || later) return null;
  return (
    <div data-testid="update-banner" className="row" style={{ padding: "8px 16px", gap: 10, background: "rgba(124,140,255,0.15)", borderBottom: "1px solid var(--accent)", fontSize: 14 }}>
      <span style={{ flex: 1 }}>✨ A new version of Velo is ready{live.time ? ` (${when(live.time)})` : ""}.</span>
      <button className="btn" onClick={applyUpdate} data-testid="update-now" style={{ padding: "6px 14px" }}>Update</button>
      <button className="ghost" onClick={() => setLater(true)} data-testid="update-later" style={{ padding: "6px 10px" }}>Later</button>
    </div>
  );
}

export function VersionCard() {
  const [live, setLive] = useState<{ id: string; time: string | null } | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "latest" | "error">("idle");
  const check = async () => {
    const r = await fetch("/api/version", { cache: "no-store" });
    if (!r.ok) throw new Error("check failed");
    const v = (await r.json()) as { id: string; time: string | null };
    setLive(v);
    return v;
  };
  useEffect(() => { check().catch(() => {}); }, []);
  const newer = !!live && live.id !== ID;
  const update = async () => {
    setState("checking");
    try {
      const v = await check();
      if (v.id === ID) { setState("latest"); return; }
      await applyUpdate();
    } catch { setState("error"); }
  };
  return (
    <div data-testid="version-card" className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>Velo version <span data-testid="version-id" style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{ID}</span></div>
          <div className="muted" style={{ fontSize: 13 }} data-testid="version-time">{TIME ? `Updated ${when(TIME)}` : "Local build"}</div>
        </div>
        <button className={newer ? "btn" : "ghost"} onClick={update} disabled={state === "checking"} data-testid="version-update" style={{ flexShrink: 0 }}>
          {state === "checking" ? "Checking…" : newer ? "Update now" : "Update"}
        </button>
      </div>
      {newer && <div data-testid="version-new" style={{ fontSize: 13, color: "var(--accent)" }}>✨ A newer version is ready{live?.time ? ` (${when(live.time)})` : ""} — tap Update now.</div>}
      {state === "latest" && <div data-testid="version-latest" className="muted" style={{ fontSize: 13 }}>✓ You&apos;re on the latest version.</div>}
      {state === "error" && <div style={{ fontSize: 13, color: "var(--bad)" }}>⚠️ Couldn&apos;t check right now — try again in a moment.</div>}
    </div>
  );
}
