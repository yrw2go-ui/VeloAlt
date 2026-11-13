"use client";
// 📸 Picagram: everyone's posts, newest first, a few at a time as you scroll. Like, comment, and post your own.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { hideSecrets } from "./lib/secrets";
import { MediaView, type Media } from "./media";
import { confirmAsk } from "./lib/dialog";

type Comment = { id: string; who: string; me: boolean; known: boolean; text: string; created_at: string };
type Post = { id: string; saved: boolean; author: { id: string | null; name: string; portrait: string | null; away: string | null; account?: { id: string; handle: string; followed: boolean } }; kind: "image" | "text"; caption: string; media: Media | null; likes: number; liked: boolean; liked_by: string[]; comments: number; preview: Comment[]; created_at: string; all?: Comment[] };

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

export default function Picagram({ name, onChat, openProfile, onProfileOpened }: { name: string; onChat?: (characterId: string) => void; openProfile?: string | null; onProfileOpened?: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [profile, setProfile] = useState<string | null>(openProfile || null);
  useEffect(() => { if (openProfile) { setProfile(openProfile); onProfileOpened?.(); } }, [openProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savedOpen, setSavedOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  // ✉️ DMs with accounts (characters chat in the normal chat).
  const [inbox, setInbox] = useState(false);
  const [thread, setThread] = useState<string | null>(null);
  const [dmUnread, setDmUnread] = useState(0);
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
    <div data-testid="picagram" style={{ maxWidth: 560, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "10px 14px", position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 24, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, background: "linear-gradient(90deg,#f59e0b,#ec4899,#8b5cf6)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Picagram</div>
        <button className="ghost" onClick={() => setInbox(true)} aria-label="Messages" data-testid="pica-inbox-open" style={{ padding: "6px 10px", position: "relative" }}>✉️
          {dmUnread > 0 && <span data-testid="pica-dm-badge" style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: "16px" }}>{dmUnread}</span>}
        </button>
        <button className="ghost" onClick={() => setFollowingOpen(true)} aria-label="Following" data-testid="pica-following-open" style={{ padding: "6px 10px" }}>👥</button>
        <button className="ghost" onClick={() => setSavedOpen(true)} aria-label="Saved pictures" data-testid="pica-saved-open" style={{ padding: "6px 10px" }}>🔖</button>
        <button className="ghost" onClick={() => load(true)} disabled={loading} aria-label="Refresh" style={{ padding: "6px 10px" }}>↻</button>
        <button className="btn" onClick={() => setComposing(true)} data-testid="pica-new" style={{ padding: "8px 14px" }}>＋ Post</button>
      </div>
      {posts && !posts.length && !loading && <div className="muted" style={{ textAlign: "center", padding: 32 }}>No posts yet — check back soon 📸</div>}
      {note && <div data-testid="pica-note" onClick={() => setNote("")} style={{ margin: "8px 14px", padding: "10px 12px", borderRadius: 12, background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.4)", fontSize: 13 }}>⚠️ {note}</div>}
      {(posts || []).map(p => <PostCard key={p.id} p={p} me={name} obs={seenObs.current} onChange={f => update(p.id, f)} onProfile={setProfile} onFollow={setFollowed} onNote={setNote} onRemoved={id => setPosts(ps => (ps || []).filter(x => x.id !== id))} />)}
      <div ref={sentinel} style={{ height: 1 }} />
      {loading && <div className="muted" style={{ textAlign: "center", padding: 18 }} data-testid="pica-loading">Loading…</div>}
      {!more && posts && posts.length > 0 && <div className="muted" style={{ textAlign: "center", padding: 18, fontSize: 13 }}>You&apos;re all caught up ✨</div>}
      {err && <div style={{ color: "var(--bad)", padding: 14 }}>⚠️ {err}</div>}
      {profile && <Profile id={profile} onClose={() => setProfile(null)} onFollow={setFollowed} onChat={onChat} onMessage={id => { setProfile(null); setThread(id); }} />}
      {inbox && <Inbox onClose={() => setInbox(false)} onOpen={id => setThread(id)} />}
      {thread && <Thread id={thread} onClose={() => setThread(null)} onProfile={id => { setThread(null); setInbox(false); setProfile(id); }} />}
      {followingOpen && <Following onClose={() => setFollowingOpen(false)} onUnfollow={acc => setFollowed(acc, false)} onOpen={id => { setFollowingOpen(false); setProfile(id); }} />}
      {savedOpen && <Saved onClose={() => setSavedOpen(false)} />}
      {composing && <Composer onClose={() => setComposing(false)} onPosted={() => { setComposing(false); load(true); }} />}
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
  const remove = async () => {
    if (!(await confirmAsk("Delete this post? Are you sure? Its likes and comments go too.", { yes: "Delete", danger: true }))) return;
    try { await api("/api/pica", { action: "delete", id: p.id }); onRemoved(p.id); } catch { /* still there */ }
  };
  const acc = p.author.account;
  const follow = async () => { if (!acc) return; const on = !acc.followed; onFollow(acc.id, on); await api("/api/pica", { action: "follow", id: acc.id, on }).catch(e => { onFollow(acc.id, !on); onNote(e instanceof Error ? e.message : "Couldn't follow."); }); };
  const save = async () => { if (!p.media) return; const on = !p.saved; onChange(x => ({ ...x, saved: on })); await api("/api/pica", { action: "save", id: p.media.id, on }).catch(() => onChange(x => ({ ...x, saved: !on }))); };
  const likedBy = p.liked_by.filter(Boolean);
  return (
    <article ref={ref} data-post={p.id} data-testid="pica-post" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
      <div className="row" style={{ gap: 10, padding: "10px 14px" }}>
        <span onClick={() => acc && onProfile(acc.id)} style={{ cursor: acc ? "pointer" : undefined, display: "flex" }}><Avatar name={p.author.name} url={p.author.portrait} /></span>
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => acc && onProfile(acc.id)} data-testid={acc ? "pica-account" : undefined}>
          <div style={{ fontWeight: 800, fontSize: 14, cursor: acc ? "pointer" : undefined }}>{acc ? acc.handle : p.author.id ? p.author.name : `${me} (you)`}</div>
          {acc && !acc.followed && <div className="muted" style={{ fontSize: 11 }}>Suggested for you</div>}
          {p.author.away && <div className="muted" style={{ fontSize: 11 }} data-testid="pica-away">{p.author.away}</div>}
        </div>
        {acc && <button className={acc.followed ? "ghost" : "btn"} onClick={follow} data-testid="pica-follow" style={{ padding: "4px 12px", fontSize: 13 }}>{acc.followed ? "Following" : "Follow"}</button>}
        <span className="muted" style={{ fontSize: 12 }}>{ago(p.created_at)}</span>
        {!p.author.id && !acc && <button onClick={remove} aria-label="Delete post" data-testid="pica-delete" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 2px", color: "var(--muted)" }}>🗑</button>}
      </div>
      {p.media ? (
        <div onDoubleClick={() => { if (!p.liked) like(); }} style={{ display: "flex", justifyContent: "center", background: "#000" }}><MediaView media={p.media} big who={p.author.name} /></div>
      ) : (
        <div onDoubleClick={() => { if (!p.liked) like(); }} data-testid="pica-text" style={{ margin: "0 14px", padding: "28px 20px", borderRadius: 16, background: GRADS[p.id.charCodeAt(0) % GRADS.length], color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "center" }}>{p.caption}</div>
      )}
      <div className="row" style={{ gap: 14, padding: "8px 14px 2px" }}>
        <button onClick={like} aria-label={p.liked ? "Unlike" : "Like"} aria-pressed={p.liked} data-testid="pica-like" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 0 }}>{p.liked ? "❤️" : "🤍"}</button>
        <button onClick={showAll} aria-label="Comments" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0 }}>💬</button>
        {p.media && <button onClick={save} aria-label={p.saved ? "Unsave" : "Save to my Picagram gallery"} aria-pressed={p.saved} data-testid="pica-save" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0, opacity: p.saved ? 1 : 0.6 }}>{p.saved ? "🔖" : "📑"}</button>}
      </div>
      <div style={{ padding: "0 14px", fontSize: 14, fontWeight: 700 }} data-testid="pica-likes">
        {likedBy.length ? <>Liked by {likedBy.slice(0, 2).join(", ")}{p.likes > likedBy.length ? <> and {fmt(p.likes - Math.min(2, likedBy.length))} others</> : null}</> : <>{fmt(p.likes)} likes</>}
      </div>
      {p.media && p.caption && <div style={{ padding: "4px 14px", fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><b>{acc ? acc.handle : p.author.id ? p.author.name : me}</b> {p.caption}</div>}
      {p.comments > list.length && !open && <button onClick={showAll} className="muted" data-testid="pica-all" style={{ background: "none", border: "none", padding: "2px 14px", fontSize: 13, cursor: "pointer" }}>View all {p.comments} comments</button>}
      <div style={{ padding: "2px 14px", display: "grid", gap: 3 }}>
        {list.map(c => <div key={c.id} data-testid="pica-comment" style={{ fontSize: 13.5, overflowWrap: "anywhere" }}><b style={{ color: c.known ? "var(--text)" : "var(--muted)" }}>{c.me ? me : c.who}</b> {c.text}</div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }} className="row" style={{ gap: 8, padding: "6px 14px 0" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" aria-label="Add a comment" maxLength={500} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 14 }} />
        {text.trim() && <button className="ghost" disabled={busy} style={{ padding: "6px 12px", fontWeight: 800, color: "var(--accent)" }}>{busy ? "…" : "Post"}</button>}
      </form>
    </article>
  );
}

function Composer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState("");
  const [mine, setMine] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const post = async () => {
    setBusy(true); setErr("");
    try { await api("/api/pica", { action: "post", caption: hideSecrets(caption).text, photo: hideSecrets(photo).text, useMyPhotos: mine, drafted }); onPosted(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't post."); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-composer" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2500 }} onClick={onClose}>
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
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <button className="btn" onClick={post} disabled={busy || (!caption.trim() && !photo.trim())} data-testid="pica-share">{busy ? "Posting…" : "Share"}</button>
      </div>
    </div>
  );
}

type Photo = { media_id: string; url: string; thumb: string | null; caption?: string; saved: boolean };

/** 🖼️ A picture, full screen, with Save. */
function Viewer({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: (on: boolean) => void }) {
  const [saved, setSaved] = useState(photo.saved);
  const toggle = async () => { const on = !saved; setSaved(on); onSaved(on); await api("/api/pica", { action: "save", id: photo.media_id, on }).catch(() => { setSaved(!on); onSaved(!on); }); };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 2700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption || "Photo"} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "80dvh", objectFit: "contain", borderRadius: 12 }} />
      <div className="row" style={{ gap: 10 }} onClick={e => e.stopPropagation()}>
        <button className={saved ? "ghost" : "btn"} onClick={toggle} data-testid="pica-viewer-save">{saved ? "🔖 Saved" : "📑 Save"}</button>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Grid({ photos, onOpen }: { photos: Photo[]; onOpen: (p: Photo) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
      {photos.map(p => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.media_id} src={p.thumb || p.url} alt={p.caption || "Photo"} loading="lazy" onClick={() => onOpen(p)} data-testid="pica-grid-item" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", cursor: "pointer", background: "var(--surface2)" }} />
      ))}
    </div>
  );
}

