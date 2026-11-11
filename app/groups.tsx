"use client";
// 👥 Group chats: you and 2–6 characters in one thread. Each one answers as herself and keeps her own
// memory of it. Characters who didn't know each other meet here and get closer the more you all chat.
import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { hideSecrets } from "./lib/secrets";
import { timeZone } from "./lib/tz";
import { confirmAsk } from "./lib/dialog";
import { CharacterFace, type Character } from "./characters";
import { SceneSheet, type SceneClockChoice } from "./chat";
import { MediaView, ReactionBar, type Media } from "./media";

export type Group = { id: string; title: string; member_ids: string[]; updated_at: string; scene_title?: string | null; scene_details?: string | null; in_person_place?: string | null };
type Msg = { id: string; speaker_id: string | null; content: string; created_at: string; pending?: boolean; peek?: boolean; media?: Media | null; reaction?: string | null; their_reactions?: Record<string, string>; private_to?: string | null };
const PEEK = /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i;

/** Up to three faces, overlapping, for a group's chip. */
export function GroupFaces({ g, chars, size }: { g: Group; chars: Character[]; size: number }) {
  const list = (g.member_ids || []).map(id => chars.find(c => c.id === id)).filter((c): c is Character => !!c).slice(0, 3);
  return <span style={{ display: "flex" }}>{list.map((c, i) => <span key={c.id} style={{ marginLeft: i ? -size * 0.4 : 0, borderRadius: "50%", border: "2px solid var(--surface2)" }}><CharacterFace c={c} size={size} /></span>)}</span>;
}

