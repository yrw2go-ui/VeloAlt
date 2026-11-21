"use client";
// 📸 Picagram: everyone's posts, newest first, a few at a time as you scroll. Like, comment, and post your own.
import { useCallback, useEffect, useRef, useState } from "react";
import { readPlace, savePlace } from "./lib/place";
import { useBack } from "./lib/back";
import { api, data, uploadFile, uploadPicaPicture } from "./lib/api";
import { hideSecrets } from "./lib/secrets";
import { noJargon } from "./lib/text";
import { MediaView, useSwipeNav, SwipeArrow, type Media } from "./media";
import { EditSheet } from "./edit";
import { MentionPicker, putName } from "./mention";
import { StarButton, tapStar } from "./star";
import { claimsMedia } from "./lib/mediaWords";
import { RedoSheet } from "./redo";
import { TraitSliders } from "./characters";
import { Selectable } from "./chat";
import { cleanTraits, DEFAULT_TRAITS, type TraitKey } from "./lib/traits";
import { stamp } from "./lib/when";
import { confirmAsk } from "./lib/dialog";

type Comment = { id: string; who: string; me: boolean; known: boolean; text: string; created_at: string };
type Post = { id: string; saved: boolean; author: { id: string | null; name: string; portrait: string | null; away: string | null; account?: { id: string; handle: string; followed: boolean } }; kind: "image" | "text"; caption: string; media: Media | null; likes: number; liked: boolean; liked_by: string[]; comments: number; preview: Comment[]; created_at: string; all?: Comment[] };

/** 🕒 When it went up / was sent — small and quiet. */
const When = ({ at, align }: { at?: string; align?: "left" | "right" | "center" }) => {
  const t = stamp(at);
  return t ? <div data-testid="when" style={{ fontSize: 10, lineHeight: 1.6, opacity: 0.55, color: "var(--text)", padding: "2px 2px 0", textAlign: align || "left" }}>{t}</div> : null;
};