/** 👤 Her profile: bio, followers, Follow, and all her photos. */
function Profile({ id, onClose, onFollow, onChat, onMessage }: { id: string; onClose: () => void; onFollow: (account: string, on: boolean) => void; onChat?: (characterId: string) => void; onMessage?: (id: string) => void }) {
  const [data, setData] = useState<{ account: { id: string; handle: string; name: string; bio: string; followers: number; followed: boolean; avatar: string | null; character_id: string | null }; photos: Photo[] } | null>(null);
  const [err, setErr] = useState("");
  const [befriending, setBefriending] = useState(false);
  // 🤝 She becomes a character (filled in from her profile; her photos are her headshot and references).
  const befriend = async () => {
    setBefriending(true); setErr("");
    try { const r = await api<{ characterId: string }>("/api/pica", { action: "befriend", id }); setData(d => (d ? { ...d, account: { ...d.account, character_id: r.characterId, followed: true } } : d)); onFollow(id, true); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't befriend her."); }
    setBefriending(false);
  };
  const [view, setView] = useState<Photo | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>("/api/pica", { action: "profile", id }).then(setData).catch(() => onClose()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const follow = async () => {
    if (!data) return;
    const on = !data.account.followed;
    setData(d => (d ? { ...d, account: { ...d.account, followed: on, followers: d.account.followers + (on ? 1 : -1) } } : d)); onFollow(id, on);
    await api("/api/pica", { action: "follow", id, on }).catch(e => { setData(d => (d ? { ...d, account: { ...d.account, followed: !on, followers: d.account.followers + (on ? -1 : 1) } } : d)); onFollow(id, !on); setErr(e instanceof Error ? e.message : "Couldn't follow."); });
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-profile" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>{data?.account.handle || "…"}</b>
      </div>
      {data && (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="row" style={{ gap: 16, padding: 16 }}>
            <Avatar name={data.account.name} url={data.account.avatar} size={76} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{data.account.name}</div>
              <div className="muted" style={{ fontSize: 13 }}><b style={{ color: "var(--text)" }}>{data.photos.length}</b> posts · <b style={{ color: "var(--text)" }}>{fmt(data.account.followers)}</b> followers</div>
              <div style={{ fontSize: 13, marginTop: 4, whiteSpace: "pre-wrap" }}>{data.account.bio}</div>
            </div>
          </div>
          <div className="row" style={{ padding: "0 16px 12px", gap: 8 }}>
            <button className={data.account.followed ? "ghost" : "btn"} onClick={follow} data-testid="pica-profile-follow" style={{ flex: 1 }}>{data.account.followed ? "Following" : "Follow"}</button>
            {data.account.character_id
              ? <button className="btn" onClick={() => onChat?.(data.account.character_id!)} data-testid="pica-chat" style={{ flex: 1 }}>💬 Chat</button>
              : <>
                  <button className="ghost" onClick={() => onMessage?.(id)} data-testid="pica-message" style={{ flex: 1 }}>✉️ Message</button>
                  <button className="ghost" onClick={befriend} disabled={befriending} data-testid="pica-befriend" style={{ flex: 1 }}>{befriending ? "Making her profile…" : "🤝 Befriend"}</button>
                </>}
          </div>
          {data.account.character_id && <div className="muted" style={{ padding: "0 16px 10px", fontSize: 12 }}>🤝 You&apos;re friends — she&apos;s one of your characters now (edit her in her character card).</div>}
          {err && <div style={{ color: "var(--bad)", padding: "0 16px 10px", fontSize: 13 }}>⚠️ {err}</div>}
          <Grid photos={data.photos} onOpen={setView} />
          {!data.photos.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>No photos yet</div>}
        </div>
      )}
      {view && <Viewer photo={view} onClose={() => setView(null)} onSaved={on => setData(d => (d ? { ...d, photos: d.photos.map(x => (x.media_id === view.media_id ? { ...x, saved: on } : x)) } : d))} />}
    </div>
  );
}

/** 🔖 Their own Picagram gallery: pictures they saved. */
function Saved({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<(Photo & { at: string })[] | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  useEffect(() => { api<{ items: (Photo & { at: string })[] }>("/api/pica", { action: "saved" }).then(r => setItems(r.items)).catch(() => setItems([])); }, []);
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-saved" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>🔖 Saved</b>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {items && !items.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>Tap 📑 on a photo to save it here</div>}
        {items && <Grid photos={items} onOpen={setView} />}
      </div>
      {view && <Viewer photo={view} onClose={() => setView(null)} onSaved={on => { if (!on) setItems(l => (l || []).filter(x => x.media_id !== view.media_id)); }} />}
    </div>
  );
}

/** 👥 Who you follow (up to 70) — unfollow some to make room for new ones. */
function Following({ onClose, onUnfollow, onOpen }: { onClose: () => void; onUnfollow: (id: string) => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<{ id: string; handle: string; name: string; avatar: string | null; friend: boolean }[] | null>(null);
  // ✨ Bring new women in right now, instead of waiting for the one who turns up each day.
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const newFaces = async () => {
    setBusy(true); setSaid("");
    try {
      const r = await api<{ made: number; names: string[] }>("/api/pica", { action: "newfaces", count: 3 });
      setSaid(`✨ ${r.names.join(", ")} just posted — pull down the feed to see them.`);
    } catch (e) { setSaid(e instanceof Error ? e.message : "Couldn't bring anyone new in."); }
    setBusy(false);
  };
  useEffect(() => { api<{ accounts: NonNullable<typeof list> }>("/api/pica", { action: "following" }).then(r => setList(r.accounts)).catch(() => setList([])); }, []);
  const unfollow = async (id: string) => {
    setList(l => (l || []).filter(x => x.id !== id)); onUnfollow(id);
    await api("/api/pica", { action: "follow", id, on: false }).catch(() => {});
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-following" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
      <div className="row" style={{ padding: "10px 14px", gap: 8, position: "sticky", top: 0, background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button className="ghost" onClick={onClose} aria-label="Back" style={{ padding: "4px 10px" }}>←</button>
        <b style={{ flex: 1 }}>👥 Following {list ? `(${list.length}/70)` : ""}</b>
        <button className="ghost" onClick={newFaces} disabled={busy} data-testid="pica-new-faces" style={{ padding: "4px 10px", fontSize: 13 }}>{busy ? "…" : "✨ 3 new faces"}</button>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {said && <div data-testid="pica-new-faces-said" className="muted" style={{ padding: "10px 14px", fontSize: 13 }}>{said}</div>}
        {list && !list.length && <div className="muted" style={{ textAlign: "center", padding: 24 }}>You&apos;re not following anyone yet</div>}
        {(list || []).map(a => (
          <div key={a.id} className="row" data-testid="pica-following-row" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <span onClick={() => onOpen(a.id)} style={{ cursor: "pointer", display: "flex" }}><Avatar name={a.name} url={a.avatar} size={40} /></span>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onOpen(a.id)}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{a.handle}{a.friend ? " 🤝" : ""}</div>
              <div className="muted" style={{ fontSize: 12 }}>{a.name}</div>
            </div>
            <button className="ghost" onClick={() => unfollow(a.id)} data-testid="pica-unfollow" style={{ padding: "4px 12px", fontSize: 13 }}>Unfollow</button>
          </div>
        ))}
      </div>
    </div>
  );
}

type DmMsg = { id: string; role: "user" | "assistant"; content: string; created_at: string; media: Media | null };
type DmAccount = { id: string; handle: string; name: string; avatar: string | null; brain?: string };

/** ✉️ Picagram messages: one row per person you've DM'd. */
function Inbox({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<{ account: DmAccount; last: string; at: string; unread: number }[] | null>(null);
  useEffect(() => { api<{ threads: NonNullable<typeof list> }>("/api/pica", { action: "dm.threads" }).then(r => setList(r.threads)).catch(() => setList([])); }, []);
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-inbox" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2600, overflowY: "auto" }}>
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
  const [acc, setAcc] = useState<DmAccount | null>(null);
  const [brains, setBrains] = useState<{ id: string; label: string }[]>([]);
  const [msgs, setMsgs] = useState<DmMsg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mySheet, setMySheet] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { api<{ account: DmAccount; messages: DmMsg[]; brains?: { id: string; label: string }[] }>("/api/pica", { action: "dm.open", id }).then(r => { setAcc(r.account); setMsgs(r.messages); setBrains(r.brains || []); }).catch(e => setErr(e instanceof Error ? e.message : "Couldn't open it.")); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  const send = async () => {
    const t = hideSecrets(text.trim()).text;
    if (!t || busy) return;
    setText(""); setBusy(true); setErr("");
    const tmp: DmMsg = { id: `tmp-${Date.now()}`, role: "user", content: t, created_at: new Date().toISOString(), media: null };
    setMsgs(m => [...(m || []), tmp]);
    try {
      const r = await api<{ added: DmMsg[]; note?: string }>("/api/pica", { action: "dm.send", id, text: t });
      setMsgs(m => [...(m || []).filter(x => x !== tmp), ...r.added]);
      if (r.note) setErr(r.note);
    } catch (e) { setErr(e instanceof Error ? e.message : "Didn't send."); setMsgs(m => (m || []).filter(x => x !== tmp)); setText(t); }
    setBusy(false);
  };
  // 📸 She said she's sending a photo but none came through.
  const last = (msgs || []).at(-1);
  const pendingPic = !busy && !!last && last.role === "assistant" && !last.media
    && /\b(pic|pics|picture|photo|selfie|snap)\b/i.test(last.content) && /\b(send|sending|sent|here'?s|here you go|coming|on (its|it's) way|incoming|let me)\b/i.test(last.content);
  const sendPic = async () => {
    setBusy(true); setErr("");
    try { const r = await api<{ added: DmMsg[]; note?: string }>("/api/pica", { action: "dm.photo", id }); if (r.added.length) setMsgs(m => [...(m || []), ...r.added]); else setErr(r.note || "Couldn't send it."); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send it."); }
    setBusy(false);
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="pica-thread" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 2650, display: "flex", flexDirection: "column" }}>
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
        {(msgs || []).map(m => (
          <div key={m.id} data-testid={m.role === "user" ? "dm-mine" : "dm-hers"} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            {m.media ? <MediaView media={m.media} who={acc?.name || ""} /> : (
              <div style={{ padding: "9px 13px", borderRadius: 18, background: m.role === "user" ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "var(--surface2)", color: m.role === "user" ? "#fff" : "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 15 }}>{m.content}</div>
            )}
          </div>
        ))}
        {busy && <div className="muted" style={{ fontSize: 13 }}>{acc?.name || "She"} is typing…</div>}
        {err && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ {err}</div>}
        <div ref={end} />
      </div>
      {mySheet && <MyPhotoSheet title={`Send ${acc?.name || "her"} a photo of you`} draft={a => api<{ description: string }>("/api/pica", { action: "dm.me.draft", id, about: a }).then(r => r.description)}
        onMake={async d => { const r = await api<{ added: DmMsg[] }>("/api/pica", { action: "dm.me.photo", id, description: d }); setMsgs(m => [...(m || []), ...r.added]); setMySheet(false); }} onClose={() => setMySheet(false)} />}
      {pendingPic && <div style={{ padding: "0 12px 6px" }}><button className="ghost" onClick={sendPic} data-testid="dm-send-pic" style={{ padding: "6px 12px", fontSize: 13, borderColor: "#ec4899" }}>📸 {acc?.name || "She"} didn&apos;t send it — send the pic</button></div>}
      <form onSubmit={e => { e.preventDefault(); send(); }} className="row" style={{ padding: "10px 12px", gap: 8, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="ghost" onClick={() => setMySheet(true)} aria-label="Send a photo of you" data-testid="dm-my-photo" style={{ flexShrink: 0, padding: "8px 10px", fontSize: 18 }}>📸</button>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`Message ${acc?.name || ""}…`} aria-label="Message" maxLength={2000} disabled={!msgs} style={{ borderRadius: 999 }} />
        <button className="btn" disabled={!text.trim() || busy || !msgs} style={{ borderRadius: 999, padding: "10px 16px" }}>Send</button>
      </form>
    </div>
  );
}

/** 📸 A photo of you: the description first (like a peek), then exactly that — with your photos as reference. */
function MyPhotoSheet({ title, draft, onMake, onClose }: { title: string; draft: (about: string) => Promise<string>; onMake: (d: string) => Promise<void>; onClose: () => void }) {
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