export function GroupChat({ group: initial, chars, name, onDeleted }: { group: Group; chars: Character[]; name: string; onDeleted: (id: string) => void }) {
  const [group, setGroup] = useState(initial);
  const [sceneSheet, setSceneSheet] = useState(false);
  const [peek, setPeek] = useState(false);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const unsaved = useRef(0);
  // 💬 The characters talking among themselves now and then; anything they send stops it.
  const run = useRef(0);
  const [chatting, setChatting] = useState(false);
  const banter = async () => {
    const me = ++run.current;
    setChatting(true);
    try {
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
        if (run.current !== me) return;
        const r = await api<{ message: Msg | null; more: boolean }>("/api/groups", { action: "banter", id: group.id, timeZone: timeZone(), name });
        if (run.current !== me) return;
        if (r.message) { setMsgs(m => [...(m || []), r.message!]); unsaved.current++; }
        if (!r.more) break;
      }
    } catch { /* they'll pick it up next time */ }
    finally { if (run.current === me) setChatting(false); }
  };
  useEffect(() => () => { run.current++; }, []);
  const log = useRef<HTMLDivElement>(null);
  const members = (group.member_ids || []).map(id => chars.find(c => c.id === id)).filter((c): c is Character => !!c);
  const byId = new Map(members.map(c => [c.id, c]));

  useEffect(() => {
    api<{ messages: Msg[] }>("/api/groups", { action: "messages", id: group.id }).then(r => setMsgs(Array.isArray(r.messages) ? r.messages : [])).catch(e => { setMsgs([]); setErr(e instanceof Error ? e.message : "Couldn't load the group."); });
  }, [group.id]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, busy]);

  // 🧠 Leaving the group chat: each character saves her own memory of it.
  useEffect(() => {
    const memo = () => {
      if (unsaved.current < 1) return;
      unsaved.current = 0;
      api("/api/groups", { action: "memo", id: group.id, timeZone: timeZone(), name }).catch(() => {});
    };
    const onHide = () => { if (document.visibilityState === "hidden") memo(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); memo(); };
  }, [group.id, name]);

  const send = async () => {
    // 🔒 Passwords and codes are hidden right here, before anything leaves the phone.
    const t = hideSecrets(text.trim()).text;
    if (!t || busy || !msgs) return;
    // 👀 "*peek*" in a scene: pick who's in it, check the description, then it's made. Nobody knows.
    if (group.scene_title && PEEK.test(t)) { setText(""); setPeek(true); return; }
    // 👁️ "ICU" when you're all together in person: the same pop-up.
    if (/^\s*\*?\s*icu\s*\*?\s*[.!]?\s*$/i.test(t)) {
      if (group.in_person_place == null || group.scene_title) { setErr("ICU works when you're all together in person."); return; }
      setText(""); setPeek(true); return;
    }
    run.current++; setChatting(false);
    const at = t.match(/^\s*@([\p{L}\p{N}'’._-]+)[\s,:]+([\s\S]+)$/u);
    const tag = at?.[1].toLowerCase().replace(/[._-]+$/, "");
    const to = tag ? members.find(c => c.name.toLowerCase() === tag || c.name.toLowerCase().split(/\s+/)[0] === tag || c.name.toLowerCase().replace(/\s+/g, "") === tag) : undefined;
    if (at && !to) { setErr(`No one called @${at[1]} is in this group.`); return; }
    const mine: Msg = { id: `tmp-${Date.now()}`, speaker_id: null, content: to ? at![2].trim() : t, created_at: new Date().toISOString(), pending: true, ...(to ? { private_to: to.id } : {}) };
    setMsgs(m => [...(m || []), mine]); setText(""); setBusy(true); setErr("");
    try {
      const r = await api<{ replies: Msg[]; banter?: boolean; mine?: { id: string; their_reactions: Record<string, string>; private_to?: string } }>("/api/groups", { action: "send", id: group.id, text: t, timeZone: timeZone(), name });
      const replies = Array.isArray(r.replies) ? r.replies : [];
      setMsgs(m => [...(m || []).map(x => (x === mine ? { ...x, pending: false, ...(r.mine ? { id: r.mine.id, their_reactions: r.mine.their_reactions, private_to: r.mine.private_to } : {}) } : x)), ...replies]);
      unsaved.current++;
      if (r.banter) banter();
    } catch (e) { setErr(e instanceof Error ? e.message : "No one answered."); }
    setBusy(false);
  };
  const startScene = async (kind: "live" | "past", title: string, details: string, clock?: SceneClockChoice) => {
    const r = await api<{ marker: Msg; group: Group }>("/api/groups", { action: "scene.start", id: group.id, kind, title, details, ...(clock || {}) });
    setGroup(r.group); setMsgs(m => [...(m || []), r.marker]); setSceneSheet(false); unsaved.current++;
  };
  const endScene = async () => {
    if (!(await confirmAsk(`End the scene "${group.scene_title}"? It'll become a memory you all share.`, { yes: "End scene" }))) return;
    try { const r = await api<{ marker: Msg | null }>("/api/groups", { action: "scene.end", id: group.id }); setGroup(g => ({ ...g, scene_title: null, scene_details: null })); if (r.marker) setMsgs(m => [...(m || []), r.marker!]); unsaved.current++; }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't end it."); }
  };
  // 🧍 Everyone heads off: back to a group text.
  const endTogether = async () => {
    try { const r = await api<{ marker: Msg | null }>("/api/groups", { action: "inperson.end", id: group.id }); setGroup(g => ({ ...g, in_person_place: null })); if (r.marker) setMsgs(m => [...(m || []), r.marker!]); unsaved.current++; }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't end it."); }
  };
  // 😮 Tap one of their messages to react (tap the same reaction again to take it back).
  const [picking, setPicking] = useState<string | null>(null);
  const react = async (id: string, emoji: string) => {
    const cur = (msgs || []).find(x => x.id === id);
    const next = cur?.reaction === emoji ? null : emoji;
    const set = (r: string | null) => setMsgs(list => (list || []).map(x => (x.id === id ? { ...x, reaction: r } : x)));
    set(next); setPicking(null);
    try { await api("/api/groups", { action: "react", id: group.id, msgId: id, reaction: next }); unsaved.current++; } catch { set(cur?.reaction || null); }
  };
  const remove = async () => {
    if (!(await confirmAsk(`Delete the group "${group.title}"? Are you sure? The group's messages are deleted (what each of them remembers stays).`))) return;
    try { await api("/api/groups", { action: "delete", id: group.id }); onDeleted(group.id); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete it."); }
  };

  return (
    <div data-testid="group-chat" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <GroupFaces g={group} chars={chars} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.title}</div>
          <div className="muted" style={{ fontSize: 11 }}>{members.map(c => c.name).join(", ")} &amp; you · each remembers it in her own way</div>
        </div>
        <button className="ghost" onClick={remove} aria-label="Delete group" data-testid="group-delete" style={{ padding: "4px 10px", color: "var(--bad)" }}>🗑</button>
      </div>
      {group.scene_title && (
        <div data-testid="group-scene-banner" className="row" style={{ padding: "6px 12px", gap: 8, background: "rgba(124,140,255,0.12)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <span style={{ flex: 1 }}>🎬 <b>{group.scene_title}</b> <span className="muted">· say *peek* to see the moment</span></span>
          <button className="ghost" onClick={endScene} data-testid="group-scene-end" style={{ padding: "2px 10px", fontSize: 12 }}>End</button>
        </div>
      )}
      {!group.scene_title && group.in_person_place != null && (
        <div data-testid="group-inperson-banner" className="row" style={{ padding: "6px 12px", gap: 8, background: "linear-gradient(90deg, rgba(16,185,129,.16), rgba(124,140,255,.12))", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🧍 <b>Together in person</b>{group.in_person_place ? <span className="muted"> · {group.in_person_place}</span> : null}</span>
          <button type="button" className="ghost" onClick={() => setPeek(true)} aria-label="ICU" data-testid="group-icu-open" style={{ padding: "2px 10px", fontSize: 14 }}>👁️</button>
          <button className="ghost" onClick={endTogether} data-testid="group-inperson-end" style={{ padding: "2px 10px", fontSize: 12 }}>Leave</button>
        </div>
      )}
      <div ref={log} data-testid="group-log" style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs && !msgs.length && <div className="muted" style={{ textAlign: "center", fontSize: 14, marginTop: 24 }}>Say hi to everyone 👋<br /><span style={{ fontSize: 12 }}>Mention someone by name to hear from her, or say &quot;you guys&quot; for everyone.</span></div>}
        {(msgs || []).map(m => {
          const c = m.speaker_id ? byId.get(m.speaker_id) : null;
          if (m.peek && m.media) return (
            <div key={m.id} data-testid="group-peek-media" style={{ alignSelf: "center", maxWidth: "85%", display: "flex", flexDirection: "column", gap: 4 }}>
              <MediaView media={m.media} who={group.title} />
              <div className="muted" style={{ fontSize: 11, textAlign: "center" }}>👀 Peek · they don&apos;t know</div>
            </div>
          );
          if (m.peek) return <div key={m.id} className="muted" style={{ alignSelf: "flex-end", fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px dashed var(--border)" }}>👀 you peeked</div>;
          if (!m.speaker_id && (m.content.startsWith("🎬") || m.content.startsWith("🧍"))) return <div key={m.id} data-testid="group-scene-note" className="muted" style={{ alignSelf: "center", maxWidth: "90%", textAlign: "center", fontSize: 12, padding: "6px 12px", borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--border)" }}>{typeof m.content === "string" ? m.content : ""}</div>;
          if (!m.speaker_id) return (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              {m.private_to && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Private · @{byId.get(m.private_to)?.name || "someone"}</div>}
              <div style={{ padding: "10px 14px", borderRadius: 18, background: m.private_to ? "var(--surface)" : "linear-gradient(135deg, var(--accent), var(--accent2))", border: m.private_to ? "1.5px dashed var(--accent)" : undefined, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 15, opacity: m.pending ? 0.75 : 1 }}>{typeof m.content === "string" ? m.content : ""}</div>
              {Object.keys(m.their_reactions || {}).length > 0 && (
                <div data-testid="group-their-reactions" style={{ display: "flex", gap: 4 }}>
                  {Object.entries(m.their_reactions || {}).map(([id, e]) => (
                    <span key={id} title={`${byId.get(id)?.name || "Someone"} reacted`} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13, padding: "2px 6px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      {typeof e === "string" ? e : ""}{byId.get(id) && <CharacterFace c={byId.get(id)!} size={14} />}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
          return (
            <div key={m.id} data-testid="group-reply" className="row" style={{ alignItems: "flex-end", gap: 8, maxWidth: "85%" }}>
              {c ? <CharacterFace c={c} size={28} /> : <span style={{ width: 28 }} />}
              <div>
                <div className="muted" style={{ fontSize: 11, fontWeight: 700, margin: "0 0 2px 6px" }}>{c?.name || "Someone"}{m.private_to ? <span> · Private, to you</span> : null}</div>
                <div onClick={() => setPicking(p => (p === m.id ? null : m.id))} style={{ position: "relative", cursor: "pointer", padding: "10px 14px", borderRadius: 18, background: "var(--surface2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 15, lineHeight: 1.45 }}>
                  {typeof m.content === "string" ? m.content : ""}
                  {typeof m.reaction === "string" && m.reaction && <span data-testid="group-reaction" style={{ position: "absolute", bottom: -12, right: -6, fontSize: 15, lineHeight: 1, padding: "3px 5px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)" }}>{m.reaction}</span>}
                </div>
                {picking === m.id && <ReactionBar value={m.reaction} onPick={r => react(m.id, r)} />}
              </div>
            </div>
          );
        })}
        {(busy || chatting) && <div className="muted" style={{ fontSize: 14 }} data-testid={chatting && !busy ? "group-banter-typing" : undefined}>💬 typing…{chatting && !busy ? <span style={{ fontSize: 12 }}> (they&apos;re chatting — jump in anytime)</span> : null}</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 14 }}>⚠️ {err}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "6px 12px 0", flexWrap: "wrap" }}>
        {members.map(c => (
          <button key={c.id} type="button" onClick={() => setText(t => t.startsWith(`@${c.name}`) ? t : `@${c.name} `)}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>
            @{c.name.split(" ")[0]}
          </button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }} className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        {!group.scene_title && <button type="button" onClick={() => setSceneSheet(true)} disabled={!msgs || busy} aria-label="Start a scene" data-testid="group-scene-open"
          style={{ borderRadius: 999, width: 36, height: 46, padding: 0, flexShrink: 0, cursor: "pointer", fontSize: 19, border: "none", background: "transparent", color: "var(--muted)" }}>🎬</button>}
        <textarea rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={msgs ? `Message ${group.title}…` : "Loading…"} aria-label="Message the group" disabled={!msgs}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} style={{ resize: "none", maxHeight: 140, borderRadius: 20 }} />
        <button className="btn" disabled={!text.trim() || busy || !msgs} style={{ borderRadius: 999, padding: "10px 16px" }}>Send</button>
      </form>
      {sceneSheet && <SceneSheet who={members.map(c => c.name).join(" & ")} onClose={() => setSceneSheet(false)} onStart={startScene} />}
      {peek && <GroupPeekSheet group={group} members={members} name={name} onClose={() => setPeek(false)} onMade={added => { setMsgs(m => [...(m || []), ...added]); setPeek(false); }} />}
    </div>
  );
}

/** Pick 2–6 characters (and an optional name) for a new group. */
export function GroupMaker({ chars, name, onClose, onMade }: { chars: Character[]; name: string; onClose: () => void; onMade: (g: Group) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (id: string) => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 6 ? p : [...p, id]));
  const make = async () => {
    setBusy(true); setErr("");
    try { onMade((await api<{ group: Group }>("/api/groups", { action: "create", memberIds: pick, title, name })).group); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make the group."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="group-maker" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>👥 New group chat</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Pick 2–6 characters. Anyone who doesn&apos;t know each other yet meets here and starts as an acquaintance; the more you all chat, the closer they get.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chars.map(c => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={pick.includes(c.id)} data-testid={`group-pick-${c.name}`}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--text)",
                border: `1px solid ${pick.includes(c.id) ? "var(--accent)" : "var(--border)"}`, background: pick.includes(c.id) ? "rgba(124,140,255,0.15)" : "var(--surface2)" }}>
              <CharacterFace c={c} size={26} /> {c.name}{pick.includes(c.id) ? " ✓" : ""}
            </button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Group name (optional)" aria-label="Group name" />
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" disabled={pick.length < 2 || busy} onClick={make} data-testid="group-create">{busy ? "Introducing everyone…" : `Start group${pick.length ? ` (${pick.length})` : ""}`}</button>
      </div>
    </div>
  );
}

/** 👀 Peek in a group scene: pick who's in the picture (one or more), check the description, then it's made. */
function GroupPeekSheet({ group, members, name, onClose, onMade }: { group: Group; members: Character[]; name: string; onClose: () => void; onMade: (added: Msg[]) => void }) {
  const [ids, setIds] = useState<string[]>(members.map(c => c.id));
  const [desc, setDesc] = useState("");
  const [forIds, setForIds] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const draft = async (pick: string[]) => {
    if (!pick.length) return;
    setLoading(true); setErr("");
    try { setDesc((await api<{ description: string }>("/api/groups", { action: "peek.draft", id: group.id, ids: pick, name })).description); setForIds(pick.join()); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't peek right now."); }
    setLoading(false);
  };
  useEffect(() => { draft(members.map(c => c.id)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setIds(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const stale = !!desc && forIds !== ids.join();
  const go = async () => {
    setLoading(true); setErr("");
    try { onMade((await api<{ added: Msg[] }>("/api/groups", { action: "peek", id: group.id, ids, description: desc })).added); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make it."); setLoading(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="group-peek-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>👀 Peek</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Who&apos;s in the picture? Then fix anything that&apos;s off in the description. Nobody knows you peeked.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {members.map(c => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={ids.includes(c.id)} data-testid={`peek-who-${c.name}`}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--text)",
                border: `1px solid ${ids.includes(c.id) ? "var(--accent)" : "var(--border)"}`, background: ids.includes(c.id) ? "rgba(124,140,255,0.15)" : "var(--surface2)" }}>
              <CharacterFace c={c} size={24} /> {c.name}{ids.includes(c.id) ? " ✓" : ""}
            </button>
          ))}
        </div>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={1500} rows={5} aria-label="Peek description" disabled={loading && !desc}
          placeholder={loading ? "Writing what you'd see…" : "What you see right now"} style={{ resize: "vertical" }} />
        {stale && <button className="ghost" onClick={() => draft(ids)} disabled={loading || !ids.length} data-testid="peek-rewrite">✍️ Rewrite for {members.filter(c => ids.includes(c.id)).map(c => c.name).join(" & ") || "…"}</button>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" onClick={go} disabled={loading || !ids.length || desc.trim().length < 10} data-testid="peek-go">{loading ? "…" : "👀 Peek"}</button>
      </div>
    </div>
  );
}