const ago = (at: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const GRADS = ["linear-gradient(135deg,#7c8cff,#ec4899)", "linear-gradient(135deg,#f59e0b,#ec4899)", "linear-gradient(135deg,#10b981,#3b82f6)", "linear-gradient(135deg,#8b5cf6,#06b6d4)", "linear-gradient(135deg,#ef4444,#f59e0b)"];

function Avatar({ name, url, size = 34 }: { name: string; url: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={name} width={size} height={size} loading="lazy" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top", flexShrink: 0, border: "2px solid #ec4899" }} />;
  return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: GRADS[0], color: "#fff", fontWeight: 800, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</span>;
}

export default function Picagram({ name, userId, onChat, openProfile, onProfileOpened, openDm, onDmOpened }: { name: string; userId?: string; onChat?: (characterId: string) => void; openProfile?: string | null; onProfileOpened?: () => void; openDm?: string | null; onDmOpened?: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  // 📍 Back where you were: a refresh (or an update) keeps the screen you had open.
  const [place] = useState(() => (typeof window === "undefined" || !userId ? {} : readPlace(userId).pica || {}));
  const [profile, setProfile] = useState<string | null>(openProfile || place.profile || null);
  useEffect(() => { if (openProfile) { setProfile(openProfile); onProfileOpened?.(); } }, [openProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savedOpen, setSavedOpen] = useState(!!place.saved);
  const [making, setMaking] = useState(false);
  const [mine, setMine] = useState(!!place.mine);
  const [followingOpen, setFollowingOpen] = useState(!!place.following);
  // ✉️ DMs with accounts (characters chat in the normal chat).
  const [inbox, setInbox] = useState(!!place.inbox);
  const [thread, setThread] = useState<string | null>(openDm || place.thread || null);
  // ✉️ Sent here by a notification about a DM: her thread, not wherever you last were.
  useEffect(() => { if (openDm) { setThread(openDm); setInbox(false); setProfile(null); onDmOpened?.(); } }, [openDm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dmUnread, setDmUnread] = useState(0);
  useEffect(() => {
    if (userId) savePlace(userId, { pica: { inbox, thread, profile, following: followingOpen, saved: savedOpen, mine } });
  }, [userId, inbox, thread, profile, followingOpen, savedOpen, mine]);
  useEffect(() => {
    const tick = () => api<{ dms?: number }>("/api/pica", { action: "new" }).then(r => setDmUnread(r.dms || 0)).catch(() => {});
    tick(); const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [thread, inbox]);
  const [note, setNote] = useState("");
  const setFollowed = (acc: string, on: boolean) => setPosts(ps => (ps || []).map(x => (x.author.account?.id === acc ? { ...x, author: { ...x.author, account: { ...x.author.account!, followed: on } } } : x)));
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (fresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setErr("");
    try {
      const before = fresh ? null : posts?.at(-1)?.created_at || null;
      const r = await api<{ posts: Post[] }>("/api/pica", { action: "feed", before });
      setPosts(p => (fresh || !p ? r.posts : [...p, ...r.posts.filter(x => !p.some(y => y.id === x.id))]));
      setMore(r.posts.length >= 6);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load Picagram."); }
    loadingRef.current = false; setLoading(false);
  }, [posts]);

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 🆕 Newer posts slide in at the top while you're here (newest first, above your own if they're more recent).
  const newestRef = useRef<string | null>(null);
  newestRef.current = posts?.[0]?.created_at || null;
  useEffect(() => {
    const t = setInterval(async () => {
      if (!newestRef.current || document.visibilityState !== "visible") return;
      const r = await api<{ posts: Post[] }>("/api/pica", { action: "newer", after: newestRef.current }).catch(() => null);
      if (r?.posts.length) setPosts(p => [...r.posts.filter(x => !(p || []).some(y => y.id === x.id)), ...(p || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }, 20000);
    return () => clearInterval(t);
  }, []);
  // ♾️ Load more as you get near the bottom.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) load(); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load, more, posts?.length]);

  // 👀 What you've scrolled past: they know you saw it.
  const seenQ = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => {
      const ids = [...seenQ.current].filter(x => !sent.current.has(x));
      if (!ids.length) return;
      ids.forEach(x => sent.current.add(x)); seenQ.current.clear();
      api("/api/pica", { action: "seen", ids }).catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, []);
  const seenObs = useRef<IntersectionObserver | null>(null);
  if (!seenObs.current && typeof IntersectionObserver !== "undefined") {
    seenObs.current = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) seenQ.current.add((e.target as HTMLElement).dataset.post || ""); }), { threshold: 0.5 });
  }

  const update = (id: string, f: (p: Post) => Post) => setPosts(ps => (ps || []).map(p => (p.id === id ? f(p) : p)));

  return (
    <div data-testid="picagram" style={{ maxWidth: "100%", width: "100%", minWidth: 0, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "10px 14px", position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 24, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, background: "linear-gradient(90deg,#f59e0b,#ec4899,#8b5cf6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Picagram</div>
        <button className="ghost" onClick={() => setInbox(true)} aria-label="Messages" data-testid="pica-inbox-open" style={{ padding: "6px 10px", position: "relative" }}>✉️
          {dmUnread > 0 && <span data-testid="pica-dm-badge" style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: "16px" }}>{dmUnread}</span>}
        </button>
        <button className="ghost" onClick={() => setFollowingOpen(true)} aria-label="Following" data-testid="pica-following-open" style={{ padding: "6px 10px" }}>👥</button>
        <button className="ghost" onClick={() => setMine(true)} aria-label="My profile" data-testid="pica-me-open" style={{ padding: "6px 10px" }}>🙋</button>
        <button className="ghost" onClick={() => setMaking(true)} aria-label="Make someone" data-testid="pica-make-open" style={{ padding: "6px 10px" }}>👩</button>
        <button className="ghost" onClick={() => setSavedOpen(true)} aria-label="Saved pictures" data-testid="pica-saved-open" style={{ padding: "6px 10px" }}>🔖</button>
        <button className="ghost" onClick={() => load(true)} disabled={loading} aria-label="Refresh" style={{ padding: "6px 10px" }}>↻</button>
        <button className="btn" onClick={() => setComposing(true)} data-testid="pica-new" style={{ padding: "8px 14px" }}>＋ Post</button>
      </div>
      {posts && !posts.length && !loading && <div className="muted" style={{ textAlign: "center", padding: 32 }}>No posts yet — check back soon 📸</div>}
      {note && (() => { const good = note.startsWith("✨"); return (
        <div data-testid="pica-note" onClick={() => setNote("")} style={{ margin: "8px 14px", padding: "10px 12px", borderRadius: 12, fontSize: 13, cursor: "pointer",
          background: good ? "rgba(236,72,153,.14)" : "rgba(245,158,11,.15)", border: `1px solid ${good ? "rgba(236,72,153,.4)" : "rgba(245,158,11,.4)"}` }}>{good ? "" : "⚠️ "}{note}</div>
      ); })()}
      {(posts || []).map(p => <PostCard key={p.id} p={p} me={name} obs={seenObs.current} onChange={f => update(p.id, f)} onProfile={setProfile} onFollow={setFollowed} onNote={setNote} onRemoved={id => setPosts(ps => (ps || []).filter(x => x.id !== id))} />)}
      <div ref={sentinel} style={{ height: 1 }} />
      {loading && <div className="muted" style={{ textAlign: "center", padding: 18 }} data-testid="pica-loading">Loading…</div>}
      {!more && posts && posts.length > 0 && <div className="muted" style={{ textAlign: "center", padding: 18, fontSize: 13 }}>You&apos;re all caught up ✨</div>}
      {err && <div style={{ color: "var(--bad)", padding: 14 }}>⚠️ {err}</div>}
      {profile && <Profile id={profile} onClose={() => setProfile(null)} onFollow={setFollowed} onChat={onChat} onMessage={id => { setProfile(null); setThread(id); }} onDeleted={id => setPosts(ps => (ps || []).filter(p => p.author.account?.id !== id))} />}
      {inbox && <Inbox onClose={() => setInbox(false)} onOpen={id => setThread(id)} />}
      {thread && <Thread id={thread} onClose={() => setThread(null)} onProfile={id => { setThread(null); setInbox(false); setProfile(id); }} />}
      {followingOpen && <Following onClose={() => setFollowingOpen(false)} onUnfollow={acc => setFollowed(acc, false)} onOpen={id => { setFollowingOpen(false); setProfile(id); }}
        onNewFaces={(names, error) => { setFollowingOpen(false); setNote(error ? `✨ ${names.join(", ")} just posted. ${error}` : `✨ ${names.join(", ")} just posted — have a look.`); load(true); }} />}
      {savedOpen && <Saved onClose={() => setSavedOpen(false)} />}
      {composing && <Composer onClose={() => setComposing(false)} onPosted={() => { setComposing(false); load(true); }} />}
      {mine && <MyProfile name={name} onClose={() => setMine(false)} />}
      {making && <MakeHer onClose={() => setMaking(false)} onMade={id => { setMaking(false); load(true); setProfile(id); }} />}
    </div>
  );
}

function PostCard({ p, me, obs, onChange, onProfile, onFollow, onNote, onRemoved }: { p: Post; me: string; obs: IntersectionObserver | null; onChange: (f: (p: Post) => Post) => void; onProfile: (id: string) => void; onFollow: (account: string, on: boolean) => void; onNote: (t: string) => void; onRemoved: (id: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const el = ref.current; if (el && obs) { obs.observe(el); return () => obs.unobserve(el); } }, [obs]);
  // ❤️ A fresh post: likes (and comments) keep trickling in while you watch.
  useEffect(() => {
    if (Date.now() - Date.parse(p.created_at) > 30 * 60_000) return;
    const t = setInterval(async () => {
      if (Date.now() - Date.parse(p.created_at) > 30 * 60_000) { clearInterval(t); return; }
      const r = await api<{ counts: { id: string; likes: number; liked_by: string[]; comments: number }[] }>("/api/pica", { action: "counts", ids: [p.id] }).catch(() => null);
      const c = r?.counts[0];
      if (c) onChange(x => ({ ...x, likes: c.likes, liked_by: c.liked_by, comments: Math.max(x.comments, c.comments) }));
    }, 5000);
    return () => clearInterval(t);
  }, [p.id, p.created_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const like = async () => {
    const on = !p.liked;
    onChange(x => ({ ...x, liked: on, likes: x.likes + (on ? 1 : -1) }));
    await api("/api/pica", { action: "like", id: p.id, on }).catch(() => onChange(x => ({ ...x, liked: !on, likes: x.likes + (on ? -1 : 1) })));
  };
  const showAll = async () => {
    setOpen(true);
    const r = await api<{ comments: Comment[] }>("/api/pica", { action: "comments", id: p.id }).catch(() => null);
    if (r) onChange(x => ({ ...x, all: r.comments, comments: r.comments.length }));
  };
  const send = async () => {
    const t = hideSecrets(text.trim()).text;
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await api<{ added: Comment[] }>("/api/pica", { action: "comment", id: p.id, text: t });
      setText("");
      onChange(x => ({ ...x, all: [...[...r.added].reverse(), ...(x.all || x.preview)], comments: x.comments + r.added.length }));
      setOpen(true);
    } catch { /* keep the text to retry */ }
    setBusy(false);
  };
  const list = open && p.all ? p.all : p.preview;
  // 🗑 Your own post: delete it (asks first).
  const remove = async (picture: boolean) => {
    setAsk(false);
    try { await api("/api/pica", { action: "delete", id: p.id, picture }); onRemoved(p.id); } catch { /* still there */ }
  };
  // 👆 Press and hold a post to take it down. On a picture the phone wants to do its own thing, so
  // the menu opens on a long press and the phone's own one is waved off.
  const [ask, setAsk] = useState(false);
  const held = useRef<ReturnType<typeof setTimeout> | null>(null);
  const letGo = () => { if (held.current) clearTimeout(held.current); held.current = null; };
  const hold = {
    onPointerDown: () => { letGo(); held.current = setTimeout(() => setAsk(true), 550); },
    onPointerUp: letGo, onPointerLeave: letGo, onPointerCancel: letGo,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setAsk(true); },
  };
  const acc = p.author.account;
  const follow = async () => { if (!acc) return; const on = !acc.followed; onFollow(acc.id, on); await api("/api/pica", { action: "follow", id: acc.id, on }).catch(e => { onFollow(acc.id, !on); onNote(e instanceof Error ? e.message : "Couldn't follow."); }); };
  const save = async () => { if (!p.media) return; const on = !p.saved; onChange(x => ({ ...x, saved: on })); await api("/api/pica", { action: "save", id: p.media.id, on }).catch(() => onChange(x => ({ ...x, saved: !on }))); };
  const likedBy = p.liked_by.filter(Boolean);
  return (
    <article ref={ref} data-post={p.id} data-testid="pica-post" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
      {ask && (
        <div role="dialog" aria-modal="true" data-testid="post-menu" onClick={() => setAsk(false)}
          style={{ position: "fixed", inset: 0, zIndex: 3200, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{p.author.id ? `${p.author.name}'s post` : acc ? `${acc.handle}'s post` : "Your post"}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Its likes and comments go with it.</div>
            <button className="ghost" data-testid="post-only" onClick={() => remove(false)}
              style={{ padding: "10px 12px", fontSize: 14, textAlign: "left", color: "var(--bad)" }}>
              🗑 Delete the post{p.media ? <span className="muted" style={{ fontWeight: 400 }}> · the picture stays in your gallery</span> : null}
            </button>
            {p.media && (
              <button className="ghost" data-testid="post-and-picture" onClick={() => remove(true)}
                style={{ padding: "10px 12px", fontSize: 14, textAlign: "left", color: "var(--bad)" }}>
                🗑 Delete the post and the picture<span className="muted" style={{ fontWeight: 400 }}> · gone for good</span>
              </button>
            )}
            <button className="btn" data-testid="post-cancel" onClick={() => setAsk(false)} style={{ padding: "10px 12px", fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 10, padding: "10px 14px" }}>
        <span onClick={() => acc && onProfile(acc.id)} style={{ cursor: acc ? "pointer" : undefined, display: "flex" }}><Avatar name={p.author.name} url={p.author.portrait} /></span>
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => acc && onProfile(acc.id)} data-testid={acc ? "pica-account" : undefined}>
          <div style={{ fontWeight: 800, fontSize: 14, cursor: acc ? "pointer" : undefined }}>{p.author.id ? p.author.name : acc ? acc.handle : `${me} (you)`}</div>
          {acc && !p.author.id && !acc.followed && <div className="muted" style={{ fontSize: 11 }}>Suggested for you</div>}
          {p.author.away && <div className="muted" style={{ fontSize: 11 }} data-testid="pica-away">{p.author.away}</div>}
        </div>
        {acc && !p.author.id && <button className={acc.followed ? "ghost" : "btn"} onClick={follow} data-testid="pica-follow" style={{ padding: "4px 12px", fontSize: 13 }}>{acc.followed ? "Following" : "Follow"}</button>}
        <span className="muted" style={{ fontSize: 12 }} title={stamp(p.created_at)}>{ago(p.created_at)}</span>
        {!p.author.id && !acc && <button onClick={() => setAsk(true)} aria-label="Delete post" data-testid="pica-delete" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 2px", color: "var(--muted)" }}>🗑</button>}
      </div>
      {p.media ? (
        <div {...hold} onDoubleClick={() => { if (!p.liked) like(); }} style={{ display: "flex", justifyContent: "center", background: "#000" }}><MediaView media={p.media} big who={p.author.name} /></div>
      ) : (
        <div {...hold} onDoubleClick={() => { if (!p.liked) like(); }} data-testid="pica-text" style={{ margin: "0 14px", padding: "20px 16px", borderRadius: 16, background: GRADS[p.id.charCodeAt(0) % GRADS.length], color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "center" }}>
          <EditableBio value={noJargon(p.caption)} testid="pica-caption" placeholder="Say something" max={2000} size={18} weight={700}
            onSave={async t => { onChange(x => ({ ...x, caption: t })); await api("/api/pica", { action: "caption.set", id: p.id, caption: hideSecrets(t).text }).catch(() => {}); }} />
        </div>
      )}
      <div className="row" style={{ gap: 14, padding: "8px 14px 2px" }}>
        <button onClick={like} aria-label={p.liked ? "Unlike" : "Like"} aria-pressed={p.liked} data-testid="pica-like" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 0 }}>{p.liked ? "❤️" : "🤍"}</button>
        <button onClick={showAll} aria-label="Comments" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0 }}>💬</button>
        {p.media && <button onClick={save} aria-label={p.saved ? "Unsave" : "Save to my Picagram gallery"} aria-pressed={p.saved} data-testid="pica-save" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0, opacity: p.saved ? 1 : 0.6 }}>{p.saved ? "🔖" : "📑"}</button>}
      </div>
      <div style={{ padding: "0 14px", fontSize: 14, fontWeight: 700 }} data-testid="pica-likes">
        {likedBy.length ? <>Liked by {likedBy.slice(0, 2).join(", ")}{p.likes > likedBy.length ? <> and {fmt(p.likes - Math.min(2, likedBy.length))} others</> : null}</> : <>{fmt(p.likes)} likes</>}
      </div>
      {p.media && <div className="row" style={{ alignItems: "flex-start", padding: "4px 14px", fontSize: 14, gap: 6 }}>
        <b style={{ flexShrink: 0 }}>{acc ? acc.handle : p.author.id ? p.author.name : me}</b>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableBio value={noJargon(p.caption)} testid="pica-caption" placeholder="Add a caption" max={2000} size={14} weight={400}
            onSave={async t => { onChange(x => ({ ...x, caption: t })); await api("/api/pica", { action: "caption.set", id: p.id, caption: hideSecrets(t).text }).catch(() => {}); }} />
        </div>
      </div>}
      <div style={{ padding: "2px 14px 0" }}><When at={p.created_at} /></div>
      {p.comments > list.length && !open && <button onClick={showAll} className="muted" data-testid="pica-all" style={{ background: "none", border: "none", padding: "2px 14px", fontSize: 13, cursor: "pointer" }}>View all {p.comments} comments</button>}
      <div style={{ padding: "2px 14px", display: "grid", gap: 3 }}>
        {list.map(c => (
          <EditableComment key={c.id} who={c.me ? me : c.who} known={c.known} text={c.text}
            onSave={async t => {
              const r = await api<{ comment: Comment }>("/api/pica", { action: "comment.edit", id: c.id, text: t });
              const fix = (xs: Comment[] | undefined) => xs?.map(x => (x.id === c.id ? r.comment : x));
              onChange(x => ({ ...x, preview: fix(x.preview) || x.preview, all: fix(x.all) }));
            }} />
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }} className="row" style={{ gap: 8, padding: "6px 14px 0" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" aria-label="Add a comment" maxLength={500} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 14 }} />
        {text.trim() && <button className="ghost" disabled={busy} style={{ padding: "6px 12px", fontWeight: 800, color: "var(--accent)" }}>{busy ? "…" : "Post"}</button>}
      </form>
    </article>
  );
}

function Composer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState("");
  const [mine, setMine] = useState(true);
  // 👥 One of your characters in the picture with you.
  const [who, setWho] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string; portrait: string | null; pictures: number }[]>([]);
  useEffect(() => { api<{ characters: typeof people }>("/api/pica", { action: "withme" }).then(r => setPeople(r.characters)).catch(() => {}); }, []);
  const [sheet, setSheet] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const post = async () => {
    setBusy(true); setErr("");
    try { await api("/api/pica", { action: "post", caption: hideSecrets(caption).text, photo: hideSecrets(photo).text, useMyPhotos: mine, drafted, withId: who }); onPosted(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't post."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-composer" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📸 New post</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} maxLength={2000} placeholder="Write a caption (or a text post)…" aria-label="Caption" />
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <textarea value={photo} onChange={e => { setPhoto(e.target.value); setDrafted(false); }} rows={2} maxLength={1500} placeholder="Photo (optional): describe it, or tap 📸 to have it written for you" aria-label="Photo description" />
          <button type="button" className="ghost" onClick={() => setSheet(true)} data-testid="post-my-photo" style={{ flexShrink: 0, padding: "8px 10px", fontSize: 18 }}>📸</button>
        </div>
        {sheet && <MyPhotoSheet title="Photo of me" draft={a => api<{ description: string }>("/api/pica", { action: "me.draft", about: a, context: caption ? `a Picagram post with the caption: ${caption}` : "a Picagram post" }).then(r => r.description)}
          onMake={async d => { setPhoto(d); setDrafted(true); setSheet(false); }} onClose={() => setSheet(false)} />}
        {photo.trim() && (
          <label className="row" style={{ gap: 10, fontSize: 13 }}>
            <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} data-testid="pica-mine" style={{ width: 20, height: 20, flexShrink: 0 }} />
            <span>Use my photos as reference <span className="muted">(your profile photo and your past posts)</span></span>
          </label>
        )}
        {photo.trim() && people.length > 0 && (
          <label style={{ fontSize: 13, fontWeight: 700 }}>👥 With me in it <span className="muted" style={{ fontWeight: 500 }}>· optional</span>
            <select value={who} onChange={e => setWho(e.target.value)} data-testid="pica-with" aria-label="Who's in it with me" style={{ marginTop: 4, display: "block", width: "100%" }}>
              <option value="">— just me —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.pictures ? "" : " (no picture of her yet)"}</option>)}
            </select>
            {who && <span className="muted" style={{ fontWeight: 500, fontSize: 11, display: "block", marginTop: 4 }}>Say what you&apos;re both doing in the photo — her face comes from her own pictures.</span>}
          </label>
        )}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" onClick={post} disabled={busy || (!caption.trim() && !photo.trim())} data-testid="pica-share">{busy ? "Posting…" : "Share"}</button>
      </div>
    </div>
  );
}

type Photo = { post_id?: string; media_id: string; url: string; thumb: string | null; caption?: string; saved: boolean; at?: string };

/** 🖼️ A picture, full screen, with Save. */
function Viewer({ photo, onClose, onSaved, onRedo, onAvatar, onRef, isRef, onPrev, onNext }: { photo: Photo; onClose: () => void; onSaved: (on: boolean) => void; onRedo?: (mediaId: string) => void; onAvatar?: (mediaId: string) => void; onRef?: (mediaId: string) => void; isRef?: boolean; onPrev?: () => void; onNext?: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const { bind, tapped } = useSwipeNav(onPrev, onNext); // 👆 swipe (or ← →) between them
  const [saved, setSaved] = useState(photo.saved);
  const toggle = async () => { const on = !saved; setSaved(on); onSaved(on); await api("/api/pica", { action: "save", id: photo.media_id, on }).catch(() => { setSaved(!on); onSaved(!on); }); };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-viewer" {...bind} onClick={() => { if (tapped()) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 2700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption || "Photo"} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "80dvh", objectFit: "contain", borderRadius: 12 }} />
      <When at={photo.at} align="center" />
      <div className="row" style={{ gap: 10 }} onClick={e => e.stopPropagation()}>
        <button className={saved ? "ghost" : "btn"} onClick={toggle} data-testid="pica-viewer-save">{saved ? "🔖 Saved" : "📑 Save"}</button>
        {onAvatar && <button className="ghost" onClick={() => onAvatar(photo.media_id)} data-testid="pica-viewer-avatar">🖼 Profile picture</button>}
        {onRef && <button className="ghost" onClick={() => onRef(photo.media_id)} data-testid="pica-viewer-ref">{isRef ? "✓ Her picture" : "＋ Use as hers"}</button>}
        {onRedo && <button className="ghost" onClick={() => onRedo(photo.media_id)} data-testid="pica-viewer-redo">↻ Redo</button>}
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      {onPrev && <SwipeArrow side="left" onGo={onPrev} />}
      {onNext && <SwipeArrow side="right" onGo={onNext} />}
    </div>
  );
}

/** 👆 Where this one sits in the grid, so you can swipe through them. */
function step(list: Photo[] | null | undefined, open: Photo, go: (p: Photo) => void) {
  const all = list || [];
  const i = all.findIndex(x => x.media_id === open.media_id);
  if (i < 0 || all.length < 2) return {};
  return {
    ...(i > 0 ? { onPrev: () => go(all[i - 1]) } : {}),
    ...(i < all.length - 1 ? { onNext: () => go(all[i + 1]) } : {}),
  };
}

function Grid({ photos, onOpen, onRemoved, whose }: { photos: Photo[]; onOpen: (p: Photo) => void; onRemoved?: (postId: string) => void; whose?: string }) {
  // 👆 Press and hold a square to take the post down — with the picture or without it.
  const [ask, setAsk] = useState<Photo | null>(null);
  const held = useRef<ReturnType<typeof setTimeout> | null>(null);
  const letGo = () => { if (held.current) clearTimeout(held.current); held.current = null; };
  const hold = (p: Photo) => (onRemoved && p.post_id ? {
    onPointerDown: () => { letGo(); held.current = setTimeout(() => setAsk(p), 550); },
    onPointerUp: letGo, onPointerLeave: letGo, onPointerCancel: letGo,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setAsk(p); },
  } : {});
  const remove = async (picture: boolean) => {
    const p = ask; setAsk(null);
    if (!p?.post_id) return;
    try { await api("/api/pica", { action: "delete", id: p.post_id, picture }); onRemoved?.(p.post_id); } catch { /* still there */ }
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
      {photos.map(p => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.media_id} src={p.thumb || p.url} alt={p.caption || "Photo"} loading="lazy" {...hold(p)} onClick={() => onOpen(p)} data-testid="pica-grid-item" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", cursor: "pointer", background: "var(--surface2)" }} />
      ))}
      {ask && (
        <div role="dialog" aria-modal="true" data-testid="grid-menu" onClick={() => setAsk(null)}
          style={{ position: "fixed", inset: 0, zIndex: 3200, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{whose ? `${whose}'s post` : "This post"}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Its likes and comments go with it.</div>
            <button className="ghost" data-testid="grid-post-only" onClick={() => remove(false)} style={{ padding: "10px 12px", fontSize: 14, textAlign: "left", color: "var(--bad)" }}>
              🗑 Delete the post<span className="muted" style={{ fontWeight: 400 }}> · the picture stays in your gallery</span>
            </button>
            <button className="ghost" data-testid="grid-post-and-picture" onClick={() => remove(true)} style={{ padding: "10px 12px", fontSize: 14, textAlign: "left", color: "var(--bad)" }}>
              🗑 Delete the post and the picture<span className="muted" style={{ fontWeight: 400 }}> · gone for good</span>
            </button>
            <button className="btn" data-testid="grid-cancel" onClick={() => setAsk(null)} style={{ padding: "10px 12px", fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 👤 Her profile: bio, followers, Follow, and all her photos. */
function Profile({ id, onClose, onFollow, onChat, onMessage, onDeleted }: { id: string; onClose: () => void; onFollow: (account: string, on: boolean) => void; onChat?: (characterId: string) => void; onMessage?: (id: string) => void; onDeleted?: (id: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [data, setData] = useState<{ refs?: { media_id: string; url: string }[]; account: { id: string; handle: string; name: string; bio: string; personality: string; traits: Record<string, number>; followers: number; followed: boolean; avatar: string | null; avatar_media_id?: string | null; character_id: string | null; lives: string; hidden: boolean; married: boolean }; photos: Photo[] } | null>(null);
  const [err, setErr] = useState("");
  const [befriending, setBefriending] = useState(false);
  // 🤝 She becomes a character (filled in from her profile; her photos are her headshot and references).
  // 🗑 Gone for good: her, her posts, your messages with her and her pictures.
  const [hidden, setHidden] = useState(false);
  const hideHer = async () => {
    const c = data?.account.character_id;
    if (!c) return;
    const on = !hidden; setHidden(on);
    await api("/api/pica", { action: "hide", id: c, on }).catch(() => setHidden(!on));
  };
  const remove = async () => {
    const who = data?.account.name || "her";
    if (!(await confirmAsk(`Delete ${who}? Her posts, your messages with her and her pictures go too. Anything you saved to your gallery stays.`, { yes: "Delete", danger: true }))) return;
    setErr("");
    try { await api("/api/pica", { action: "account.delete", id }); onDeleted?.(id); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete her."); }
  };
  // 🧠 Her character card is a lot of writing, so you say who does it: the brain picked in
  // Settings is the obvious one, but any other that's set up is right there — with roughly
  // what each costs — in case you'd rather she were written by one of them.
  const [who, setWho] = useState<{ id: string; label: string; cost: string; mine: boolean }[] | null>(null);
  const befriend = async (brain?: string) => {
    setBefriending(true); setErr(""); setWho(null);
    try { const r = await api<{ characterId: string }>("/api/pica", { action: "befriend", id, ...(brain ? { brain } : {}) }); setData(d => (d ? { ...d, account: { ...d.account, character_id: r.characterId, followed: true } } : d)); onFollow(id, true); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't befriend her."); }
    setBefriending(false);
  };
  const askWho = async () => {
    setErr("");
    try { const r = await api<{ choices: NonNullable<typeof who> }>("/api/pica", { action: "befriend.who" }); setWho(r.choices); }
    catch { await befriend(); } // couldn't ask: get on with it using the Settings brain
  };
  const [view, setView] = useState<Photo | null>(null);
  // ↻ Redo: the picture being replaced, and a note while the new one is on its way.
  const [redo, setRedo] = useState<string | null>(null);
  const [redoing, setRedoing] = useState("");
  // 🖼️ Her profile picture on its own: one of her photos, or one you upload just for it.
  const pic = useRef<HTMLInputElement>(null);
  const [picBusy, setPicBusy] = useState("");
  // 🔖 Whether her current profile picture is one of your saved ones (the viewer's button reads it).
  const [savedAvatar, setSavedAvatar] = useState(false);
  // 🎭 Her description and sliders, in a tab of her own.
  const [persona, setPersona] = useState(false);
  const readAvatarSaved = (d: { account: { avatar_media_id?: string | null }; photos: Photo[] }) =>
    setSavedAvatar(!!d.account.avatar_media_id && d.photos.some(x => x.media_id === d.account.avatar_media_id && x.saved));
  const reload = () => api<NonNullable<typeof data>>("/api/pica", { action: "profile", id }).then(d => { setData(d); setHidden(d.account.hidden); readAvatarSaved(d); }).catch(() => {});
  const setAvatar = async (mediaId: string) => {
    setErr(""); setPicBusy("…");
    try {
      const r = await api<{ avatar: string }>("/api/pica", { action: "avatar.set", id, mediaId });
      setData(d => (d ? { ...d, account: { ...d.account, avatar: r.avatar, avatar_media_id: mediaId } } : d));
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't change her profile picture."); }
    setPicBusy("");
  };
  // 🖼️ Her reference pictures: what every new photo of her is built from.
  const refs = data?.refs || [];
  const isRef = (mediaId: string) => refs.some(r => r.media_id === mediaId);
  const setRefs = async (ids: string[]) => {
    setErr("");
    try {
      const r = await api<{ refs: { media_id: string; url: string }[] }>("/api/pica", { action: "refs.set", id, mediaIds: ids });
      setData(d => (d ? { ...d, refs: r.refs } : d));
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save her pictures."); }
  };
  const toggleRef = (mediaId: string) => {
    if (isRef(mediaId)) return setRefs(refs.filter(r => r.media_id !== mediaId).map(r => r.media_id));
    if (refs.length >= 4) { setErr("Four pictures is the most — take one out first."); return; }
    return setRefs([...refs.map(r => r.media_id), mediaId]);
  };
  const refIn = useRef<HTMLInputElement>(null);
  const uploadRefs = async (files: FileList | null) => {
    const picked = [...(files || [])];
    if (!picked.length) return;
    setErr("");
    const room = Math.max(0, 4 - refs.length);
    if (!room) { setErr("Four pictures is the most — take one out first."); return; }
    const take = picked.slice(0, room);
    if (picked.length > room) setErr(`Room for ${room} more — the ${picked.length > room + 1 ? "rest were" : "other was"} left out.`);
    setPicBusy(take.length > 1 ? `…${take.length}` : "…");
    const got: string[] = [];
    for (const f of take) {
      try { got.push((await uploadPicaPicture(f)).mediaId); }
      catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't upload."); }
    }
    if (got.length) await setRefs([...refs.map(r => r.media_id), ...got].slice(0, 4));
    setPicBusy("");
  };
  const uploadAvatar = async (f: File | undefined) => {
    if (!f) return;
    setErr(""); setPicBusy("…");
    try {
      const up = await uploadPicaPicture(f);
      await setAvatar(up.mediaId);
      // 🔖 Keep it: a picture you picked for her profile is worth keeping, so it lands in your saved ones.
      await api("/api/pica", { action: "save", id: up.mediaId, on: true }).then(() => setSavedAvatar(true)).catch(() => {});
    }
    catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't upload."); setPicBusy(""); }
  };
  useEffect(() => { api<NonNullable<typeof data>>("/api/pica", { action: "profile", id }).then(d => { setData(d); setHidden(d.account.hidden); readAvatarSaved(d); }).catch(() => onClose()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const follow = async () => {
    if (!data) return;
    const on = !data.account.followed;
    if (!on && data.account.character_id && !(await confirmAsk(`Unfollow ${data.account.name}? She can see who follows her — she'll notice, and she might bring it up. To keep her posts out of your feed without her knowing, hide them instead.`, { yes: "Unfollow" }))) return;
    setData(d => (d ? { ...d, account: { ...d.account, followed: on, followers: d.account.followers + (on ? 1 : -1) } } : d)); onFollow(id, on);
    await api("/api/pica", { action: "follow", id, on }).catch(e => { setData(d => (d ? { ...d, account: { ...d.account, followed: !on, followers: d.account.followers + (on ? -1 : 1) } } : d)); onFollow(id, !on); setErr(e instanceof Error ? e.message : "Couldn't follow."); });
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-profile" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        {data && !data.account.character_id
          ? <div style={{ flex: 1, minWidth: 0 }}>
              <EditableBio value={data.account.handle} testid="pica-handle" placeholder="username" max={28}
                onSave={async t => {
                  const handle = t.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 28);
                  if (handle.length < 2) return;
                  try {
                    const r = await api<{ handle: string }>("/api/pica", { action: "handle.set", id, handle });
                    setData(d => (d ? { ...d, account: { ...d.account, handle: r.handle } } : d));
                  } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't change her username."); }
                }} />
            </div>
          : <b style={{ flex: 1 }}>{data?.account.handle || "…"}</b>}
      </div>
      {data && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="row" style={{ gap: 16, padding: 16 }}>
            <div style={{ textAlign: "center" }}>
              {/* 🔍 Tap her profile picture to see it full size — Save, Redo and the rest are in there. */}
              <button type="button" onClick={() => { if (data.account.avatar && data.account.avatar_media_id) setView({ media_id: data.account.avatar_media_id, url: data.account.avatar, thumb: null, saved: savedAvatar, caption: `${data.account.name}'s profile picture` }); }}
                aria-label={data.account.avatar ? `${data.account.name}'s profile picture, tap to see it full size` : `${data.account.name}'s profile picture`}
                data-testid="pica-avatar-open" disabled={!data.account.avatar || !data.account.avatar_media_id}
                style={{ all: "unset", cursor: data.account.avatar && data.account.avatar_media_id ? "zoom-in" : "default", display: "block" }}>
                <Avatar name={data.account.name} url={data.account.avatar} size={76} />
              </button>
              <button className="ghost" onClick={() => pic.current?.click()} disabled={!!picBusy} data-testid="pica-avatar-change" style={{ display: "block", marginTop: 6, padding: "3px 8px", fontSize: 11 }}>{picBusy || "Change"}</button>
              <input ref={pic} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="pica-avatar-file" onChange={e => uploadAvatar(e.target.files?.[0])} />
              {data.account.avatar_media_id && (
                <button className="ghost" onClick={() => setRedo(data.account.avatar_media_id!)} data-testid="pica-redo-avatar" style={{ display: "block", marginTop: 4, padding: "3px 8px", fontSize: 11 }}>↻ Redo</button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 4, fontWeight: 800 }}>
                {data.account.character_id
                  ? <span>{data.account.name}</span>
                  : <div style={{ flex: 1, minWidth: 0 }}>
                      <EditableBio value={data.account.name} testid="pica-name" placeholder="Her name" max={60}
                        onSave={async t => {
                          const name = t.trim();
                          if (!name) return;
                          setData(d => (d ? { ...d, account: { ...d.account, name } } : d));
                          await api("/api/pica", { action: "name.set", id, name: hideSecrets(name).text }).catch(e => setErr(e instanceof Error ? e.message : "Couldn't rename her."));
                        }} />
                    </div>}
                {data.account.married && <span data-testid="pica-ring" title="Married" aria-label="married" style={{ marginLeft: 4 }}>💍</span>}
              </div>
              <div className="muted" style={{ fontSize: 13 }}><b style={{ color: "var(--text)" }}>{data.photos.length}</b> posts · <b style={{ color: "var(--text)" }}>{fmt(data.account.followers)}</b> followers</div>
              <EditableBio value={data.account.bio} testid="pica-bio" placeholder="No bio yet — click to write one"
                onSave={async t => { setData(d => (d ? { ...d, account: { ...d.account, bio: t } } : d)); await api("/api/pica", { action: "bio.set", id, bio: hideSecrets(t).text }).catch(() => {}); }} />
              {data.account.character_id
                ? data.account.lives && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>📍 {data.account.lives}</div>
                : <div className="row" style={{ gap: 4, fontSize: 12, marginTop: 2 }}>
                    <span className="muted">📍</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <EditableBio value={data.account.lives} testid="pica-lives" placeholder="Where she lives" max={120}
                        onSave={async t => { setData(d => (d ? { ...d, account: { ...d.account, lives: t } } : d)); await api("/api/pica", { action: "lives.set", id, lives: hideSecrets(t).text }).catch(() => {}); }} />
                    </div>
                  </div>}
            </div>
          </div>
          <div className="row" style={{ padding: "0 16px 12px", gap: 8 }}>
            <button className={data.account.followed ? "ghost" : "btn"} onClick={follow} data-testid="pica-profile-follow" style={{ flex: 1 }}>{data.account.followed ? "Following" : "Follow"}</button>
            {data.account.character_id
              ? <button className="btn" onClick={() => onChat?.(data.account.character_id!)} data-testid="pica-chat" style={{ flex: 1 }}>💬 Chat</button>
              : <>
                  <button className="ghost" onClick={() => onMessage?.(id)} data-testid="pica-message" style={{ flex: 1 }}>✉️ Message</button>
                  <button className="ghost" onClick={askWho} disabled={befriending} data-testid="pica-befriend" style={{ flex: 1 }}>{befriending ? "Making her profile…" : "🤝 Befriend"}</button>
                </>}
          </div>
          {who && (
            <div data-testid="pica-befriend-who" style={{ margin: "0 16px 12px", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)" }}>
              <b style={{ fontSize: 14 }}>Who should write her?</b>
              <div className="muted" style={{ fontSize: 12, margin: "2px 0 10px" }}>She gets a whole character card. Costs are rough estimates for the writing — her pictures cost the same either way.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {who.map(o => (
                  <button key={o.id} className="ghost" disabled={befriending} onClick={() => befriend(o.id)} data-testid={`pica-befriend-${o.id}`}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)" }}>
                    <b>{o.label}</b>{o.mine ? " ✓" : ""} <span className="muted" style={{ fontSize: 12 }}>· {o.cost}{o.mine ? " · your Settings brain" : ""}</span>
                  </button>
                ))}
                <button className="ghost" onClick={() => setWho(null)} style={{ padding: "6px 10px", fontSize: 13 }}>Not now</button>
              </div>
            </div>
          )}
          {!data.account.character_id && (
            <div style={{ padding: "0 16px 10px" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>🖼️ Her pictures <span style={{ opacity: 0.8 }}>· what every new photo of her is built from (up to 4)</span></div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }} data-testid="pica-refs">
                {refs.map(r => (
                  <span key={r.media_id} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt="" data-testid="pica-ref" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", objectPosition: "top" }} />
                    <button onClick={() => toggleRef(r.media_id)} aria-label="Take this one out" data-testid="pica-ref-out"
                      style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0 }}>✕</button>
                  </span>
                ))}
                <button className="ghost" onClick={() => refIn.current?.click()} disabled={!!picBusy || refs.length >= 4} data-testid="pica-ref-add"
                  style={{ width: 54, height: 54, borderRadius: 10, borderStyle: "dashed", fontSize: 18, padding: 0 }}>＋</button>
                <input ref={refIn} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-testid="pica-ref-file" onChange={e => { uploadRefs(e.target.files); e.target.value = ""; }} />
              </div>
              {!refs.length && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>None picked — her profile picture is used instead. Tap any photo of hers to use it, or ＋ to upload one.</div>}
            </div>
          )}
          <div className="row" style={{ padding: "0 16px 10px", gap: 10 }}>
            {!data.account.character_id && (
              <button className="ghost" onClick={() => setPersona(true)} data-testid="pica-persona-open" style={{ padding: "4px 12px", fontSize: 13 }}>🎭 Personality</button>
            )}
            {data.account.character_id
              ? <button className="ghost" onClick={hideHer} data-testid="pica-profile-hide" style={{ padding: "4px 12px", fontSize: 13 }}>{hidden ? "👁 Show her posts again" : "🙈 Hide her posts"}</button>
              : <button className="ghost" onClick={remove} data-testid="pica-profile-delete" style={{ padding: "4px 12px", fontSize: 13, color: "var(--bad)" }}>🗑 Delete this account</button>}
          </div>
          {data.account.character_id && <div className="muted" style={{ padding: "0 16px 10px", fontSize: 12 }}>🤝 You&apos;re friends — she&apos;s one of your characters (edit her in her character card). Her account can&apos;t be deleted, but you can hide her posts, and she&apos;ll never know. Unfollowing her she <i>would</i> notice.</div>}
          {err && <div style={{ color: "var(--bad)", padding: "0 16px 10px", fontSize: 13 }}>⚠️ {err}</div>}
          {redoing && <div data-testid="pica-redoing" className="muted" style={{ margin: "0 16px 10px", padding: "8px 12px", borderRadius: 12, background: "rgba(236,72,153,.14)", border: "1px solid rgba(236,72,153,.4)", fontSize: 12 }}>{redoing}</div>}
          <Grid photos={data.photos} onOpen={setView} whose={data.account.name}
            onRemoved={id => setData(d => (d ? { ...d, photos: d.photos.filter(x => x.post_id !== id) } : d))} />
          {!data.photos.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>No photos yet</div>}
        </div>
      )}
      {view && <Viewer photo={view} onClose={() => setView(null)} onRedo={m => { setView(null); setRedo(m); }} onAvatar={m => { setView(null); setAvatar(m); }}
        {...step(data?.photos, view, setView)}
        {...(data && !data.account.character_id ? { onRef: (m: string) => { toggleRef(m); setView(null); }, isRef: isRef(view.media_id) } : {})}
        onSaved={on => {
          if (view.media_id === data?.account.avatar_media_id) setSavedAvatar(on);
          setData(d => (d ? { ...d, photos: d.photos.map(x => (x.media_id === view.media_id ? { ...x, saved: on } : x)) } : d));
        }} />}
      {persona && data && (
        <PersonaSheet who={data.account.name} personality={data.account.personality} traits={data.account.traits}
          onClose={() => setPersona(false)}
          onSave={async (personality, traits) => {
            setData(d => (d ? { ...d, account: { ...d.account, personality, traits } } : d));
            await api("/api/pica", { action: "persona.set", id, personality: hideSecrets(personality).text, traits }).catch(e => setErr(e instanceof Error ? e.message : "Couldn't save her."));
          }} />
      )}
      {redo && <RedoSheet mediaId={redo} who={data?.account.name || "her"} onClose={() => setRedo(null)}
        onGoing={() => { setRedo(null); setRedoing("↻ Making the new one — about a minute. It takes this one's place when it lands."); setTimeout(reload, 60_000); }} />}
    </div>
  );
}

/**
 * 🎭 Who she is, and the nine sliders — the same ones a character has. It saves itself three
 * seconds after you stop, like her bio. Someone you've befriended doesn't have this: she's a
 * character, so hers are on her character card.
 */
function PersonaSheet({ who, personality, traits, onSave, onClose }: {
  who: string; personality: string; traits: Record<string, number>;
  onSave: (personality: string, traits: Record<TraitKey, number>) => Promise<void>; onClose: () => void;
}) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [text, setText] = useState(personality);
  const [t, setT] = useState<Record<TraitKey, number>>(cleanTraits(traits && Object.keys(traits).length ? traits : DEFAULT_TRAITS));
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(JSON.stringify({ personality, traits: cleanTraits(traits && Object.keys(traits).length ? traits : DEFAULT_TRAITS) }));
  const save = async (p: string, tr: Record<TraitKey, number>) => {
    const now = JSON.stringify({ personality: p, traits: tr });
    if (now === last.current) return; // nothing changed — don't touch the server
    last.current = now;
    await onSave(p, tr);
    setSaved(true); setTimeout(() => setSaved(false), 1600);
  };
  const later = (p: string, tr: Record<TraitKey, number>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(p, tr), 3000);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const close = () => { if (timer.current) clearTimeout(timer.current); save(text, t); onClose(); };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-persona" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2700, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={close} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>🎭 {who}</b>
        <span className="muted" style={{ fontSize: 12 }} data-testid="pica-persona-saved">{saved ? "✓ Saved" : "Saves itself"}</span>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 4 }}>Who she is <span className="muted" style={{ fontWeight: 500 }}>· how she talks and acts, in your words</span></label>
          <textarea value={text} onChange={e => { setText(e.target.value); later(e.target.value, t); }} maxLength={2000} data-testid="pica-persona-text"
            placeholder="Dry, a bit guarded, warms up once she trusts you. Talks about her dog more than herself."
            style={{ width: "100%", minHeight: 120, resize: "vertical", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
        </div>
        <TraitSliders value={t} romantic onChange={(k, v) => { const next = { ...t, [k]: v }; setT(next); later(text, next); }} />
        <div className="muted" style={{ fontSize: 12 }}>This is hers on Picagram — her DMs, her posts and her captions. If you befriend her, it all comes with her onto her character card.</div>
      </div>
    </div>
  );
}

/** 🖼️ Pick a picture you already have — anything in the app's gallery — to send her. */
function PickFromGallery({ onClose, onPick }: { onClose: () => void; onPick: (mediaId: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  type Item = { id: string; mediaId: string; url: string; thumb: string | null; at: string; from: string };
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(true);
  const load = async (before: string | null) => {
    const r = await data<{ items: Item[] }>("gallery.pick", before ? { before } : {}).catch(() => ({ items: [] as Item[] }));
    setItems(l => [...(before ? l || [] : []), ...r.items]); setMore(r.items.length >= 30);
  };
  useEffect(() => { load(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="dialog" aria-modal="true" data-testid="dm-pick" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2700 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "80dvh", overflowY: "auto", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🖼️ Send a picture</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        {items && !items.length && <div className="muted" style={{ textAlign: "center", padding: 20 }}>No pictures yet</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {(items || []).map(it => (
            <button key={it.id} type="button" onClick={() => onPick(it.mediaId)} data-testid="dm-pick-item" title={it.from}
              style={{ position: "relative", padding: 0, border: "none", background: "var(--surface2)", cursor: "pointer", aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.thumb || it.url} alt={`From ${it.from}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" }}>{it.from}</span>
            </button>
          ))}
        </div>
        {items && more && <button className="ghost" onClick={() => load(items.at(-1)?.at || null)}>Show more</button>}
      </div>
    </div>
  );
}

/** 🔖 Their own Picagram gallery: pictures they saved. */
function Saved({ onClose }: { onClose: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [items, setItems] = useState<(Photo & { at: string })[] | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  useEffect(() => { api<{ items: (Photo & { at: string })[] }>("/api/pica", { action: "saved" }).then(r => setItems(r.items)).catch(() => setItems([])); }, []);
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-saved" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>🔖 Saved</b>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {items && !items.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>Tap 📑 on a photo to save it here</div>}
        {items && <Grid photos={items} onOpen={setView} />}
      </div>
      {view && <Viewer photo={view} onClose={() => setView(null)} {...step(items, view, setView)}
        onSaved={on => { if (!on) setItems(l => (l || []).filter(x => x.media_id !== view.media_id)); }} />}
    </div>
  );
}

/** 👥 Who you follow (up to 70) — unfollow some to make room for new ones. */
function Following({ onClose, onUnfollow, onOpen, onNewFaces }: { onClose: () => void; onUnfollow: (id: string) => void; onOpen: (id: string) => void; onNewFaces?: (names: string[], error?: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [list, setList] = useState<{ id: string; handle: string; name: string; avatar: string | null; friend: boolean; character_id: string | null; married?: boolean }[] | null>(null);
  // 🙈 Your characters: hide their posts without them ever knowing (unlike unfollowing).
  const [chars, setChars] = useState<{ id: string; name: string; portrait: string | null; hidden: boolean }[] | null>(null);
  const hide = async (id: string, on: boolean) => {
    setChars(cs => (cs || []).map(c => (c.id === id ? { ...c, hidden: on } : c)));
    await api("/api/pica", { action: "hide", id, on }).catch(() => setChars(cs => (cs || []).map(c => (c.id === id ? { ...c, hidden: !on } : c))));
  };
  // ✨ Bring new women in right now, instead of waiting for the one who turns up each day.
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  // 🧠 If the brain you picked couldn't manage it, these are the others you could retry with,
  // and roughly what each would cost. Nothing is spent again unless you choose one.
  const [retry, setRetry] = useState<{ tried: string; list: { id: string; label: string; cost: string }[] } | null>(null);
  const newFaces = async (brain?: string) => {
    setBusy(true); setRetry(null); setSaid(brain ? "✨ Trying again — a moment…" : "✨ Bringing someone new in — a moment…");
    try {
      const r = await api<{ made: number; names: string[]; error?: string; tried?: string; retry?: { id: string; label: string; cost: string }[] }>("/api/pica", { action: "newfaces", count: 1, ...(brain ? { brain } : {}) });
      if (!r.made) {
        if (r.retry?.length) { setSaid(""); setRetry({ tried: r.tried || "", list: r.retry }); }
        else setSaid(r.error || "Couldn't bring anyone new in just now — try again in a moment.");
        setBusy(false); return;
      }
      onNewFaces?.(r.names, r.error);
    } catch (e) { setSaid(e instanceof Error && e.message ? e.message : "Couldn't bring anyone new in."); setBusy(false); }
  };
  useEffect(() => { api<{ accounts: NonNullable<typeof list> }>("/api/pica", { action: "following" }).then(r => setList(r.accounts)).catch(() => setList([])); }, []);
  useEffect(() => { api<{ characters: NonNullable<typeof chars> }>("/api/pica", { action: "characters" }).then(r => setChars(r.characters)).catch(() => setChars([])); }, []);
  // 🧍 One row per person: a character who's already up there as her own account (🤝) isn't
  // listed again below — her 🙈 Hide sits on that row instead.
  const shown = new Set((list || []).map(a => a.character_id).filter(Boolean) as string[]);
  const mineBelow = (chars || []).filter(c => !shown.has(c.id));
  const unfollow = async (id: string, who: string, friend: boolean) => {
    if (friend && !(await confirmAsk(`Unfollow ${who}? She can see who follows her — she'll notice, and she might bring it up. To just keep her posts out of your feed without her knowing, hide her below instead.`, { yes: "Unfollow" }))) return;
    setList(l => (l || []).filter(x => x.id !== id)); onUnfollow(id);
    await api("/api/pica", { action: "follow", id, on: false }).catch(() => {});
  };
  // 🗑 Gone for good: her, her posts, her DMs and her pictures (anything you saved stays).
  const remove = async (id: string, who: string) => {
    if (!(await confirmAsk(`Delete ${who}? Her posts, your messages with her and her pictures go too. Anything you saved to your gallery stays.`, { yes: "Delete", danger: true }))) return;
    setSaid("");
    try { await api("/api/pica", { action: "account.delete", id }); setList(l => (l || []).filter(x => x.id !== id)); onUnfollow(id); }
    catch (e) { setSaid(e instanceof Error ? e.message : "Couldn't delete her."); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-following" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>👥 Following {list ? `(${list.length}/70)` : ""}</b>
        <button className="ghost" onClick={() => newFaces()} disabled={busy} data-testid="pica-new-faces" style={{ padding: "4px 10px", fontSize: 13 }}>{busy ? "…" : "✨ New face"}</button>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {said && <div data-testid="pica-new-faces-said" role="status" style={{ margin: "10px 14px", padding: "10px 12px", borderRadius: 12, fontSize: 14, background: said.startsWith("✨") && !said.includes("Couldn't") ? "rgba(236,72,153,.14)" : "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.45)" }}>{said.startsWith("✨") ? said : `⚠️ ${said}`}</div>}
        {retry && (
          <div data-testid="pica-new-faces-retry" style={{ margin: "10px 14px", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)" }}>
            <b style={{ fontSize: 14 }}>Couldn&apos;t bring anyone new in</b>
            <div className="muted" style={{ fontSize: 12, margin: "2px 0 10px" }}>{retry.tried ? `${retry.tried} didn't manage it.` : ""} Try again with another AI? Costs are rough estimates for the writing — her photo costs the same either way.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {retry.list.map(o => (
                <button key={o.id} className="ghost" disabled={busy} onClick={() => newFaces(o.id)} data-testid={`pica-retry-${o.id}`}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <b>{o.label}</b> <span className="muted" style={{ fontSize: 12 }}>· {o.cost}</span>
                </button>
              ))}
              <button className="ghost" onClick={() => setRetry(null)} style={{ padding: "6px 10px", fontSize: 13 }}>Not now</button>
            </div>
          </div>
        )}
        {list && !list.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>You&apos;re not following anyone yet</div>}
        {(list || []).map(a => (
          <div key={a.id} className="row" data-testid="pica-following-row" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <span onClick={() => onOpen(a.id)} style={{ cursor: "pointer", display: "flex" }}><Avatar name={a.name} url={a.avatar} size={40} /></span>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onOpen(a.id)}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{a.handle}{a.friend ? " 🤝" : ""}{a.married ? " 💍" : ""}</div>
              <div className="muted" style={{ fontSize: 12 }}>{a.name}</div>
            </div>
            {a.friend && a.character_id && (() => {
              const c = (chars || []).find(x => x.id === a.character_id);
              return c ? <button className="ghost" onClick={() => hide(c.id, !c.hidden)} data-testid="pica-hide" data-hidden={c.hidden ? "yes" : undefined} style={{ padding: "4px 10px", fontSize: 13 }}>{c.hidden ? "Show" : "🙈 Hide"}</button> : null;
            })()}
            <button className="ghost" onClick={() => unfollow(a.id, a.name, a.friend)} data-testid="pica-unfollow" style={{ padding: "4px 12px", fontSize: 13 }}>Unfollow</button>
            {!a.friend && <button className="ghost" onClick={() => remove(a.id, a.name)} aria-label={`Delete ${a.name}`} data-testid="pica-account-delete" style={{ padding: "4px 10px", fontSize: 15, color: "var(--bad)" }}>🗑</button>}
          </div>
        ))}
        {/* 🙈 Your characters: out of the feed, and she never knows. */}
        {mineBelow.length > 0 && (
          <>
            <div className="muted" style={{ padding: "16px 14px 6px", fontSize: 12, fontWeight: 700 }}>YOUR CHARACTERS ON PICAGRAM<div style={{ fontWeight: 500, marginTop: 2 }}>Hiding keeps her posts out of your feed. She can&apos;t tell — unlike unfollowing her.</div></div>
            {mineBelow.map(c => (
              <div key={c.id} className="row" data-testid="pica-character-row" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", opacity: c.hidden ? 0.55 : 1 }}>
                <Avatar name={c.name} url={c.portrait} size={40} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14 }}>{c.name}{c.hidden ? <span className="muted" style={{ fontWeight: 500 }}> · hidden</span> : ""}</div>
                <button className="ghost" onClick={() => hide(c.id, !c.hidden)} data-testid="pica-hide" data-hidden={c.hidden ? "yes" : undefined} style={{ padding: "4px 12px", fontSize: 13 }}>{c.hidden ? "👁 Show" : "🙈 Hide"}</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

type DmMsg = { id: string; role: "user" | "assistant"; content: string; created_at: string; media: Media | null };
type DmAccount = { id: string; handle: string; name: string; avatar: string | null; brain?: string };

/** ✉️ Picagram messages: one row per person you've DM'd. */
function Inbox({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [list, setList] = useState<{ account: DmAccount; last: string; at: string; unread: number }[] | null>(null);
  useEffect(() => { api<{ threads: NonNullable<typeof list> }>("/api/pica", { action: "dm.threads" }).then(r => setList(r.threads)).catch(() => setList([])); }, []);
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-inbox" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>✉️ Messages</b>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {list && !list.length && <div className="muted" style={{ textAlign: "center", padding: 24, fontSize: 14 }}>No messages yet — open someone&apos;s profile and tap ✉️ Message.<br /><span style={{ fontSize: 12 }}>(Your characters chat with you in Chat.)</span></div>}
        {(list || []).map(t => (
          <button key={t.account.id} onClick={() => onOpen(t.account.id)} data-testid="pica-thread-row" className="row" style={{ width: "100%", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "none", border: "none", borderBottomStyle: "solid", color: "var(--text)", textAlign: "left", cursor: "pointer" }}>
            <Avatar name={t.account.name} url={t.account.avatar} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: t.unread ? 800 : 600, fontSize: 14 }}>{t.account.handle}</div>
              <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: t.unread ? 700 : 400, color: t.unread ? "var(--text)" : undefined }}>{t.last} · {ago(t.at)}</div>
            </div>
            {t.unread > 0 && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 💬 A DM thread with one account: she answers in her own voice and can send photos (📸 if one didn't come through). */
function Thread({ id, onClose, onProfile }: { id: string; onClose: () => void; onProfile: (id: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [acc, setAcc] = useState<DmAccount | null>(null);
  const [brains, setBrains] = useState<{ id: string; label: string }[]>([]);
  const [msgs, setMsgs] = useState<DmMsg[] | null>(null);
  const [text, setText] = useState("");
  // 🗣️ Where the caret is, so "@…" is picked up as you type it.
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mySheet, setMySheet] = useState(false);
  // 🖼️📎 Send her something you already have: from the gallery, or straight off the phone.
  // 🗑 Long-press a written message to start picking (up to 10). A message with a picture in it
  // isn't selectable at all, so a long press on a photo stays the phone's own save-and-share.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toggleSelect = (mid: string) => setSelected(sel => {
    if (!sel) return sel;
    const next = new Set(sel);
    if (next.has(mid)) next.delete(mid); else if (next.size < 10) next.add(mid);
    return next.size ? next : null;
  });
  // ✏️ Double-tap a written message to reword it — hers or yours. Pictures stay as they are.
  const editMsg = async (mid: string, text: string) => {
    const r = await api<{ id: string; content: string }>("/api/pica", { action: "dm.edit", id, messageId: mid, text });
    setMsgs(list => (list || []).map(m => (m.id === r.id ? { ...m, content: r.content } : m)));
  };
  const deleteSelected = async () => {
    if (!selected?.size) return;
    const n = selected.size;
    if (!(await confirmAsk(`Delete ${n === 1 ? "this message" : `these ${n} messages`}? Are you sure?`, { yes: "Delete", danger: true }))) return;
    setDeleting(true);
    try {
      await api("/api/pica", { action: "dm.delete", id, ids: [...selected] });
      const gone = selected;
      setMsgs(list => (list || []).filter(m => !gone.has(m.id)));
      setSelected(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete."); }
    setDeleting(false);
  };
  const [pick, setPick] = useState(false);
  const [sending, setSending] = useState("");
  const upIn = useRef<HTMLInputElement>(null);
  const dmBox = useRef<HTMLInputElement>(null); // the message box, for putting the caret back after a *
  const sendMine = async (mediaId: string) => {
    setSending("…"); setErr("");
    try { const r = await api<{ added: DmMsg[] }>("/api/pica", { action: "dm.me.send", id, mediaId }); setMsgs(m => [...(m || []), ...r.added]); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it."); }
    setSending("");
  };
  const uploadMine = async (f: File | undefined) => {
    if (!f) return;
    setSending("…"); setErr("");
    try { const up = await uploadPicaPicture(f); await sendMine(up.mediaId); }
    catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't upload."); setSending(""); }
  };
  const end = useRef<HTMLDivElement>(null);
  // ⏳ Her reply is written whether you are looking or not. If you sent something and left before
  // it landed — out of the thread, onto another tab, out of the app — this picks it up when you
  // come back, the same way the chat does.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    api<{ account: DmAccount; messages: DmMsg[]; brains?: { id: string; label: string }[] }>("/api/pica", { action: "dm.open", id })
      .then(r => {
        setAcc(r.account); setMsgs(r.messages); setBrains(r.brains || []);
        const last = r.messages[r.messages.length - 1];
        if (last?.role === "user" && last.created_at && Date.now() - Date.parse(last.created_at) < 3 * 60_000) setWaiting(Date.now());
      })
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't open it."));
  }, [id]);
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await api<{ messages: DmMsg[] }>("/api/pica", { action: "dm.open", id }).catch(() => null);
      const last = r?.messages[r.messages.length - 1];
      if (r && last?.role === "assistant") { setMsgs(r.messages); setWaiting(0); clearInterval(t); }
      else if (n >= 30) { setWaiting(0); clearInterval(t); }
    }, 4000);
    return () => clearInterval(t);
  }, [waiting, id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  const send = async () => {
    const t = hideSecrets(text.trim()).text;
    if (!t || busy) return;
    setText(""); setBusy(true); setErr("");
    const tmp: DmMsg = { id: `tmp-${Date.now()}`, role: "user", content: t, created_at: new Date().toISOString(), media: null };
    setMsgs(m => [...(m || []), tmp]);
    try {
      const r = await api<{ added: DmMsg[]; note?: string; ask?: string }>("/api/pica", { action: "dm.send", id, text: t });
      setMsgs(m => [...(m || []).filter(x => x !== tmp), ...r.added]);
      if (r.note) setErr(r.note);
      if (r.ask) { setAsk(r.ask); setHiddenAsk(null); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Didn't send."); setMsgs(m => (m || []).filter(x => x !== tmp)); setText(t); }
    setBusy(false);
  };
  // 📸 Her photo: you see exactly what's going to the picture service, and send it yourself.
  const [ask, setAsk] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // 📸 Put away, not lost.
  const [hiddenAsk, setHiddenAsk] = useState<string | null>(null);
  const sendAsk = async (description: string) => {
    setAsking(true); setErr("");
    try {
      const r = await api<{ added: DmMsg[]; note?: string }>("/api/pica", { action: "dm.photo.make", id, description });
      setAsk(null); setHiddenAsk(null);
      if (r.added.length) setMsgs(m => [...(m || []), ...r.added]); else setErr(r.note || "Couldn't send it.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it."); setAsk(null); }
    setAsking(false);
  };
  // 📸 She said she's sending a photo but none came through.
  const last = (msgs || []).at(-1);
  // 📣 The same words a text uses to spot a claim, so "*sent it*" or "*should be popping up*"
  // brings the button up here too — this had its own, narrower list and missed those.
  const pendingPic = !busy && !!last && last.role === "assistant" && !last.media && claimsMedia(last.content);
  const sendPic = async () => {
    setBusy(true); setErr("");
    try { const r = await api<{ added: DmMsg[]; note?: string; ask?: string }>("/api/pica", { action: "dm.photo", id }); if (r.ask) { setAsk(r.ask); setHiddenAsk(null); } else if (r.added.length) setMsgs(m => [...(m || []), ...r.added]); else setErr(r.note || "Couldn't send it."); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it."); }
    setBusy(false);
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-thread" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2650, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 10, borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        {acc && <span onClick={() => onProfile(acc.id)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 0 }}><Avatar name={acc.name} url={acc.avatar} size={32} /><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.handle}</b></span>}
        {acc && brains.length > 0 && (
          <label className="row" style={{ gap: 4, fontSize: 12 }} title="Her brain">🧠
            <select value={acc.brain || ""} aria-label="Her brain" data-testid="dm-brain" onChange={async e => { const b = e.target.value; setAcc(x => (x ? { ...x, brain: b } : x)); await api("/api/pica", { action: "dm.brain", id, brain: b }).catch(err => setErr(err instanceof Error ? err.message : "Couldn't change it.")); }}
              style={{ padding: "4px 6px", fontSize: 12, width: "auto", borderRadius: 8 }}>
              {brains.map(o => <option key={o.id || "same"} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8, maxWidth: 560, width: "100%", margin: "0 auto" }}>
        {msgs && !msgs.length && <div className="muted" style={{ textAlign: "center", marginTop: 24, fontSize: 14 }}>Say hi to {acc?.name || "her"} 👋</div>}
        {(msgs || []).map(m => {
          const bubble = (
            <div key={m.id} data-testid={m.role === "user" ? "dm-mine" : "dm-hers"} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              {m.media ? <MediaView media={m.media} who={acc?.name || ""} /> : (
                <DmText m={m} onEdit={editMsg} />
              )}
              <When at={m.created_at} align={m.role === "user" ? "right" : "left"} />
            </div>
          );
          // A picture message is never selectable: long-press it and the phone does its own thing.
          return m.media ? bubble : (
            <Selectable key={m.id} id={m.id} selecting={selected} onStart={x => setSelected(new Set([x]))} onToggle={toggleSelect}>{bubble}</Selectable>
          );
        })}
        {busy && <div className="muted" style={{ fontSize: 13 }}>{acc?.name || "She"} is typing…</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <div ref={end} />
      </div>
      {ask !== null && <DmAskSheet who={acc?.name || "She"} description={ask} busy={asking} onChange={setAsk} onSend={sendAsk}
        onClose={() => { setAsk(null); setHiddenAsk(null); }} onHide={() => { setHiddenAsk(ask); setAsk(null); }} />}
      {ask === null && hiddenAsk !== null && (
        <div style={{ padding: "0 12px 6px" }}>
          <button className="ghost" onClick={() => { setAsk(hiddenAsk); setHiddenAsk(null); }} data-testid="dm-ask-waiting" style={{ padding: "6px 12px", fontSize: 13, borderColor: "#ec4899" }}>
            📸 {acc?.name || "Her"} photo is waiting on you — look it over
          </button>
        </div>
      )}
      {pick && <PickFromGallery onClose={() => setPick(false)} onPick={m => { setPick(false); sendMine(m); }} />}
      {mySheet && <MyPhotoSheet title={`Send ${acc?.name || "her"} a photo of you`} draft={a => api<{ description: string }>("/api/pica", { action: "dm.me.draft", id, about: a }).then(r => r.description)}
        onMake={async d => { const r = await api<{ added: DmMsg[] }>("/api/pica", { action: "dm.me.photo", id, description: d }); setMsgs(m => [...(m || []), ...r.added]); setMySheet(false); }} onClose={() => setMySheet(false)} />}
      {pendingPic && <div style={{ padding: "0 12px 6px" }}><button className="ghost" onClick={sendPic} data-testid="dm-send-pic" style={{ padding: "6px 12px", fontSize: 13, borderColor: "#ec4899" }}>📸 {acc?.name || "She"} didn&apos;t send it — send the pic</button></div>}
      {selected && (
        <div data-testid="dm-select-bar" className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14 }}><b>{selected.size}</b> selected <span className="muted" style={{ fontSize: 12 }}>(up to 10)</span></span>
          <button type="button" className="ghost" onClick={() => setSelected(null)} data-testid="dm-select-cancel">Cancel</button>
          <button type="button" className="btn" onClick={deleteSelected} disabled={deleting} data-testid="dm-select-delete" style={{ background: "var(--bad)" }}>{deleting ? "…" : `🗑 Delete${selected.size > 1 ? ` ${selected.size}` : ""}`}</button>
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); send(); }} className="row" style={{ position: "relative", flexWrap: "nowrap", padding: "10px 12px", gap: 8, borderTop: "1px solid var(--border)", ...(selected ? { display: "none" } : {}) }}>
        {/* 🗣️ "@" offers the people you could name — she's told who, never that she's met them. */}
        <MentionPicker testid="dm-mention" text={text} caret={caret} onPick={(name, at) => setText(t => putName(t, at, caret, name))} />
        <PicMenu busy={sending} onMine={() => setMySheet(true)} onGallery={() => setPick(true)} onUpload={() => upIn.current?.click()} />
        <input ref={upIn} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="dm-upload-file" onChange={e => uploadMine(e.target.files?.[0])} />
        <input ref={dmBox} value={text} onChange={e => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
          onSelect={e => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          placeholder={`Message ${acc?.name || ""}…`} aria-label="Message" maxLength={2000} disabled={!msgs} style={{ borderRadius: 999, flex: "1 1 auto", width: "auto", minWidth: 0 }} />
        <StarButton testid="dm-star" disabled={!msgs} onTap={() => tapStar(dmBox, text, caret, setText, setCaret)} />
        <button className="btn" disabled={!text.trim() || busy || !msgs} style={{ borderRadius: 999, padding: "10px 16px", flexShrink: 0 }}>Send</button>
      </form>
    </div>
  );
}

/**
 * ➕ The three ways to put a picture in a message, behind one button: a photo of you, something
 * from your gallery, or one off your phone. They took up half the row as separate buttons.
 */
function PicMenu({ busy, onMine, onGallery, onUpload }: { busy: string; onMine: () => void; onGallery: () => void; onUpload: () => void }) {
  const [open, setOpen] = useState(false);
  // 🪧 It stays up while you tap around — the message box, the thread — and closes only when you
  // pick one, tap the button again, or press Escape.
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const pick = (go: () => void) => { setOpen(false); go(); };
  const item: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "var(--text)", padding: "11px 14px", fontSize: 14, cursor: "pointer" };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" className="ghost" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
        aria-label="Send a picture" data-testid="dm-plus" style={{ padding: "8px 12px", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{busy || (open ? "✕" : "📷")}</button>
      {open && (
        <>
          <div role="menu" data-testid="dm-pic-menu" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 2601, minWidth: 210, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
            <button type="button" role="menuitem" onClick={() => pick(onMine)} data-testid="dm-my-photo" style={item}>📸 A photo of you</button>
            <button type="button" role="menuitem" onClick={() => pick(onGallery)} data-testid="dm-pick-open" style={{ ...item, borderTop: "1px solid var(--border)" }}>🖼️ From your gallery</button>
            <button type="button" role="menuitem" onClick={() => pick(onUpload)} disabled={!!busy} data-testid="dm-upload-open" style={{ ...item, borderTop: "1px solid var(--border)" }}>📎 Upload a picture</button>
          </div>
        </>
      )}
    </div>
  );
}

/** 📸 A photo of you: the description first (like a peek), then exactly that — with your photos as reference. */
/** 📸 A photo she's about to send: the prompt first, the same as a peek. */
function DmAskSheet({ who, description, busy, onChange, onSend, onClose, onHide }: { who: string; description: string; busy: boolean; onChange: (d: string) => void; onSend: (d: string) => void; onClose: () => void; onHide: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  return (
    <div role="dialog" aria-modal="true" data-testid="dm-ask-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2700 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📸 {who}&apos;s photo</div>
          <button type="button" className="ghost" onClick={onHide} aria-label="Later" title="Later" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>This goes to the picture service exactly as it reads. Change anything you like, or send it as it is. ✕ keeps it for later; Cancel drops it.</div>
        <textarea value={description} onChange={e => onChange(e.target.value)} maxLength={1500} autoFocus data-testid="dm-ask-prompt"
          style={{ width: "100%", minHeight: 110, resize: "vertical", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} data-testid="dm-ask-cancel" style={{ padding: "10px 14px" }}>Cancel</button>
          <button type="button" className="btn" onClick={() => onSend(description)} disabled={busy || description.trim().length < 5} data-testid="dm-ask-send" style={{ flex: 1, padding: "10px 14px" }}>{busy ? "…" : "Send it"}</button>
        </div>
      </div>
    </div>
  );
}

function MyPhotoSheet({ title, draft, onMake, onClose }: { title: string; draft: (about: string) => Promise<string>; onMake: (d: string) => Promise<void>; onClose: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [about, setAbout] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const write = async () => {
    setBusy(true); setErr("");
    try { setDesc(await draft(about)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't write it."); }
    setBusy(false);
  };
  const make = async () => {
    setBusy(true); setErr("");
    try { await onMake(desc); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make it."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="my-photo-sheet" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2700 }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📸 {title}</div>
          <button className="ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Say what you want a photo of. You&apos;ll see the description first and can fix anything before it&apos;s made — your &quot;About you&quot; photos keep it looking like you.</div>
        <div className="row" style={{ gap: 8 }}>
          <input value={about} onChange={e => setAbout(e.target.value)} maxLength={300} aria-label="What photo" data-testid="my-photo-about" placeholder="e.g. me at the gym after leg day" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); write(); } }} />
          <button className="ghost" onClick={write} disabled={busy} data-testid="my-photo-write" style={{ flexShrink: 0 }}>{busy && !desc ? "…" : "✍️ Write it"}</button>
        </div>
        {desc && <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} maxLength={1500} aria-label="Photo description" data-testid="my-photo-desc" style={{ resize: "vertical" }} />}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        {desc && <button className="btn" onClick={make} disabled={busy || desc.trim().length < 5} data-testid="my-photo-go">{busy ? "Making it…" : "📸 Make this photo"}</button>}
      </div>
    </div>
  );
}

/** 👩 Make someone yourself: your specs, your bio, your two pictures. She posts from those. */
function MakeHer({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [look, setLook] = useState("");
  const [lives, setLives] = useState("");
  const [followers, setFollowers] = useState("");
  const [follow, setFollow] = useState(true);
  const [head, setHead] = useState<{ mediaId: string; url: string; note?: string } | null>(null);
  const [shot, setShot] = useState<{ mediaId: string; url: string; note?: string } | null>(null);
  // 💬 What's in each picture, in your words — it's what her followers comment on.
  const [headAbout, setHeadAbout] = useState("");
  const [shotAbout, setShotAbout] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const headIn = useRef<HTMLInputElement>(null);
  const shotIn = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined, which: "head" | "shot") => {
    if (!f) return;
    setErr(""); setBusy(which === "head" ? "Uploading her headshot…" : "Uploading her photo…");
    try {
      const r = await uploadPicaPicture(f, which === "head" ? headAbout : shotAbout);
      if (which === "head") setHead(r); else setShot(r);
    } catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't upload."); }
    setBusy("");
  };

  // 💬 Changed your mind about what's in it: saved against the picture, so the comments follow.
  const saveAbout = async (p: { mediaId: string } | null, about: string) => {
    if (!p) return;
    await api("/api/pica", { action: "picture.about", id: p.mediaId, about }).catch(() => {});
  };
  const make = async () => {
    setErr(""); setBusy("Putting her up…");
    try {
      const r = await api<{ id: string; posted: boolean }>("/api/pica", {
        action: "account.create", name, handle, bio: hideSecrets(bio).text, look: hideSecrets(look).text, lives,
        followers: Number(followers.replace(/[^0-9]/g, "")) || 0, follow,
        headshotMediaId: head?.mediaId || "", shotMediaId: shot?.mediaId || "",
      });
      onMade(r.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make her."); setBusy(""); }
  };

  const field = { width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 } as const;
  const label = { fontSize: 12, fontWeight: 700, opacity: 0.75, display: "block", marginBottom: 4 } as const;
  const shown = (p: { url: string } | null, alt: string) =>
    // eslint-disable-next-line @next/next/no-img-element
    p ? <img src={p.url} alt={alt} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", objectPosition: "top" }} /> : <span style={{ width: 72, height: 72, borderRadius: 12, border: "1px dashed var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, opacity: 0.5 }}>🖼️</span>;

  return (
    <div role="dialog" aria-modal="true" data-testid="pica-make" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2700, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>👩 Make someone</b>
        <button className="btn" onClick={make} disabled={!!busy || !name.trim() || !handle.trim() || !head} data-testid="pica-make-save" style={{ padding: "6px 14px" }}>{busy ? "…" : "Put her up"}</button>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "12px 14px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>Her pictures are what she looks like: every photo she posts is built from them. Say what&apos;s in each one and her followers comment on that — the outfit, the place, what she&apos;s doing. Leave it blank and it&apos;s read off the picture instead. Use AI-made or fictional pictures — not photos of a real person.</div>
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
          <div style={{ textAlign: "center" }}>
            {shown(head, "Her headshot")}
            <button type="button" className="ghost" onClick={() => headIn.current?.click()} disabled={!!busy} data-testid="pica-make-head-btn" style={{ display: "block", marginTop: 6, padding: "4px 10px", fontSize: 12 }}>{head ? "Change" : "Headshot *"}</button>
            <input ref={headIn} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="pica-make-head" onChange={e => pick(e.target.files?.[0], "head")} />
          </div>
          <div style={{ textAlign: "center" }}>
            {shown(shot, "A photo of her")}
            <button type="button" className="ghost" onClick={() => shotIn.current?.click()} disabled={!!busy} data-testid="pica-make-shot-btn" style={{ display: "block", marginTop: 6, padding: "4px 10px", fontSize: 12 }}>{shot ? "Change" : "Post photo"}</button>
            <input ref={shotIn} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="pica-make-shot" onChange={e => pick(e.target.files?.[0], "shot")} />
          </div>
        </div>
        {(head || shot) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {head && (
              <div><label style={label} htmlFor="mk-head-about">What&apos;s in her headshot</label>
                <input id="mk-head-about" style={field} value={headAbout} onChange={e => setHeadAbout(e.target.value)} onBlur={() => saveAbout(head, headAbout)} maxLength={400}
                  data-testid="pica-make-head-about" placeholder="e.g. close-up on her back porch, white tank top, hair up, laughing" />
              </div>
            )}
            {shot && (
              <div><label style={label} htmlFor="mk-shot-about">What&apos;s in her photo</label>
                <input id="mk-shot-about" style={field} value={shotAbout} onChange={e => setShotAbout(e.target.value)} onBlur={() => saveAbout(shot, shotAbout)} maxLength={400}
                  data-testid="pica-make-shot-about" placeholder="e.g. at the beach in a red bikini, sunglasses on, sand on her feet" />
              </div>
            )}
            <span className="muted" style={{ fontSize: 11 }}>This is what her followers see, so they comment on it — the outfit, the place, what she&apos;s doing. Blank, and it&apos;s read off the picture instead.</span>
          </div>
        )}
        <div><label style={label} htmlFor="mk-name">Name *</label><input id="mk-name" style={field} value={name} onChange={e => setName(e.target.value)} placeholder="Ava Lane" data-testid="pica-make-name" maxLength={60} /></div>
        <div><label style={label} htmlFor="mk-handle">Handle *</label><input id="mk-handle" style={field} value={handle} onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))} placeholder="avalane" data-testid="pica-make-handle" maxLength={28} /></div>
        <div><label style={label} htmlFor="mk-bio">Bio</label><textarea id="mk-bio" style={{ ...field, minHeight: 60, resize: "vertical" }} value={bio} onChange={e => setBio(e.target.value)} placeholder="☕ coffee &amp; long runs · 📍 Chicago" data-testid="pica-make-bio" maxLength={300} /></div>
        <div><label style={label} htmlFor="mk-look">What she looks like</label><textarea id="mk-look" style={{ ...field, minHeight: 70, resize: "vertical" }} value={look} onChange={e => setLook(e.target.value)} placeholder="28, long dark hair, green eyes, athletic, usually in jeans and a crop top" data-testid="pica-make-look" maxLength={600} /></div>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label style={label} htmlFor="mk-lives">Lives</label><input id="mk-lives" style={field} value={lives} onChange={e => setLives(e.target.value)} placeholder="Valparaiso, IN" data-testid="pica-make-lives" maxLength={120} /></div>
          <div style={{ width: 120 }}><label style={label} htmlFor="mk-foll">Followers</label><input id="mk-foll" style={field} value={followers} onChange={e => setFollowers(e.target.value)} inputMode="numeric" placeholder="24000" data-testid="pica-make-followers" /></div>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} data-testid="pica-make-follow" />
          Follow her (she posts in your feed; befriend her later from her profile)
        </label>
        {busy && <div className="muted" style={{ fontSize: 13 }}>{busy}</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }} data-testid="pica-make-err">⚠️ {err}</div>}
      </div>
    </div>
  );
}

/**
 * ✍️ A bio you just click and type in. It saves itself three seconds after you stop typing
 * (and when you tap away), so there's no Save button to remember.
 */
/**
 * ✍️ Click-to-edit, the same everywhere on Picagram: three seconds after you stop typing it saves
 * itself, tapping away saves at once, and nothing is sent when the words haven't changed.
 */
function useTypeAndSave(value: string, onSave: (t: string) => Promise<void>) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(value);
  useEffect(() => { if (!editing) { setText(value); last.current = value; } }, [value, editing]);
  const save = async (t: string) => {
    if (t === last.current) return;
    last.current = t;
    await onSave(t);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };
  const typed = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(t), 3000);
  };
  const done = () => {
    if (timer.current) clearTimeout(timer.current);
    setEditing(false);
    save(text);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { editing, setEditing, text, typed, done, saved };
}

/** 💬 Any comment on your feed — yours, hers, a stranger's: tap the words to put it right. */
function EditableComment({ who, known, text: value, onSave }: { who: string; known: boolean; text: string; onSave: (t: string) => Promise<void> }) {
  const { editing, setEditing, text, typed, done, saved } = useTypeAndSave(value, onSave);
  const name = <b style={{ color: known ? "var(--text)" : "var(--muted)" }}>{who}</b>;
  if (!editing) return (
    <div data-testid="pica-comment" style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>
      {name}{" "}
      <span onClick={() => setEditing(true)} data-testid="pica-comment-text" title="Click to edit" style={{ cursor: "text" }}>{noJargon(text)}</span>
      {saved && <span className="muted" data-testid="pica-comment-saved" style={{ marginLeft: 6, fontSize: 11 }}>✓ Saved</span>}
    </div>
  );
  return (
    <div data-testid="pica-comment" style={{ fontSize: 13.5 }}>
      {name}
      <textarea value={text} onChange={e => typed(e.target.value)} onBlur={done} autoFocus maxLength={600} data-testid="pica-comment-box"
        style={{ width: "100%", minHeight: 34, marginTop: 2, resize: "vertical", padding: "6px 8px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
      <div className="muted" style={{ fontSize: 11 }}>{saved ? "✓ Saved" : "Saves itself a few seconds after you stop typing"}</div>
    </div>
  );
}

function EditableBio({ value, onSave, testid, placeholder = "No bio yet", max = 300, size, weight }: { value: string; onSave: (t: string) => Promise<void>; testid: string; placeholder?: string; max?: number; size?: number; weight?: number }) {
  const { editing, setEditing, text, typed, done, saved } = useTypeAndSave(value, onSave);
  if (!editing) return (
    <div onClick={() => setEditing(true)} data-testid={testid} title="Click to edit"
      style={{ fontSize: size ?? (max <= 60 ? 15 : 13), fontWeight: weight ?? (max <= 60 ? 800 : 400), marginTop: size ? 0 : max <= 60 ? 0 : 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", cursor: "text", minHeight: 18, color: "inherit" }}>
      {text || <span className="muted">{placeholder}</span>}
      {saved && <span className="muted" data-testid={`${testid}-saved`} style={{ marginLeft: 6, fontSize: 11 }}>✓ Saved</span>}
    </div>
  );
  return (
    <div style={{ marginTop: 4 }}>
      <textarea value={text} onChange={e => typed(e.target.value)} onBlur={done} autoFocus maxLength={max} data-testid={`${testid}-box`}
        style={{ width: "100%", minHeight: max > 150 ? 64 : 34, resize: "vertical", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} placeholder={placeholder} />
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{saved ? "✓ Saved" : "Saves itself a few seconds after you stop typing"}</div>
    </div>
  );
}

/** 🙋 Your own Picagram: your picture, your bio, and everything you've posted. */
function MyProfile({ name, onClose }: { name: string; onClose: () => void }) {
  useBack(true, onClose); // the phone's back button closes this, one step at a time
  type Me = { name: string; bio: string; avatar: string | null; posts: number; following: number; photos: (Photo & { at: string })[] };
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [view, setView] = useState<Photo | null>(null);
  const pic = useRef<HTMLInputElement>(null);
  useEffect(() => { api<Me>("/api/pica", { action: "me" }).then(m => setMe(m)).catch(() => onClose()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changePic = async (f: File | undefined) => {
    if (!f) return;
    setBusy("Uploading…"); setErr("");
    try { const file = await uploadFile(f, "picame"); setMe(m => (m ? { ...m, avatar: file.url } : m)); }
    catch (e) { setErr(e instanceof Error ? e.message : "That picture didn't upload."); }
    setBusy("");
  };

  return (
    <div role="dialog" aria-modal="true" data-testid="pica-me" style={{ position: "fixed", inset: 0, bottom: "var(--nav-h)", background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>{me?.name || name}</b>
      </div>
      {me && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="row" style={{ gap: 16, padding: 16, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center" }}>
              <Avatar name={me.name} url={me.avatar} size={76} />
              <button type="button" className="ghost" onClick={() => pic.current?.click()} disabled={!!busy} data-testid="pica-me-pic-btn" style={{ display: "block", marginTop: 6, padding: "3px 8px", fontSize: 11 }}>Change</button>
              <input ref={pic} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="pica-me-pic" onChange={e => changePic(e.target.files?.[0])} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{me.name}</div>
              <div className="muted" style={{ fontSize: 13 }}><b style={{ color: "var(--text)" }}>{me.posts}</b> posts · <b style={{ color: "var(--text)" }}>{me.following}</b> following</div>
              <EditableBio value={me.bio} testid="pica-me-bio" placeholder="No bio yet — click to write one"
                onSave={async t => { setMe(m => (m ? { ...m, bio: t } : m)); await api("/api/pica", { action: "me.bio", bio: hideSecrets(t).text }).catch(() => setErr("Couldn't save your bio.")); }} />
            </div>
          </div>
          {err && <div style={{ color: "var(--bad)", padding: "0 16px 10px", fontSize: 13 }} data-testid="pica-me-err">⚠️ {err}</div>}
          <Grid photos={me.photos} onOpen={setView}
            onRemoved={id => setMe(m => (m ? { ...m, posts: Math.max(0, m.posts - 1), photos: m.photos.filter(x => x.post_id !== id) } : m))} />
          {!me.photos.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>Nothing posted yet — tap ＋ Post</div>}
        </div>
      )}
      {view && <Viewer photo={view} onClose={() => setView(null)} {...step(me?.photos, view, setView)}
        onSaved={on => setMe(m => (m ? { ...m, photos: m.photos.map(x => (x.media_id === view.media_id ? { ...x, saved: on } : x)) } : m))} />}
    </div>
  );
}


/** ✏️ One written DM. Double-tap it to reword it; Enter saves, Escape leaves it. */
function DmText({ m, onEdit }: { m: { id: string; role: string; content: string }; onEdit: (id: string, text: string) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastTap = useRef(0);
  const mine = m.role === "user";
  const open = () => setEditing(m.content);
  const save = async () => {
    const text = (editing || "").trim();
    if (!text) return;
    setSaving(true);
    try { await onEdit(m.id, text); setEditing(null); } catch { /* leave it open */ }
    setSaving(false);
  };
  const box = { padding: "9px 13px", borderRadius: 18, background: mine ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "var(--surface2)", color: mine ? "#fff" : "var(--text)", whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, fontSize: 15 };
  return (
    <>
      <div data-testid="dm-text" style={box} onDoubleClick={open}
        onClick={() => { const now = Date.now(); if (now - lastTap.current < 400) open(); lastTap.current = now; }}>{m.content}</div>
      {/* ✏️ Double-tapped: the words get the whole screen. */}
      {editing !== null && <EditSheet testid="dm-edit" who={mine ? "Your message" : "Her message"} value={editing} busy={saving}
        onChange={setEditing} onSave={() => void save()} onClose={() => setEditing(null)} />}
    </>
  );
}
